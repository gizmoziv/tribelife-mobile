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
