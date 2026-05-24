import type { Router } from 'expo-router';
import type { ChatNotification } from '@/types';
import { notificationsApi } from '@/services/api';
import { useNotificationStore } from '@/store/notificationStore';

// Post-login landing decision. Both cold-start (restoreSession) and re-login
// (welcome.tsx) call this so unread daily-matcher results are surfaced even
// without a push tap. Side-effect: hydrates the notification summary store so
// the bell badge reflects the current count without an extra round trip.
export async function getPostLoginLandingRoute(): Promise<
  | { pathname: '/(app)/beacon'; params?: { tab: 'matches' } }
> {
  try {
    const s = await notificationsApi.summary();
    useNotificationStore.getState().setSummary(s);
    if (s.beaconMatches > 0) {
      return { pathname: '/(app)/beacon', params: { tab: 'matches' } };
    }
  } catch { /* fall through to default */ }
  return { pathname: '/(app)/beacon' };
}

// ── Phase 10 D-05: chat notification tap routing ────────────────────────
// One function handles BOTH the cold-start tap (via
// Notifications.getLastNotificationResponseAsync) and the live tap (via
// Notifications.addNotificationResponseReceivedListener). The two call
// sites in app/_layout.tsx pass the user's router instance in.
//
// DM/group uses router.navigate() per the instance-reuse trick from
// _layout.tsx:170-177 — reuses any open chat instance to avoid the
// duplicate-header / double-keyboard glitch when the user was already
// viewing the conversation.
//
// Globe rooms and Local Chat use router.push() — these screens don't have
// the same instance-reuse concern. The globe room screen handles slug
// changes via useLocalSearchParams; Local Chat is a single screen.

export function routeChatNotificationTap(
  data: ChatNotification,
  router: Pick<Router, 'navigate' | 'push'>,
): void {
  // Phase 14 D-04: when the payload carries a messageId, pass it as
  // `aroundMessageId` so the destination chat screen scrolls to and flashes
  // the triggering message instead of opening at the newest message.
  const around = data.messageId != null ? { aroundMessageId: String(data.messageId) } : {};
  switch (data.source) {
    case 'dm':
      router.navigate({
        pathname: '/(app)/chat/[conversationId]',
        params: {
          conversationId: String(data.conversationId),
          ...(data.senderHandle ? { handle: String(data.senderHandle) } : {}),
          ...around,
        },
      });
      return;
    case 'group':
      router.navigate({
        pathname: '/(app)/chat/[conversationId]',
        params: {
          conversationId: String(data.conversationId),
          ...(data.senderHandle ? { handle: String(data.senderHandle) } : {}),
          isGroup: 'true',
          groupName: String(data.groupName ?? ''),
          ...around,
        },
      });
      return;
    case 'globe_room':
      router.push({
        pathname: '/(app)/globe/[roomSlug]',
        params: { roomSlug: data.roomSlug, ...around },
      });
      return;
    case 'local_chat':
      if (data.messageId != null) {
        router.push({ pathname: '/(app)/chat/local', params: { aroundMessageId: String(data.messageId) } });
      } else {
        router.push('/(app)/chat/local');
      }
      return;
  }
}
