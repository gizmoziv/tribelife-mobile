package com.tribelife.app.shortcuts

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage registering the ConversationShortcut native module. Wired into the
 * app's MainApplication getPackages() list by plugins/withConversationShortcut.js
 * (Android-only; added via the app.config.js Android plugin gate).
 */
class ConversationShortcutPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(ConversationShortcutModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
