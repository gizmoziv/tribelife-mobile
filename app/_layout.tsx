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
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
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
import { routeChatNotificationTap, getPostLoginLandingRoute } from '@/services/notificationRouting';
import { registerForPushNotifications, sendPushTokenToServer } from '@/services/pushNotifications';
import { checkVersion, type VersionCheckResult } from '@/services/version';
import { ForceUpdateModal } from '@/components/ui/ForceUpdateModal';

SplashScreen.preventAutoHideAsync();

function extractAndStoreAttribution(url: string) {
  try {
    const parsed = ExpoLinking.parse(url);
    const ref = parsed.queryParams?.ref;
    if (!ref || typeof ref !== 'string') return;

    const path = parsed.path ?? '';
    let source: 'handle_code' | 'profile_share' | 'group_invite';
    if (path.startsWith('u/')) {
      source = 'profile_share';
    } else if (path.startsWith('g/')) {
      source = 'group_invite';
    } else {
      // /invite?ref= path (or fallback)
      source = 'handle_code';
    }

    AsyncStorage.setItem('attributionRef', ref.toLowerCase());
    AsyncStorage.setItem('attributionSource', source);
  } catch { /* ignore parse errors */ }
}

/**
 * Recover an attribution payload left on the clipboard by the interstitial
 * pages (/invite, /g/:slug, /u/:handle). Runs ONCE per install (guarded by
 * a flag) and only when the user is not yet authenticated, to avoid
 * inspecting the clipboard on every launch.
 *
 * Phase 13: supports 3 payload formats:
 *  - `tribelife-ref:<handle>`              → source = 'handle_code'
 *  - `tribelife-g-ref:<handle>:<slug>`     → source = 'group_invite'
 *  - `tribelife-u-ref:<handle>:<handle>`   → source = 'profile_share'
 */
async function recoverAttributionFromClipboard() {
  try {
    const alreadyChecked = await AsyncStorage.getItem('clipboardRefChecked');
    if (alreadyChecked) return;
    await AsyncStorage.setItem('clipboardRefChecked', '1');

    const hasString = await Clipboard.hasStringAsync();
    if (!hasString) return;

    const content = await Clipboard.getStringAsync();
    if (!content) return;

    // Match in order — first hit wins. The two-segment patterns (g-ref / u-ref)
    // are matched BEFORE the single-segment fallback so a payload like
    // `tribelife-g-ref:alice:my-group` is not misclassified.
    const matchG = content.match(/^tribelife-g-ref:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/);
    const matchU = content.match(/^tribelife-u-ref:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/);
    const match = content.match(/^tribelife-ref:([a-zA-Z0-9_-]+)$/);

    let ref: string | null = null;
    let source: 'handle_code' | 'profile_share' | 'group_invite' | null = null;
    // Deferred deep link target — the slug or handle the interstitial captured.
    // Persisted alongside the attribution so the auth-restore branch in this
    // file (pendingGroupSlug) can auto-navigate to the join screen after the
    // user finishes onboarding from a fresh App Store install.
    let pendingGroupSlug: string | null = null;
    let pendingProfileHandle: string | null = null;
    if (matchG) {
      ref = matchG[1].toLowerCase();
      source = 'group_invite';
      pendingGroupSlug = matchG[2];
    } else if (matchU) {
      ref = matchU[1].toLowerCase();
      source = 'profile_share';
      pendingProfileHandle = matchU[2];
    } else if (match) {
      ref = match[1].toLowerCase();
      source = 'handle_code';
    }

    if (!ref || !source) return;

    await AsyncStorage.setItem('attributionRef', ref);
    await AsyncStorage.setItem('attributionSource', source);
    if (pendingGroupSlug) {
      await AsyncStorage.setItem('pendingGroupSlug', pendingGroupSlug);
    }
    if (pendingProfileHandle) {
      await AsyncStorage.setItem('pendingProfileHandle', pendingProfileHandle);
    }

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
        // Phase 13: one-time migration of the legacy `referralCode` AsyncStorage
        // key → `attributionRef` + `attributionSource='handle_code'`. Idempotent:
        // after `removeItem` runs, subsequent launches read null and skip. The
        // `removeItem` is the gate (no separate "has-migrated" flag needed).
        const legacyRef = await AsyncStorage.getItem('referralCode');
        if (legacyRef) {
          await AsyncStorage.setItem('attributionRef', legacyRef);
          await AsyncStorage.setItem('attributionSource', 'handle_code');
          await AsyncStorage.removeItem('referralCode');
        }

        const token = await getToken();
        // First launch without a session: recover an attribution payload an
        // interstitial page (/invite, /g/:slug, /u/:handle) may have left on
        // the clipboard.
        if (!token) {
          await recoverAttributionFromClipboard();
        }
        if (token) {
          const deviceTimezone = Localization.getCalendars()[0]?.timeZone ?? undefined;
          const { user, needsOnboarding, capabilities } = await auth.me(deviceTimezone);
          await setAuth(token, user, capabilities, needsOnboarding);

          // Tracks whether a deep link (pending group invite or cold-start push
          // tap) consumed the initial nav slot. If still false after both
          // branches below, we fall back to checking for unread beacon
          // matches and routing the user to the Matches tab.
          let deepLinkHandled = false;

          // Handle pending group invite from deep link (saved pre-auth)
          const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
          if (pendingGroupSlug) {
            await AsyncStorage.removeItem('pendingGroupSlug');
            setTimeout(() => router.push(`/g/${pendingGroupSlug}`), 500);
            deepLinkHandled = true;
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
              deepLinkHandled = true;
            } else if (nData?.type === 'beacon_match') {
              setTimeout(() => router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } }), 500);
              deepLinkHandled = true;
            } else if (nData?.type === 'news_breaking') {
              setTimeout(() => router.push({
                pathname: '/(app)/news',
                params: nData?.articleId ? { highlightArticleId: String(nData.articleId) } : {},
              }), 500);
              deepLinkHandled = true;
            } else if (nData?.type === 'org_invite' && nData?.token) {
              setTimeout(() => router.push({
                pathname: '/org/invite/[token]',
                params: { token: String(nData.token) },
              }), 500);
              deepLinkHandled = true;
            }
          }

          // No deep link took the user somewhere specific — if there's an
          // unread daily-matcher result waiting, surface the Matches tab
          // instead of the default beacon list. Mirrors the welcome.tsx
          // re-login flow so both entry paths behave the same.
          if (!deepLinkHandled) {
            getPostLoginLandingRoute().then((landing) => {
              if (landing.params?.tab === 'matches') {
                router.replace(landing);
              }
            });
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
    // Group invite routes (/g/:slug) and profile share routes (/u/:handle) are
    // handled by their respective Expo Router files via native linking. This
    // listener only extracts the attribution token + source channel from the
    // incoming URL. Phase 13 recognizes 3 surfaces: /invite, /g/:slug, /u/:handle.
    ExpoLinking.getInitialURL().then((url) => {
      if (url) extractAndStoreAttribution(url);
    });
    const sub = ExpoLinking.addEventListener('url', ({ url }) => {
      extractAndStoreAttribution(url);
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
        // Refresh notification summary on foreground. If the unread
        // beacon-match count grew while the app was backgrounded (e.g., the
        // daily matcher ran while the user was away), bump them to the
        // Matches tab. Only-on-growth gate avoids yanking users who already
        // saw the count and just toggled away briefly.
        const prevBeaconMatches = useNotificationStore.getState().summary.matches;
        notificationsApi.summary().then((s) => {
          useNotificationStore.getState().setSummary(s);
          if (s.matches > prevBeaconMatches && s.matches > 0) {
            router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } });
          }
        }).catch(() => {});
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
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <ForceUpdateModal message={versionResult.message} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* `initialMetrics={initialWindowMetrics}` seeds safe-area insets
          SYNCHRONOUSLY on the first render so `useSafeAreaInsets()` and
          context-aware `<SafeAreaView>` return real values immediately
          — fixes the Android race where the loading-state render of
          `globe/[roomSlug]` (timezone rooms like Eastern) committed
          before the native layout measurement pass, locking in a
          status-bar overlap. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="user/[handle]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="g/[slug]" options={{ headerShown: false }} />
          </Stack>
        </KeyboardProvider>
      </SafeAreaProvider>
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
