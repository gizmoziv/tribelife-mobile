// verify-eas-profiles.mjs
//
// OFFLINE ONLY — never imported by app code. Guards eas.json so a wrong store
// binary is impossible to miss: the iOS 27 scene-lifecycle flag (TRIBELIFE_IOS_SCENES)
// and any Xcode 27 build image may appear ONLY on the two flag-ON test profiles
// (ios-scenes-test, ios-scenes-dev), which have no channel and are never submitted;
// the store profiles (development, preview, production) are pinned to the exact
// Xcode 26.6 / SDK 57 Android images; and `eas submit` can only land on the Android
// internal track. No network, no EAS CLI, no database: it only reads eas.json.
//
// Effective profile config: each build profile is resolved by following `extends`
// recursively (child keys override parent; the `env`, `ios` and `android` objects are
// shallow-merged child over parent).
//
// Checks (ids)
//   eas:parse                    valid JSON with a `build` object
//   eas:scene-profiles-present   ios-scenes-test and ios-scenes-dev exist
//   eas:scene-profile-env        each scene profile's OWN env has TRIBELIFE_IOS_SCENES=1 and SHARP_IGNORE_GLOBAL_LIBVIPS=1
//   eas:scene-profile-image      each scene profile's effective ios.image is macos-tahoe-26.6-xcode-27.0
//   eas:scene-profile-no-channel each scene profile has no effective channel and is not distribution=store
//   eas:scenes-env-scope         no other profile's effective env carries TRIBELIFE_IOS_SCENES
//   eas:xcode27-scope            no other profile's effective ios.image contains xcode-27
//   eas:non-scene-ios-image-pin  development, preview, production: ios.image is macos-tahoe-26.5-xcode-26.6 (D-03, amended 2026-10-11)
//   eas:android-image-pin        development, preview, production: android.image is ubuntu-26.04-jdk-17-ndk-r27b-sdk-57
//   eas:channels                 development and preview have no channel, production has channel production
//   eas:sharp-env                every build profile's effective env has SHARP_IGNORE_GLOBAL_LIBVIPS=1
//   eas:submit-android-track     submit.production.android.track is internal
//
// Options
//   --file <path>              eas.json to check (default: this script's parent, tribelife-mobile/eas.json)
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-eas-profiles.mjs
//   Requires Node v22.18+ (same .mjs rationale as scripts/verify-link-clicks.mjs).
//
// Prints EAS_PROFILES_OK (exit 0) or EAS_PROFILES_FAIL <check ids, sorted> (exit 1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const fileIdx = argv.indexOf('--file');
const file = path.resolve(fileIdx >= 0 && argv[fileIdx + 1] !== undefined ? argv[fileIdx + 1] : path.join(here, '..', 'eas.json'));

const SCENE_PROFILES = ['ios-scenes-test', 'ios-scenes-dev'];
const STORE_PROFILES = ['development', 'preview', 'production'];
const SCENE_IMAGE = 'macos-tahoe-26.6-xcode-27.0';
const IOS_PIN = 'macos-tahoe-26.5-xcode-26.6';
const ANDROID_PIN = 'ubuntu-26.04-jdk-17-ndk-r27b-sdk-57';

const fails = [];
const ok = (cond, id) => { if (!cond && !fails.includes(id)) fails.push(id); };
const finish = () => {
  if (fails.length) {
    console.log('EAS_PROFILES_FAIL ' + [...fails].sort().join(' '));
    process.exit(1);
  }
  console.log('EAS_PROFILES_OK');
  process.exit(0);
};

// ── Parse ───────────────────────────────────────────────────────────────────
let eas = null;
try { eas = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { eas = null; }
if (!eas || typeof eas !== 'object' || !eas.build || typeof eas.build !== 'object') {
  ok(false, 'eas:parse');
  finish();
}
const build = eas.build;

// ── Effective profile (follow `extends`, shallow-merge env/ios/android) ──────
const MERGED_KEYS = ['env', 'ios', 'android'];
function effective(name, seen = []) {
  const raw = build[name];
  if (!raw || typeof raw !== 'object' || seen.includes(name)) return {};
  const base = raw.extends ? effective(raw.extends, [...seen, name]) : {};
  const out = { ...base, ...raw };
  delete out.extends;
  for (const k of MERGED_KEYS) {
    if (base[k] || raw[k]) out[k] = { ...(base[k] || {}), ...(raw[k] || {}) };
  }
  return out;
}
const eff = Object.fromEntries(Object.keys(build).map((n) => [n, effective(n)]));
const others = Object.keys(build).filter((n) => !SCENE_PROFILES.includes(n));

// ── Scene profiles ──────────────────────────────────────────────────────────
ok(SCENE_PROFILES.every((n) => build[n] && typeof build[n] === 'object'), 'eas:scene-profiles-present');
ok(
  SCENE_PROFILES.every((n) => {
    const own = (build[n] && build[n].env) || {};
    return own.TRIBELIFE_IOS_SCENES === '1' && own.SHARP_IGNORE_GLOBAL_LIBVIPS === '1';
  }),
  'eas:scene-profile-env',
);
ok(SCENE_PROFILES.every((n) => eff[n] && eff[n].ios && eff[n].ios.image === SCENE_IMAGE), 'eas:scene-profile-image');
ok(SCENE_PROFILES.every((n) => eff[n] && eff[n].channel === undefined && eff[n].distribution !== 'store'), 'eas:scene-profile-no-channel');

// ── Scope: the flag and Xcode 27 stay off every other profile ────────────────
ok(others.every((n) => !(eff[n].env && 'TRIBELIFE_IOS_SCENES' in eff[n].env)), 'eas:scenes-env-scope');
ok(others.every((n) => !String((eff[n].ios && eff[n].ios.image) || '').includes('xcode-27')), 'eas:xcode27-scope');

// ── Store pins (D-03 as amended 2026-10-11) ──────────────────────────────────
ok(STORE_PROFILES.every((n) => eff[n] && eff[n].ios && eff[n].ios.image === IOS_PIN), 'eas:non-scene-ios-image-pin');
ok(STORE_PROFILES.every((n) => eff[n] && eff[n].android && eff[n].android.image === ANDROID_PIN), 'eas:android-image-pin');
ok(
  eff.development && eff.development.channel === undefined &&
    eff.preview && eff.preview.channel === undefined &&
    eff.production && eff.production.channel === 'production',
  'eas:channels',
);
ok(Object.keys(eff).every((n) => eff[n].env && eff[n].env.SHARP_IGNORE_GLOBAL_LIBVIPS === '1'), 'eas:sharp-env');

// ── Submit ──────────────────────────────────────────────────────────────────
ok(Boolean(eas.submit && eas.submit.production && eas.submit.production.android && eas.submit.production.android.track === 'internal'), 'eas:submit-android-track');

finish();
