import { create } from 'zustand';

// Phase 9 D-07: the Chats tab re-tap listener in (app)/_layout.tsx needs to
// trigger TWO actions that live inside the ChatsScreen component:
//   1. Clear the search input (state held in ChatsScreen)
//   2. Scroll the FlatList to offset 0 (ref held in ChatsScreen)
//
// We avoid prop-drilling and module-mutable-refs by routing through a tiny
// Zustand store: ChatsScreen registers the callback at mount; the listener
// calls .getState().clearAndScrollToTop(). Registering replaces — only one
// ChatsScreen instance is ever mounted, so there is no race.

interface State {
  clearAndScrollToTop: () => void;
}

export const useChatsListRefStore = create<State>(() => ({
  clearAndScrollToTop: () => { /* no-op until ChatsScreen mounts and registers */ },
}));
