import { create } from 'zustand';

// Sub-tab selection inside the Chat screen (Local timezone vs Direct Messages).
// Lifted into a global store so the bottom-tab listener in (app)/_layout.tsx
// can reset to 'local' on a re-tap of the Chat bottom-nav icon while the
// screen is already focused — Amazon-style "tap the active tab to go home".
export type ChatTab = 'local' | 'dms';

interface State {
  activeTab: ChatTab;
  setActiveTab: (tab: ChatTab) => void;
}

export const useChatTabStore = create<State>((set) => ({
  activeTab: 'local',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
