/**
 * fcmMessaging.ts — Android raw-FCM message handler (Phase C production).
 * =========================================================================
 * Promotes the proven Phase C spike harness to production. ANDROID-ONLY.
 *
 * Path (device-proven in the spike):
 *   backend firebase-admin data-only high-priority FCM message
 *     → @react-native-firebase/messaging setBackgroundMessageHandler (headless,
 *       fires from a FORCE-KILLED app because it is registered at module top,
 *       before AppRegistry runs — see index.js ordering)
 *     → react-native-notify-kit MessagingStyle notification whose `Person.icon`
 *       is the sender avatar URL → WhatsApp/Telegram avatar look.
 *
 * The whole module is Android-guarded: on any non-Android platform every entry
 * point is a no-op, and index.js only requires it on Android, so RNFirebase JS
 * never loads on iOS (iOS keeps the Expo gateway + Phase B NSE, untouched).
 *
 * Payload (Phase A, produced identically at all 4 backend send sites):
 *   data.sender        JSON string  { id, name, avatarUrl }   (avatarUrl never null — initials fallback)
 *   data.conversation  JSON string  { id, title, isGroup }
 *   data.body          string
 *   data.source/type/conversationId/senderHandle/notificationId/messageId/... (flat strings, for tap routing)
 */
import { NativeModules, Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
  onMessage,
  getToken,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';
import notifee, {
  AndroidStyle,
  AndroidImportance,
  EventType,
  type Notification,
  type Event,
} from 'react-native-notify-kit';
import { router } from 'expo-router';
import { auth } from './api';
import { adaptChatNotification } from './chatNotificationAdapter';
import { routeChatNotificationTap } from './notificationRouting';

const IS_ANDROID = Platform.OS === 'android';

// Dedicated HIGH-importance channel for message pushes (kept separate from the
// expo-notifications 'default'/'news' channels so message notifications get
// their own importance + sound settings). Created lazily on first display.
const CHANNEL_ID = 'messages';

// Native conversation-shortcut module (Phase C LOCKED DECISION 5). Undefined if
// the native module failed to link — the notification then falls back to the
// largeIcon-only partial (avatar in collapsed view, no OS badge composite).
const ConversationShortcut = NativeModules.ConversationShortcut as
  | {
      pushConversationShortcut: (
        shortcutId: string,
        personName: string,
        avatarUri: string,
      ) => Promise<void>;
    }
  | undefined;

function parseJson<T>(value: unknown, fallback: T): T {
  // FCM data values arrive as strings; sender/conversation are JSON-encoded by
  // the backend (services/fcm.ts) and must be parsed back out.
  try {
    return typeof value === 'string' && value.length > 0 ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

type Sender = { id: number; name: string; avatarUrl: string };
type Conversation = { id: string; title: string; isGroup: boolean };

async function presentMessagingNotification(
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const d = data ?? {};
  const sender = parseJson<Sender>(d.sender, { id: 0, name: 'Unknown', avatarUrl: '' });
  const conversation = parseJson<Conversation>(d.conversation, {
    id: '0',
    title: sender.name,
    isGroup: false,
  });
  const body = typeof d.body === 'string' ? d.body : '(no message)';
  const shortcutId = `conversation:${conversation.id}`;
  const avatar = sender.avatarUrl || undefined;

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Messages',
    importance: AndroidImportance.HIGH,
  });

  // LOCKED DECISION 5: publish the long-lived Person sharing shortcut so Android
  // promotes the notification to a conversation (avatar + app-icon corner badge
  // in the COLLAPSED view). If the native module is missing/throws, fall back to
  // the largeIcon-only partial — a shortcut failure must never drop the push.
  let hasShortcut = false;
  if (ConversationShortcut && avatar) {
    try {
      await ConversationShortcut.pushConversationShortcut(shortcutId, sender.name, avatar);
      hasShortcut = true;
    } catch {
      hasShortcut = false;
    }
  }

  // `smallIcon` is MANDATORY — omit it and notify-kit throws IllegalArgumentException.
  // 'notification_icon' is the drawable the expo-notifications config plugin
  // generates from assets/notification-icon.png.
  const androidOptions: NonNullable<Notification['android']> & { shortcutId?: string } = {
    channelId: CHANNEL_ID,
    smallIcon: 'notification_icon',
    largeIcon: avatar, // collapsed-view avatar fallback (no badge composite without a shortcut)
    style: {
      type: AndroidStyle.MESSAGING,
      person: { name: sender.name, icon: avatar },
      group: conversation.isGroup === true,
      messages: [
        {
          text: body,
          timestamp: Date.now(),
          person: { name: sender.name, icon: avatar },
        },
      ],
    },
    pressAction: { id: 'default' },
  };
  // Only set shortcutId when the shortcut was actually published — a shortcutId
  // pointing at a non-existent shortcut suppresses the notification on some OEMs.
  if (hasShortcut) {
    androidOptions.shortcutId = shortcutId;
  }

  await notifee.displayNotification({
    title: sender.name,
    body,
    // FCM data values are all strings; carry them through so the tap handler can
    // re-derive the ChatNotification (adaptChatNotification).
    data: d as { [key: string]: string },
    android: androidOptions,
  });
}

// ── Tap routing ───────────────────────────────────────────────────────────
// notify-kit displays the notification (not expo-notifications), so taps come
// through notify-kit's event system, not Notifications.addNotificationResponse
// or RNFirebase onNotificationOpenedApp. Reuse the app's existing chat-tap
// router so DM/group/globe/local all deep-link exactly like the iOS/Expo path.
function routeFcmTap(data: Record<string, unknown> | undefined): void {
  const adapted = adaptChatNotification(data);
  if (adapted) {
    routeChatNotificationTap(adapted, router);
  }
}

/**
 * Cold-start / background tap consumer. notify-kit persists the notification
 * that launched the app via a tap; _layout calls this once the router is mounted
 * (mirrors the expo-notifications getLastNotificationResponseAsync cold-start path).
 */
export async function consumeInitialFcmTap(): Promise<void> {
  if (!IS_ANDROID) return;
  try {
    const initial = await notifee.getInitialNotification();
    if (initial?.notification?.data) {
      routeFcmTap(initial.notification.data as Record<string, unknown>);
    }
  } catch (err) {
    console.log('[fcm] consumeInitialFcmTap error', err);
  }
}

/**
 * Android FCM device-token registration. Requests POST_NOTIFICATIONS, fetches
 * the raw FCM device token, posts it to the Stage-1 endpoint as
 * { token, platform:'android', tokenType:'fcm' }, and re-registers on rotation.
 * No-op on non-Android.
 */
export async function registerAndroidFcmToken(): Promise<void> {
  if (!IS_ANDROID) return;
  try {
    const messaging = getMessaging(getApp());
    await registerDeviceForRemoteMessages(messaging); // no-op on Android, harmless
    await notifee.requestPermission(); // Android 13+ POST_NOTIFICATIONS prompt
    const token = await getToken(messaging);
    if (token) {
      await auth.registerPushToken(token, 'android', 'fcm').catch((err) => {
        console.error('[fcm] token register failed', err);
      });
    }
    // FCM tokens rotate — re-home the new token to the current user on refresh.
    onTokenRefresh(messaging, (next) => {
      auth.registerPushToken(next, 'android', 'fcm').catch((err) => {
        console.error('[fcm] token refresh register failed', err);
      });
    });
  } catch (err) {
    console.error('[fcm] registerAndroidFcmToken error', err);
  }
}

// ── Handler registration (runs at import on Android, before expo-router/entry) ─
if (IS_ANDROID) {
  const messaging = getMessaging(getApp());

  // THE handler that must fire on a force-killed app. Registered at module top.
  setBackgroundMessageHandler(messaging, async (remoteMessage) => {
    await presentMessagingNotification(
      remoteMessage?.data as Record<string, unknown> | undefined,
    );
  });

  // Foreground receipt (app open) — present the same MessagingStyle notification.
  onMessage(messaging, async (remoteMessage) => {
    await presentMessagingNotification(
      remoteMessage?.data as Record<string, unknown> | undefined,
    );
  });

  // notify-kit requires a background-event handler to be registered; route taps
  // that occur while the app is backgrounded via the persisted initial
  // notification on next resume (getInitialNotification / consumeInitialFcmTap).
  notifee.onBackgroundEvent(async ({ type }: Event) => {
    if (type === EventType.PRESS) {
      // Navigation isn't possible from the headless background context; the
      // press is consumed on resume via consumeInitialFcmTap().
    }
  });

  // Foreground taps — router is mounted, route immediately.
  notifee.onForegroundEvent(({ type, detail }: Event) => {
    if (type === EventType.PRESS && detail.notification?.data) {
      routeFcmTap(detail.notification.data as Record<string, unknown>);
    }
  });
}
