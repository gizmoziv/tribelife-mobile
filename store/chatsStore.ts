import { create } from 'zustand';
import type { ChatsRow, ChatNotification } from '@/types';
import { chats } from '@/services/api';

// ── Phase 10: useChatsStore ─────────────────────────────────────────────
// Single source of truth for the Chats screen rows + per-row unread counts
// (per 10-CONTEXT.md D-07). Single source of truth replacing the legacy per-source
// stores + the Chats-tab read of useGlobeStore.unreadCounts['town-square'].
//
// Hydration: `hydrate()` fetches GET /api/chats (Phase 9 endpoint) and
// replaces `rows`. Called on Chats screen mount, pull-to-refresh, AppState
// 'active' transitions. In-flight guard via `_hydrating` flag (mirrors the
// Phase 1 refreshSession dedupe pattern at app/_layout.tsx:283-316).
//
// Live updates: per-source `apply*` methods called from socket listeners in
// app/_layout.tsx (Plan 10-03). `applyChatNotification` is the primary
// signal for unread bumps; the per-source message events (`room:message`,
// `globe:message`, `dm:message`) update `lastMessage` only — they do NOT
// bump unread (per 10-CONTEXT.md D-09 two-signal pattern).
//
// Optimistic clear: `clearRowUnread` is called on screen mount of the
// matching conversation/room (Plan 10-03). The screen separately calls the
// existing server mark-read endpoint; failure does not roll back.
//
// `currentlyViewing` holds the `entityId` of the currently-viewed
// conversation/room screen. `applyChatNotification` and `applyDmMessage`
// skip the unread bump when the incoming entityId matches `currentlyViewing`
// (mirrors the existing in-chat-message-suppression pattern from
// useForegroundContextStore + chat/local.tsx).

type RowKey =
  | { type: 'dm'; conversationId: number }
  | { type: 'group'; conversationId: number }
  | { type: 'town_square'; roomSlug: string }
  | { type: 'local_chat'; timezoneIana: string };

interface ChatsState {
  rows: ChatsRow[];
  loading: boolean;
  currentlyViewing: string | number | null;
  _hydrating: boolean;
  hydrate: () => Promise<void>;
  applyChatNotification: (n: ChatNotification) => void;
  applyRoomMessage: (msg: { roomId?: string; senderId?: number; content?: string; createdAt?: string }) => void;
  applyGlobeMessage: (msg: { slug?: string; roomId?: string; senderId?: number; content?: string; createdAt?: string; mentions?: number[]; replyToId?: number | null }) => void;
  applyDmMessage: (msg: { conversationId?: number; senderId?: number; content?: string; createdAt?: string }) => void;
  clearRowUnread: (key: RowKey) => void;
  setCurrentlyViewing: (entityId: string | number | null) => void;
}

// Per-row matcher: returns true if `row` is the row identified by `entityId`.
function rowMatchesEntity(row: ChatsRow, entityId: string | number): boolean {
  if (row.type === 'dm' || row.type === 'group') return row.conversationId === entityId;
  if (row.type === 'town_square') return entityId === 'town-square';
  if (row.type === 'local_chat') return row.timezoneIana === entityId;
  return false;
}

function rowMatchesKey(row: ChatsRow, key: RowKey): boolean {
  if (key.type === 'dm' && row.type === 'dm') return row.conversationId === key.conversationId;
  if (key.type === 'group' && row.type === 'group') return row.conversationId === key.conversationId;
  if (key.type === 'town_square' && row.type === 'town_square') return row.roomSlug === key.roomSlug;
  if (key.type === 'local_chat' && row.type === 'local_chat') return row.timezoneIana === key.timezoneIana;
  return false;
}

function applyToRow(
  rows: ChatsRow[],
  entityId: string | number,
  lastMessage: { preview: string; at: string } | null,
  alsoBump: boolean,
): ChatsRow[] {
  return rows.map((row) => {
    if (!rowMatchesEntity(row, entityId)) return row;
    return {
      ...row,
      unreadCount: alsoBump ? (row.unreadCount ?? 0) + 1 : (row.unreadCount ?? 0),
      lastMessage: lastMessage ?? row.lastMessage,
    } as ChatsRow;
  });
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  rows: [],
  loading: true,
  currentlyViewing: null,
  _hydrating: false,

  hydrate: async () => {
    if (get()._hydrating) return; // dedupe rapid AppState 'active' toggles
    set({ _hydrating: true });
    try {
      const { rows } = await chats.list();
      set({ rows, loading: false });
    } catch {
      // Silent — next hydrate attempt recovers. Existing rows stay.
      set({ loading: false });
    } finally {
      set({ _hydrating: false });
    }
  },

  applyChatNotification: (n) => {
    const viewing = get().currentlyViewing;
    const alsoBump = viewing !== n.entityId;
    const lastMessage = { preview: n.body, at: new Date().toISOString() };
    set((s) => ({ rows: applyToRow(s.rows, n.entityId, lastMessage, alsoBump) }));
  },

  applyRoomMessage: (msg) => {
    // Local Chat row — `roomId` is `'timezone:America/New_York'`.
    if (!msg.roomId || !msg.roomId.startsWith('timezone:')) return;
    const timezoneIana = msg.roomId.replace('timezone:', '');
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    // No unread bump — `chat:notification` is the authoritative bump signal (D-09).
    set((s) => ({ rows: applyToRow(s.rows, timezoneIana, lastMessage, false) }));
  },

  applyGlobeMessage: (msg) => {
    // Only Town Square is in the Chats list; other globe rooms aren't.
    const slug = msg.slug ?? msg.roomId?.replace('globe:', '');
    if (slug !== 'town-square') return;
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    set((s) => ({ rows: applyToRow(s.rows, 'town-square', lastMessage, false) }));
  },

  applyDmMessage: (msg) => {
    if (typeof msg.conversationId !== 'number') return;
    const viewing = get().currentlyViewing;
    const alsoBump = viewing !== msg.conversationId;
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    set((s) => ({ rows: applyToRow(s.rows, msg.conversationId!, lastMessage, alsoBump) }));
  },

  clearRowUnread: (key) => {
    set((s) => ({
      rows: s.rows.map((row) => (rowMatchesKey(row, key) ? { ...row, unreadCount: 0 } : row)),
    }));
  },

  setCurrentlyViewing: (entityId) => set({ currentlyViewing: entityId }),
}));

// ── Derived selectors ───────────────────────────────────────────────────
export const selectChatsHasUnread = (s: ChatsState): boolean =>
  s.rows.some((r) => (r.unreadCount ?? 0) > 0);
