/**
 * @deprecated Phase 10 — DELETED in Plan 10-03 once consumers are migrated.
 * Replaced by `useChatsStore` (per .planning/phases/10-notification-consolidation
 * /10-CONTEXT.md D-07). The Chats screen now reads `useChatsStore.rows` for the
 * Local Chat row's unread count.
 *
 * Do NOT add new consumers. The file ships in the repo only long enough for
 * Plan 10-03 to remove its last import sites; the `git rm` follows.
 */
import { create } from 'zustand';

// Tracks how many timezone-room messages have arrived while the user is not
// actively viewing Local Chat. Mirrors the globe pattern: incremented on the
// live `room:message` event in (app)/_layout.tsx, reset when LocalChatPanel
// gains focus. Combined with useChatUnreadStore.totalUnread (DM + group) to
// drive the Chat tab badge.
interface State {
  unread: number;
  increment: () => void;
  reset: () => void;
}

export const useLocalChatUnreadStore = create<State>((set) => ({
  unread: 0,
  increment: () => set((s) => ({ unread: s.unread + 1 })),
  reset: () => set({ unread: 0 }),
}));
