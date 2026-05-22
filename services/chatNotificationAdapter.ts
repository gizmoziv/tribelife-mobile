import type { ChatNotification } from '@/types';

// ── Phase 10 D-08: receive-side adapter ─────────────────────────────────
// Normalize legacy-shape notifications (`type === 'mention' | 'new_dm'`
// without `data.source`) into the new `ChatNotification` shape so queued
// legacy push payloads + any rolling-deploy `notification:new` events
// still render and route correctly post-upgrade. Adapter stays in code
// indefinitely — cheap insurance (per 10-CONTEXT.md D-08).
//
// Returns null for non-chat types (`beacon_match`, `news_breaking`,
// `org_invite`, `system`) — callers fall through to the existing
// bell-path branches in app/_layout.tsx.
//
// Inputs:
//   - Live `chat:notification` socket payload (already new-shape; passes
//     through the `typeof data.source === 'string'` fast path).
//   - Legacy `notification:new` socket payload (legacy mention/new_dm
//     shape; mapped via the legacy `data.type` branches).
//   - Push notification `data` field (cold-start + live tap handlers in
//     _layout.tsx).
//
// The adapter accepts `unknown` and returns `ChatNotification | null` so
// callers don't need to narrow up-front.

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function adaptChatNotification(raw: unknown): ChatNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const notificationId = asNum(data.notificationId) ?? 0;
  const title = asStr(data.title) ?? '';
  const body = asStr(data.body) ?? '';
  const senderHandle = asStr(data.senderHandle) ?? '';
  // Phase 14 D-04: optional message id forwarded through to the tap router
  // so it can deep-link via aroundMessageId. asNum returns null for missing
  // payloads (older clients / non-chat notifications).
  const messageId = asNum(data.messageId);
  const withMsgId = messageId !== null ? { messageId } : {};

  // ── Already new-shape — pass through ─────────────────────────────────
  if (typeof data.source === 'string') {
    const src = data.source;
    if (src === 'dm') {
      const conversationId = asNum(data.conversationId);
      if (conversationId === null) return null;
      return {
        source: 'dm',
        entityId: conversationId,
        conversationId,
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    if (src === 'group') {
      const conversationId = asNum(data.conversationId);
      if (conversationId === null) return null;
      const groupName = asStr(data.groupName) ?? undefined;
      return {
        source: 'group',
        entityId: conversationId,
        conversationId,
        ...(groupName ? { groupName } : {}),
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    if (src === 'globe_room') {
      const roomSlug = asStr(data.roomSlug);
      if (roomSlug === null) return null;
      return {
        source: 'globe_room',
        entityId: roomSlug,
        roomSlug,
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    if (src === 'local_chat') {
      const timezoneIana = asStr(data.timezoneIana);
      if (timezoneIana === null) return null;
      return {
        source: 'local_chat',
        entityId: timezoneIana,
        timezoneIana,
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    return null;
  }

  // ── Legacy shapes (no data.source) ───────────────────────────────────
  // News + beacon + system + org_invite explicitly skipped — they stay
  // on the existing bell-path branches in _layout.tsx (D-08).
  const type = asStr(data.type);
  if (type === 'news_breaking' || type === 'beacon_match' || type === 'org_invite' || type === 'system') {
    return null;
  }

  // Legacy DM / group
  if (type === 'new_dm') {
    const conversationId = asNum(data.conversationId);
    if (conversationId === null) return null;
    const isGroup = data.isGroup === true || data.isGroup === 'true';
    if (isGroup) {
      const groupName = asStr(data.groupName) ?? undefined;
      return {
        source: 'group',
        entityId: conversationId,
        conversationId,
        ...(groupName ? { groupName } : {}),
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    return {
      source: 'dm',
      entityId: conversationId,
      conversationId,
      notificationId,
      title,
      body,
      senderHandle,
      ...withMsgId,
    };
  }

  // Legacy mention (globe room OR timezone room)
  if (type === 'mention') {
    const globeSlug = asStr(data.globeSlug);
    if (globeSlug !== null) {
      return {
        source: 'globe_room',
        entityId: globeSlug,
        roomSlug: globeSlug,
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    // Timezone-room mention — `data.roomId` is `'timezone:America/New_York'`
    // pre-Phase-10. Strip the prefix.
    const roomId = asStr(data.roomId);
    if (roomId !== null && roomId.startsWith('timezone:')) {
      const timezoneIana = roomId.replace('timezone:', '');
      return {
        source: 'local_chat',
        entityId: timezoneIana,
        timezoneIana,
        notificationId,
        title,
        body,
        senderHandle,
        ...withMsgId,
      };
    }
    return null;
  }

  return null;
}
