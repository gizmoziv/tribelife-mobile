import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/constants';
import type {
  User,
  Capabilities,
  Conversation,
  Message,
  Beacon,
  BeaconMatch,
  Notification,
  PublicProfile,
  GlobeRoom,
  GlobeMessage,
  GroupMember,
  NewsArticle,
  ReactionGroup,
  ChatsListResponse,
  SearchResponse,
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
  options: RequestInit = {},
  retried: boolean = false,
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

  const data = await res.json().catch(() => ({}));

  if (res.status === 403 && data && data.capabilityViolation === true && !retried) {
    // Stale capabilities — refresh once and retry the original request.
    // Lazy require to avoid circular import (authStore imports api).
    const { useAuthStore } = await import('@/store/authStore');
    await useAuthStore.getState().refreshCapabilities();
    return request<T>(path, options, true);
  }

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
    request<{ token: string; user: User; needsOnboarding: boolean; isNewUser: boolean; capabilities: Capabilities }>(
      '/api/auth/google',
      { method: 'POST', body: JSON.stringify({ idToken }) }
    ),

  appleSignIn: (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null } | null, email?: string | null) =>
    request<{ token: string; user: User; needsOnboarding: boolean; isNewUser: boolean; capabilities: Capabilities }>(
      '/api/auth/apple',
      { method: 'POST', body: JSON.stringify({ identityToken, fullName, email }) }
    ),

  onboarding: (
    handle: string,
    timezone: string,
    acceptedTerms: boolean,
    referralCode?: string,
    attributionSource?: 'handle_code' | 'profile_share' | 'group_invite',
  ) =>
    request('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({
        handle,
        timezone,
        acceptedTerms,
        ...(referralCode ? { referralCode } : {}),
        ...(attributionSource ? { attributionSource } : {}),
      }),
    }),

  checkHandle: (handle: string) =>
    request<{ available: boolean; reason?: string }>(`/api/auth/handle-check/${handle}`),

  updateHandle: (handle: string) =>
    request<{ handle: string; handleUpdatedAt: string; nextChangeAt: string }>(
      '/api/auth/handle',
      { method: 'PUT', body: JSON.stringify({ handle }) }
    ),

  updateBio: (bio: string | null) =>
    request<{ bio: string | null }>(
      '/api/auth/me/bio',
      { method: 'PUT', body: JSON.stringify({ bio }) },
    ),

  me: (timezone?: string) =>
    request<{ user: User; needsOnboarding: boolean; capabilities: Capabilities }>(`/api/auth/me${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ''}`),

  capabilities: () =>
    request<{ capabilities: Capabilities }>('/api/auth/capabilities'),

  updatePushToken: (expoPushToken: string) =>
    request('/api/auth/push-token', {
      method: 'PUT',
      body: JSON.stringify({ expoPushToken }),
    }),

  deleteAccount: () =>
    request<{ ok: boolean }>('/api/auth/account', { method: 'DELETE' }),
};

// ── Chat ───────────────────────────────────────────────────────────────────
export const chat = {
  getConversations: () =>
    request<{ conversations: Conversation[] }>('/api/chat/conversations'),

  markAllRead: () =>
    request<{ ok: true }>('/api/chat/conversations/mark-all-read', { method: 'PUT' }),

  getOrCreateConversation: (otherUserId: number) =>
    request<{ conversationId: number; isNew: boolean }>('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),

  getConversationMessages: (conversationId: number, opts?: { before?: string; aroundMessageId?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set('before', opts.before);
    if (opts?.aroundMessageId != null) {
      params.set('aroundMessageId', String(opts.aroundMessageId));
      params.set('before', '25');
      params.set('after', '25');
    }
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{ messages: Message[]; hasMore: boolean }>(
      `/api/chat/conversations/${conversationId}/messages${qs}`
    );
  },

  getRoomMessages: (roomId: string, opts?: { before?: string; aroundMessageId?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set('before', opts.before);
    if (opts?.aroundMessageId != null) {
      params.set('aroundMessageId', String(opts.aroundMessageId));
      params.set('before', '25');
      params.set('after', '25');
    }
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{ messages: Message[]; hasMore: boolean }>(
      `/api/chat/room/${encodeURIComponent(roomId)}/messages${qs}`
    );
  },

  hideConversation: (conversationId: number) =>
    request<{ ok: true }>(`/api/chat/conversations/${conversationId}/hide`, { method: 'PUT' }),

  translateMessage: (messageId: number, targetLanguage: string) =>
    request<{ translation: string; cached: boolean }>(`/api/chat/translate/${messageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage }),
    }),

  editMessage: (messageId: number, content: string) =>
    request<{ message: Message }>(`/api/chat/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  // Phase 14 SRCH-01/02: full-text search across all chats the caller has access to.
  // Abortable via AbortController — signal is forwarded to fetch via RequestInit spread.
  // 429 responses propagate as ApiError (status=429) for the caller to surface.
  search: (q: string, cursor?: string, options?: { signal?: AbortSignal }) => {
    const params = new URLSearchParams({ q });
    if (cursor) params.set('cursor', cursor);
    return request<SearchResponse>(`/api/chat/search?${params.toString()}`, {
      signal: options?.signal,
    });
  },
};

// ── Chats (Phase 9 unified list) ───────────────────────────────────────────
export const chats = {
  list: () =>
    request<ChatsListResponse>('/api/chats'),

  markRoomRead: (roomSlug: string) =>
    request<{ ok: true }>('/api/chats/room-read', {
      method: 'POST',
      body: JSON.stringify({ roomSlug }),
    }),
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

  dismissMatch: (matchId: number) =>
    request<{ ok: boolean }>(`/api/beacons/matches/${matchId}/dismiss`, { method: 'PUT' }),
};

// ── Notifications ──────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () =>
    request<{ notifications: Notification[]; unreadCount: number }>('/api/notifications'),

  summary: () =>
    request<{ groups: number; dms: number; matches: number; system: number }>(
      '/api/notifications/summary',
    ),

  readAll: (tab: 'groups' | 'dms' | 'matches' | 'system') =>
    request<{
      clearedConversationIds: number[];
      clearedGlobeSlugs: string[];
      clearedTimezoneRooms: string[];
    }>(`/api/notifications/read-all?tab=${tab}`, { method: 'PUT' }),

  read: (id: number) => request(`/api/notifications/${id}/read`, { method: 'PUT' }),

  readContext: (ctx: { conversationId: number } | { roomId: string }) =>
    request<{ markedRead: number[] }>('/api/notifications/read-context', {
      method: 'PUT',
      body: JSON.stringify(ctx),
    }),

  getPreferences: () =>
    request<{
      mentionsPush: boolean;
      timezoneChatPush: boolean;
      beaconMatchesPush: boolean;
      dmPush: boolean;
      dmsPush: boolean;
    }>('/api/notifications/preferences'),

  updatePreferences: (prefs: {
    mentionsPush?: boolean;
    timezoneChatPush?: boolean;
    beaconMatchesPush?: boolean;
    dmPush?: boolean;
    dmsPush?: boolean;
  }) =>
    request('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),
};

// ── News Push ──────────────────────────────────────────────────────────────
export const newsPushApi = {
  getPreference: () =>
    request<{ newsPushEnabled: boolean }>('/api/users/me/news-push'),

  updatePreference: (newsPushEnabled: boolean) =>
    request<{ ok: true }>('/api/users/me/news-push', {
      method: 'PUT',
      body: JSON.stringify({ newsPushEnabled }),
    }),
};

// ── Support ───────────────────────────────────────────────────────────────
export const supportApi = {
  send: (subject: string, message: string) =>
    request<{ success: boolean }>('/api/support', {
      method: 'POST',
      body: JSON.stringify({ subject, message }),
    }),
};

// ── Moderation ────────────────────────────────────────────────────────────
export const moderationApi = {
  blockUser: (userId: number) =>
    request<{ ok: boolean }>(`/api/moderation/block/${userId}`, { method: 'POST' }),

  unblockUser: (userId: number) =>
    request<{ ok: boolean }>(`/api/moderation/block/${userId}`, { method: 'DELETE' }),

  getBlocked: () =>
    request<{ blockedUsers: { id: number; blockedUserId: number }[] }>('/api/moderation/blocked'),

  report: (reportedUserId: number, contentType: 'message' | 'beacon' | 'profile', reason: string, contentId?: number) =>
    request<{ ok: boolean }>('/api/moderation/report', {
      method: 'POST',
      body: JSON.stringify({ reportedUserId, contentType, reason, contentId }),
    }),
};

// ── Users ──────────────────────────────────────────────────────────────────
export const usersApi = {
  getProfile: (handle: string) =>
    request<{ user: PublicProfile }>(`/api/users/${handle}`),

  searchByHandle: (q: string, orgId?: number) =>
    request<{ users: (PublicProfile & { alreadyMember?: boolean })[] }>(
      `/api/users/search/handle?q=${encodeURIComponent(q)}${orgId ? `&orgId=${orgId}` : ''}`,
    ),

  suggest: (
    q: string,
    scope: 'timezone' | 'globe' | 'group' | 'dm',
    contextId: string,
  ) =>
    request<{ users: Array<{ userId: number; handle: string; name: string; avatarUrl: string | null }> }>(
      `/api/users/suggest?q=${encodeURIComponent(q)}&scope=${scope}&contextId=${encodeURIComponent(contextId)}`,
    ),
};

// ── Reactions ─────────────────────────────────────────────────────────────
export const reactionsApi = {
  toggle: (messageId: number, emoji: string) =>
    request<{ action: 'added' | 'removed' }>('/api/reactions/toggle', {
      method: 'POST',
      body: JSON.stringify({ messageId, emoji }),
    }),
};

// ── Referrals ─────────────────────────────────────────────────────────────
export const referralsApi = {
  getStats: () => request<{ totalReferrals: number; premiumMonthsEarned: number }>('/api/referrals/stats'),
  getFunnel: () => request<{ bySource: Record<string, { joined: number; paid: number }>; totalPremiumMonths: number }>('/api/referrals/funnel'),
};

// ── Groups ─────────────────────────────────────────────────────────────────
export const groupsApi = {
  myGroups: (opts?: { role?: 'admin' }) =>
    request<{ groups: { id: number; groupName: string; groupIconUrl: string | null; inviteSlug: string; createdAt: string; role: string; memberCount: number }[] }>(
      opts?.role ? `/api/chat/groups?role=${opts.role}` : '/api/chat/groups'),

  create: (name: string, slug?: string, isPublic = false) =>
    request<{ conversation: { id: number; groupName: string; inviteSlug: string; createdAt: string } }>(
      '/api/chat/groups', { method: 'POST', body: JSON.stringify({ name, slug, isPublic }) }),

  getInfo: (slug: string) =>
    request<{ group: { id: number; groupName: string; groupIconUrl: string | null; inviteSlug: string; isPublic: boolean; memberCount: number; isMember: boolean; createdAt: string; admin: { id: number; handle: string; name: string; avatarUrl: string | null } | null } }>(
      `/api/chat/groups/${slug}`),

  join: (slug: string) =>
    request<{ conversation: { id: number; groupName: string } }>(
      `/api/chat/groups/${slug}/join`, { method: 'POST' }),

  update: (id: number, data: { name?: string; slug?: string; groupIconUrl?: string; isPublic?: boolean }) =>
    request<{ group: { id: number; groupName: string; groupIconUrl: string | null; inviteSlug: string; isPublic: boolean } }>(
      `/api/chat/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  members: (id: number) =>
    request<{ members: GroupMember[] }>(`/api/chat/groups/${id}/members`),

  kickMember: (id: number, userId: number) =>
    request(`/api/chat/groups/${id}/members/${userId}`, { method: 'DELETE' }),

  leave: (id: number) =>
    request<{ ok: true; archived: boolean }>(`/api/chat/groups/${id}/leave`, { method: 'POST' }),
};

// ── Globe ──────────────────────────────────────────────────────────────────
export const globeApi = {
  // Phase 14 SRCH-03: optional q for server-side Chevra title filtering.
  // Backward-compatible — existing callers passing no args still work.
  rooms: (opts?: { q?: string }) => {
    const q = opts?.q?.trim();
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ rooms: GlobeRoom[] }>(`/api/globe/rooms${qs}`);
  },

  // Phase 14 D-04: aroundMessageId for tap-to-jump from search results.
  messages: (slug: string, before?: string, limit = 50, aroundMessageId?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (aroundMessageId != null) {
      params.set('aroundMessageId', String(aroundMessageId));
      params.set('before', '25');
      params.set('after', '25');
    }
    return request<{ messages: GlobeMessage[]; hasMore: boolean }>(
      `/api/globe/rooms/${slug}/messages?${params.toString()}`
    );
  },

  unread: () =>
    request<{ unread: Record<string, number> }>('/api/globe/unread'),

  markRead: (slug: string) =>
    request<{ ok: true }>(`/api/globe/rooms/${slug}/read`, { method: 'PUT' }),

  markAllRead: () =>
    request<{ ok: true }>('/api/globe/rooms/mark-all-read', { method: 'PUT' }),

  // Phase 11 D-05: explicit join/leave for non-Town-Square regional rooms.
  // Town Square stays auto-joined (Phase 7 D-04) — backend rejects DELETE
  // with HTTP 422 + { error: 'Cannot leave an auto-join community' }.
  join: (slug: string) =>
    request<{ ok: true; isMember: true }>(`/api/globe/rooms/${slug}/join`, {
      method: 'POST',
    }),

  // Phase 15 (TZRM-01): alias for `join` — semantically explicit for the
  // Chevra timezone-room join handler. Backend POST /api/globe/rooms/:slug/join
  // is the SAME endpoint (Plan 15-03 Task 1 extended dispatch to accept
  // timezone-room slugs). On 403 capabilityViolation, api.ts's existing retry
  // path refreshes caps once then re-fires; if still 403 the caller sees the
  // ApiError and surfaces the UpgradeModal as a defensive fallback.
  joinRoom: (slug: string) =>
    request<{ ok: true; isMember: true }>(`/api/globe/rooms/${slug}/join`, {
      method: 'POST',
    }),

  leave: (slug: string) =>
    request<{ ok: true; isMember: false }>(`/api/globe/rooms/${slug}/join`, {
      method: 'DELETE',
    }),
};

// ── Organizations ──────────────────────────────────────────────────────────
export const orgsApi = {
  // GET /api/orgs/:slug — public org info (works auth + anon)
  getBySlug: (slug: string) =>
    request<{ org: { id: number; slug: string; name: string; description: string | null; type: string; iconUrl: string | null; memberCount: number; isMember: boolean; role: 'admin' | 'moderator' | 'member' | null } }>(
      `/api/orgs/${slug}`,
    ),

  // POST /api/orgs — create (gated by canCreateOrg = false in v1.5)
  create: (body: { slug: string; name: string; type: 'jcc' | 'non_profit' | 'creator' | 'community' | 'business'; description?: string; iconUrl?: string }) =>
    request<{ org: { id: number; slug: string; name: string; type: string; description: string | null; iconUrl: string | null } }>(
      '/api/orgs',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // PUT /api/orgs/:id — admin edit (D-07: name + description + iconUrl)
  update: (id: number, body: { name?: string; description?: string; iconUrl?: string }) =>
    request<{ org: { id: number; name: string; description: string | null; iconUrl: string | null } }>(
      `/api/orgs/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  // POST /api/orgs/:id/invite — handle (Path A) or empty body/rotate for link (Path B)
  invite: (id: number, opts?: { invitedHandle?: string; rotate?: boolean }) =>
    request<{ invite: { id: number; token: string; invitedUserId: number | null; role: string; expiresAt: string } }>(
      `/api/orgs/${id}/invite`,
      { method: 'POST', body: JSON.stringify(opts ?? {}) },
    ),

  // GET /api/orgs/invites/:token — preview without accepting
  previewInvite: (token: string) =>
    request<{ invite: { state: 'pending' | 'expired' | 'already_used' | 'already_member'; org: { slug: string; name: string; type: string; iconUrl: string | null; description: string | null }; inviter: { handle: string; name: string } | null; expiresAt: string } }>(
      `/api/orgs/invites/${token}`,
    ),

  // POST /api/orgs/invites/:token/accept
  acceptInvite: (token: string) =>
    request<{ membership: { id: number; orgId: number; userId: number; role: string; joinedAt: string } }>(
      `/api/orgs/invites/${token}/accept`,
      { method: 'POST' },
    ),

  // GET /api/orgs/:id/members — admin-only
  members: (id: number) =>
    request<{ members: { userId: number; handle: string; name: string; avatarUrl: string | null; role: 'admin' | 'moderator' | 'member'; joinedAt: string }[] }>(
      `/api/orgs/${id}/members`,
    ),

  // PUT /api/orgs/:id/members/:userId — admin-only role change
  updateMemberRole: (id: number, userId: number, role: 'admin' | 'moderator' | 'member') =>
    request<{ membership: { userId: number; role: string } }>(
      `/api/orgs/${id}/members/${userId}`,
      { method: 'PUT', body: JSON.stringify({ role }) },
    ),

  // DELETE /api/orgs/:id/members/:userId — admin-only remove (or self-leave when caller===subject)
  removeMember: (id: number, userId: number) =>
    request<{ ok: true }>(
      `/api/orgs/${id}/members/${userId}`,
      { method: 'DELETE' },
    ),
};

// ── News ────────────────────────────────────────────────────────────────────
export const newsApi = {
  feed: (before?: string) =>
    request<{ articles: NewsArticle[]; hasMore: boolean; nextCursor: string | null }>(
      `/api/news/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`
    ),

  toggleReaction: (articleId: number, emoji: string) =>
    request<{ action: 'added' | 'removed' }>(
      '/api/news/reactions/toggle',
      { method: 'POST', body: JSON.stringify({ articleId, emoji }) }
    ),
};

/**
 * Optimistic reaction toggle for NewsArticle.reactions.
 *
 * D-07 semantics (per-user, per-emoji). Requires `currentUserId` so the optimistic
 * mutation mirrors server-side `userIds[]` state (server's attachNewsReactions pushes
 * `req.user!.id` into userIds on add). Without this parameter, the optimistic update
 * leaves userIds: [] for a brand-new group, which diverges from the authoritative
 * response on next pull-to-refresh.
 *
 * Branches:
 * - No group for this emoji on this article → append {emoji, count:1, userIds:[currentUserId], hasReacted:true}.
 * - Group exists and currentUserId is NOT in userIds → count+1, append currentUserId to userIds, hasReacted:true.
 * - Group exists and currentUserId IS in userIds → count-1, filter currentUserId out of userIds, hasReacted:false; drop group when count hits 0.
 *
 * Pure. Calling with the same (article, emoji, currentUserId) twice returns the original article — used by Plan 03 rollback.
 */
export function applyReactionToggle(
  article: NewsArticle,
  emoji: string,
  currentUserId: number,
): NewsArticle {
  const existing = article.reactions.find(r => r.emoji === emoji);
  const userAlreadyReacted = !!existing && existing.userIds.includes(currentUserId);

  let next: ReactionGroup[];
  if (userAlreadyReacted && existing) {
    // Remove: decrement, drop currentUserId from userIds, drop group if empty
    next = article.reactions
      .map(r => r.emoji === emoji
        ? {
            ...r,
            count: r.count - 1,
            userIds: r.userIds.filter(id => id !== currentUserId),
            hasReacted: false,
          }
        : r
      )
      .filter(r => r.count > 0);
  } else if (existing) {
    // Add to existing group
    next = article.reactions.map(r =>
      r.emoji === emoji
        ? {
            ...r,
            count: r.count + 1,
            userIds: [...r.userIds, currentUserId],
            hasReacted: true,
          }
        : r
    );
  } else {
    // First reaction for this emoji — create the group with currentUserId present
    next = [
      ...article.reactions,
      { emoji, count: 1, userIds: [currentUserId], hasReacted: true },
    ];
  }
  return { ...article, reactions: next };
}
