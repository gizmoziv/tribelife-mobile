import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { AppState, AppStateStatus, Platform, View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ExpoLinking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';
import { GiphySDK } from '@giphy/react-native-sdk';
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
import { auth, getToken, notificationsApi, extractAccessStatus } from '@/services/api';
import { connectSocket, emitForeground, emitBackground } from '@/services/socket';
import { useNotificationStore } from '@/store/notificationStore';
import { onNotification, onChatNotification, onRoomMessage, onGlobeMessage, onDirectMessage } from '@/services/socket';
import { useChatsStore } from '@/store/chatsStore';
import { adaptChatNotification } from '@/services/chatNotificationAdapter';
import { routeChatNotificationTap, getPostLoginLandingRoute } from '@/services/notificationRouting';
import { markNotificationTap, wasNotificationTapRecent } from '@/services/notificationTapGuard';
import { navTrace, debugTrace } from '@/services/navTrace'; // TEMP(261112-fsr): debugTrace
import {
  registerForPushNotifications,
  sendPushTokenToServer,
  registerAndroidPushToken,
  consumeAndroidInitialFcmTap,
} from '@/services/pushNotifications';
import { checkVersion, type VersionCheckResult } from '@/services/version';
import { ForceUpdateModal } from '@/components/ui/ForceUpdateModal';
import { AccessBlockScreen } from '@/components/ui/AccessBlockScreen';

SplashScreen.preventAutoHideAsync();

// [nav-trace] temporary: proves WHEN the JS bundle is evaluated relative to
// AppState / notification events on a cold launch.
navTrace('module-load app/_layout');

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

// ── Giphy SDK ────────────────────────────────────────────────────────────
// Configure the Giphy SDK ONCE at module load (mirrors the RevenueCat pattern
// above) so the prebuilt picker is ready before any composer can open it.
// The platform-correct key comes from EXPO_PUBLIC_ env vars (readable via
// process.env). If the key is missing we skip configure() and leave
// isGiphyConfigured=false; GifButton reads this flag to hide/disable itself
// so a missing key never crashes the app. The key value is never logged.
const giphyKey = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_GIPHY_SDK_IOS
  : process.env.EXPO_PUBLIC_GIPHY_SDK_ANDROID;

export const isGiphyConfigured = !!giphyKey;

if (giphyKey) {
  GiphySDK.configure({ apiKey: giphyKey });
}

// ── Coalesced bell-summary refresh (Phase 1 #B) ─────────────────────────────
// Rapid socket notification events (a busy room, a reconnect back-fill) would
// otherwise each fire notificationsApi.summary(), tripping the backend's
// 120 req/min limit (the /summary 429 bursts). A trailing debounce collapses a
// burst into ONE authoritative refetch — the summary is idempotent, so only the
// last value matters. The mount/foreground refetch in (app)/_layout.tsx is
// unaffected (it's not bursty and stays immediate).
let summaryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function refreshBellSummarySoon(): void {
  if (summaryRefreshTimer) clearTimeout(summaryRefreshTimer);
  summaryRefreshTimer = setTimeout(() => {
    summaryRefreshTimer = null;
    notificationsApi
      .summary()
      .then((s) => useNotificationStore.getState().setSummary(s))
      .catch(() => {});
  }, 800);
}

// ── Cold-start navigation gate ───────────────────────────────────────────────
// restoreSession() used to fire its cold-start navigations (tapped chat,
// beacon_match, news_breaking, org_invite, pending group invite, Android FCM
// consume) from a fixed setTimeout(…, 500). If the first version check was
// slower than that, no navigator was mounted yet and router.push/navigate threw
// ("Attempted to navigate before mounting the Root Layout component") from a
// timer callback — an uncaught JS exception.
//
// Now: navigations are queued until the root <Stack> is mounted AND the auth
// restore finished (see the readiness effect in RootLayoutInner), then run
// after a short settle window inside try/catch. The settle window lets Index's
// <Redirect> REPLACE reach the FIFO routing queue first so the tap destination
// is always applied LAST (and so wins), exactly as the old 500ms delay did on
// the happy path.
const COLD_START_NAV_SETTLE_MS = 500;
const COLD_START_NAV_RETRY_MS = 300;
const COLD_START_NAV_MAX_ATTEMPTS = 3;

function runColdStartNav(
  label: string,
  nav: () => void,
  attemptsLeft: number = COLD_START_NAV_MAX_ATTEMPTS,
): void {
  try {
    nav();
    navTrace('coldStartNav ran', { label });
  } catch (err) {
    // A not-ready router throws before enqueuing anything, so retrying cannot
    // double-navigate. Give up quietly after the last attempt — never crash.
    navTrace('coldStartNav threw', { label, attemptsLeft, error: String(err) });
    if (attemptsLeft > 1) {
      setTimeout(() => runColdStartNav(label, nav, attemptsLeft - 1), COLD_START_NAV_RETRY_MS);
    }
  }
}

function RootLayoutInner() {
  const { isDark } = useTheme();
  // TEMP(261112-fsr): dev-only mount/unmount trace (no-op when __DEV__ is false).
  useEffect(() => {
    debugTrace('RootLayoutInner mount');
    return () => debugTrace('RootLayoutInner unmount');
  }, []);
  const { token, user, setAuth, setLoading, isAuthenticated, isLoading, accessStatus } = useAuthStore();
  const { incrementUnread, addNotification, markOneRead } = useNotificationStore();
  const router = useRouter();

  // Cold-start navigations waiting for the navigator (see gate above). Each
  // entry arms the settle timer when flushed. Refs, not state: restoreSession
  // runs once from a mount-only effect and must see live values.
  const pendingNav = useRef<Array<() => void>>([]);
  const navReady = useRef(false);

  function scheduleColdStartNav(label: string, nav: () => void): void {
    const arm = () => {
      setTimeout(() => runColdStartNav(label, nav), COLD_START_NAV_SETTLE_MS);
    };
    if (navReady.current) {
      arm();
      return;
    }
    navTrace('coldStartNav queued (navigator not ready)', { label });
    pendingNav.current.push(arm);
  }

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
  // TEMP(261112-fsr): dev-only trace of each versionResult status change.
  useEffect(() => {
    debugTrace('versionResult status', { status: versionResult?.status ?? null });
  }, [versionResult?.status]);

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
          const meResponse = await auth.me(deviceTimezone);
          const { user, needsOnboarding, capabilities } = meResponse;
          const resolvedStatus = extractAccessStatus(meResponse);
          await setAuth(token, user, capabilities, needsOnboarding, resolvedStatus);
          navTrace('restoreSession after setAuth', { needsOnboarding, accessStatus: resolvedStatus });

          // Tracks whether a deep link (pending group invite or cold-start push
          // tap) consumed the initial nav slot. If still false after both
          // branches below, we fall back to checking for unread beacon
          // matches and routing the user to the Matches tab.
          let deepLinkHandled = false;

          // Handle pending group invite from deep link (saved pre-auth)
          const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
          if (pendingGroupSlug) {
            await AsyncStorage.removeItem('pendingGroupSlug');
            scheduleColdStartNav('pendingGroupInvite', () => router.push(`/g/${pendingGroupSlug}`));
            deepLinkHandled = true;
          }

          // Connect socket — Phase 35: skip entirely for a pending/rejected
          // session. Phase 34 refuses the handshake for these statuses, so
          // dialing it here would burn a connect_error on every launch. The
          // status is already known synchronously (resolvedStatus, above).
          const socketBlocked = resolvedStatus === 'pending' || resolvedStatus === 'rejected';
          const socket = socketBlocked ? null : await connectSocket();

          // Listen for real-time notifications. Optimistically bump the raw
          // unread count, then refetch the authoritative per-type summary so
          // the bell badge (events, not messages) updates without waiting for
          // the next foreground/reconnect poll.
          // Phase 10 D-08: defensive — a legacy server pod (or stale socket
          // connection) might still emit notification:new for chat types during a
          // rolling deploy. Adapt + feed useChatsStore so Chats badges stay correct.
          const cleanup = onNotification((raw) => {
            incrementUnread();
            refreshBellSummarySoon();
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
            refreshBellSummarySoon();
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
          navTrace('restoreSession after getLastNotificationResponseAsync', {
            hasResponse: !!lastResponse,
            type: lastResponse?.notification.request.content.data?.type ?? null,
            source: lastResponse?.notification.request.content.data?.source ?? null,
          });
          if (lastResponse) {
            // A tap is authoritative: stamp it FIRST so the passive foreground
            // Beacon bump / post-login landing replace stand down.
            markNotificationTap('restoreSession cold-start');
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
              scheduleColdStartNav('chatTap', () => routeChatNotificationTap(adapted, router));
              deepLinkHandled = true;
            } else if (nData?.type === 'beacon_match') {
              scheduleColdStartNav('beaconMatchTap', () => router.push({ pathname: '/(app)/beacon', params: { tab: 'matches' } }));
              deepLinkHandled = true;
            } else if (nData?.type === 'news_breaking') {
              scheduleColdStartNav('newsBreakingTap', () => router.push({
                pathname: '/(app)/tribe',
                params: nData?.articleId ? { highlightArticleId: String(nData.articleId) } : {},
              }));
              deepLinkHandled = true;
            } else if (nData?.type === 'org_invite' && nData?.token) {
              scheduleColdStartNav('orgInviteTap', () => router.push({
                pathname: '/org/invite/[token]',
                params: { token: String(nData.token) },
              }));
              deepLinkHandled = true;
            }
          }

          // Android: a cold-start tap on an FCM message notification is
          // displayed by notify-kit (not expo-notifications), so it never shows
          // up in getLastNotificationResponseAsync above. Consume notify-kit's
          // persisted initial notification and deep-link into the conversation.
          if (Platform.OS === 'android') {
            scheduleColdStartNav('androidInitialFcmTap', () => {
              consumeAndroidInitialFcmTap().catch(() => {});
            });
          }

          // No deep link took the user somewhere specific — if there's an
          // unread daily-matcher result waiting, surface the Matches tab
          // instead of the default beacon list. Mirrors the welcome.tsx
          // re-login flow so both entry paths behave the same.
          if (!deepLinkHandled) {
            getPostLoginLandingRoute().then((landing) => {
              if (landing.params?.tab !== 'matches') return;
              // A notification tap (e.g. the Android FCM consume, which this
              // branch cannot see) is the user's explicit intent — never
              // override it with the passive Matches landing.
              const tapRecent = wasNotificationTapRecent();
              navTrace('restoreSession landing-replace decision', { tapRecent, replaced: !tapRecent });
              if (tapRecent) return;
              try {
                router.replace(landing);
              } catch {
                // navigator not mounted yet — same outcome as before (landing skipped), minus the unhandled rejection
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
    // TEMP(261112-fsr): dev-only skip toggle + run trace. Both inert when __DEV__ is false.
    const skipPushReg = __DEV__ && process.env.EXPO_PUBLIC_DEBUG_SKIP_PUSH_REG === '1';
    debugTrace('push effect run', {
      hasAuth: !!(token && user),
      skipped: skipPushReg,
    });
    if (skipPushReg) return;
    if (!(token && user)) return;
    if (Platform.OS === 'android') {
      // Android routes message pushes via raw FCM. Still run the expo path to
      // create the 'default'/'news' notification channels + request permission
      // (auto-displayed FCM `notification` messages for non-person pushes land
      // on the 'default' channel), but ignore the returned Expo token — register
      // the raw FCM device token instead.
      registerForPushNotifications().catch(() => {});
      registerAndroidPushToken().catch((err) =>
        console.error('[push] Android FCM registration failed:', err),
      );
    } else {
      registerForPushNotifications().then((pushToken) => {
        if (pushToken) {
          sendPushTokenToServer(pushToken);
        }
      });
    }
    // Depend on user?.id (identity), NOT the whole user object: refreshSession()
    // mints a new `user` reference on every foreground, which would otherwise
    // re-run push registration each time. Registration only needs to run when the
    // authenticated identity actually changes (login/logout).
  }, [token, user?.id]);

  // ── RevenueCat user identification ───────────────────────────────────────
  // Tag future purchases with the real numeric user id so the backend webhook
  // can attribute them directly. Fires on both session restore and fresh login
  // because user?.id becomes defined in both paths via setAuth().
  useEffect(() => {
    if (!rcKey || !user?.id) return;
    Purchases.logIn(String(user.id))
      .then(() => {
        // Populate RevenueCat subscriber attributes so customers are
        // identifiable in the dashboard and future webhook payloads.
        if (user.email) Purchases.setEmail(user.email);
        if (user.name) Purchases.setDisplayName(user.name);
        // Collects IDFV + IP (IDFA only if ATT is authorized).
        Purchases.collectDeviceIdentifiers();
      })
      .catch((err) => {
        if (__DEV__) console.warn('[revenuecat] logIn failed', err);
      });
  }, [user?.id]);

  useEffect(() => {
    function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data;
      navTrace('handleNotificationResponse', {
        type: data?.type ?? null,
        source: data?.source ?? null,
      });
      // A tap is authoritative: stamp it FIRST so the passive foreground
      // Beacon bump / post-login landing replace stand down (all branches).
      markNotificationTap('handleNotificationResponse');
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
          pathname: '/(app)/tribe',
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

  // ── Cold-start navigation gate: readiness ──────────────────────────────────
  // True exactly when the render path below reaches the root <Stack> (fonts
  // loaded, first version check resolved and not force_update, access gate not
  // blocking) — the navigator mounts in this same commit, and child effects run
  // before this parent effect. Plus the auth restore must have finished
  // (isLoading false) so Index has resolved its redirect. Re-evaluated on every
  // change so a later force_update / access block (Stack unmounts) closes the
  // gate again. Queued navigations flush the moment the gate opens.
  const stackMounted =
    fontsLoaded &&
    versionResult !== null &&
    versionResult.status !== 'force_update' &&
    !(isAuthenticated && (accessStatus === 'pending' || accessStatus === 'rejected'));

  useEffect(() => {
    const ready = stackMounted && !isLoading;
    navReady.current = ready;
    navTrace('coldStartNav readiness', { ready, queued: pendingNav.current.length });
    if (!ready) return;
    const jobs = pendingNav.current;
    pendingNav.current = [];
    jobs.forEach((arm) => arm());
  }, [stackMounted, isLoading]);

  useEffect(() => {
    // Background → foreground: refresh the full session (user + capabilities)
    // so tier rule changes made server-side (RevenueCat upgrade, admin role
    // grant, premium expiry) take effect. Capabilities-driven gating — see
    // hooks/useCapability.ts and useIsPremium.
    //
    // Note: AppState.addEventListener('change') does NOT fire a synthetic
    // 'active' on registration — only on real transitions.
    const handleChange = async (next: AppStateStatus) => {
      navTrace('appState change', { next });
      // 260621-un7: single AppState listener also drives the backend
      // active-viewing foreground state. Backgrounding ('background' or
      // 'inactive') immediately resumes push for the room on screen (backend
      // nulls activeRoomKey on app:background). 'active' re-asserts foreground.
      if (next === 'active') {
        emitForeground();
      } else if (next === 'background' || next === 'inactive') {
        emitBackground();
      }

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
        //
        // Two guards keep this passive bump from hijacking the user:
        //  - baseline: the in-memory summary starts at matches 0 after a
        //    restart, so "growth" against a never-loaded baseline is just "the
        //    user has any unread match". Only compare once a real summary has
        //    been stored before this foreground; on first load just store it.
        //  - tap: a notification tap (chat/beacon/news/invite) is the user's
        //    explicit destination and navigates synchronously, while this
        //    decision resolves after an HTTP round trip — it would land second
        //    and steal focus to Beacon. Stand down if a tap navigated recently.
        const baseline = useNotificationStore.getState();
        const prevBeaconMatches = baseline.summary.matches;
        const summaryLoaded = baseline.summaryLoaded;
        notificationsApi.summary().then((s) => {
          useNotificationStore.getState().setSummary(s);
          const tapRecent = wasNotificationTapRecent();
          const shouldBump = summaryLoaded && !tapRecent && s.matches > prevBeaconMatches && s.matches > 0;
          navTrace('appState bump decision', {
            prevBeaconMatches,
            matches: s.matches,
            summaryLoaded,
            tapRecent,
            pushed: shouldBump,
          });
          if (shouldBump) {
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
    // TEMP(261112-fsr): dev-only plain-View variant to isolate the RN Modal.
    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_PLAIN_VIEW === '1') {
      return (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text>Update Required (debug plain view)</Text>
            </View>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      );
    }
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <ForceUpdateModal message={versionResult.message} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Phase 35 (D-13/D-14/D-15/D-20): this is a UX gate only — Phase 34 owns
  // server-side enforcement (requireApprovedAccess + the socket handshake
  // refusal). Placed here, above <Stack>, because five top-level routes
  // (g/[slug], u/[handle], user/[handle], org/[slug], org/invite/[token]) are
  // siblings of (app) and would bypass any (app)/_layout.tsx effect guard.
  // isAuthenticated is required so an unauthenticated user still reaches
  // welcome.tsx.
  if (isAuthenticated && (accessStatus === 'pending' || accessStatus === 'rejected')) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AccessBlockScreen status={accessStatus} />
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
  // TEMP(261112-fsr): dev-only mount/unmount trace (no-op when __DEV__ is false).
  useEffect(() => {
    debugTrace('RootLayout mount');
    return () => debugTrace('RootLayout unmount');
  }, []);
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}
