/**
 * Store URLs for the Phase 6 force-update gate (D-07).
 *
 * iOS: opens the App Store app via the apps.apple.com universal link. The
 *      <APP_ID> placeholder MUST be replaced with the public-store App ID
 *      once Apple assigns it (TestFlight builds use a different ID and we
 *      do not want to deep-link to TF). Until then, tapping "Update Now"
 *      will land on the empty App Store error page — acceptable while the
 *      production floor is 0.0.0 (gate disabled) per D-03.
 *
 * Android: market:// scheme opens the Play Store app directly when installed
 *          (every shipped Android device). HTTPS fallback handles the rare
 *          case of a Play Store-less OEM build — out of scope for TribeLife
 *          but the fallback is free to ship.
 */

// TODO(force-update): replace <APP_ID> with the App Store ID once the app
// is approved for the public store. Until then, the iOS deep link opens
// an error page. Phase 6 ships the gate disabled (floors at 0.0.0) so no
// real user will hit this URL before the App ID is filled in.
export const IOS_STORE_URL = 'https://apps.apple.com/app/id<APP_ID>';

export const ANDROID_STORE_URL = 'market://details?id=com.tribelife.app';
export const ANDROID_STORE_URL_FALLBACK = 'https://play.google.com/store/apps/details?id=com.tribelife.app';
