import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/constants';
import type {
  User,
  Conversation,
  Message,
  Beacon,
  BeaconMatch,
  Notification,
  PublicProfile,
} from '@/types';

const TOKEN_KEY = 'tribelife_jwt';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? 'Request failed', res.status, data);
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
  googleSignIn: (idToken: string) =>
    request<{ token: string; user: User; needsOnboarding: boolean; isNewUser: boolean }>(
      '/api/auth/google',
      { method: 'POST', body: JSON.stringify({ idToken }) }
    ),

  onboarding: (handle: string, timezone: string) =>
    request('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ handle, timezone }),
    }),

  checkHandle: (handle: string) =>
    request<{ available: boolean; reason?: string }>(`/api/auth/handle-check/${handle}`),

  me: () => request<{ user: User }>('/api/auth/me'),

  updatePushToken: (expoPushToken: string) =>
    request('/api/auth/push-token', {
      method: 'PUT',
      body: JSON.stringify({ expoPushToken }),
    }),
};

// ── Chat ───────────────────────────────────────────────────────────────────
export const chat = {
  getConversations: () =>
    request<{ conversations: Conversation[] }>('/api/chat/conversations'),

  getOrCreateConversation: (otherUserId: number) =>
    request<{ conversationId: number; isNew: boolean }>('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),

  getConversationMessages: (conversationId: number, before?: string) =>
    request<{ messages: Message[]; hasMore: boolean }>(
      `/api/chat/conversations/${conversationId}/messages${before ? `?before=${before}` : ''}`
    ),

  getRoomMessages: (roomId: string, before?: string) =>
    request<{ messages: Message[]; hasMore: boolean }>(
      `/api/chat/room/${encodeURIComponent(roomId)}/messages${before ? `?before=${before}` : ''}`
    ),
};

// ── Beacons ────────────────────────────────────────────────────────────────
export const beacons = {
  create: (rawText: string) =>
    request<{ beacon: Beacon }>('/api/beacons', {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    }),

  mine: () => request<{ beacons: Beacon[] }>('/api/beacons/mine'),

  deactivate: (id: number) =>
    request(`/api/beacons/${id}`, { method: 'DELETE' }),

  getMatches: () => request<{ matches: BeaconMatch[] }>('/api/beacons/matches'),

  markMatchViewed: (matchId: number) =>
    request(`/api/beacons/matches/${matchId}/viewed`, { method: 'PUT' }),
};

// ── Notifications ──────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () =>
    request<{ notifications: Notification[]; unreadCount: number }>('/api/notifications'),

  readAll: () => request('/api/notifications/read-all', { method: 'PUT' }),

  read: (id: number) => request(`/api/notifications/${id}/read`, { method: 'PUT' }),
};

// ── Users ──────────────────────────────────────────────────────────────────
export const usersApi = {
  getProfile: (handle: string) =>
    request<{ user: PublicProfile }>(`/api/users/${handle}`),

  searchByHandle: (q: string) =>
    request<{ users: PublicProfile[] }>(`/api/users/search/handle?q=${encodeURIComponent(q)}`),
};
