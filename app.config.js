// app.config.js — dynamic Expo config.
// =========================================================================
// Two jobs:
//   1. Inject the Android <queries> block for market:// scheme visibility
//      (Android 11+/API 30+) so Linking.canOpenURL('market://...') works (WR-01).
//   2. Phase C LOCKED DECISION 1 — gate the RNFirebase / notify-kit / native
//      conversation-shortcut config plugins to ANDROID BUILDS ONLY. These
//      plugins inject iOS mods too (RNFB adds `[FIRApp configure]` to
//      AppDelegate); appending them only for Android keeps the iOS project
//      byte-for-byte what TestFlight ships (no Firebase pods, no static
//      frameworks). Pod autolinking exclusion is handled in react-native.config.js.
//
// When both app.json and app.config.js are present, Expo CLI uses app.config.js
// and ignores app.json. All static config from app.json is spread here.
//
// ⚠ CAVEAT: `expo prebuild` evaluates this config ONCE — a combined prebuild
// (both platforms in one run) CANNOT emit different plugin sets per platform.
// EAS builds are per-platform, so `EAS_BUILD_PLATFORM` is authoritative there.
// For a LOCAL Android prebuild you MUST run per-platform and set the flag:
//   RNFB_ANDROID=1 npx expo prebuild -p android
// (iOS local prebuild: `npx expo prebuild -p ios` — no flag → no Firebase plugins.)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

/**
 * Config plugin: adds a <queries> → <intent> block for the market:// scheme.
 * @param {import('expo/config').ExpoConfig} cfg
 * @returns {import('expo/config').ExpoConfig}
 */
function withMarketSchemeQuery(cfg) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { withAndroidManifest } = require('@expo/config-plugins');
  return withAndroidManifest(cfg, (config) => {
    const manifest = config.modResults;
    if (!manifest.manifest.queries) {
      manifest.manifest.queries = [];
    }
    // Only add if not already present
    const alreadyDeclared = manifest.manifest.queries.some(
      (q) =>
        q.intent &&
        q.intent.some(
          (i) => i.data && i.data.some((d) => d.$?.['android:scheme'] === 'market'),
        ),
    );
    if (!alreadyDeclared) {
      manifest.manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'market' } }],
          },
        ],
      });
    }
    return config;
  });
}

module.exports = () => {
  // EAS sets EAS_BUILD_PLATFORM per build; RNFB_ANDROID=1 is the local-prebuild opt-in.
  const isAndroid =
    process.env.EAS_BUILD_PLATFORM === 'android' || process.env.RNFB_ANDROID === '1';

  const plugins = [...(appJson.expo.plugins || []), withMarketSchemeQuery];

  if (isAndroid) {
    plugins.push(
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      'react-native-notify-kit',
      './plugins/withRnFirebaseMessagingServiceWins',
      './plugins/withConversationShortcut',
    );
  }

  return {
    ...appJson.expo,
    plugins,
  };
};
