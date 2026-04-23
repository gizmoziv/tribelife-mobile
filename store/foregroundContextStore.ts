import { create } from 'zustand';

// What the user is currently looking at while the app is foregrounded. Used
// by services/pushNotifications.ts to decide whether an incoming push should
// surface as an OS banner (the in-app UI already shows it) or be suppressed.
export type ForegroundContext =
  | { type: 'chat'; conversationId: number }
  | { type: 'localChat' }
  | { type: 'globe'; roomSlug: string }
  | { type: 'news' }
  | { type: 'none' };

interface State {
  context: ForegroundContext;
  setContext: (context: ForegroundContext) => void;
}

export const useForegroundContextStore = create<State>((set) => ({
  context: { type: 'none' },
  setContext: (context) => set({ context }),
}));
