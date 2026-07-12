/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "notification-service",
  name: "NotificationService",
  // Dot-prefix → auto-appends to the main bundle id: com.tribelife.app.notificationservice
  bundleIdentifier: ".notificationservice",
  // Matches the Podfile deployment target; Communication Notifications need iOS 15+.
  deploymentTarget: "15.1",
  // Pin the Swift version for reproducible codegen across Xcode versions.
  swiftVersion: "5.0",
  // Intents is required for INSendMessageIntent / INPerson / INImage.
  // UserNotifications is implicit for a notification-service extension.
  frameworks: ["Intents"],
};
