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
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/messaging': { platforms: { ios: null } },
    // notify-kit is cross-platform but only used on Android here; exclude iOS
    // so it adds no iOS pod either.
    'react-native-notify-kit': { platforms: { ios: null } },
  },
};
