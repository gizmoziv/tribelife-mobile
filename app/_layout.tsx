import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ExpoLinking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Purchases from 'react-native-purchases';
import {
  useFonts,
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth, getToken, notificationsApi } from '@/services/api';
import { connectSocket } from '@/services/socket';
import { useNotificationStore } from '@/store/notificationStore';
import { onNotification } from '@/services/socket';
import { registerForPushNotifications, sendPushTokenToServer } from '@/services/pushNotifications';

SplashScreen.preventAutoHideAsync();

function extractAndStoreReferralCode(url: string) {
  try {
    const parsed = ExpoLinking.parse(url);
    const ref = parsed.queryParams?.ref;
    if (ref && typeof ref === 'string') {
      AsyncStorage.setItem('referralCode', ref.toLowerCase());
    }
  } catch { /* ignore parse errors */ }
}

/**
 * Recover a referral code left on the clipboard by the /invite interstitial
 * page. Runs ONCE per install (guarded by a flag) and only when the user is
 * not yet authenticated, to avoid inspecting the clipboard on every launch.
 */
async function recoverReferralCodeFromClipboard() {
  try {
    const alreadyChecked = await AsyncStorage.getItem('clipboardRefChecked');
    if (alreadyChecked) return;
    await AsyncStorage.setItem('clipboardRefChecked', '1');

    const hasString = await Clipboard.hasStringAsync();
    if (!hasString) return;

    const content = await Clipboard.getStringAsync();
    const match = content?.match(/^tribelife-ref:([a-zA-Z0-9_-]+)$/);
    if (!match) return;

    const ref = match[1].toLowerCase();
    await AsyncStorage.setItem('referralCode', ref);

    // Clear the clipboard so the user doesn't accidentally paste it elsewhere
    await Clipboard.setStringAsync('');
  } catch { /* ignore clipboard errors */ }
}


// Configure RevenueCat
const rcKey = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

if (rcKey) {
  Purchases.configure({ apiKey: rcKey });
}

function RootLayoutInner() {
  const { isDark } = useTheme();
  const { token, user, setAuth, setLoading } = useAuthStore();
  const { incrementUnread, addNotification, markOneRead } = useNotificationStore();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // Restore session on app launch
  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await getToken();
        // First launch without a session: recover a referral code the
        // /invite interstitial may have left on the clipboard.
        if (!token) {
          await recoverReferralCodeFromClipboard();
        }
        if (token) {
          const deviceTimezone = Localization.getCalendars()[0]?.timeZone ?? undefined;
          const { user, needsOnboarding } = await auth.me(deviceTimezone);
          await setAuth(token, user, needsOnboarding);

          // Handle pending group invite from deep link (saved pre-auth)
          const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
          if (pendingGroupSlug) {
            await AsyncStorage.removeItem('pendingGroupSlug');
            setTimeout(() => router.push(`/g/${pendingGroupSlug}`), 500);
          }

          // Connect socket
          const socket = await connectSocket();

          // Listen for real-time notifications. Optimistically bump the raw
          // unread count, then refetch the authoritative per-type summary so
          // the bell badge (events, not messages) updates without waiting for
          // the next foreground/reconnect poll.
          const cleanup = onNotification(() => {
            incrementUnread();
            notificationsApi
              .summary()
              .then((s) => useNotificationStore.getState().setSummary(s))
              .catch(() => {});
          });

          // Handle cold-start notification (app was killed, user tapped notification)
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (lastResponse) {
            const nData = lastResponse.notification.request.content.data;
            // Auto-mark-as-read the tapped notification (industry standard: WhatsApp/iMessage)
            const notifId = typeof nData?.notificationId === 'number'
              ? nData.notificationId
              : Number(nData?.notificationId);
            if (notifId && !Number.isNaN(notifId)) {
              markOneRead(notifId);
              notificationsApi.read(notifId).catch(() => {});
            }
            if (nData?.type === 'new_dm' && nData?.conversationId) {
              // navigate (not push) so that if the user was already viewing
              // this conversation when the notification fired, we reuse that
              // screen instance instead of stacking a duplicate — otherwise
              // tapping "back" pops to the original and renders both the tab
              // header and the stack header at once.
              setTimeout(() => router.navigate({
                pathname: '/(app)/chat/[conversationId]',
                params: {
                  conversationId: String(nData.conversationId),
                  ...(nData.senderHandle ? { handle: String(nData.senderHandle) } : {}),
                  ...(nData.isGroup ? { isGroup: 'true', groupName: String(nData.groupName ?? '') } : {}),
                },
              }), 500);
            } else if (nData?.type === 'mention' && nData?.roomId) {
              setTimeout(() => router.push('/(app)/chat'), 500);
            } else if (nData?.type === 'beacon_match') {
              setTimeout(() => router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } }), 500);
            } else if (nData?.type === 'news_breaking') {
              setTimeout(() => router.push({
                pathname: '/(app)/news',
                params: nData?.articleId ? { highlightArticleId: String(nData.articleId) } : {},
              }), 500);
            }
          }

          return cleanup;
        }
      } catch {
        // Token expired or invalid — user will be shown auth screen
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    // Group invite routes (/g/:slug) are handled by app/g/[slug].tsx via Expo
    // Router's native linking. This listener only extracts the referral code.
    ExpoLinking.getInitialURL().then((url) => {
      if (url) extractAndStoreReferralCode(url);
    });
    const sub = ExpoLinking.addEventListener('url', ({ url }) => {
      extractAndStoreReferralCode(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (token && user) {
      registerForPushNotifications().then((pushToken) => {
        if (pushToken) {
          sendPushTokenToServer(pushToken);
        }
      });
    }
  }, [token, user]);

  useEffect(() => {
    function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data;
      // Auto-mark-as-read the tapped notification (industry standard: WhatsApp/iMessage)
      const notifId = typeof data?.notificationId === 'number'
        ? data.notificationId
        : Number(data?.notificationId);
      if (notifId && !Number.isNaN(notifId)) {
        markOneRead(notifId);
        notificationsApi.read(notifId).catch(() => {});
      }
      if (data?.type === 'mention' && data?.roomId) {
        router.push('/(app)/chat');
      } else if (data?.type === 'new_dm' && data?.conversationId) {
        // See cold-start handler above: navigate reuses an existing chat
        // instance in history if one is already open for this conversation,
        // preventing duplicate header/keyboard glitches on back-tap.
        router.navigate({
          pathname: '/(app)/chat/[conversationId]',
          params: {
            conversationId: String(data.conversationId),
            ...(data.senderHandle ? { handle: String(data.senderHandle) } : {}),
            ...(data.isGroup ? { isGroup: 'true', groupName: String(data.groupName ?? '') } : {}),
          },
        });
      } else if (data?.type === 'beacon_match') {
        router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } });
      } else if (data?.type === 'news_breaking') {
        router.push({
          pathname: '/(app)/news',
          params: data?.articleId ? { highlightArticleId: String(data.articleId) } : {},
        });
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="user/[handle]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="g/[slug]" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}
