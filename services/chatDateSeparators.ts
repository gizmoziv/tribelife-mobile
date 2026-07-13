// ── Viber-style chat date segmentation — pure logic (no React) ───────────────
// Groups chat messages by calendar day. Two responsibilities:
//   1. formatChatDateLabel — turn a message timestamp into a human date label.
//   2. needsSeparatorAbove — decide whether a date separator belongs above a
//      given message (i.e. it is the oldest loaded message of its calendar day).
//
// All day math is done in the PHONE's local timezone using calendar-day
// (midnight) boundaries, NOT 24h deltas. Weekday/month names are formatted
// MANUALLY from string arrays — we deliberately avoid Intl / toLocaleDateString
// because Hermes on Android is inconsistent for those, and deterministic output
// is required.

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local-time midnight (epoch ms) for the calendar day containing `d`. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** True when both dates fall on the same calendar day in local time. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Difference in CALENDAR days (local time, midnight boundaries) between `date`
 * and `now`. Today = 0, yesterday = 1, etc. Rounding absorbs DST-shifted days
 * (a calendar day can span 23 or 25 real hours). Future timestamps → <= 0.
 */
export function calendarDaysAgo(date: Date, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / MS_PER_DAY);
}

/**
 * Format a message timestamp into a chat date-separator label, computed in the
 * phone's local timezone:
 *   - Today                       → "Today"
 *   - Yesterday                   → "Yesterday"
 *   - 2–6 calendar days ago       → full weekday name, e.g. "Sunday"
 *   - 7+ calendar days ago        → "Weekday, Month D, YYYY", e.g.
 *                                   "Sunday, July 5, 2026" (no leading zero)
 * Invalid input yields an empty string (callers should not render it).
 */
export function formatChatDateLabel(
  input: string | Date,
  now: Date = new Date(),
): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';

  const daysAgo = calendarDaysAgo(date, now);
  // Clock skew / optimistic messages can carry a slightly-future timestamp —
  // treat anything at or before "today" as Today.
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo <= 6) return WEEKDAYS[date.getDay()];
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Minimal shape needed for the separator decision. */
type Dated = { createdAt: string };

/**
 * Decide whether a date separator belongs ABOVE `current`. True when `current`
 * is the oldest loaded message of its calendar day — that is, when its older
 * neighbour (the message that renders visually above it) is a DIFFERENT
 * calendar day, or there is no older neighbour (current is the oldest loaded
 * message). Deterministic in local time; invalid timestamps degrade safely.
 */
export function needsSeparatorAbove(
  current: Dated | null | undefined,
  olderNeighbor: Dated | null | undefined,
): boolean {
  if (!current) return false;
  const currentDate = new Date(current.createdAt);
  if (Number.isNaN(currentDate.getTime())) return false;
  if (!olderNeighbor) return true;
  const olderDate = new Date(olderNeighbor.createdAt);
  // WR-02: an unparseable neighbour timestamp is NOT a real calendar-day
  // boundary — suppress the separator rather than manufacture a spurious one.
  if (Number.isNaN(olderDate.getTime())) return false;
  return !isSameLocalDay(currentDate, olderDate);
}
