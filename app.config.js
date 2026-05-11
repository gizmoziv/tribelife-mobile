// app.config.js — extends app.json with a config plugin that injects
// the Android <queries> block required for market:// scheme visibility
// on Android 11+ (API 30+). Without this declaration, canOpenURL('market://...')
// always returns false and the Play Store deep-link never fires (WR-01).
//
// When both app.json and app.config.js are present, Expo CLI uses app.config.js
// and ignores app.json. All static config from app.json is spread here so nothing
// is lost. Dynamic modifications (plugins) are appended below.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
const config = {
  ...appJson.expo,
  plugins: [
    ...(appJson.expo.plugins || []),
    // Inject <queries> into AndroidManifest.xml for market:// scheme visibility.
    // Required on Android 11+ (API 30+) for Linking.canOpenURL('market://...') to
    // return true on devices with the Play Store installed (D-07 acceptance criterion).
    withMarketSchemeQuery,
  ],
};

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

module.exports = config;
