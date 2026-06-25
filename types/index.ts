export * from './capabilities';

export interface User {
  id: number;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  // isPremium removed (TIER-03) — consumers read capabilities.isPremium via useIsPremium()
  timezone: string | null;
  // Phase 17: backend-stamped canonical zone slug (e.g. 'eastern-time').
  // Optional — absent on old API responses; fallback to getZoneForTimezone(timezone).
  timezoneZone?: string | null;
  acceptedTermsAt: string | null;
  handleUpdatedAt: string | null;
  bio: string | null;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: number[];
  hasReacted: boolean;
}

export interface ReplyTo {
  id: number;
  content: string;
  senderHandle: string;
}

export interface Message {
  id: number;
  content: string;
  senderId: number;
  senderHandle: string;
  senderAvatar?: string | null;
  senderName?: string;
  roomId?: string;
  conversationId?: number;
  createdAt: string;
  editedAt?: string | null;
  mentions?: number[];
  reactions?: ReactionGroup[];
  replyTo?: ReplyTo | null;
  replyToId?: number | null;
  mediaUrls?: string[] | null;
  kind?: 'user' | 'system';
}

export interface Conversation {
  conversationId: number;
  lastMessageAt: string;
  participantId: number;
  participantName: string;
  participantHandle: string;
  participantAvatar: string | null;
  lastReadAt: string | null;
  lastMessage: { content: string; createdAt: string } | null;
  isGroup?: boolean;
  groupName?: string;
  groupIconUrl?: string | null;
  inviteSlug?: string;
  memberCount?: number;
  unreadCount: number;
}

export interface GroupMember {
  userId: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

export interface Beacon {
  id: number;
  userId: number;
  rawText: string;
  parsedIntent: string | null;
  timezone: string | null;
  isActive: boolean;
  lastMatchedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// Authoritative beacon-slot occupancy summary from GET /api/beacons/mine.
// `used` counts beacons still within their 30-day life (active, removed, OR
// matched) — freed only by expiry (Phase 23). `nextFreesAt` is the soonest
// effective-expiry among occupied beacons (ISO string), or null when none.
export interface BeaconSlots {
  used: number;
  limit: number;
  nextFreesAt: string | null;
}

export interface BeaconMatch {
  matchId: number;
  beaconId: number;
  myBeaconText: string;
  matchedBeaconId: number;
  similarityScore: string;
  matchReason: string | null;
  viewedAt: string | null;
  createdAt: string;
  matchedUser: {
    rawText: string;
    parsedIntent: string | null;
    userId: number;
    userName: string;
    userHandle: string;
    userAvatar: string | null;
  } | null;
}

export interface Notification {
  id: number;
  type: 'mention' | 'beacon_match' | 'new_dm' | 'group' | 'system' | 'org_invite';
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface PublicProfile {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  timezone: string | null;
  bio: string | null;
  isPremium: boolean;
  createdAt: string;
}

// ── Globe ───────────────────────────────────────────────────────────────────
export interface GlobeRoom {
  slug: string;
  displayName: string;
  participantCount: number;
  lastMessage: { content: string; createdAt: string; senderHandle: string } | null;
  isSuggested: boolean;
  isGlobal: boolean;
  sortOrder: number;
  welcomeMessage: string;
  // Phase 11 D-03: server-derived membership flag. Drives the Member-pill
  // render decision on the Community list AND the read-only-vs-interactive
  // mode of the chat screen (D-12 supersedes D-08's separate-preview-screen
  // design — the chat screen itself handles both modes based on isMember).
  isMember: boolean;
  // Phase 11 D-03 mirror: `autoJoin=true` rooms (Town Square only in v1.7)
  // cannot be left — backend rejects DELETE /rooms/:slug/join with HTTP 422.
  // Mobile mirrors the field for symmetry (no UI consumer in Phase 11; will
  // gate a future "Leave" affordance).
  autoJoin: boolean;
}

export interface GlobeMessage {
  id: number;
  content: string;
  senderId: number;
  senderName: string;
  senderHandle: string;
  senderAvatar: string | null;
  createdAt: string;
  editedAt?: string | null;
  slug: string;
  reactions?: ReactionGroup[];
  replyTo?: ReplyTo | null;
  replyToId?: number | null;
  mediaUrls?: string[] | null;
  kind?: 'user' | 'system';
}

// ── News ─────────────────────────────────────────────────────────────────────
export interface NewsArticle {
  id: number;
  outletSlug: string;
  outletName: string;
  rephrasedTitle: string;
  translatedTitle: string | null;
  originalLanguage: string | null;
  summary: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  publishedAt: string;              // ISO timestamp
  importance: 'breaking' | 'major'; // 'routine' is server-filtered
  reactions: ReactionGroup[];       // reuse v1.1 type
}

// ── Phase 24: Job Postings ────────────────────────────────────────────────────
export interface JobPosting {
  id: number;
  title: string;
  company: string;
  location: string | null;   // null → render "Remote"
  postedDate: string;        // MM/DD/YYYY — render as-is, no reformatting
  description: string | null;
  logoUrl: string | null;
  jobUrl: string;
  viewCount: number;
  source: string;            // 'jewishjobs' in v1
  externalRef: string;
}

// ── Phase 8: caps:invalidated socket event reason union ────────────────────
// Loose mirror of `tribelife-backend/src/types/capabilities.ts CapsInvalidatedReason`.
// No shared types package — keep manually in sync (per CONTEXT.md D-01 canonical_refs).
// The mobile client does NOT validate `reason` at runtime; this type exists for
// Metro-log grep and IDE autocomplete only.
export type CapsInvalidatedReason =
  | 'revenuecat_grant'
  | 'revenuecat_revoke'
  | 'org_create'
  | 'org_invite_accept'
  | 'org_role_change'
  | 'org_soft_delete';

// ── Phase 9: Chats Tab Restructure ─────────────────────────────────────────
// Loose mirror of tribelife-backend/src/types/chats.ts (no shared types
// package — keep in sync manually per CONTEXT.md canonical_refs convention,
// mirroring the Phase 8 CapsInvalidatedReason pattern).
export interface ChatsRowLastMessage {
  preview: string;
  at: string;
}

export type ChatsRow =
  | {
      type: 'local_chat';
      roomSlug: 'local';
      timezoneIana: string;
      // Phase 17: backend-stamped canonical zone slug. Optional — absent on old
      // API responses; fallback to getZoneForTimezone(timezoneIana).
      timezoneZone?: string;
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
    }
  | {
      type: 'town_square';
      roomSlug: 'town-square';
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
    }
  | {
      type: 'dm';
      conversationId: number;
      partner: { handle: string; avatarUrl: string | null };
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
      // Phase 20: per-user archive flag. Mirrors backend types/chats.ts.
      // Distinct from conversations.isArchived (group-admin archive — different concept).
      isUserArchived?: boolean;
    }
  | {
      type: 'group';
      conversationId: number;
      name: string;
      iconUrl: string | null;
      memberCount: number;
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
      isPublic: boolean;
      isArchived: boolean;
      // Phase 20: per-user archive flag. Mirrors backend types/chats.ts.
      // Distinct from isArchived above (group-admin archive — different concept).
      isUserArchived?: boolean;
    }
  // Phase 11 D-04: joined regional Globe room (Town Square stays its own
  // `town_square` variant — pinned position, gold tint). One row per
  // non-Town-Square `globe_room_memberships` row the user has.
  | {
      type: 'globe_room';
      roomSlug: string;
      displayName: string;
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
    }
  // Phase 15 D-04 + TZRM-01: joined non-native timezone room — mixes into
  // unread-first section, NOT pinned alongside Local Chat. Mirror of backend
  // Plan 15-03 Task 2 ChatsRow extension (tribelife-backend/src/types/chats.ts).
  // Routing: tap → `globe/[roomSlug]` chat screen using `zoneSlug` as roomSlug.
  | {
      type: 'timezone_room';
      zoneSlug: string;
      displayName: string;
      unreadCount: number;
      lastMessage: ChatsRowLastMessage | null;
    };

export interface ChatsListResponse {
  rows: ChatsRow[];
}

// Phase 20: PillFilter type centralized here so store + UI import from one place.
// Previously declared inline in chat/index.tsx; Plan 20-04 imports from here.
export type PillFilter = 'all' | 'unread' | 'groups' | 'dms' | 'archive';

// ── Phase 12: Chevra Discovery Row ─────────────────────────────────────────
// Separate from ChatsRow — uses `kind` discriminator (not `type`) per D-13.
// Consumers: globe/index.tsx FlatList; globeApi.rooms() return type.
export type ChevraRow =
  | {
      kind: 'globe_room';
      slug: string;
      displayName: string;
      participantCount: number;
      lastMessage: { content: string; createdAt: string; senderHandle: string } | null;
      isSuggested: boolean;
      isGlobal: boolean;
      sortOrder: number;
      welcomeMessage: string;
      isMember: boolean;
      autoJoin: boolean;
    }
  | {
      kind: 'group';
      conversationId: number;
      name: string;
      iconUrl: string | null;
      inviteSlug: string;
      memberCount: number;
      lastMessage: { senderHandle: string; content: string; createdAt: string } | null;
      isMember: boolean;
    }
  // Phase 15 D-10 + TZRM-02: discovery surface for timezone rooms — paywall flag for free callers, isMember for joined non-native filter on premium
  | {
      kind: 'timezone_room';
      slug: string;
      displayName: string;
      memberCount: number;
      lastMessage: { content: string; createdAt: string; senderHandle: string } | null;
      isMember: boolean;
      paywalled: boolean;
    };

export interface ChevraListResponse {
  rooms: ChevraRow[];
}

// ── Phase 18: per-section Chevra pagination ─────────────────────────────────
// MIRROR: tribelife-backend/src/routes/globe.ts buildChevraSection() response.
// The Chevra screen now renders three independent horizontal carousels, each
// paged by offset/limit. `section` echoes the requested carousel; `rows` reuses
// the existing per-kind ChevraRow shapes.
export type ChevraSection = 'regions' | 'chavurot' | 'timezones';

export interface ChevraSectionResponse {
  section: ChevraSection;
  rows: ChevraRow[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ── Phase 14: Chat Search — SearchResult discriminated union ───────────────
// MIRROR: tribelife-backend/src/types/searchResult.ts — keep in sync.
// Hand-mirrored shape (no shared types package — Phase 10 ChatNotification
// precedent). Discriminator `source` mirrors ChatNotificationPayload exactly
// so routeChatNotificationTap-style routing works for tap navigation (D-04).
//
// The `entityId` field is the canonical row identity from /api/chats:
//   - dm/group:   entityId = conversationId (number)
//   - globe_room: entityId = roomSlug        (string)
//   - local_chat: entityId = timezoneIana    (string)
export type SearchResult =
  | {
      source: 'dm';
      messageId: number;
      content: string;
      createdAt: string;
      senderHandle: string;
      chatTitle: string;
      entityId: number;
      conversationId: number;
    }
  | {
      source: 'group';
      messageId: number;
      content: string;
      createdAt: string;
      senderHandle: string;
      chatTitle: string;
      entityId: number;
      conversationId: number;
    }
  | {
      source: 'globe_room';
      messageId: number;
      content: string;
      createdAt: string;
      senderHandle: string;
      chatTitle: string;
      entityId: string;
      roomSlug: string;
    }
  | {
      source: 'local_chat';
      messageId: number;
      content: string;
      createdAt: string;
      senderHandle: string;
      chatTitle: string;
      entityId: string;
      timezoneIana: string;
    };

// Paginated search response (D-02: cursor pagination on (createdAt, id)).
export type SearchResponse = {
  results: SearchResult[];
  nextCursor: string | null;
};

// ── Phase 10: Notification Consolidation ──────────────────────────────────
// Loose mirror of tribelife-backend/src/types/chatNotification.ts
// ChatNotificationPayload (no shared types package — keep in sync manually
// per CONTEXT.md canonical_refs convention, mirroring the Phase 8
// CapsInvalidatedReason + Phase 9 ChatsRow pattern).
//
// Discriminator: `source`. The `entityId` field is the canonical row
// identity from /api/chats — conversationId for DM/group, roomSlug for
// globe_room, timezoneIana for local_chat. Lets the tap-router +
// store-applier share one key path.

export interface ChatNotificationCommon {
  notificationId: number;
  title: string;
  body: string;
  senderHandle: string;
  // Phase 14: optional message id so notification taps can deep-link to the
  // triggering message via `aroundMessageId` (mirrors backend ChatNotificationCommon).
  messageId?: number;
}

export type ChatNotification =
  | (ChatNotificationCommon & {
      source: 'dm';
      entityId: number;
      conversationId: number;
    })
  | (ChatNotificationCommon & {
      source: 'group';
      entityId: number;
      conversationId: number;
      groupName?: string;
    })
  | (ChatNotificationCommon & {
      source: 'globe_room';
      entityId: string;
      roomSlug: string;
    })
  | (ChatNotificationCommon & {
      source: 'local_chat';
      entityId: string;
      timezoneIana: string;
    });
