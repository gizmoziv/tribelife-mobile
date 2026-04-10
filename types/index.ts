export interface User {
  id: number;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
  timezone: string | null;
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
  mentions?: number[];
  reactions?: ReactionGroup[];
  replyTo?: ReplyTo | null;
  replyToId?: number | null;
  mediaUrls?: string[] | null;
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
  type: 'mention' | 'beacon_match' | 'new_dm' | 'system';
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
  isPremium: boolean;
  createdAt: string;
}

// ── Globe ───────────────────────────────────────────────────────────────────
export interface GlobeRoom {
  slug: string;
  displayName: string;
  description: string;
  participantCount: number;
  lastMessage: { content: string; createdAt: string; senderHandle: string } | null;
  isSuggested: boolean;
  isGlobal: boolean;
  sortOrder: number;
  welcomeMessage: string;
}

export interface GlobeMessage {
  id: number;
  content: string;
  senderId: number;
  senderName: string;
  senderHandle: string;
  senderAvatar: string | null;
  createdAt: string;
  slug: string;
  reactions?: ReactionGroup[];
  replyTo?: ReplyTo | null;
  replyToId?: number | null;
  mediaUrls?: string[] | null;
}
