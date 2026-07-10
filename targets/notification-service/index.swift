import UserNotifications
import Intents

/// Notification Service Extension that re-issues TribeLife message pushes as iOS
/// Communication Notifications (sender avatar in the main circle + app-icon corner
/// badge — the Messages/WhatsApp look). iOS draws that composite itself once a
/// `mutable-content` push is re-issued through a donated `INSendMessageIntent`.
///
/// Phase A payload contract (from the backend send sites):
///   data.type          : "chat"
///   data.sender        : { id: <number>, name: <handle>, avatarUrl: <string, never null> }
///   data.conversation  : { id: <string>, title: <string>, isGroup: <bool> }
///
/// The exact `userInfo` key path is DEVICE-UNVERIFIED: with Expo's push gateway the
/// custom `data` object may land at `userInfo["sender"]` (top level) OR nested under
/// `userInfo["body"]` (as a dict, or sometimes as a JSON *string* to parse). We read
/// defensively across all three shapes and fall back to the plain notification on any
/// miss. `contentHandler` is called on EVERY path (all guard failures, success, and
/// `serviceExtensionTimeWillExpire()`).
final class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(_ request: UNNotificationRequest,
                           withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    self.contentHandler = contentHandler
    self.bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

    guard #available(iOSApplicationExtension 15.0, *),
          let best = bestAttempt else { return finish() }

    // Defensively resolve the [String: Any] "data" root that holds sender/conversation.
    guard let root = Self.resolveDataRoot(from: request.content.userInfo),
          let sender = root["sender"] as? [String: Any],
          let name = sender["name"] as? String,
          let avatarUrlStr = sender["avatarUrl"] as? String,  // NEVER null per Phase A
          let avatarUrl = URL(string: avatarUrlStr) else { return finish() }

    // sender.id is a JS NUMBER → arrives as NSNumber, NOT a String. Coerce defensively.
    let senderId = "\(sender["id"] ?? "")"
    let convo = root["conversation"] as? [String: Any]
    let convoId = (convo?["id"] as? String) ?? "tribelife"
    let convoTitle = convo?["title"] as? String
    let isGroup = (convo?["isGroup"] as? Bool) ?? false

    // Download the avatar (public DO Spaces CDN, no auth) within the NSE budget.
    // Fall back to the plain notification on any download failure.
    let task = URLSession.shared.dataTask(with: avatarUrl) { [weak self] data, _, _ in
      guard let self = self else { return }

      // INImage(imageData:) from downloaded bytes — NOT INImage(url:) which renders
      // nothing for remote https URLs (it expects file URLs / bundled assets).
      let avatar: INImage? = data.map { INImage(imageData: $0) }

      let handle = INPersonHandle(value: senderId, type: .unknown)
      let person = INPerson(personHandle: handle,
                            nameComponents: nil,
                            displayName: name,
                            image: avatar,
                            contactIdentifier: nil,
                            customIdentifier: senderId)

      // "Group" is inferred from recipients + speakableGroupName — there is no isGroup
      // property on the intent. Never add the current user to recipients; for incoming
      // messages the OS infers the current user as recipient.
      let group = (isGroup && convoTitle != nil)
        ? INSpeakableString(spokenPhrase: convoTitle!)
        : nil

      let intent = INSendMessageIntent(recipients: isGroup ? [] : nil,
                                       outgoingMessageType: .outgoingMessageText,
                                       content: best.body,
                                       speakableGroupName: group,
                                       conversationIdentifier: convoId,
                                       serviceName: nil,
                                       sender: person,
                                       attachments: nil)

      // Group avatar (if any) must be set before donating.
      if let group = group, let avatar = avatar {
        intent.setImage(avatar, forParameterNamed: \.speakableGroupName)
      }

      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        if let updated = try? request.content.updating(from: intent) {
          self.contentHandler?(updated)
        } else {
          self.finish()
        }
      }
    }
    task.resume()
  }

  /// ~30s NSE budget fallback — always deliver something.
  override func serviceExtensionTimeWillExpire() { finish() }

  /// Deliver the unmodified best-attempt content. Safe to call on any failure path.
  private func finish() {
    if let handler = contentHandler, let best = bestAttempt {
      handler(best)
    }
  }

  /// Resolve the dict holding `sender`/`conversation`, trying (in order):
  ///   1. `userInfo` itself, when `sender` is present at the top level.
  ///   2. `userInfo["body"]` as a `[String: Any]` dict.
  ///   3. `userInfo["body"]` as a JSON *String* → parsed to a dict.
  /// Returns nil if none contain a usable `sender`.
  private static func resolveDataRoot(from userInfo: [AnyHashable: Any]) -> [String: Any]? {
    // 1. Top-level: userInfo already carries `sender`.
    if userInfo["sender"] != nil {
      // Normalize AnyHashable keys to String keys.
      var dict: [String: Any] = [:]
      for (key, value) in userInfo {
        if let k = key as? String { dict[k] = value }
      }
      return dict
    }

    // 2. Nested dict under "body".
    if let body = userInfo["body"] as? [String: Any], body["sender"] != nil {
      return body
    }

    // 3. JSON string under "body".
    if let bodyStr = userInfo["body"] as? String,
       let bodyData = bodyStr.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
       parsed["sender"] != nil {
      return parsed
    }

    return nil
  }
}
