/**
 * index.js — app entry point ("main" in package.json).
 * =====================================================
 * On Android, the FCM background handler MUST be registered at module top level,
 * BEFORE AppRegistry runs (expo-router/entry), so setBackgroundMessageHandler is
 * in place before the headless task fires from a FORCE-KILLED state (per
 * @react-native-firebase/messaging docs). It is required conditionally so that
 * RNFirebase JS never loads on iOS — iOS keeps the Expo gateway + Phase B NSE
 * and links no Firebase pods (see react-native.config.js / app.config.js).
 */
const { Platform } = require('react-native');

if (Platform.OS === 'android') {
  require('./services/fcmMessaging');
}

require('expo-router/entry');
