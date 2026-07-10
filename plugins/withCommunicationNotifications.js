const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const COMMUNICATION_ENTITLEMENT =
  'com.apple.developer.usernotifications.communication';
const SEND_MESSAGE_INTENT = 'INSendMessageIntent';

/**
 * Enable iOS Communication Notifications for the MAIN app target.
 *
 * Phase B renders DM / group / timezone / globe message pushes as the sender's
 * avatar (main circle) + TribeLife app-icon corner badge — the Messages/WhatsApp
 * "communication notification" look. iOS draws that composite itself once a
 * `mutable-content` push is re-issued through an `INSendMessageIntent` donated
 * from a Notification Service Extension (the NSE sub-target is added separately by
 * `@bacons/apple-targets` via `targets/notification-service/`).
 *
 * For the OS to honor those donated intents, the MAIN app must declare two things
 * (this is the one gap `@bacons/apple-targets` does NOT fill — it only configures
 * the sub-target):
 *
 *   1. Entitlement `com.apple.developer.usernotifications.communication = true`.
 *      This is the "Communication Notifications" capability — self-service since
 *      iOS 15 (no Apple request form, unlike the *filtering* entitlement). It must
 *      also be present in the app's provisioning profile at build time.
 *   2. `NSUserActivityTypes` (Info.plist) must contain `INSendMessageIntent` so the
 *      system associates the donated intent with the app.
 *
 * Both mods are idempotent: the entitlement is set without clobbering existing keys
 * (e.g. `aps-environment` from the managed push setup), and `INSendMessageIntent` is
 * de-duped into the `NSUserActivityTypes` array on every re-run of `expo prebuild`.
 *
 * Deploy note: Phase B is INERT until a human ships a new EAS build (no OTA path for
 * native code). The Apple provisioning profile for `com.tribelife.app` must include
 * the Communication Notifications capability, and the new NSE App ID
 * `com.tribelife.app.notificationservice` must be registered in EAS credentials.
 * See `targets/notification-service/DEPLOY-CHECKLIST.md`.
 */
module.exports = function withCommunicationNotifications(config) {
  // (1) Main-app entitlement — keep existing keys (aps-environment, etc).
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults[COMMUNICATION_ENTITLEMENT] = true;
    return cfg;
  });

  // (2) Main-app Info.plist NSUserActivityTypes must contain INSendMessageIntent.
  config = withInfoPlist(config, (cfg) => {
    const existing = cfg.modResults.NSUserActivityTypes;
    const list = Array.isArray(existing) ? existing : [];
    if (!list.includes(SEND_MESSAGE_INTENT)) {
      list.push(SEND_MESSAGE_INTENT);
    }
    cfg.modResults.NSUserActivityTypes = list;
    return cfg;
  });

  return config;
};
