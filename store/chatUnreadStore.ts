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
