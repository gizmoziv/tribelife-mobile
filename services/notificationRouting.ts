import type { Router } from 'expo-router';
import type { ChatNotification } from '@/types';

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
  switch (data.source) {
    case 'dm':
      router.navigate({
        pathname: '/(app)/chat/[conversationId]',
        params: {
          conversationId: String(data.conversationId),
          ...(data.senderHandle ? { handle: String(data.senderHandle) } : {}),
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
        },
      });
      return;
    case 'globe_room':
      router.push({
        pathname: '/(app)/globe/[roomSlug]',
        params: { roomSlug: data.roomSlug },
      });
      return;
    case 'local_chat':
      router.push('/(app)/chat/local');
      return;
  }
}
