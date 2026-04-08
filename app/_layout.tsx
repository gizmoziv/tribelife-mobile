import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
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
import { auth, getToken } from '@/services/api';
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

          // Connect socket
          const socket = await connectSocket();

          // Listen for real-time notifications
          const cleanup = onNotification((notif) => {
            incrementUnread();
            // Could parse and add to store here
          });

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
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'mention' && data?.roomId) {
        router.push('/chat');
      } else if (data?.type === 'new_dm' && data?.conversationId) {
        router.push(`/chat/dm/${data.conversationId}`);
      } else if (data?.type === 'beacon_match') {
        router.push('/beacon');
      }
    });
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
