// candleViewModel — the single source of every candle string shown by the Tribe
// tab's candle strip, the Tribe header chip and the details sheet.
//
// It is pure (no imports, no React Native) so scripts/verify-candle-viewmodel.mjs
// can run it in Node. Negative daysUntil means the Saturday state: on Saturday
// the server returns this week's Friday candles, so daysUntil is -1 (or lower
// once the day has rolled over on an east-of-UTC server clock). No raw number
// below zero is ever allowed to reach a string.

// ── Constants ─────────────────────────────────────────────────────────────────

export const CANDLE_AMBER = '#E5A23A';
export const CANDLE_AMBER_TEXT_LIGHT = '#B45309';
export const CANDLE_SWAP_MS = 180;
export const TODAY_REFRESH_STALE_MS = 10 * 60 * 1000;
export const CANDLE_LOCATION_MAX_CHARS = 40;

// ── Types ─────────────────────────────────────────────────────────────────────

export type CandleShabbatInput = {
  candleLightingTime: string;
  havdalahTime: string;
  locationLabel: string;
  daysUntil: number;
  parshaName: string;
  parshaHebrew: string;
};

export type CandleTodayInput = {
  shabbat: CandleShabbatInput | null;
  needsLocation: boolean;
};

export type CandleVmInput = {
  today: CandleTodayInput | null;
  loading: boolean;
  error: boolean;
  fetchedAt: number | null;
  now: number;
};

export type CandleState = 'loading' | 'no-location' | 'error' | 'upcoming' | 'friday' | 'saturday';

export type CandleSegment = { text: string; kind: 'label' | 'time' | 'sep' };

export type CandleChip = {
  visible: boolean;
  text: string;
  sub: string | null;
  muted: boolean;
  filled: boolean;
};

export type CandleSheetVm = {
  eyebrow: string;
  candleLabel: string;
  candleTime: string;
  havdalahLabel: string;
  havdalahTime: string;
  location: string;
  parshaName: string;
  parshaHebrew: string;
};

export type CandleViewModel = {
  state: CandleState;
  tonight: boolean;
  stripLine1: CandleSegment[];
  stripLine2: string;
  stripAction: string | null;
  chip: CandleChip;
  sheet: CandleSheetVm | null;
  a11yLabel: string;
  a11yHint: string;
};

// ── Calendar tables ───────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Amber used as TEXT: dark amber on light backgrounds for contrast. */
export function candleAmberText(isDark: boolean): string {
  return isDark ? CANDLE_AMBER : CANDLE_AMBER_TEXT_LIGHT;
}

/** '7:19 PM' -> '7:19'; 24h strings pass through unchanged. */
export function shortClockTime(time: string): string {
  return time.trim().replace(/\s*(am|pm)$/i, '');
}

/** Shorten a location label to max chars, preferring a word boundary. */
export function shortenLocation(label: string, max: number = CANDLE_LOCATION_MAX_CHARS): string {
  const s = label.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(max / 2) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[ ,·-]+$/, '') + '…';
}

function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/**
 * Ages the server's daysUntil by the device-local calendar days that have passed
 * since the data was fetched, so an app left open across midnight stays right.
 */
export function effectiveDaysUntil(daysUntil: number, fetchedAt: number | null, now: number): number {
  if (fetchedAt === null) return daysUntil;
  return daysUntil - Math.max(0, localDay(now) - localDay(fetchedAt));
}

function joinParts(parts: string[]): string {
  return parts.filter((p) => p !== '').join(', ');
}

// ── View-model ────────────────────────────────────────────────────────────────

export function buildCandleViewModel(input: CandleVmInput): CandleViewModel {
  const { today, loading, error, fetchedAt, now } = input;

  // 1. No location.
  if (today && today.needsLocation) {
    return {
      state: 'no-location',
      tonight: false,
      stripLine1: [{ text: 'Candle-lighting times', kind: 'label' }],
      stripLine2: 'Set your location to see them',
      stripAction: 'Set',
      chip: { visible: true, text: 'Set times', sub: null, muted: true, filled: false },
      sheet: null,
      a11yLabel: 'Candle-lighting times. Set your location to see them',
      a11yHint: 'Opens location search',
    };
  }

  // 2. No usable data: loading or error. Present data always wins over the flags.
  const s = today ? today.shabbat : null;
  const candle = s ? s.candleLightingTime.trim() : '';
  if (!s || candle === '') {
    if (loading || (!today && !error)) {
      return {
        state: 'loading',
        tonight: false,
        stripLine1: [],
        stripLine2: '',
        stripAction: null,
        chip: { visible: true, text: '', sub: null, muted: true, filled: false },
        sheet: null,
        a11yLabel: 'Loading candle-lighting times',
        a11yHint: '',
      };
    }
    return {
      state: 'error',
      tonight: false,
      stripLine1: [{ text: 'Candle times unavailable', kind: 'label' }],
      stripLine2: 'Tap to try again',
      stripAction: null,
      chip: { visible: false, text: '', sub: null, muted: true, filled: false },
      sheet: null,
      a11yLabel: 'Candle times unavailable. Tap to try again',
      a11yHint: 'Reloads candle-lighting times',
    };
  }

  // 3. Data states.
  const havdalah = s.havdalahTime.trim();
  const fullLoc = s.locationLabel.replace(/\s+/g, ' ').trim();
  const shortLoc = shortenLocation(fullLoc);
  const eff = effectiveDaysUntil(s.daysUntil, fetchedAt, now);

  const nowDate = new Date(now);
  const target = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + eff);
  const wd = WEEKDAYS_SHORT[target.getDay()];
  const wdLong = WEEKDAYS_LONG[target.getDay()];
  const tag = `${wd} ${MONTHS_SHORT[target.getMonth()]} ${target.getDate()}`.toUpperCase();
  const hDay = wd === 'Fri' ? 'Sat' : '';

  const withLoc = (head: string): string => (shortLoc ? `${head} · ${shortLoc}` : head);

  const sheetBase = {
    candleLabel: `Candles · ${wd}`,
    candleTime: candle,
    havdalahLabel: hDay ? 'Havdalah · Sat' : 'Havdalah',
    havdalahTime: havdalah,
    location: fullLoc,
    parshaName: s.parshaName.trim(),
    parshaHebrew: s.parshaHebrew.trim(),
  };
  const hint = 'Opens candle-lighting details';

  // Saturday (and anything before Friday's candles in the past): Havdalah tonight.
  if (eff < 0) {
    return {
      state: 'saturday',
      tonight: true,
      stripLine1: havdalah
        ? [
            { text: 'Havdalah tonight ', kind: 'label' },
            { text: havdalah, kind: 'time' },
          ]
        : [{ text: 'Shabbat Shalom', kind: 'label' }],
      stripLine2: havdalah ? withLoc('Shabbat Shalom') : shortLoc,
      stripAction: null,
      chip: {
        visible: true,
        text: havdalah ? `Havdalah ${shortClockTime(havdalah)}` : 'Shabbat',
        sub: null,
        muted: false,
        filled: true,
      },
      sheet: {
        eyebrow: havdalah ? 'SHABBAT SHALOM · HAVDALAH TONIGHT' : 'SHABBAT SHALOM',
        ...sheetBase,
      },
      a11yLabel: joinParts([havdalah ? `Havdalah tonight ${havdalah}` : 'Shabbat Shalom', fullLoc]),
      a11yHint: hint,
    };
  }

  // Friday: candles tonight.
  if (eff === 0) {
    return {
      state: 'friday',
      tonight: true,
      stripLine1: [
        { text: 'Candles tonight ', kind: 'label' },
        { text: candle, kind: 'time' },
      ],
      stripLine2: havdalah
        ? `Shabbat Shalom · Havdalah ${hDay ? hDay + ' ' : ''}${havdalah}`
        : withLoc('Shabbat Shalom'),
      stripAction: null,
      chip: {
        visible: true,
        text: `Tonight ${shortClockTime(candle)}`,
        sub: null,
        muted: false,
        filled: true,
      },
      sheet: { eyebrow: `SHABBAT · TONIGHT · ${tag}`, ...sheetBase },
      a11yLabel: joinParts([
        `Candle lighting tonight ${candle}`,
        havdalah ? `Havdalah ${havdalah}` : '',
        fullLoc,
      ]),
      a11yHint: hint,
    };
  }

  // Upcoming.
  const phrase = `in ${eff} day${eff === 1 ? '' : 's'}`;
  const line1: CandleSegment[] = [
    { text: 'Candles ', kind: 'label' },
    { text: candle, kind: 'time' },
  ];
  if (havdalah) {
    line1.push(
      { text: ' · ', kind: 'sep' },
      { text: 'Havdalah ', kind: 'label' },
      { text: havdalah, kind: 'time' },
    );
  }
  return {
    state: 'upcoming',
    tonight: false,
    stripLine1: line1,
    stripLine2: withLoc(`Shabbat ${phrase}`),
    stripAction: null,
    chip: { visible: true, text: shortClockTime(candle), sub: wd, muted: false, filled: false },
    sheet: { eyebrow: `SHABBAT · ${phrase.toUpperCase()} · ${tag}`, ...sheetBase },
    a11yLabel: joinParts([
      `Candle lighting ${wdLong} ${candle}`,
      havdalah ? `Havdalah ${havdalah}` : '',
      `Shabbat ${phrase}`,
      fullLoc,
    ]),
    a11yHint: hint,
  };
}
