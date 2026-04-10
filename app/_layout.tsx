import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { auth, getToken, groupsApi } from '@/services/api';
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

function extractGroupSlug(url: string): string | null {
  try {
    const match = url.match(/\/g\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function handleGroupInvite(slug: string, router: ReturnType<typeof useRouter>) {
  try {
    const token = await getToken();
    if (!token) {
      await AsyncStorage.setItem('pendingGroupSlug', slug);
      return;
    }
    const { group } = await groupsApi.getInfo(slug);
    if (group.isMember) {
      router.push({
        pathname: '/(app)/chat/[conversationId]',
        params: { conversationId: group.id.toString(), isGroup: 'true', groupName: group.groupName, inviteSlug: group.inviteSlug },
      });
      return;
    }
    Alert.alert(
      'Join Group',
      `Join "${group.groupName}" (${group.memberCount} members)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            try {
              const { conversation } = await groupsApi.join(slug);
              router.push({
                pathname: '/(app)/chat/[conversationId]',
                params: { conversationId: conversation.id.toString(), isGroup: 'true', groupName: conversation.groupName, inviteSlug: slug },
              });
            } catch { Alert.alert('Error', 'Could not join this group.'); }
          },
        },
      ]
    );
  } catch {
    Alert.alert('Error', 'This group was not found.');
  }
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
  const { incrementUnread, addNotification } = useNotificationStore();
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
        if (token) {
          const deviceTimezone = Localization.getCalendars()[0]?.timeZone ?? undefined;
          const { user } = await auth.me(deviceTimezone);
          const needsOnboarding = !user.handle;
          await setAuth(token, user, needsOnboarding);

          // Handle pending group invite from deep link
          const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
          if (pendingGroupSlug) {
            await AsyncStorage.removeItem('pendingGroupSlug');
            // Defer to after navigation is ready
            setTimeout(() => handleGroupInvite(pendingGroupSlug, router), 500);
          }

          // Connect socket
          const socket = await connectSocket();

          // Listen for real-time notifications
          const cleanup = onNotification((notif) => {
            incrementUnread();
            // Could parse and add to store here
          });

          // Handle cold-start notification (app was killed, user tapped notification)
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (lastResponse) {
            const nData = lastResponse.notification.request.content.data;
            if (nData?.type === 'new_dm' && nData?.conversationId) {
              setTimeout(() => router.push({
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
    const processUrl = (url: string) => {
      extractAndStoreReferralCode(url);
      const groupSlug = extractGroupSlug(url);
      if (groupSlug) {
        handleGroupInvite(groupSlug, router);
      }
    };

    ExpoLinking.getInitialURL().then((url) => {
      if (url) processUrl(url);
    });
    const sub = ExpoLinking.addEventListener('url', ({ url }) => {
      processUrl(url);
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
      if (data?.type === 'mention' && data?.roomId) {
        router.push('/(app)/chat');
      } else if (data?.type === 'new_dm' && data?.conversationId) {
        router.push({
          pathname: '/(app)/chat/[conversationId]',
          params: {
            conversationId: String(data.conversationId),
            ...(data.senderHandle ? { handle: String(data.senderHandle) } : {}),
            ...(data.isGroup ? { isGroup: 'true', groupName: String(data.groupName ?? '') } : {}),
          },
        });
      } else if (data?.type === 'beacon_match') {
        router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } });
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
