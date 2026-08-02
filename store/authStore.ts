import { create } from 'zustand';
import type { User, Capabilities, AccessStatus } from '@/types';
import { setToken, clearToken, auth, extractAccessStatus } from '@/services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  capabilities: Capabilities | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  // Phase 35: null = not gated (existing user, or old server build that omits
  // the field). 'pending'/'rejected' drives the root-layout block gate.
  accessStatus: AccessStatus | null;

  setAuth: (token: string, user: User, capabilities: Capabilities, needsOnboarding?: boolean, accessStatus?: AccessStatus | null) => Promise<void>;
  setCapabilities: (capabilities: Capabilities) => void;
  setAccessStatus: (status: AccessStatus | null) => void;
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
  accessStatus: null,

  setAuth: async (token, user, capabilities, needsOnboarding = false, accessStatus = null) => {
    await setToken(token);
    set({ token, user, capabilities, isAuthenticated: true, isLoading: false, needsOnboarding, accessStatus });
  },

  setCapabilities: (capabilities) => set({ capabilities }),

  // Phase 35: consumed by 35-02 after a successful access-request submission
  // (D-09: submission sets accessStatus = 'pending' locally, reconciled by
  // the refreshSession() call that follows it).
  setAccessStatus: (status) => set({ accessStatus: status }),

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
      // Phase 35: keep the WHOLE auth.me() response instead of destructuring
      // only user/capabilities — this is the mechanism D-17's foreground
      // unlock depends on. Destructuring here would silently drop accessStatus.
      const meResponse = await auth.me();
      set({
        user: meResponse.user,
        capabilities: meResponse.capabilities,
        accessStatus: extractAccessStatus(meResponse),
      });
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
    set({ user: null, token: null, capabilities: null, isAuthenticated: false, needsOnboarding: false, accessStatus: null });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
