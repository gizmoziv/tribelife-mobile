const { withAndroidManifest } = require('expo/config-plugins');

const PERMISSION = 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED';

/**
 * Strip READ_MEDIA_VISUAL_USER_SELECTED from the merged Android manifest.
 *
 * expo-media-library (auto-applied config plugin and library manifest) declares
 * this permission, but it only exists for Android 14 "selected photos" access on
 * top of READ_MEDIA_IMAGES / READ_MEDIA_VIDEO. TribeLife declares neither (see the
 * expo-media-library `granularPermissions: []` entry in app.json): every photo is
 * picked through the Android system photo picker, which needs no permission, and
 * saving an image uses MediaStore on Android 10+.
 *
 * Google Play's "Photo and Video Permissions" policy rejected the app for the
 * READ_MEDIA_* permissions. This one is not named by the policy, but it is
 * useless without them, so we remove it via a manifest-merger override
 * (tools:node="remove") rather than risk a second review cycle.
 *
 * If a feature ever needs real media-library access, delete this plugin and the
 * `granularPermissions: []` entry, and file the Play Console declaration form.
 */
module.exports = function withoutVisualUserSelectedPermission(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    // Ensure the tools namespace exists so tools:node="remove" is honored.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const list = manifest['uses-permission'] || [];
    // Drop any existing entry, then add a single marker that tells the manifest
    // merger to remove what expo-media-library's library manifest adds.
    const filtered = list.filter((p) => p?.$?.['android:name'] !== PERMISSION);
    filtered.push({ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } });
    manifest['uses-permission'] = filtered;

    return cfg;
  });
};
