package com.tribelife.app.shortcuts

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.Intent
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.URL

/**
 * ConversationShortcutModule — Phase C LOCKED DECISION 5.
 *
 * react-native-notify-kit exposes no shortcut API, so the COLLAPSED conversation
 * look (sender avatar + app-icon corner badge) needs a long-lived Person sharing
 * shortcut published natively. This module publishes that shortcut; the JS side
 * (services/fcmMessaging.ts) then sets the SAME shortcutId on the notification
 * (via the notify-kit shortcutId patch), which Android promotes to a conversation.
 *
 * Runs on the React native-modules thread (not the UI thread), so the synchronous
 * avatar bitmap fetch is allowed here. Any failure rejects the promise; the JS
 * caller then falls back to the largeIcon-only partial so a shortcut failure never
 * drops the notification.
 */
class ConversationShortcutModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ConversationShortcut"

  @ReactMethod
  fun pushConversationShortcut(
    shortcutId: String,
    personName: String,
    avatarUri: String,
    promise: Promise
  ) {
    try {
      val context = reactApplicationContext
      val icon: IconCompat? = fetchIcon(avatarUri)

      val personBuilder = Person.Builder().setName(personName).setKey(shortcutId)
      if (icon != null) personBuilder.setIcon(icon)
      val person = personBuilder.build()

      // A dynamic shortcut MUST carry an intent, or pushDynamicShortcut throws.
      val intent = Intent(Intent.ACTION_VIEW).apply { setPackage(context.packageName) }

      val shortcutBuilder = ShortcutInfoCompat.Builder(context, shortcutId)
        .setShortLabel(personName)
        .setLongLived(true)
        .setPerson(person)
        .setIntent(intent)
      if (icon != null) shortcutBuilder.setIcon(icon)

      ShortcutManagerCompat.pushDynamicShortcut(context, shortcutBuilder.build())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHORTCUT_ERROR", e.message, e)
    }
  }

  private fun fetchIcon(avatarUri: String): IconCompat? {
    if (avatarUri.isBlank()) return null
    return try {
      val connection = URL(avatarUri).openStream()
      val bitmap: Bitmap? = BitmapFactory.decodeStream(connection)
      connection.close()
      if (bitmap != null) IconCompat.createWithAdaptiveBitmap(bitmap) else null
    } catch (e: Exception) {
      null
    }
  }
}
