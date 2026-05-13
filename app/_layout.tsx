import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { AppState, AppStateStatus, Platform } from 'react-native';
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
import { onNotification, onChatNotification, onRoomMessage, onGlobeMessage, onDirectMessage } from '@/services/socket';
import { useChatsStore } from '@/store/chatsStore';
import { adaptChatNotification } from '@/services/chatNotificationAdapter';
import { routeChatNotificationTap } from '@/services/notificationRouting';
import { registerForPushNotifications, sendPushTokenToServer } from '@/services/pushNotifications';
import { checkVersion, type VersionCheckResult } from '@/services/version';
import { ForceUpdateModal } from '@/components/ui/ForceUpdateModal';

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

  // ── Version check state ──────────────────────────────────────────────
  // null = not yet resolved; 'ok' | 'force_update' | 'unreachable' after check.
  const [versionResult, setVersionResult] = useState<VersionCheckResult | null>(null);
  // In-flight guard: prevents concurrent checkVersion() calls from AppState
  // transitions (rapid background→foreground) from overwriting each other's
  // results with stale data (CR-01).
  const versionCheckInFlight = useRef(false);

  // Cold-start version check — fires once after fonts load (D-09).
  // checkVersion() resolves to 'unreachable' on any network failure (never
  // throws), so no catch branch is needed here. Per D-02, 'unreachable'
  // is treated as 'ok' by the render gate below.
  useEffect(() => {
    if (!fontsLoaded) return;
    let cancelled = false;
    (async () => {
      const result = await checkVersion();
      if (!cancelled) setVersionResult(result);
    })();
    return () => { cancelled = true; };
  }, [fontsLoaded]);

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
          const { user, needsOnboarding, capabilities } = await auth.me(deviceTimezone);
          await setAuth(token, user, capabilities, needsOnboarding);

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
          // Phase 10 D-08: defensive — a legacy server pod (or stale socket
          // connection) might still emit notification:new for chat types during a
          // rolling deploy. Adapt + feed useChatsStore so Chats badges stay correct.
          const cleanup = onNotification((raw) => {
            incrementUnread();
            notificationsApi
              .summary()
              .then((s) => useNotificationStore.getState().setSummary(s))
              .catch(() => {});
            const adapted = adaptChatNotification(raw);
            if (adapted) {
              useChatsStore.getState().applyChatNotification(adapted);
            }
          });

          // Phase 10 D-03: chat:notification listener feeds useChatsStore +
          // triggers bell summary refresh.
          const cleanupChatNotif = onChatNotification((raw) => {
            const adapted = adaptChatNotification(raw);
            if (adapted) {
              useChatsStore.getState().applyChatNotification(adapted);
            }
            notificationsApi
              .summary()
              .then((s) => useNotificationStore.getState().setSummary(s))
              .catch(() => {});
          });

          // Phase 10 D-09: per-source message events drive `lastMessage` updates
          // on the Chats rows (the unread bump lives on chat:notification).
          const cleanupRoomMsg = onRoomMessage((msg) => {
            useChatsStore.getState().applyRoomMessage(msg as never);
          });
          const cleanupGlobeMsg = onGlobeMessage((msg) => {
            useChatsStore.getState().applyGlobeMessage(msg as never);
          });
          const cleanupDmMsg = onDirectMessage((msg) => {
            useChatsStore.getState().applyDmMessage(msg as never);
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
            // Phase 10 D-04 + D-05: adapter handles both new (data.type === 'chat')
            // and legacy (data.type === 'mention'|'new_dm' without data.source)
            // chat shapes. Non-chat types fall through to their existing branches.
            const adapted = adaptChatNotification(nData);
            if (adapted) {
              setTimeout(() => routeChatNotificationTap(adapted, router), 500);
            } else if (nData?.type === 'beacon_match') {
              setTimeout(() => router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } }), 500);
            } else if (nData?.type === 'news_breaking') {
              setTimeout(() => router.push({
                pathname: '/(app)/news',
                params: nData?.articleId ? { highlightArticleId: String(nData.articleId) } : {},
              }), 500);
            } else if (nData?.type === 'org_invite' && nData?.token) {
              setTimeout(() => router.push({
                pathname: '/org/invite/[token]',
                params: { token: String(nData.token) },
              }), 500);
            }
          }

          return () => {
            cleanup?.();
            cleanupChatNotif?.();
            cleanupRoomMsg?.();
            cleanupGlobeMsg?.();
            cleanupDmMsg?.();
          };
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
      // Auto-mark-as-read the tapped notification
      const notifId = typeof data?.notificationId === 'number'
        ? data.notificationId
        : Number(data?.notificationId);
      if (notifId && !Number.isNaN(notifId)) {
        markOneRead(notifId);
        notificationsApi.read(notifId).catch(() => {});
      }
      // Phase 10 D-04 + D-05: adapter handles new + legacy chat shapes.
      const adapted = adaptChatNotification(data);
      if (adapted) {
        routeChatNotificationTap(adapted, router);
        return;
      }
      if (data?.type === 'beacon_match') {
        router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } });
      } else if (data?.type === 'news_breaking') {
        router.push({
          pathname: '/(app)/news',
          params: data?.articleId ? { highlightArticleId: String(data.articleId) } : {},
        });
      } else if (data?.type === 'org_invite' && data?.token) {
        router.push({
          pathname: '/org/invite/[token]',
          params: { token: String(data.token) },
        });
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => subscription.remove();
  }, []);

  // Keep splash visible until BOTH fonts are loaded AND the version check has
  // resolved. Hiding on fontsLoaded alone would expose a blank screen while
  // the network call is still in flight (the render gate at versionResult===null
  // returns null, so there's nothing to show until both conditions are met).
  useEffect(() => {
    if (fontsLoaded && versionResult !== null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, versionResult]);

  useEffect(() => {
    // Background → foreground: refresh the full session (user + capabilities)
    // so tier rule changes made server-side (RevenueCat upgrade, admin role
    // grant, premium expiry) take effect. Capabilities-driven gating — see
    // hooks/useCapability.ts and useIsPremium.
    //
    // Note: AppState.addEventListener('change') does NOT fire a synthetic
    // 'active' on registration — only on real transitions.
    const handleChange = async (next: AppStateStatus) => {
      if (next !== 'active') return;
      // Existing Phase 1 behavior — capabilities refresh on foreground.
      // refreshSession is fire-and-forget (not awaited); version check runs
      // independently so neither blocks the other.
      if (useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().refreshSession();
        // Phase 10 D-07: foreground re-fetch of /api/chats reconciles drift
        // from missed socket events while backgrounded. Store-internal
        // _hydrating flag dedupes rapid AppState toggles.
        useChatsStore.getState().hydrate();
      }
      // Phase 6 / D-09 — re-run version check on every foreground transition.
      // If the operator bumped the floor while the app was backgrounded, the
      // user gets the modal on the next render.
      // Guard against concurrent calls (CR-01): rapid background→foreground
      // toggles on a slow connection could queue multiple checkVersion() calls;
      // without this lock the last-to-resolve (not the latest) wins.
      if (versionCheckInFlight.current) return;
      versionCheckInFlight.current = true;
      try {
        const result = await checkVersion();
        setVersionResult(result);
      } finally {
        versionCheckInFlight.current = false;
      }
    };
    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  // Per D-09: wait for the first version-check result before rendering.
  // The check is fast (single HTTP request with a 5s timeout, or instant
  // when __DEV__ via D-05). The splash screen is held open by the combined
  // fontsLoaded + versionResult gate above, so returning null here is a
  // safety net — the splash should still be visible at this point.
  if (versionResult === null) return null;

  // Per D-08: when force_update, render ONLY the modal. The Stack does
  // NOT mount — the rest of the app shell is unreachable. Per D-02:
  // 'unreachable' is treated as 'ok' (fail-open) — the user proceeds
  // into the app and the downstream error UI takes over if needed.
  if (versionResult.status === 'force_update') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ForceUpdateModal message={versionResult.message} />
      </GestureHandlerRootView>
    );
  }

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
