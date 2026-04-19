import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/constants';
import { getToken } from './api';
import type { Message } from '@/types';

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
      transports: ['websocket'],   // websocket-only: eliminates polling handshake + sticky-session requirement
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

export function onMessageRejected(cb: (data: { reason?: string }) => void): () => void {
  socket?.on('message:rejected', cb);
  return () => socket?.off('message:rejected', cb);
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
