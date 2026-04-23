import { create } from 'zustand';
import type { User } from '@/types';
import { setToken, clearToken } from '@/services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;

  setAuth: (token: string, user: User, needsOnboarding?: boolean) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  completeOnboarding: (updates: Partial<User>) => void;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: false,

  setAuth: async (token, user, needsOnboarding = false) => {
    await setToken(token);
    set({ token, user, isAuthenticated: true, isLoading: false, needsOnboarding });
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
    set({ user: null, token: null, isAuthenticated: false, needsOnboarding: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
