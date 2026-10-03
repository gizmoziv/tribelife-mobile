// verify-candle-viewmodel.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises utils/candleViewModel.ts
// (the pure view-model behind the Tribe tab candle strip, header chip and
// details sheet) with plain inputs: no React Native, no network, no database.
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-candle-viewmodel.mjs
//   Optional arg: [path/to/candleViewModel.ts], resolved against the current
//   working directory. Default is relative to this script's own location
//   (tribelife-mobile/scripts/). Requires Node v22.18+ (built-in TypeScript
//   type stripping). Same .mjs rationale as scripts/verify-chat-draft.mjs.
//
// Planner-authored gate for quick task 261003-kum. The committed copy in
// tribelife-mobile/scripts/ must stay byte-identical to the planning copy.
// Prints CANDLE_VM_OK on success, CANDLE_VM_FAIL <case...> otherwise.

// Device-local calendar math is part of the contract (day shift, weekday,
// date tag), so pin a real non-UTC zone before any Date is created.
process.env.TZ = 'America/New_York';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../utils/candleViewModel.ts');
const m = await import(pathToFileURL(modPath).href);
const { buildCandleViewModel: B, effectiveDaysUntil: E, shortenLocation: L, shortClockTime: C, candleAmberText: A } = m;
const fails = [];
const ok = (c, n) => { if (!c) fails.push(n); };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n);
const t1 = (vm) => vm.stripLine1.map((s) => s.text).join('');
const times = (vm) => vm.stripLine1.filter((s) => s.kind === 'time').map((s) => s.text);

// Module hygiene: pure, zero imports (no React Native), so Node can run it.
const src = fs.readFileSync(modPath, 'utf8');
ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src) && !src.includes('react-native'), 'noimports');

// Constants (light-mode contrast fix, swap timing, refresh staleness, truncation).
ok(m.CANDLE_AMBER === '#E5A23A' && m.CANDLE_AMBER_TEXT_LIGHT === '#B45309', 'amberconsts');
ok(A(true) === '#E5A23A' && A(false) === '#B45309', 'ambertext');
ok(m.CANDLE_SWAP_MS === 180 && m.TODAY_REFRESH_STALE_MS === 600000 && m.CANDLE_LOCATION_MAX_CHARS === 40, 'consts');

// Fixtures. Location-local == device-local (America/New_York) in these cases.
const at = (iso) => Date.parse(iso);
const SUN = at('2026-10-04T12:00:00-04:00');
const WED = at('2026-09-30T12:00:00-04:00');
const THU = at('2026-10-08T12:00:00-04:00');
const FRI = at('2026-10-09T10:00:00-04:00');
const SAT = at('2026-10-10T12:00:00-04:00');
const SATN = at('2026-10-10T21:00:00-04:00');
const LOC = 'Davie, Florida, USA';
const sh = (o = {}) => ({ candleLightingTime: '7:19 PM', havdalahTime: '8:11 PM', locationLabel: LOC, daysUntil: 5, parshaName: 'Parashat Bereshit', parshaHebrew: 'בְּרֵאשִׁית', hebrewDate: '1 Cheshvan 5787', gregorianLabel: 'Sat, Oct 10', ...o });
const day = (o = {}) => ({ shabbat: sh(o), daf: { tractate: 'Sukkah', page: '12a', englishName: 'Sukkah 12a' }, needsLocation: false });
const vmAt = (now, o = {}, extra = {}) => B({ today: day(o), loading: false, error: false, fetchedAt: now, now, ...extra });
const HINT = 'Opens candle-lighting details';

// 1. Normal weekday (Sun, Shabbat in 5 days).
const w = vmAt(SUN);
ok(w.state === 'upcoming' && w.tonight === false, 'weekday:state');
ok(t1(w) === 'Candles 7:19 PM · Havdalah 8:11 PM', 'weekday:line1');
eq(times(w), ['7:19 PM', '8:11 PM'], 'weekday:timesegs');
ok(w.stripLine2 === 'Shabbat in 5 days · Davie, Florida, USA' && w.stripAction === null, 'weekday:line2');
eq(w.chip, { visible: true, text: '7:19', sub: 'Fri', muted: false, filled: false }, 'weekday:chip');
eq(w.sheet, { eyebrow: 'SHABBAT · IN 5 DAYS · FRI OCT 9', candleLabel: 'Candles · Fri', candleTime: '7:19 PM', havdalahLabel: 'Havdalah · Sat', havdalahTime: '8:11 PM', location: LOC, parshaName: 'Parashat Bereshit', parshaHebrew: 'בְּרֵאשִׁית' }, 'weekday:sheet');
ok(w.a11yLabel === 'Candle lighting Friday 7:19 PM, Havdalah 8:11 PM, Shabbat in 5 days, Davie, Florida, USA' && w.a11yHint === HINT, 'weekday:a11y');

// 2. Singular "1 day" (Thu).
const one = vmAt(THU, { daysUntil: 1 });
ok(one.state === 'upcoming' && one.stripLine2 === 'Shabbat in 1 day · Davie, Florida, USA', 'singular:line2');
ok(one.sheet && one.sheet.eyebrow === 'SHABBAT · IN 1 DAY · FRI OCT 9' && one.a11yLabel.includes('Shabbat in 1 day,'), 'singular:eyebrow');

// 3. Friday / daysUntil === 0 (tonight).
const f = vmAt(FRI, { daysUntil: 0 });
ok(f.state === 'friday' && f.tonight === true, 'friday:state');
ok(t1(f) === 'Candles tonight 7:19 PM' && f.stripLine2 === 'Shabbat Shalom · Havdalah Sat 8:11 PM', 'friday:lines');
eq(f.chip, { visible: true, text: 'Tonight 7:19', sub: null, muted: false, filled: true }, 'friday:chip');
ok(f.sheet && f.sheet.eyebrow === 'SHABBAT · TONIGHT · FRI OCT 9', 'friday:eyebrow');
ok(f.a11yLabel === 'Candle lighting tonight 7:19 PM, Havdalah 8:11 PM, Davie, Florida, USA', 'friday:a11y');

// 4. Saturday: the server returns this week's Friday candles, so daysUntil is -1.
const s = vmAt(SAT, { daysUntil: -1 });
ok(s.state === 'saturday' && s.tonight === true, 'saturday:state');
ok(t1(s) === 'Havdalah tonight 8:11 PM' && s.stripLine2 === 'Shabbat Shalom · Davie, Florida, USA', 'saturday:lines');
eq(s.chip, { visible: true, text: 'Havdalah 8:11', sub: null, muted: false, filled: true }, 'saturday:chip');
ok(s.sheet && s.sheet.eyebrow === 'SHABBAT SHALOM · HAVDALAH TONIGHT' && s.sheet.candleLabel === 'Candles · Fri' && s.sheet.havdalahLabel === 'Havdalah · Sat', 'saturday:sheet');
ok(s.a11yLabel === 'Havdalah tonight 8:11 PM, Davie, Florida, USA', 'saturday:a11y');
ok(!/-\d/.test(JSON.stringify(s)) && !/IN -|in -/.test(JSON.stringify(s)), 'saturday:nonegative');
ok(vmAt(SAT, { daysUntil: -2 }).state === 'saturday', 'saturday:minus2');

// 5. After Havdalah the server rolls over to next week: Sat night, daysUntil 6.
const r = vmAt(SATN, { daysUntil: 6, candleLightingTime: '6:56 PM', havdalahTime: '7:53 PM' });
ok(r.state === 'upcoming' && r.tonight === false && r.stripLine2 === 'Shabbat in 6 days · Davie, Florida, USA', 'rollover:state');
ok(r.chip.sub === 'Fri' && r.chip.text === '6:56' && r.sheet && r.sheet.eyebrow === 'SHABBAT · IN 6 DAYS · FRI OCT 16', 'rollover:chip');

// 6. Sweep: every daysUntil maps to the right state and no string shows a negative number.
for (const d of [-3, -2, -1, 0, 1, 2, 5, 6, 7]) {
  const v = vmAt(SUN, { daysUntil: d });
  const want = d < 0 ? 'saturday' : d === 0 ? 'friday' : 'upcoming';
  ok(v.state === want && v.tonight === d <= 0, 'sweep:state' + d);
  ok(!/-\d/.test(JSON.stringify(v)), 'sweep:nonegative' + d);
}

// 7. Day shift: data fetched on an earlier local day is aged by calendar days.
const late = at('2026-10-08T23:50:00-04:00');
const past = at('2026-10-09T00:10:00-04:00');
ok(E(1, late, past) === 0 && E(5, SUN - 4 * 3600e3, SUN) === 5 && E(5, null, SUN) === 5 && E(5, SUN + 86400e3, SUN) === 5, 'dayshift:fn');
ok(B({ today: day({ daysUntil: 1 }), loading: false, error: false, fetchedAt: late, now: past }).state === 'friday', 'dayshift:friday');
ok(B({ today: day({ daysUntil: 0 }), loading: false, error: false, fetchedAt: FRI, now: at('2026-10-10T09:00:00-04:00') }).state === 'saturday', 'dayshift:saturday');

// 8. Month wrap for the date tag.
const mw = vmAt(WED, { daysUntil: 2 });
ok(mw.sheet && mw.sheet.eyebrow === 'SHABBAT · IN 2 DAYS · FRI OCT 2' && mw.chip.sub === 'Fri', 'monthwrap');

// 9. No location (server sends needsLocation with empty times).
const NOLOC = { state: 'no-location', tonight: false, stripLine1: [{ text: 'Candle-lighting times', kind: 'label' }], stripLine2: 'Set your location to see them', stripAction: 'Set', chip: { visible: true, text: 'Set times', sub: null, muted: true, filled: false }, sheet: null, a11yLabel: 'Candle-lighting times. Set your location to see them', a11yHint: 'Opens location search' };
eq(B({ today: { shabbat: sh({ candleLightingTime: '', havdalahTime: '', locationLabel: '', daysUntil: 0 }), daf: null, needsLocation: true }, loading: false, error: false, fetchedAt: SUN, now: SUN }), NOLOC, 'nolocation');
eq(B({ today: { shabbat: null, daf: null, needsLocation: true }, loading: true, error: false, fetchedAt: SUN, now: SUN }), NOLOC, 'nolocation:null');

// 10. Error: no data + failed fetch, or data present but no usable times.
const ERR = { state: 'error', tonight: false, stripLine1: [{ text: 'Candle times unavailable', kind: 'label' }], stripLine2: 'Tap to try again', stripAction: null, chip: { visible: false, text: '', sub: null, muted: true, filled: false }, sheet: null, a11yLabel: 'Candle times unavailable. Tap to try again', a11yHint: 'Reloads candle-lighting times' };
eq(B({ today: null, loading: false, error: true, fetchedAt: null, now: SUN }), ERR, 'error');
eq(B({ today: { shabbat: null, daf: null, needsLocation: false }, loading: false, error: false, fetchedAt: SUN, now: SUN }), ERR, 'error:noshabbat');
eq(B({ today: day({ candleLightingTime: '' }), loading: false, error: false, fetchedAt: SUN, now: SUN }), ERR, 'error:nocandle');
ok(vmAt(SUN, {}, { error: true }).state === 'upcoming', 'error:keepsdata');

// 11. Loading: skeleton only when there is nothing to show yet.
const LOAD = { state: 'loading', tonight: false, stripLine1: [], stripLine2: '', stripAction: null, chip: { visible: true, text: '', sub: null, muted: true, filled: false }, sheet: null, a11yLabel: 'Loading candle-lighting times', a11yHint: '' };
eq(B({ today: null, loading: true, error: false, fetchedAt: null, now: SUN }), LOAD, 'loading');
eq(B({ today: null, loading: false, error: false, fetchedAt: null, now: SUN }), LOAD, 'loading:initial');
ok(vmAt(SUN, {}, { loading: true }).state === 'upcoming', 'loading:keepsdata');

// 12. Missing havdalah.
const nh = vmAt(SUN, { havdalahTime: '' });
ok(t1(nh) === 'Candles 7:19 PM' && nh.a11yLabel === 'Candle lighting Friday 7:19 PM, Shabbat in 5 days, Davie, Florida, USA' && nh.sheet && nh.sheet.havdalahTime === '', 'nohavdalah:upcoming');
ok(vmAt(FRI, { daysUntil: 0, havdalahTime: '' }).stripLine2 === 'Shabbat Shalom · Davie, Florida, USA', 'nohavdalah:friday');
const ns = vmAt(SAT, { daysUntil: -1, havdalahTime: '' });
ok(t1(ns) === 'Shabbat Shalom' && ns.stripLine2 === LOC && ns.chip.text === 'Shabbat' && ns.a11yLabel === 'Shabbat Shalom, Davie, Florida, USA' && ns.sheet && ns.sheet.eyebrow === 'SHABBAT SHALOM', 'nohavdalah:saturday');

// 13. Long location: line 2 keeps the days phrase, only the location is shortened; a11y and sheet keep it whole.
const LONG = 'Rancho Santa Margarita, California, United States of America';
const lg = vmAt(SUN, { locationLabel: LONG });
ok(lg.stripLine2 === 'Shabbat in 5 days · Rancho Santa Margarita, California…', 'longloc:line2');
ok(lg.a11yLabel.endsWith(', ' + LONG) && lg.sheet && lg.sheet.location === LONG, 'longloc:full');
ok(L(LOC) === LOC && L('  Tel   Aviv,  Israel ') === 'Tel Aviv, Israel', 'shorten:passthrough');
const hard = L('x'.repeat(100));
ok(hard.length === 40 && hard.endsWith('…') && L(LONG).length <= 40, 'shorten:hard');
const el = vmAt(SUN, { locationLabel: '   ' });
ok(el.stripLine2 === 'Shabbat in 5 days' && el.a11yLabel === 'Candle lighting Friday 7:19 PM, Havdalah 8:11 PM, Shabbat in 5 days', 'emptyloc');

// 14. Short clock time for the chip.
ok(C('7:19 PM') === '7:19' && C('12:05 am') === '12:05' && C('18:06') === '18:06' && C('') === '', 'shorttime');

console.log(fails.length ? 'CANDLE_VM_FAIL ' + fails.slice(0, 12).join(' ') : 'CANDLE_VM_OK');
