// ── Phase 14: Relative-time helper for search result-row meta line ────────
// Returns a short label for how long ago a date was:
//   < 60 seconds  → 'now'
//   < 60 minutes  → '${m}m'   (e.g. '5m')
//   < 24 hours    → '${h}h'   (e.g. '3h')
//   < 7 days      → '${d}d'   (e.g. '2d')
//   >= 7 days     → 'MMM D'   (e.g. 'May 18') via Intl.DateTimeFormat
//
// Pure function — no React hooks, no module-level state.
// Handles invalid inputs by returning '' (does not throw; callers render meta
// line and a thrown error would crash the row).
// Locale-agnostic for numeric bands (Nm/Nh/Nd); only >= 7d fallback uses locale.
// No external dependencies (no dayjs, no date-fns).
// Used by: MessageResultRow (Plan 14-05).

export function formatRelativeTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return 'now'; // future timestamps treated as now

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;

    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return '';
  }
}
