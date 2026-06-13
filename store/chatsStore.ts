import { create } from 'zustand';
import type { ChatsRow, ChatNotification } from '@/types';
import { chat, chats } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { getZoneForTimezone } from '@/utils/timezoneZones';

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
  // Phase 20: per-user archive state
  archivedRows: ChatsRow[];
  archivedLoading: boolean;
  _loadingArchived: boolean;
  hydrate: () => Promise<void>;
  applyChatNotification: (n: ChatNotification) => void;
  applyRoomMessage: (msg: { roomId?: string; senderId?: number; content?: string; createdAt?: string }) => void;
  applyGlobeMessage: (msg: { slug?: string; roomId?: string; senderId?: number; content?: string; createdAt?: string; mentions?: number[]; replyToId?: number | null }) => void;
  applyDmMessage: (msg: { conversationId?: number; senderId?: number; content?: string; createdAt?: string }) => void;
  clearRowUnread: (key: RowKey) => void;
  setCurrentlyViewing: (entityId: string | number | null) => void;
  // Phase 20: archive actions
  loadArchivedRows: () => Promise<void>;
  archiveRow: (conversationId: number) => Promise<void>;
  unarchiveRow: (conversationId: number) => Promise<void>;
}

// Per-row matcher: returns true if `row` is the row identified by `entityId`.
function rowMatchesEntity(row: ChatsRow, entityId: string | number): boolean {
  if (row.type === 'dm' || row.type === 'group') return row.conversationId === entityId;
  if (row.type === 'town_square') return entityId === 'town-square';
  if (row.type === 'local_chat')
    return row.timezoneIana === entityId
      || row.timezoneZone === entityId
      || getZoneForTimezone(row.timezoneIana) === entityId;
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
  // Phase 20: archive state — starts empty, lazy-loaded on Archive pill tap
  archivedRows: [],
  archivedLoading: false,
  _loadingArchived: false,

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
    // D-09 two-signal invariant: room:message updates lastMessage ONLY; unread
    // is driven exclusively by applyChatNotification (chat:notification via the
    // user:<id> room). Plan 16-02 deleted the broadcast chat:notification so
    // this listener temporarily bumped unread directly — but Plan 16-07
    // RE-INTRODUCED the per-member chat:notification fan-out (roomHandler.ts
    // plain-message path), and timezone (Local) rooms are AUTO-JOINED on connect
    // (socket index.ts), so every non-viewing member now receives BOTH
    // room:message AND chat:notification. Bumping here too double-counts
    // (+2/msg — the LOCAL-room form of ISSUE-6, mirroring the applyGlobeMessage
    // fix). DMs do not double: conversation rooms join on-demand via dm:join,
    // so non-viewing DM recipients get chat:notification only. (16-11 follow-up)
    if (lastMessage === null) return;
    set((s) => ({ rows: applyToRow(s.rows, timezoneIana, lastMessage, false) }));
  },

  applyGlobeMessage: (msg) => {
    // Phase 11 D-04: applies to ANY joined regional Globe room row AND Town Square.
    // `applyToRow` is a no-op when no row matches (rowMatchesEntity returns false),
    // so a globe:message for a room the user hasn't joined silently drops here.
    // D-16: REST-route join/system announcements arrive as globe:message with
    // kind:'system'. Skip lastMessage update for system msgs.
    const isSystemMsg = (msg as { kind?: string }).kind === 'system';
    const slug = msg.slug ?? msg.roomId?.replace('globe:', '');
    if (!slug) return;
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    // D-09 two-signal invariant: globe:message updates lastMessage ONLY.
    // Unread bumps are driven exclusively by applyChatNotification (chat:notification
    // via the user:<id> room). Globe rooms are already in globe-feed auto-join so
    // every member receives BOTH globe:message AND chat:notification — bumping here
    // too causes double-count (+2 per message). Removing the bump restores D-09
    // and matches the applyDmMessage / applyRoomMessage original intent. (ISSUE-6)
    if (isSystemMsg || lastMessage === null) return;
    set((s) => ({ rows: applyToRow(s.rows, slug, lastMessage, false) }));
  },

  applyDmMessage: (msg) => {
    if (typeof msg.conversationId !== 'number') return;
    const viewing = get().currentlyViewing;
    const me = useAuthStore.getState().user?.id;
    const alsoBump = viewing !== msg.conversationId && msg.senderId !== me;
    const lastMessage =
      msg.content && msg.createdAt ? { preview: msg.content, at: msg.createdAt } : null;
    // Fix 3: if alsoBump but no row matches yet, hydrate so new row surfaces.
    if (alsoBump && !get().rows.some((r) => rowMatchesEntity(r, msg.conversationId!))) {
      get().hydrate();
    } else {
      set((s) => ({ rows: applyToRow(s.rows, msg.conversationId!, lastMessage, alsoBump) }));
    }
  },

  clearRowUnread: (key) => {
    set((s) => ({
      rows: s.rows.map((row) => (rowMatchesKey(row, key) ? { ...row, unreadCount: 0 } : row)),
    }));
  },

  setCurrentlyViewing: (entityId) => set({ currentlyViewing: entityId }),

  // Phase 20: load archived rows — lazy, deduped via _loadingArchived guard.
  // Silent on error (mirrors hydrate() catch pattern).
  loadArchivedRows: async () => {
    if (get()._loadingArchived) return;
    set({ _loadingArchived: true, archivedLoading: true });
    try {
      const { rows } = await chats.listArchived();
      set({ archivedRows: rows, archivedLoading: false });
    } catch {
      set({ archivedLoading: false });
    } finally {
      set({ _loadingArchived: false });
    }
  },

  // Phase 20: optimistically move a dm/group row from rows → archivedRows,
  // then confirm with the server. Rolls back via hydrate() + loadArchivedRows()
  // on API failure.
  archiveRow: async (conversationId: number) => {
    const current = get().rows;
    const target = current.find(
      (r) => (r.type === 'dm' || r.type === 'group') && r.conversationId === conversationId,
    );
    if (!target) return; // no-op gracefully if not found or not dm/group

    // Optimistic: remove from main list, prepend to archived list with isUserArchived true
    const archivedTarget: ChatsRow = { ...target, isUserArchived: true } as ChatsRow;
    set((s) => ({
      rows: s.rows.filter(
        (r) => !((r.type === 'dm' || r.type === 'group') && r.conversationId === conversationId),
      ),
      archivedRows: [archivedTarget, ...s.archivedRows],
    }));

    try {
      await chat.archive(conversationId);
    } catch {
      // Roll back: re-sync both lists from server
      get().hydrate();
      get().loadArchivedRows();
    }
  },

  // Phase 20: optimistically remove a row from archivedRows, call unarchive,
  // then hydrate() so the row reappears in the main list (server cleared archived_at).
  // Rolls back via loadArchivedRows() + hydrate() on failure.
  unarchiveRow: async (conversationId: number) => {
    const hasRow = get().archivedRows.some(
      (r) => (r.type === 'dm' || r.type === 'group') && r.conversationId === conversationId,
    );
    if (!hasRow) return; // no-op gracefully if not found

    // Optimistic: remove from archived list
    set((s) => ({
      archivedRows: s.archivedRows.filter(
        (r) => !((r.type === 'dm' || r.type === 'group') && r.conversationId === conversationId),
      ),
    }));

    try {
      await chat.unarchive(conversationId);
      // On success, hydrate main list so the unarchived row surfaces
      get().hydrate();
    } catch {
      // Roll back: re-sync both lists from server
      get().loadArchivedRows();
      get().hydrate();
    }
  },
}));

// ── Derived selectors ───────────────────────────────────────────────────
export const selectChatsHasUnread = (s: ChatsState): boolean =>
  s.rows.some((r) => (r.unreadCount ?? 0) > 0);
