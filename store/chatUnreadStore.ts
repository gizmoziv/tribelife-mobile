/**
 * @deprecated Phase 10 — DELETED in Plan 10-03 once consumers are migrated.
 * Replaced by `useChatsStore` (per .planning/phases/10-notification-consolidation
 * /10-CONTEXT.md D-07). The Chats screen now reads `useChatsStore.rows` for
 * per-DM/per-group unread counts; the Chats-tab badge reads
 * `selectChatsHasUnread(useChatsStore)`.
 *
 * Do NOT add new consumers. The file ships in the repo only long enough for
 * Plan 10-03 to remove its last import sites; the `git rm` follows.
 */
import { create } from 'zustand';

// Tiny store for the Chat tab's aggregate unread badge. The chat list screen
// is the authoritative source (it fetches /api/chat/conversations with
// per-row unreadCount); after each fetch it publishes the sum here so the
// Chat tab icon in (app)/_layout.tsx can render a badge without having to
// own the same network call.
interface State {
  totalUnread: number;
  setTotalUnread: (totalUnread: number) => void;
}

export const useChatUnreadStore = create<State>((set) => ({
  totalUnread: 0,
  setTotalUnread: (totalUnread) => set({ totalUnread }),
}));
