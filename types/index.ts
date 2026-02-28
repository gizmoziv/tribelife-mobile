export interface User {
  id: number;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
  timezone: string | null;
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
