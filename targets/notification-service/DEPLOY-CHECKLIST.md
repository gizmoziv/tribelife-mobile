# Phase B — iOS Communication Notifications: Deploy Checklist (human-run)

Phase B (sender-avatar communication notifications) is **INERT until a human ships a
new EAS build** — native code has no OTA path. The agent's work is committed and
locally prebuild-verified; the steps below are what a human operator must do to make
it live and confirm the visual result.

> Do NOT bump `MIN_CLIENT_VERSION`. No backend change is needed (Phase A already sends
> `mutableContent:true` + `data.sender` / `data.conversation`).

## 1. Set `ios.appleTeamId` in `app.json`

`@bacons/apple-targets` needs `ios.appleTeamId` for multi-target codesigning. It is
intentionally NOT committed (unknown to the agent; local `--no-install` codegen works
without it). Add your Apple Developer Team ID:

```jsonc
// app.json → expo.ios
"appleTeamId": "XXXXXXXXXX"
```

## 2. Register the NSE App ID in the Apple Developer portal

Register a new App ID **`com.tribelife.app.notificationservice`** (the dot-prefixed
`bundleIdentifier` in `expo-target.config.js` auto-appends to the main bundle id).
Include it in EAS credentials for multi-target signing:
<https://docs.expo.dev/app-signing/local-credentials/#multi-target-project>

## 3. Add the Communication Notifications capability to the MAIN app

Add the **Communication Notifications** capability to the `com.tribelife.app` App ID
**and** its provisioning profile. This is **self-service since iOS 15** — no Apple
request form needed. (Do NOT confuse it with the *filtering* entitlement
`com.apple.developer.usernotifications.filtering`, which DOES require an Apple request
form.) If this capability is missing from the profile, the NSE silently no-ops and
users just see plain notifications.

The `com.apple.developer.usernotifications.communication` entitlement and
`NSUserActivityTypes = [INSendMessageIntent]` are already injected into the main app by
`plugins/withCommunicationNotifications.js` at prebuild time.

## 4. Build to a PHYSICAL device and visually confirm

Run a fresh EAS **dev/preview** build, install on a **physical iOS device** (the
Simulator will NOT render the avatar + corner-badge composite faithfully), and confirm:

- 1:1 DM push → sender avatar circle + TribeLife app-icon corner badge.
- Group / timezone / globe push → correct group threading (per `conversation.id`).
- Non-person pushes (beacon / news / moderation / system) are unaffected (plain look).

## 5. ONE-TIME payload key-path confirmation

The Swift NSE reads `data.sender` / `data.conversation` **defensively** across three
shapes: `userInfo["sender"]` (top level), `userInfo["body"]` (dict), and
`userInfo["body"]` (JSON string). This handles the unverified Expo push-gateway nesting.

To confirm the live path (and prune the resolver if desired), dump
`request.content.userInfo` on device (e.g. `NSLog` inside `didReceive`) on a real push
and note which shape carries `sender`. If NONE match, adjust `resolveDataRoot(from:)`
in `index.swift`. This is the single device-unverified assumption from RESEARCH.md (A2).

## Verification already done by the agent (local codegen only)

- `npx expo prebuild -p ios --clean --no-install` runs clean.
- Generated `ios/*.xcodeproj/project.pbxproj` contains the NSE target
  (`com.tribelife.app.notificationservice`).
- Generated main-app `.entitlements` contains
  `com.apple.developer.usernotifications.communication`.
- Generated main-app `Info.plist` `NSUserActivityTypes` contains `INSendMessageIntent`.
- NSE `Info.plist` declares the `com.apple.usernotifications.service` extension point.
- Idempotent: `PBXNativeTarget` count is stable across two prebuilds (no duplicate NSE).
- `ios/` was removed after verification (it is gitignored / EAS-regenerated).
