const { withAndroidManifest } = require('expo/config-plugins');

const PERMISSION = 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK';

/**
 * Strip FOREGROUND_SERVICE_MEDIA_PLAYBACK from the merged Android manifest.
 *
 * expo-audio@1.1.1 declares this permission unconditionally in its library
 * manifest, but TribeLife only plays voice messages in the FOREGROUND and never
 * enables background playback (no `enableBackgroundPlayback` on the expo-audio
 * plugin config), so the media-playback foreground service is never started.
 * Per the Expo audio docs, foreground playback needs no foreground service.
 *
 * Leaving the permission in forces a Google Play "Foreground service permissions"
 * declaration we cannot honestly satisfy (Google's criterion = tasks noticeable
 * while the user is NOT interacting with the app — i.e. background, which we don't
 * do). So we remove it via a manifest-merger override (tools:node="remove").
 *
 * If we ever add background voice playback, delete this plugin AND set
 * `enableBackgroundPlayback: true` on the expo-audio plugin, then declare the
 * permission in Play Console.
 */
module.exports = function withoutMediaPlaybackPermission(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    // Ensure the tools namespace exists so tools:node="remove" is honored.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const list = manifest['uses-permission'] || [];
    // Drop any existing entry for this permission, then add a single marker that
    // tells the manifest merger to remove what expo-audio's library manifest adds.
    const filtered = list.filter((p) => p?.$?.['android:name'] !== PERMISSION);
    filtered.push({ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } });
    manifest['uses-permission'] = filtered;

    return cfg;
  });
};
