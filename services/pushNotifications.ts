import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { auth } from './api';
import { useForegroundContextStore, type ForegroundContext } from '@/store/foregroundContextStore';

// Decide whether an incoming push should be suppressed at the OS level.
// Suppression rule: only when the user is currently looking at the exact
// thing the push is about (e.g. viewing the same chat the message arrived
// in, or on the news tab when a news push arrives). Anything else — including
// pushes for other chats while inside a chat — should still surface.
function isCurrentlyViewing(ctx: ForegroundContext, data: Record<string, unknown>): boolean {
  const type = data.type;
  if (ctx.type === 'chat' && type === 'new_dm') {
    const dataConvId = Number(data.conversationId);
    return !Number.isNaN(dataConvId) && dataConvId === ctx.conversationId;
  }
  if (ctx.type === 'news' && type === 'news_breaking') {
    return true;
  }
  return false;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isActive = AppState.currentState === 'active';
    const data = (notification.request.content.data ?? {}) as Record<string, unknown>;

    // Background / inactive → always show the OS notification.
    if (!isActive) {
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    }

    // Foreground → suppress only if the push is for the screen the user is
    // already on. The in-app UI (chat list, news tab banner, etc.) handles
    // the event in real time via the socket / received-listener instead.
    const ctx = useForegroundContextStore.getState().context;
    const suppress = isCurrentlyViewing(ctx, data);

    return {
      shouldShowAlert: !suppress,
      shouldShowBanner: !suppress,
      shouldShowList: true,
      shouldPlaySound: !suppress,
      shouldSetBadge: true,
    };
  },
});

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E8922F',
      });
      await Notifications.setNotificationChannelAsync('news', {
        name: 'Breaking News',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E8922F',
        sound: 'default',
      });
    }

    if (!Device.isDevice) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.error('[push] registration failed:', err);
    return null;
  }
}

export async function sendPushTokenToServer(token: string): Promise<void> {
  try {
    await auth.updatePushToken(token);
  } catch (err) {
    console.error('[push] Failed to send push token to server:', err);
  }
}
