// verify-chat-draft.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises utils/chatDraft.ts
// against an in-memory fake AsyncStorage so the draft engine's load/debounce/
// flush/purge behavior can be verified without a native toolchain or device.
//
// Usage: node --no-warnings scripts/verify-chat-draft.mjs
//   Run from tribelife-mobile/. Requires Node v22.18+ or v23.6+ (built-in
//   TypeScript type stripping loads ../utils/chatDraft.ts directly). Node
//   v24.14.0 was confirmed at planning time.
//
// Why .mjs, not .ts:
//   - The mobile tsconfig (extends expo/tsconfig.base) lacks
//     allowImportingTsExtensions, so a .ts script importing
//     '../utils/chatDraft.ts' with the explicit extension fails tsc (TS5097).
//   - Node's ESM loader requires that explicit .ts extension to resolve the
//     module at all.
//   - A .mjs file falls under allowJs without checkJs, so tsc does not
//     type-check this script, avoiding the contradiction above.
//   scripts/generate-region-globes.mjs sets the precedent for a .mjs script
//   in this directory.

import assert from 'node:assert/strict';
import {
  DRAFT_SAVE_DEBOUNCE_MS,
  conversationDraftKey,
  roomDraftKey,
  createDraftController,
  purgeAllChatDrafts,
  listDraftTexts,
} from '../utils/chatDraft.ts';

// ── Fake storage ─────────────────────────────────────────────────────────

function createFakeStorage() {
  const map = new Map();
  const calls = [];
  const deferred = new Map(); // key -> { promise, resolve }

  return {
    map,
    calls,
    deferGet(key) {
      let resolve;
      const promise = new Promise((res) => {
        resolve = res;
      });
      deferred.set(key, { promise, resolve });
    },
    async getItem(key) {
      calls.push({ op: 'getItem', key });
      if (deferred.has(key)) {
        const { promise } = deferred.get(key);
        const value = await promise;
        return value;
      }
      return map.has(key) ? map.get(key) : null;
    },
    resolveGet(key, value) {
      const entry = deferred.get(key);
      if (!entry) throw new Error(`no deferred get for ${key}`);
      deferred.delete(key);
      entry.resolve(value);
    },
    async setItem(key, value) {
      map.set(key, value);
      calls.push({ op: 'setItem', key, value });
    },
    async removeItem(key) {
      map.delete(key);
      calls.push({ op: 'removeItem', key });
    },
    async getAllKeys() {
      calls.push({ op: 'getAllKeys' });
      return Array.from(map.keys());
    },
    async multiRemove(keys) {
      for (const k of keys) map.delete(k);
      calls.push({ op: 'multiRemove', keys: [...keys] });
    },
    async multiGet(keys) {
      calls.push({ op: 'multiGet', keys: [...keys] });
      return keys.map((k) => [k, map.has(k) ? map.get(k) : null]);
    },
  };
}

function createFakeRejectingStorage() {
  return {
    async getItem() {
      return null;
    },
    async setItem() {},
    async removeItem() {},
    async getAllKeys() {
      throw new Error('boom');
    },
    async multiRemove() {},
  };
}

function createRecordedController(storage, debounceMs = 20) {
  const changes = [];
  const controller = createDraftController({
    storage,
    onTextChange: (text) => changes.push(text),
    debounceMs,
  });
  return { controller, changes };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

// ── Cases ───────────────────────────────────────────────────────────────

async function T1_keys() {
  assert.equal(conversationDraftKey(42), 'chatDraft:conversation:42');
  assert.equal(conversationDraftKey(Number.NaN), null);
  assert.equal(conversationDraftKey(0), null);
  assert.equal(conversationDraftKey(-3), null);
  assert.equal(conversationDraftKey(null), null);
  assert.equal(conversationDraftKey(undefined), null);
  assert.equal(roomDraftKey('timezone:eastern-time'), 'chatDraft:room:timezone:eastern-time');
  assert.equal(roomDraftKey('eastern-time'), 'chatDraft:room:eastern-time');
  assert.notEqual(roomDraftKey('timezone:eastern-time'), roomDraftKey('eastern-time'));
  assert.equal(roomDraftKey(''), null);
  assert.equal(roomDraftKey(null), null);
  assert.equal(roomDraftKey(undefined), null);
  assert.ok(DRAFT_SAVE_DEBOUNCE_MS >= 300 && DRAFT_SAVE_DEBOUNCE_MS <= 400);
}

async function T2_load() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:1';
  storage.map.set(K, 'hello draft');
  const { controller, changes } = createRecordedController(storage);
  controller.setKey(K);
  await settle();
  assert.equal(controller.getText(), 'hello draft');
  assert.equal(changes[changes.length - 1], 'hello draft');
}

async function T3_oncePerKey() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:2';
  storage.map.set(K, 'stored');
  const { controller } = createRecordedController(storage);
  controller.setKey(K);
  await settle();
  controller.flush();
  controller.setKey(K);
  await settle();
  const getCalls = storage.calls.filter((c) => c.op === 'getItem' && c.key === K);
  assert.equal(getCalls.length, 1);
}

async function T4_lateKeyNoClobber() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:3';
  storage.map.set(K, 'stored');
  const { controller } = createRecordedController(storage);
  controller.setKey(null);
  controller.setText('typed early');
  controller.setKey(K);
  await settle();
  assert.equal(controller.getText(), 'typed early');
}

async function T5_typingDuringSlowLoad() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:4';
  storage.deferGet(K);
  const { controller } = createRecordedController(storage);
  controller.setKey(K);
  controller.setText('x');
  storage.resolveGet(K, 'stored');
  await settle();
  assert.equal(controller.getText(), 'x');
}

async function T6_staleLoadDiscarded() {
  const storage = createFakeStorage();
  const K1 = 'chatDraft:conversation:5';
  const K2 = 'chatDraft:conversation:6';
  storage.deferGet(K1);
  const { controller, changes } = createRecordedController(storage);
  controller.setKey(K1);
  controller.setKey(K2);
  storage.resolveGet(K1, 'old');
  await settle();
  assert.equal(controller.getText(), '');
  assert.ok(!changes.includes('old'));
}

async function T7_debounce() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:7';
  const { controller } = createRecordedController(storage);
  controller.setKey(K);
  controller.setText('a');
  controller.setText('ab');
  controller.setText('abc');
  await settle();
  let setItemCalls = storage.calls.filter((c) => c.op === 'setItem' && c.key === K);
  assert.equal(setItemCalls.length, 0);
  await sleep(80);
  setItemCalls = storage.calls.filter((c) => c.op === 'setItem' && c.key === K);
  assert.equal(setItemCalls.length, 1);
  assert.equal(setItemCalls[0].value, 'abc');
}

async function T8_flushLatest() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:8';
  const { controller } = createRecordedController(storage);
  controller.setKey(K);
  controller.setText('hel');
  controller.setText('hello');
  controller.flush();
  await settle();
  assert.equal(storage.map.get(K), 'hello');
  await sleep(80);
  const setItemCalls = storage.calls.filter((c) => c.op === 'setItem' && c.key === K);
  assert.equal(setItemCalls.length, 1);
}

async function T9_emptyRemoval() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:9';
  const { controller } = createRecordedController(storage);
  controller.setKey(K);
  controller.setText('abc');
  controller.flush();
  await settle();
  assert.equal(storage.map.get(K), 'abc');

  controller.setText('   \n');
  controller.flush();
  await settle();
  assert.ok(!storage.map.has(K));
  const whitespaceSetItems = storage.calls.filter((c) => c.op === 'setItem' && typeof c.value === 'string' && c.value.trim() === '');
  assert.equal(whitespaceSetItems.length, 0);

  controller.setText('x');
  await sleep(80);
  assert.equal(storage.map.get(K), 'x');
  controller.setText('');
  await sleep(80);
  assert.ok(!storage.map.has(K));
}

async function T10_clear() {
  const storage = createFakeStorage();
  const K = 'chatDraft:conversation:10';
  const { controller, changes } = createRecordedController(storage);
  controller.setKey(K);
  controller.setText('msg');
  controller.flush();
  await settle();
  controller.clear();
  assert.equal(controller.getText(), '');
  assert.equal(changes[changes.length - 1], '');
  assert.ok(!storage.map.has(K));

  controller.setText('again');
  controller.clear();
  await sleep(80);
  assert.ok(!storage.map.has(K));
}

async function T11_keySwitch() {
  const storage = createFakeStorage();
  const K1 = 'chatDraft:conversation:11';
  const K2 = 'chatDraft:conversation:12';
  const { controller } = createRecordedController(storage);
  controller.setKey(K1);
  controller.setText('for one');
  controller.setKey(K2);
  await settle();
  assert.equal(storage.map.get(K1), 'for one');
  assert.equal(controller.getText(), '');
  controller.setKey(K1);
  await settle();
  assert.equal(controller.getText(), 'for one');
}

async function T12_noKey() {
  const storage = createFakeStorage();
  const { controller } = createRecordedController(storage);
  controller.setText('x');
  await sleep(80);
  controller.flush();
  const setItemCalls = storage.calls.filter((c) => c.op === 'setItem');
  const removeItemCalls = storage.calls.filter((c) => c.op === 'removeItem');
  assert.equal(setItemCalls.length, 0);
  assert.equal(removeItemCalls.length, 0);
}

async function T13_purge() {
  const storage = createFakeStorage();
  storage.map.set('chatDraft:conversation:1', 'old');
  storage.map.set('chatDraft:room:eastern-time', 'old room');
  storage.map.set('preferredTranslateLanguage', 'en');
  storage.map.set('chevra:welcome_dismissed:town-square', 'true');

  const { controller: a } = createRecordedController(storage);
  a.setKey('chatDraft:conversation:1');
  a.setText('secret');
  // deliberately not flushed before the purge

  await purgeAllChatDrafts(storage);

  const remainingChatDraftKeys = Array.from(storage.map.keys()).filter((k) => k.startsWith('chatDraft:'));
  assert.equal(remainingChatDraftKeys.length, 0);
  assert.equal(storage.map.get('preferredTranslateLanguage'), 'en');
  assert.equal(storage.map.get('chevra:welcome_dismissed:town-square'), 'true');

  a.flush();
  await settle();
  assert.ok(!storage.map.has('chatDraft:conversation:1'));

  a.setText('more');
  await sleep(80);
  assert.ok(!storage.map.has('chatDraft:conversation:1'));

  const { controller: b } = createRecordedController(storage);
  const K = 'chatDraft:conversation:99';
  b.setKey(K);
  b.setText('fresh');
  b.flush();
  await settle();
  assert.equal(storage.map.get(K), 'fresh');
}

async function T14_neverRejects() {
  const storage = createFakeRejectingStorage();
  await purgeAllChatDrafts(storage);
}

async function T15_listEmpty() {
  const storage = createFakeStorage();
  const result = await listDraftTexts(storage);
  assert.deepEqual(result, {});
  assert.equal(storage.calls.filter((c) => c.op === 'multiGet').length, 0);

  const storage2 = createFakeStorage();
  storage2.map.set('preferredTranslateLanguage', 'en');
  storage2.map.set('chevra:welcome_dismissed:town-square', 'true');
  const result2 = await listDraftTexts(storage2);
  assert.deepEqual(result2, {});
  assert.equal(storage2.calls.filter((c) => c.op === 'multiGet').length, 0);
}

async function T16_listFiltersPrefix() {
  const storage = createFakeStorage();
  storage.map.set('chatDraft:conversation:1', 'hi');
  storage.map.set('chatDraft:room:town-square', 'yo');
  storage.map.set('chatDraft:room:timezone:eastern-time', 'local draft');
  storage.map.set('preferredTranslateLanguage', 'en');

  const result = await listDraftTexts(storage);
  assert.deepEqual(result, {
    'chatDraft:conversation:1': 'hi',
    'chatDraft:room:town-square': 'yo',
    'chatDraft:room:timezone:eastern-time': 'local draft',
  });

  const multiGetCalls = storage.calls.filter((c) => c.op === 'multiGet');
  assert.equal(multiGetCalls.length, 1);
  assert.deepEqual(
    [...multiGetCalls[0].keys].sort(),
    ['chatDraft:conversation:1', 'chatDraft:room:timezone:eastern-time', 'chatDraft:room:town-square'].sort(),
  );
}

async function T17_listSkipsNullRace() {
  const storage = {
    async getAllKeys() {
      return ['chatDraft:conversation:1', 'chatDraft:conversation:2', 'chatDraft:conversation:3'];
    },
    async multiGet() {
      return [
        ['chatDraft:conversation:1', 'kept'],
        ['chatDraft:conversation:2', null],
        ['chatDraft:conversation:3', '  \n '],
      ];
    },
  };
  const result = await listDraftTexts(storage);
  assert.deepEqual(result, { 'chatDraft:conversation:1': 'kept' });
}

async function T18_listNeverRejects() {
  const result = await listDraftTexts(createFakeRejectingStorage());
  assert.deepEqual(result, {});

  const storage2 = {
    async getAllKeys() {
      return ['chatDraft:conversation:1'];
    },
    async multiGet() {
      throw new Error('boom');
    },
  };
  const result2 = await listDraftTexts(storage2);
  assert.deepEqual(result2, {});
}

// ── Runner ──────────────────────────────────────────────────────────────

const cases = [
  ['T1_keys', T1_keys],
  ['T2_load', T2_load],
  ['T3_oncePerKey', T3_oncePerKey],
  ['T4_lateKeyNoClobber', T4_lateKeyNoClobber],
  ['T5_typingDuringSlowLoad', T5_typingDuringSlowLoad],
  ['T6_staleLoadDiscarded', T6_staleLoadDiscarded],
  ['T7_debounce', T7_debounce],
  ['T8_flushLatest', T8_flushLatest],
  ['T9_emptyRemoval', T9_emptyRemoval],
  ['T10_clear', T10_clear],
  ['T11_keySwitch', T11_keySwitch],
  ['T12_noKey', T12_noKey],
  ['T13_purge', T13_purge],
  ['T14_neverRejects', T14_neverRejects],
  ['T15_listEmpty', T15_listEmpty],
  ['T16_listFiltersPrefix', T16_listFiltersPrefix],
  ['T17_listSkipsNullRace', T17_listSkipsNullRace],
  ['T18_listNeverRejects', T18_listNeverRejects],
];

for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (err) {
    process.stderr.write(`${name} FAILED: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  }
}

console.log('CHAT_DRAFT_OK');
