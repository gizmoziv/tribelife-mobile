// react-native.config.js — scope RNFirebase + notify-kit to ANDROID ONLY.
// =========================================================================
// Phase C LOCKED DECISION 1: iOS already ships (Expo push gateway + the
// Phase B @bacons/apple-targets NSE) and needs ZERO part of Firebase. Linking
// the Firebase iOS pods is exactly what forces app-wide `useFrameworks: static`
// in CocoaPods, which risks the shipping Giphy / Google-Sign-In / NSE targets.
//
// Setting `platforms.ios = null` removes each module from iOS autolinking while
// keeping it on Android, so no Firebase/notify-kit pod is ever added to the iOS
// project and iOS linkage stays byte-for-byte what TestFlight ships today.
//
// The config-plugin iOS mods (RNFB injects `[FIRApp configure]` into
// AppDelegate) are gated separately in app.config.js (Android-only plugin set).
// ⚠ Apply the iOS-exclusion overrides ONLY when NOT building Android. On an
// Android build we provide NO overrides so RNFirebase/notify-kit autolink
// normally with their OWN declared android metadata — mirroring the proven
// throwaway harness (which had no react-native.config.js and built Android fine).
// Specifying a `platforms` override for these deps on Android clobbers
// RNFirebase's declared packageImportPath (io.invertase.firebase.app.* becomes a
// wrong io.invertase.firebase.*), producing the Gradle compile error
// "cannot find symbol ReactNativeFirebaseAppPackage". EAS sets EAS_BUILD_PLATFORM
// per build; RNFB_ANDROID=1 is the local-android-prebuild opt-in (mirrors app.config.js).
const isAndroidBuild =
  process.env.EAS_BUILD_PLATFORM === 'android' || process.env.RNFB_ANDROID === '1';

module.exports = {
  dependencies: isAndroidBuild
    ? {}
    : {
        '@react-native-firebase/app': { platforms: { ios: null } },
        '@react-native-firebase/messaging': { platforms: { ios: null } },
        // notify-kit is cross-platform but only used on Android here; exclude iOS.
        'react-native-notify-kit': { platforms: { ios: null } },
      },
};
