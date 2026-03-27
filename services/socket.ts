import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/constants';
import { getToken } from './api';
import type { Message } from '@/types';

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await getToken();

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

// ── Room (location-based) chat ─────────────────────────────────────────────
export function sendRoomMessage(content: string): void {
  socket?.emit('room:message', { content });
}

// ── Direct messages ────────────────────────────────────────────────────────
export function joinConversation(conversationId: number): void {
  socket?.emit('dm:join', { conversationId });
}

export function leaveConversation(conversationId: number): void {
  socket?.emit('dm:leave', { conversationId });
}

export function sendDirectMessage(conversationId: number, content: string): void {
  socket?.emit('dm:message', { conversationId, content });
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

// ── Globe rooms ─────────────────────────────────────────────────────────────
export function joinGlobeRoom(slug: string): void {
  socket?.emit('globe:join', { slug });
}

export function leaveGlobeRoom(slug: string): void {
  socket?.emit('globe:leave', { slug });
}

export function sendGlobeMessage(slug: string, content: string): void {
  socket?.emit('globe:message', { slug, content });
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
