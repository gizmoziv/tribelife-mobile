import { create } from 'zustand';
import type { ChatsRow, ChatNotification } from '@/types';
import { chats } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

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
  | { type: 'local_chat'; timezoneIana: string }
  | { type: 'globe_room'; roomSlug: string }
  | { type: 'timezone_room'; zoneSlug: string };

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
  if (row.type === 'globe_room') return row.roomSlug === entityId;
  if (row.type === 'timezone_room') return row.zoneSlug === entityId;
  return false;
}

function rowMatchesKey(row: ChatsRow, key: RowKey): boolean {
  if (key.type === 'dm' && row.type === 'dm') return row.conversationId === key.conversationId;
  if (key.type === 'group' && row.type === 'group') return row.conversationId === key.conversationId;
  if (key.type === 'town_square' && row.type === 'town_square') return row.roomSlug === key.roomSlug;
  if (key.type === 'local_chat' && row.type === 'local_chat') return row.timezoneIana === key.timezoneIana;
  if (key.type === 'globe_room' && row.type === 'globe_room') return row.roomSlug === key.roomSlug;
  if (key.type === 'timezone_room' && row.type === 'timezone_room') return row.zoneSlug === key.zoneSlug;
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
    // If the row already exists, in-place bump (cheap, no network).
    // If not — e.g. brand-new DM that the recipient hasn't hydrated yet —
    // applyToRow would silently no-op; trigger a hydrate so the new row
    // surfaces (and brings the yellow-dot tab badge with it). _hydrating
    // dedupes rapid back-to-back notifications.
    const hasMatchingRow = get().rows.some((r) => rowMatchesEntity(r, n.entityId));
    if (hasMatchingRow) {
      set((s) => ({ rows: applyToRow(s.rows, n.entityId, lastMessage, alsoBump) }));
    } else {
      get().hydrate();
    }
    // Group membership-change system notifications change the row's
    // memberCount, which `applyToRow` doesn't touch. Re-hydrate to pull
    // fresh counts. Match by body suffix to avoid coupling to a structured
    // event type that backend doesn't currently emit.
    if (/(joined|left) the community$/.test(n.body)) {
      get().hydrate();
    }
  },

  applyRoomMessage: (msg) => {
    // Local Chat row — `roomId` is `'timezone:America/New_York'`.
    if (!msg.roomId || !msg.roomId.startsWith('timezone:')) return;
    const timezoneIana = msg.roomId.replace('timezone:', '');
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    // Plan 16-02 deleted the broadcast chat:notification that used to drive
    // plain-message unread bumps. The message-arrival listener must now bump
    // directly — but only for non-self, non-viewing recipients (NOTIF-01).
    // Plain room:message is broadcast back to the sender's own socket, so the
    // senderId !== me guard is REQUIRED to prevent sender self-bump.
    const me = useAuthStore.getState().user?.id;
    const alsoBump =
      msg.senderId != null && msg.senderId !== me && get().currentlyViewing !== timezoneIana;
    set((s) => ({ rows: applyToRow(s.rows, timezoneIana, lastMessage, alsoBump) }));
  },

  applyGlobeMessage: (msg) => {
    // Phase 11 D-04: applies to ANY joined regional Globe room row AND Town Square.
    // `applyToRow` is a no-op when no row matches (rowMatchesEntity returns false),
    // so a globe:message for a room the user hasn't joined silently drops here.
    // Plan 16-02 deleted the broadcast chat:notification that used to drive
    // plain-message unread bumps. The message-arrival listener must now bump
    // directly — but only for non-self, non-viewing recipients (NOTIF-01).
    // Plain globe:message is broadcast back to the sender's own socket, so the
    // senderId !== me guard is REQUIRED to prevent sender self-bump.
    const slug = msg.slug ?? msg.roomId?.replace('globe:', '');
    if (!slug) return;
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    const me = useAuthStore.getState().user?.id;
    const alsoBump =
      msg.senderId != null && msg.senderId !== me && get().currentlyViewing !== slug;
    set((s) => ({ rows: applyToRow(s.rows, slug, lastMessage, alsoBump) }));
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
