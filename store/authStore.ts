import { create } from 'zustand';
import type { User, Capabilities } from '@/types';
import { setToken, clearToken, auth } from '@/services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  capabilities: Capabilities | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;

  setAuth: (token: string, user: User, capabilities: Capabilities, needsOnboarding?: boolean) => Promise<void>;
  setCapabilities: (capabilities: Capabilities) => void;
  refreshCapabilities: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  completeOnboarding: (updates: Partial<User>) => void;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  capabilities: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: false,

  setAuth: async (token, user, capabilities, needsOnboarding = false) => {
    await setToken(token);
    set({ token, user, capabilities, isAuthenticated: true, isLoading: false, needsOnboarding });
  },

  setCapabilities: (capabilities) => set({ capabilities }),

  refreshCapabilities: async () => {
    try {
      const { capabilities } = await auth.capabilities();
      set({ capabilities });
    } catch (err) {
      // Leave existing capabilities in place. Logged at warn so a stuck
      // refresh is debuggable from the Metro console — silent failure here
      // previously masked a bug.
      console.warn('[capabilities] refresh failed', err);
    }
  },

  // Foreground refresh of the whole session (user + capabilities). Used
  // when the app comes back from background and after RevenueCat
  // purchase/restore, ensuring both the user shape and capability grants
  // are current. The 403-retry path in services/api.ts uses
  // refreshCapabilities (above), which hits the cheaper capabilities-only
  // endpoint.
  refreshSession: async () => {
    try {
      const { user, capabilities } = await auth.me();
      set({ user, capabilities });
    } catch (err) {
      console.warn('[session] refresh failed', err);
    }
  },

  updateUser: (updates) =>
    set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),

  completeOnboarding: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
      needsOnboarding: false,
    })),

  logout: async () => {
    await clearToken();
    set({ user: null, token: null, capabilities: null, isAuthenticated: false, needsOnboarding: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
