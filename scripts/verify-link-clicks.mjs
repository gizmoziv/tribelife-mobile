// verify-link-clicks.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises the pure client side of
// link-click analytics: utils/linkClicksViewModel.ts (the Info sheet's "Link
// clicks" section: hidden / locked teaser / loading / error / empty / per-link
// rows, label shortening, singular-plural screen-reader labels, and the
// "should this tap be tracked" rule) and utils/messageLinks.ts (shared link
// identity). No React Native, no network, no database.
//
// PARITY: utils/messageLinks.ts must be BYTE-IDENTICAL to
// tribelife-backend/src/utils/messageLinks.ts, so the client and the server
// agree on what a "link" is and on its normalized key. The backend gate
// (tribelife-backend/scripts/verify-link-analytics.mjs) proves that module
// reproduces MessageBubble's original link parsing.
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-link-clicks.mjs
//   Optional args: [path/to/mobile/utils/messageLinks.ts]
//   [path/to/backend/src/utils/messageLinks.ts] [path/to/linkClicksViewModel.ts],
//   resolved against the current working directory. Defaults are relative to
//   this script (tribelife-mobile/scripts/). Requires Node v22.18+ (built-in
//   TypeScript type stripping). Same .mjs rationale as scripts/verify-chat-draft.mjs.
//
// Planner-authored gate for quick task 261003-nfu. The committed copy in
// tribelife-mobile/scripts/ must stay byte-identical to the planning copy.
// Prints LINK_CLICKS_OK on success, LINK_CLICKS_FAIL <case...> otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileLinksPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../utils/messageLinks.ts');
const backendLinksPath = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(here, '../../tribelife-backend/src/utils/messageLinks.ts');
const vmPath = process.argv[4] ? path.resolve(process.argv[4]) : path.resolve(here, '../utils/linkClicksViewModel.ts');
const fails = [];
const ok = (c, n) => { if (!c) fails.push(n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pure = (src) => !/^\s*import\s/m.test(src) && !/require\(/.test(src);

const mobileSrc = fs.readFileSync(mobileLinksPath);
const backendSrc = fs.readFileSync(backendLinksPath);
ok(mobileSrc.length > 0 && Buffer.compare(mobileSrc, backendSrc) === 0, 'parity:bytes');
ok(pure(mobileSrc.toString('utf8')), 'pure:links');
ok(pure(fs.readFileSync(vmPath, 'utf8')), 'pure:vm');
const L = await import(pathToFileURL(mobileLinksPath).href);
const VM = await import(pathToFileURL(vmPath).href);
const fns = ['isYouTubeLinkKey', 'shortenLinkLabel', 'shouldTrackLinkClick', 'buildLinkClicksViewModel'];
ok(fns.every((f) => typeof VM[f] === 'function'), 'exports:vm');
ok(typeof L.messageLinkKeys === 'function' && typeof L.youTubeKey === 'function', 'exports:links');
if (fails.length) { console.log('LINK_CLICKS_FAIL ' + fails.join(' ')); process.exit(1); }

ok(VM.LINK_CLICKS_HEADER === 'LINK CLICKS' && VM.LINK_CLICKS_LABEL_MAX === 40, 'const:header');
ok(VM.LINK_CLICKS_LOCKED_TITLE === 'Link clicks' && VM.LINK_CLICKS_LOCKED_BODY === 'Upgrade to Premium to see how many people opened your links', 'const:locked');
ok(VM.LINK_CLICKS_UPSELL_BODY === 'Link click analytics are a Premium feature. Upgrade to see how many people opened your links.', 'const:upsell');
ok(VM.LINK_CLICKS_EMPTY === 'No link clicks yet' && VM.LINK_CLICKS_ERROR === "Couldn't load link clicks" && VM.LINK_CLICKS_RETRY === 'Try again' && VM.LINK_CLICKS_LOADING_A11Y === 'Loading link clicks', 'const:states');

// ── shortenLinkLabel / isYouTubeLinkKey ─────────────────────────────────────
const SL = VM.shortenLinkLabel;
ok(SL('https://tribelife.app/g/shabbat-dinner') === 'tribelife.app/g/shabbat-dinner', 'short:plain');
ok(SL('https://www.example.com/a/b/?q=1#x') === 'example.com/a/b' && SL('https://example.com') === 'example.com', 'short:hostpath');
ok(SL('https://example.com/' + 'abcdefghij/'.repeat(5)) === 'example.com/abcdefghij/abcdefghij/abcde…', 'short:long');
ok(SL('https://example.com/abcdefghijklmnopqrstuvwxyz/more-path-here') === 'example.com/abcdefghijklmnopqrstuvwxyz…', 'short:trailcut');
ok(SL('https://example.com/abcdef', 10) === 'example.c…' && SL('') === '' && SL('   ') === '', 'short:max-empty');
ok([...SL('https://example.com/' + 'x'.repeat(300))].length === 40, 'short:len40');
const YT = VM.isYouTubeLinkKey;
ok(YT('https://youtube.com/watch?v=dQw4w9WgXcQ') && YT('https://youtu.be/dQw4w9WgXcQ') && YT('https://m.youtube.com/watch?v=dQw4w9WgXcQ') && YT('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'yt:yes');
ok(!YT('https://notyoutube.com/x') && !YT('https://youtube.com.evil.com/x') && !YT('https://example.com/?u=youtube.com') && !YT(''), 'yt:no');

// ── shouldTrackLinkClick ────────────────────────────────────────────────────
const T = VM.shouldTrackLinkClick;
const base = { enabled: true, isMe: false, messageId: 42, kind: 'user' };
ok(T(base) === true && T({ ...base, kind: null }) === true && T({ ...base, kind: undefined }) === true, 'track:yes');
ok(T({ ...base, enabled: false }) === false, 'track:disabled');
ok(T({ ...base, isMe: true }) === false, 'track:sender');
ok(T({ ...base, messageId: 0 }) === false && T({ ...base, messageId: -1712345678901 }) === false && T({ ...base, messageId: NaN }) === false && T({ ...base, messageId: 1.5 }) === false, 'track:optimistic');
ok(T({ ...base, kind: 'system' }) === false, 'track:system');

// ── buildLinkClicksViewModel ────────────────────────────────────────────────
const B = VM.buildLinkClicksViewModel;
const V = 'dQw4w9WgXcQ';
const stats = [
  { url: 'https://tribelife.app/g/shabbat-dinner', clicks: 14, uniqueClickers: 9 },
  { url: `https://youtube.com/watch?v=${V}`, clicks: 1, uniqueClickers: 1 },
  { url: 'https://example.com/a', clicks: 0, uniqueClickers: 0 },
];
const inp = (o) => ({ linkCount: 3, canView: true, loading: false, error: false, stats: null, ...o });
ok(eq(B(inp({ linkCount: 0, stats })), { kind: 'hidden' }) && eq(B(inp({ linkCount: 0, canView: false })), { kind: 'hidden' }), 'vm:hidden');
const locked = B(inp({ canView: false, loading: true, stats }));
ok(locked.kind === 'locked' && locked.title === 'Link clicks' && locked.body === 'Upgrade to Premium to see how many people opened your links' && locked.a11yLabel === 'Link clicks. Upgrade to Premium to see how many people opened your links', 'vm:locked');
ok(eq(B(inp({})), { kind: 'loading', header: 'LINK CLICKS', a11yLabel: 'Loading link clicks' }), 'vm:loading-initial');
ok(B(inp({ loading: true, error: true })).kind === 'loading', 'vm:loading-retry');
ok(eq(B(inp({ error: true })), { kind: 'error', header: 'LINK CLICKS', message: "Couldn't load link clicks", retryLabel: 'Try again' }), 'vm:error');
ok(B(inp({ loading: true, error: true, stats })).kind === 'rows', 'vm:datawins');
ok(eq(B(inp({ stats: stats.map((s) => ({ ...s, clicks: 0, uniqueClickers: 0 })) })), { kind: 'empty', header: 'LINK CLICKS', message: 'No link clicks yet' }), 'vm:empty');
ok(eq(B(inp({ stats: [] })), { kind: 'hidden' }), 'vm:nostats');
const rows = B(inp({ stats }));
ok(rows.kind === 'rows' && rows.header === 'LINK CLICKS' && rows.rows.length === 3, 'vm:rows');
if (rows.kind === 'rows' && rows.rows.length === 3) {
  const [r0, r1, r2] = rows.rows;
  ok(r0.icon === 'link' && r0.label === 'tribelife.app/g/shabbat-dinner' && r0.clicksText === '14' && r0.uniqueText === '9' && r0.clicks === 14 && r0.unique === 9, 'vm:row0');
  ok(r0.a11yLabel === 'Link tribelife.app/g/shabbat-dinner, 14 clicks, 9 unique people', 'vm:a11y-plural');
  ok(r1.icon === 'youtube' && r1.label === `youtu.be/${V}` && r1.a11yLabel === `YouTube video youtu.be/${V}, 1 click, 1 unique person`, 'vm:a11y-singular-youtube');
  ok(r2.icon === 'link' && r2.label === 'example.com/a' && r2.clicksText === '0' && r2.a11yLabel === 'Link example.com/a, 0 clicks, 0 unique people', 'vm:zero-row');
  ok(new Set(rows.rows.map((r) => r.key)).size === 3, 'vm:keys');
}
const dup = B(inp({ stats: [stats[0], stats[0]] }));
ok(dup.kind === 'rows' && dup.rows.length === 2 && dup.rows[0].key !== dup.rows[1].key, 'vm:dupkeys');
const san = B(inp({ stats: [{ url: 'https://a.com', clicks: -2, uniqueClickers: NaN }, { url: 'https://b.com', clicks: 3.9, uniqueClickers: 2.2 }, { url: '', clicks: 5, uniqueClickers: 5 }] }));
ok(san.kind === 'rows' && san.rows.length === 2 && san.rows[0].clicks === 0 && san.rows[0].unique === 0 && san.rows[1].clicks === 3 && san.rows[1].unique === 2, 'vm:sanitize');

// ── Integration: client link list → view-model labels ───────────────────────
const content = `Dinner details tribelife.app/g/shabbat-dinner and https://youtu.be/${V} (see you!)`;
const keys = L.messageLinkKeys(content);
ok(eq(keys, ['https://tribelife.app/g/shabbat-dinner', `https://youtube.com/watch?v=${V}`]), 'int:keys');
const integ = B({ linkCount: keys.length, canView: true, loading: false, error: false, stats: keys.map((url, i) => ({ url, clicks: i + 1, uniqueClickers: 1 })) });
ok(integ.kind === 'rows' && eq(integ.rows.map((r) => [r.icon, r.label]), [['link', 'tribelife.app/g/shabbat-dinner'], ['youtube', `youtu.be/${V}`]]), 'int:labels');
ok(['AAAAAAAAAAA', 'a-b_c-d_e-f', V].every((id) => { const r = B(inp({ linkCount: 1, stats: [{ url: L.youTubeKey(id), clicks: 2, uniqueClickers: 1 }] })); return r.kind === 'rows' && r.rows[0].icon === 'youtube' && r.rows[0].label === `youtu.be/${id}`; }), 'int:ytkeys');

if (fails.length) { console.log('LINK_CLICKS_FAIL ' + fails.join(' ')); process.exit(1); }
console.log('LINK_CLICKS_OK');
