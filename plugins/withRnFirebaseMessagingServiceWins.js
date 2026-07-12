/**
 * withRnFirebaseMessagingServiceWins.js — Phase C production plugin (Android-only).
 * ================================================================================
 * Resolves the AndroidManifest conflict between two FirebaseMessagingService
 * subclasses that BOTH register for `com.google.firebase.MESSAGING_EVENT`:
 *
 *   - expo-notifications:            expo.modules.notifications.service.ExpoFirebaseMessagingService
 *                                    (intent-filter android:priority="-1")
 *   - @react-native-firebase/messaging: io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService
 *                                    (intent-filter default priority 0)
 *
 * Android delivers an incoming FCM message to only ONE service. expo-notifications
 * already self-deprioritizes to -1, so RNFirebase (0) wins by default — but that is
 * implicit. This plugin makes it DETERMINISTIC by stripping the expo service from
 * the merged manifest via `tools:node="remove"`, guaranteeing RNFirebase's
 * setBackgroundMessageHandler is the sole receiver on a killed app (the message
 * avatar path in services/fcmMessaging.ts).
 *
 * CONSEQUENCE (intended): once RNFirebase owns MESSAGING_EVENT, the Expo push
 * gateway can no longer render remote pushes on THIS Android build. That is exactly
 * why the backend (Stage 2) routes ALL Android FCM-device pushes — person AND
 * non-person (beacon/news/system) — through firebase-admin for FCM-token devices.
 * expo-notifications LOCAL/scheduled notifications are unaffected — they run through
 * NotificationsService, not the FCM service removed here.
 *
 * Added for ANDROID BUILDS ONLY via the app.config.js plugin gate.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const EXPO_FCM_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
// Both expo-notifications (value="default") and @react-native-firebase/messaging
// (empty value) declare this same meta-data key → manifest merger fails. We keep the
// app's value and add tools:replace="android:value" so the app wins over the library.
const DEFAULT_CHANNEL_META = 'com.google.firebase.messaging.default_notification_channel_id';

module.exports = function withRnFirebaseMessagingServiceWins(config) {
  return withAndroidManifest(config, (cfg) => {
    // Ensure xmlns:tools is declared on <manifest> so tools:node/tools:replace are honored.
    cfg.modResults.manifest.$ = cfg.modResults.manifest.$ || {};
    cfg.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service || [];

    const already = app.service.find(
      (s) =>
        s && s.$ && s.$['android:name'] === EXPO_FCM_SERVICE && s.$['tools:node'] === 'remove',
    );
    if (!already) {
      app.service.push({ $: { 'android:name': EXPO_FCM_SERVICE, 'tools:node': 'remove' } });
    }

    // Resolve the default_notification_channel_id meta-data merge conflict.
    app['meta-data'] = app['meta-data'] || [];
    let meta = app['meta-data'].find(
      (m) => m && m.$ && m.$['android:name'] === DEFAULT_CHANNEL_META,
    );
    if (!meta) {
      meta = { $: { 'android:name': DEFAULT_CHANNEL_META, 'android:value': 'default' } };
      app['meta-data'].push(meta);
    }
    // Keep whatever value expo-notifications set (default: "default"); ensure non-empty.
    if (!meta.$['android:value']) meta.$['android:value'] = 'default';
    meta.$['tools:replace'] = 'android:value';

    return cfg;
  });
};
