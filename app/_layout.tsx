import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth, getToken } from '@/services/api';
import { connectSocket } from '@/services/socket';
import { useNotificationStore } from '@/store/notificationStore';
import { onNotification } from '@/services/socket';

SplashScreen.preventAutoHideAsync();

// Configure RevenueCat
const rcKey = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

if (rcKey) {
  Purchases.configure({ apiKey: rcKey });
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function RootLayoutInner() {
  const { isDark } = useTheme();
  const { setAuth, setLoading } = useAuthStore();
  const { incrementUnread, addNotification } = useNotificationStore();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="user/[handle]" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}
