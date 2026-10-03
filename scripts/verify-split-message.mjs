// verify-split-message.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises utils/splitMessage.ts
// (long-message splitter + ordered chunk sender) with pure inputs and a fake
// emitter, and checks that the mobile MESSAGE_MAX_LENGTH equals the backend
// MESSAGE_MAX_LENGTH in tribelife-backend/src/lib/messageSend.ts.
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-split-message.mjs
//   Optional args: [path/to/splitMessage.ts] [path/to/backend/messageSend.ts],
//   resolved against the current working directory. Defaults are relative to
//   this script's own location (tribelife-mobile/scripts/).
//   Requires Node v22.18+ (built-in TypeScript type stripping). Same .mjs
//   rationale as scripts/verify-chat-draft.mjs.
//
// Planner-authored gate for quick task 261002-w9b. The committed copy in
// tribelife-mobile/scripts/ must stay byte-identical to the planning copy.
// Prints SPLIT_OK on success, SPLIT_FAIL <case...> otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../utils/splitMessage.ts');
const backendPath = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(here, '../../tribelife-backend/src/lib/messageSend.ts');
const m = await import(pathToFileURL(modPath).href);
const { splitMessage: S, unsentRemainder: R, sendChunksInOrder: Q, friendlySendFailure: F, MESSAGE_MAX_LENGTH: CAP } = m;
const fails = [];
const ok = (c, n) => { if (!c) fails.push(n); };
const WS = /\s/;
const bad = (s, i) => { const a = s.charCodeAt(i - 1), b = s.charCodeAt(i), b2 = s.charCodeAt(i + 1); return (a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff) || a === 0x200d || b === 0x200d || (b >= 0x300 && b <= 0x36f) || (b >= 0x591 && b <= 0x5c7 && b !== 0x5be && b !== 0x5c0 && b !== 0x5c3 && b !== 0x5c6) || (b >= 0xfe00 && b <= 0xfe0f) || (b === 0xd83c && b2 >= 0xdffb && b2 <= 0xdfff); };
const inv = (t, cs, cap, n) => {
  const T = t.trim(); let p = 0;
  cs.forEach((c, k) => { ok(c.length > 0 && c.length <= cap && c === c.trim(), n + ':len' + k); ok(T.startsWith(c, p), n + ':walk' + k); if (k > 0) ok(!bad(T, p), n + ':grapheme' + k); p += c.length; while (p < T.length && WS.test(T[p])) p++; });
  ok(p === T.length, n + ':cover');
};

// Backend parity: one shared cap value on both sides.
const backendSrc = fs.readFileSync(backendPath, 'utf8');
const hit = backendSrc.match(/^export const MESSAGE_MAX_LENGTH = (\d+);$/m);
ok(CAP === 4000, 'cap');
ok(!!hit && Number(hit[1]) === CAP, 'backendparity');

// splitMessage cases
ok(JSON.stringify(S('hello')) === '["hello"]', 'under');
ok(JSON.stringify(S('')) === '[]' && JSON.stringify(S(' \n\t ')) === '[]', 'empty');
const exact = 'a'.repeat(4000); ok(S(exact).length === 1 && S(exact)[0] === exact, 'exact');
const words = 'word '.repeat(801).trim(); const w = S(words); ok(w.length === 2, 'over'); inv(words, w, 4000, 'over'); ok(w.every((c) => /^word( word)*$/.test(c)), 'nomidword');
const para = Array.from({ length: 4 }, (_, i) => ('P' + i + ' lorem ipsum. ').repeat(110).trim()).join('\n\n'); const pc = S(para); inv(para, pc, 4000, 'para'); ok(pc.length >= 2 && para.trim().startsWith(pc[0] + '\n\n'), 'parabreak');
const g = S('a'.repeat(9000)); ok(g.length === 3 && g[0].length === 4000 && g[1].length === 4000 && g[2].length === 1000, 'giant');
const e1 = 'a'.repeat(3999) + '\u{1F600}' + 'b'.repeat(100); const ec = S(e1); inv(e1, ec, 4000, 'emoji'); ok(ec[0].length === 3999, 'emojicut');
const fam = '\u{1F468}‍\u{1F469}‍\u{1F467}'; const e2 = 'a'.repeat(3995) + fam + 'b'.repeat(50); const fc = S(e2); inv(e2, fc, 4000, 'zwj'); ok(fc[0].length === 3995 && fc[1].startsWith(fam), 'zwjcut');
const e3 = 'a'.repeat(3998) + '\u{1F44D}\u{1F3FD}' + 'b'.repeat(50); const sc = S(e3); inv(e3, sc, 4000, 'skin'); ok(sc[0].length === 3998, 'skincut');
const e4 = 'a'.repeat(3998) + '\u{1F1EE}\u{1F1F1}' + 'b'.repeat(50); const rc = S(e4); inv(e4, rc, 4000, 'flag'); ok(rc[0].length === 3998, 'flagcut');
const url = 'https://example.com/' + 'p'.repeat(60); const ut = 'go '.repeat(1320) + url + ' tail words here'; const uc = S(ut); inv(ut, uc, 4000, 'url'); ok(uc.some((c) => c.includes(url)), 'urlwhole');
const men = '@mention_handle_x'; const mt = 'hi '.repeat(1330) + men + ' after'; const mc = S(mt); inv(mt, mc, 4000, 'mention'); ok(mc.some((c) => c.includes(men)), 'mentionwhole');
const he = 'שלום עולם. '.repeat(900); const hc = S(he); inv(he, hc, 4000, 'hebrew'); ok(hc.length >= 3 && hc.slice(0, -1).every((c) => c.endsWith('.')), 'hebrewsentence');
const nq = ('שָׁ').repeat(2000); const nc = S(nq); inv(nq, nc, 4000, 'niqqud'); ok(nc.length === 2, 'niqqudcount');
const cm = 'é'.repeat(2500); inv(cm, S(cm), 4000, 'combining');
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const parts = ['word', ' ', ' ', '\n', '\n\n', '. ', '\u{1F600}', fam, '\u{1F44D}\u{1F3FD}', '\u{1F1EE}\u{1F1F1}', 'שָׁ', 'é', 'https://x.io/abc', '@some_handle', 'x'.repeat(40), ' '];
for (let it = 0; it < 300; it++) { let t = ''; const n = 5 + rnd(120); for (let j = 0; j < n; j++) t += parts[rnd(parts.length)]; for (const cap of [16, 23, 50]) inv(t, S(t, cap), cap, 'fuzz' + it + '/' + cap); }
let threw = false; try { S('abc', 8); } catch (err) { threw = err instanceof RangeError; } ok(threw, 'capguard');

// unsentRemainder
ok(R(words, w, 0) === words && R(words, w, 1) === words.slice(w[0].length).trimStart() && R(words, w, 2) === '', 'remainder');

// sendChunksInOrder (fake emitter + fake sleep)
const log = []; let inflight = 0, maxIn = 0; const slept = [];
const emit = (fail) => async (c, i) => { inflight++; maxIn = Math.max(maxIn, inflight); await new Promise((r) => setTimeout(r, 2)); inflight--; log.push(i); return fail(i); };
const fsleep = async (ms) => { slept.push(ms); };
const r1 = await Q(['a', 'b', 'c', 'd'], emit(() => ({ ok: true, id: 1 })), { minGapMs: 1050, sleep: fsleep });
ok(r1.sentCount === 4 && r1.failedIndex === null && log.join() === '0,1,2,3' && maxIn === 1 && slept.join() === '1050,1050,1050', 'seq');
log.length = 0; slept.length = 0;
const r2 = await Q(['a', 'b', 'c', 'd'], emit((i) => (i === 2 ? { ok: false, reason: 'Slur detected' } : { ok: true })), { sleep: fsleep });
ok(r2.sentCount === 2 && r2.failedIndex === 2 && r2.reason === 'Slur detected' && log.join() === '0,1,2' && slept.length === 0, 'stop');
log.length = 0; let tries = 0;
const r3 = await Q(['a', 'b'], emit((i) => (i === 1 && tries++ === 0 ? { ok: false, reason: 'rate_limited', retryAfterMs: 1000 } : { ok: true })), { sleep: fsleep });
ok(r3.sentCount === 2 && log.join() === '0,1,1' && slept.some((ms) => ms >= 1000), 'retry');
const r4 = await Q(['a', 'b'], async () => ({ ok: false, reason: 'rate_limited', retryAfterMs: 1000 }), { sleep: fsleep, maxRateLimitRetries: 3 });
ok(r4.failedIndex === 0 && r4.reason === 'rate_limited', 'retrycap');
const r5 = await Q(['a'], async () => { throw new Error('x'); }, { sleep: fsleep });
ok(r5.failedIndex === 0 && r5.sentCount === 0, 'throw');

// friendlySendFailure
ok(F('timeout').startsWith('Connection') && F(null).startsWith('Connection') && F('Slur detected') === 'Slur detected' && F('not_a_member') === 'Your message could not be sent.' && F('Message is too long (limit 4000 characters).') === 'Message is too long (limit 4000 characters).', 'friendly');

console.log(fails.length ? 'SPLIT_FAIL ' + fails.slice(0, 10).join(' ') : 'SPLIT_OK');
