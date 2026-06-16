import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/constants';
import { getToken } from './api';
import type { Message } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useChatsStore } from '@/store/chatsStore';

let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;

export async function connectSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    const token = await getToken();
    if (!token) {
      console.log('[socket] No auth token — skipping connection');
      return null;
    }

    const s = io(API_URL, {
      auth: { token },
      // Prod: websocket-only — eliminates polling handshake + LB sticky-session requirement.
      // Dev: allow polling fallback — Android emulator's 10.0.2.2 NAT is flaky on raw WS upgrades.
      transports: __DEV__ ? ['polling', 'websocket'] : ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    s.on('connect', () => {
      console.log('[socket] Connected:', s.id);
    });

    s.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
    });

    s.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
    });

    // HARDEN-02: backend rolling-deploy signal. Backend emits this during
    // graceful shutdown (lib/shutdown.ts D-15) with payload
    // { reason: 'rolling_deploy' }. We ignore the payload (D-15 reserves the
    // reason field for future expansion without requiring a mobile release).
    // Immediate disconnect + reconnect on the SAME socket instance `s`
    // skips the 1.5s reconnectionDelay and lands on the new pod within
    // ~500ms — inside the 5s drain window. Silent UX (D-18): no banner,
    // no toast, no state change — sub-500ms reconnects are invisible to
    // users. socket.io-client buffers outgoing events while disconnected
    // and flushes them on reconnect, so in-flight sends are not lost.
    s.on('server:shutdown', () => {
      console.log('[socket] server:shutdown received — reconnecting');
      s.disconnect();
      s.connect();
    });

    // Phase 8 D-02: backend emits caps:invalidated when the user's tier or
    // org membership changes server-side (RevenueCat grant/revoke, org create,
    // role change, member remove, invite accept). The empty body is
    // intentional — mobile re-fetches /api/auth/capabilities via
    // refreshCapabilities(), which is idempotent and cheap. No debounce or
    // dedup state (per D-06) — back-to-back events fire back-to-back
    // refetches; the second response wins.
    s.on('caps:invalidated', (data: { reason?: string }) => {
      console.log('[caps:invalidated] received', data);
      useAuthStore.getState().refreshCapabilities();
      // Phase 15 D-09: also re-hydrate the Chats list so the server's new
      // caps-aware /api/chats filter is reflected immediately. On downgrade
      // this drops non-native timezone_room rows from the UI; on re-upgrade
      // it surfaces them again (membership rows are preserved server-side).
      useChatsStore.getState().hydrate();
    });

    socket = s;
    return s;
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

export function disconnectSocket(): void {
  connecting = null;
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

// ── Room (location-based) chat ─────────────────────────────────────────────
export function sendRoomMessage(content: string, replyToId?: number, mediaUrls?: string[]): void {
  socket?.emit('room:message', { content, replyToId, ...(mediaUrls?.length ? { mediaUrls } : {}) });
}

// ── Direct messages ────────────────────────────────────────────────────────
export function joinConversation(conversationId: number): void {
  socket?.emit('dm:join', { conversationId });
}

export function leaveConversation(conversationId: number): void {
  socket?.emit('dm:leave', { conversationId });
}

export function sendDirectMessage(conversationId: number, content: string, replyToId?: number, mediaUrls?: string[]): void {
  socket?.emit('dm:message', { conversationId, content, replyToId, ...(mediaUrls?.length ? { mediaUrls } : {}) });
}

// ── Typing ─────────────────────────────────────────────────────────────────
export function startTyping(context: { roomId?: string; conversationId?: number }): void {
  socket?.emit('typing:start', context);
}

export function stopTyping(context: { roomId?: string; conversationId?: number }): void {
  socket?.emit('typing:stop', context);
}

// ── Event listeners (return cleanup function) ─────────────────────────────
export function onRoomMessage(cb: (msg: Message) => void): () => void {
  socket?.on('room:message', cb);
  return () => socket?.off('room:message', cb);
}

export function onDirectMessage(cb: (msg: Message) => void): () => void {
  socket?.on('dm:message', cb);
  return () => socket?.off('dm:message', cb);
}

export function onTypingStart(cb: (data: { handle: string }) => void): () => void {
  socket?.on('typing:start', cb);
  return () => socket?.off('typing:start', cb);
}

export function onTypingStop(cb: (data: { handle: string }) => void): () => void {
  socket?.on('typing:stop', cb);
  return () => socket?.off('typing:stop', cb);
}

export function onNotification(cb: (notif: unknown) => void): () => void {
  socket?.on('notification:new', cb);
  return () => socket?.off('notification:new', cb);
}

// Phase 10 D-03: chat-type notifications fan to `chat:notification` (replaces
// the per-source `notification:new` emits in the backend socket handlers).
// Mirror of onNotification — same singleton socket, same cleanup pattern.
export function onChatNotification(cb: (n: unknown) => void): () => void {
  socket?.on('chat:notification', cb);
  return () => socket?.off('chat:notification', cb);
}

export function onNewsAvailable(cb: (data: { count: number }) => void): () => void {
  socket?.on('news:new', cb);
  return () => socket?.off('news:new', cb);
}

// Phase 12: broadcast emitted when a public, non-archived group receives a
// new message — Chevra subscribes so its row preview updates without
// requiring a manual refresh or focus-cycle.
export type ChevraGroupMessagePayload = {
  conversationId: number;
  name: string;
  iconUrl: string | null;
  lastMessage: {
    content: string;
    createdAt: string;
    senderHandle: string;
  };
};
export function onChevraGroupMessage(
  cb: (data: ChevraGroupMessagePayload) => void,
): () => void {
  socket?.on('chevra:group-message', cb);
  return () => socket?.off('chevra:group-message', cb);
}

// Phase 12: server tells a user their participation in a conversation ended
// (e.g. admin kick) so their Chats list refreshes + any open chat screen
// ejects to the list.
export type ChatRemovedPayload = {
  conversationId: number;
  reason: 'kicked' | 'archived';
};
export function onChatRemoved(
  cb: (data: ChatRemovedPayload) => void,
): () => void {
  socket?.on('chat:removed', cb);
  return () => socket?.off('chat:removed', cb);
}

export function onMessageRejected(cb: (data: { reason?: string }) => void): () => void {
  socket?.on('message:rejected', cb);
  return () => socket?.off('message:rejected', cb);
}

export function onMessageEdited(cb: (data: {
  messageId: number;
  content: string;
  editedAt: string;
  roomId: string | null;
  conversationId: number | null;
}) => void): () => void {
  socket?.on('message:edited', cb);
  return () => socket?.off('message:edited', cb);
}

// ── Reactions ────────────────────────────────────────────────────────────────
export function onReactionUpdate(cb: (data: {
  messageId: number;
  emoji: string;
  userId: number;
  userHandle: string;
  action: 'add' | 'remove';
  roomId?: string;
  conversationId?: number;
}) => void): () => void {
  socket?.on('reaction:update', cb);
  return () => { socket?.off('reaction:update', cb); };
}

// ── Globe rooms ─────────────────────────────────────────────────────────────
export function joinGlobeRoom(slug: string): void {
  socket?.emit('globe:join', { slug });
}

export function leaveGlobeRoom(slug: string): void {
  socket?.emit('globe:leave', { slug });
}

export function sendGlobeMessage(slug: string, content: string, replyToId?: number, mediaUrls?: string[]): void {
  socket?.emit('globe:message', { slug, content, replyToId, ...(mediaUrls?.length ? { mediaUrls } : {}) });
}

export function sendGlobeTyping(slug: string, isTyping: boolean): void {
  socket?.emit('globe:typing', { slug, isTyping });
}

// ── Globe event listeners (return cleanup function) ─────────────────────────
export function onGlobeMessage(callback: (data: any) => void): () => void {
  socket?.on('globe:message', callback);
  return () => { socket?.off('globe:message', callback); };
}

export function onGlobeParticipants(callback: (data: { slug: string; count: number }) => void): () => void {
  socket?.on('globe:participants', callback);
  return () => { socket?.off('globe:participants', callback); };
}

export function onGlobeTyping(callback: (data: { slug: string; handle: string; isTyping: boolean }) => void): () => void {
  socket?.on('globe:typing', callback);
  return () => { socket?.off('globe:typing', callback); };
}

export function onGlobeAgeGated(callback: (data: { hoursRemaining: number }) => void): () => void {
  socket?.on('globe:age_gated', callback);
  return () => { socket?.off('globe:age_gated', callback); };
}

export function onGlobeRateLimited(callback: (data: { retryAfterMs: number }) => void): () => void {
  socket?.on('globe:rate_limited', callback);
  return () => { socket?.off('globe:rate_limited', callback); };
}

// ── Media events ────────────────────────────────────────────────────────────
export function onMediaRemoved(cb: (data: { messageId: number; removedUrls: string[]; remainingUrls: string[] }) => void): () => void {
  socket?.on('message:media_removed', cb);
  return () => { socket?.off('message:media_removed', cb); };
}

export function onMediaRejected(cb: (data: { messageId: number; category: string; message: string }) => void): () => void {
  socket?.on('message:media_rejected', cb);
  return () => { socket?.off('message:media_rejected', cb); };
}

// ── Pinned messages ─────────────────────────────────────────────────────────
import type { PinnedMessageRow } from './api';

export interface PinEventPayload {
  action: 'pin' | 'unpin';
  roomId?: string;
  conversationId?: number;
  slug?: string;
  pin: PinnedMessageRow | null;
}

/** Listener for timezone room pin events (room:pinned). */
export function onRoomPinned(cb: (payload: PinEventPayload) => void): () => void {
  socket?.on('room:pinned', cb);
  return () => socket?.off('room:pinned', cb);
}

/** Listener for DM / group conversation pin events (dm:pinned). */
export function onDmPinned(cb: (payload: PinEventPayload) => void): () => void {
  socket?.on('dm:pinned', cb);
  return () => socket?.off('dm:pinned', cb);
}

/** Listener for Globe room pin events (globe:pinned). */
export function onGlobePinned(cb: (payload: PinEventPayload) => void): () => void {
  socket?.on('globe:pinned', cb);
  return () => socket?.off('globe:pinned', cb);
}
