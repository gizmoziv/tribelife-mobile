/**
 * withConversationShortcut.js — Phase C LOCKED DECISION 5 (Android-only).
 * =======================================================================
 * Wires the custom Kotlin conversation-shortcut native module into the prebuilt
 * Android project so the COLLAPSED message notification shows the sender avatar +
 * app-icon corner badge (Android conversation promotion). notify-kit has no
 * shortcut API, so this native ShortcutManagerCompat helper fills the gap; the JS
 * side (services/fcmMessaging.ts) publishes the long-lived Person shortcut through
 * it and sets the matching shortcutId on the notification.
 *
 * Two mods:
 *   1. Copy native/conversation-shortcut/*.kt into the generated Android project
 *      (android/app/src/main/java/com/tribelife/app/shortcuts/).
 *   2. Register ConversationShortcutPackage in MainApplication.getPackages().
 *
 * Added to the plugin list for ANDROID BUILDS ONLY via app.config.js gating.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const PACKAGE = 'com.tribelife.app.shortcuts';
const SOURCE_DIR = path.join('native', 'conversation-shortcut');
const KOTLIN_FILES = ['ConversationShortcutModule.kt', 'ConversationShortcutPackage.kt'];
const IMPORT_LINE = `import ${PACKAGE}.ConversationShortcutPackage`;
// Marker used to detect an already-applied registration across both MainApplication shapes.
const ADD_MARKER = 'ConversationShortcutPackage()';

function withCopyKotlinSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot; // <project>/android
      const destDir = path.join(
        platformRoot,
        'app',
        'src',
        'main',
        'java',
        ...PACKAGE.split('.'),
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of KOTLIN_FILES) {
        const src = path.join(projectRoot, SOURCE_DIR, file);
        const dest = path.join(destDir, file);
        fs.copyFileSync(src, dest);
      }
      return cfg;
    },
  ]);
}

function withRegisterPackage(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // SDK 54 / RN 0.81 ships a Kotlin MainApplication.
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        '[withConversationShortcut] expected a Kotlin MainApplication (SDK 54). ' +
          'Java MainApplication is not supported by this plugin.',
      );
    }

    // (1) import — insert after the package declaration.
    if (!contents.includes(IMPORT_LINE)) {
      contents = contents.replace(/(^package .*$)/m, `$1\n\n${IMPORT_LINE}`);
    }

    // (2) register the package in getPackages(). SDK 54 emits
    //     `PackageList(this).packages.apply { ... }` — add() inside the apply
    //     block (the receiver is the mutable package list). Also support the
    //     older `val packages = PackageList(this).packages` shape.
    if (!contents.includes(ADD_MARKER)) {
      const applyAnchor = /(PackageList\(this\)\.packages\.apply\s*\{)/;
      const valAnchor = /(val packages = PackageList\(this\)\.packages)/;
      if (applyAnchor.test(contents)) {
        contents = contents.replace(applyAnchor, `$1\n              add(ConversationShortcutPackage())`);
      } else if (valAnchor.test(contents)) {
        contents = contents.replace(valAnchor, `$1\n      packages.add(ConversationShortcutPackage())`);
      } else {
        throw new Error(
          '[withConversationShortcut] could not find the PackageList anchor in ' +
            'MainApplication.kt — cannot register ConversationShortcutPackage.',
        );
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withConversationShortcut(config) {
  config = withCopyKotlinSources(config);
  config = withRegisterPackage(config);
  return config;
};
