// ── Phase 9 R-2: timezone IANA → human-friendly zone name ──────────────────
// 3-tier fallback chain (per 09-RESEARCH.md):
//   Tier 1: Intl.DateTimeFormat with timeZoneName: 'longGeneric'
//           → "Eastern Time" (ideal — but Android Hermes may not support)
//   Tier 2: Intl.DateTimeFormat with timeZoneName: 'long'
//           → "Eastern Standard Time" / "Eastern Daylight Time" (seasonal)
//   Tier 3: Last segment of IANA string, underscores → spaces
//           → "Asia/Jerusalem" → "Jerusalem"
//
// The Tier 1 guard `!zoneName.includes('/')` catches the Android edge case
// where Hermes returns the raw IANA string instead of a friendly name.

export function timezoneToZoneName(tz: string): string {
  // Tier 1: longGeneric
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longGeneric',
    }).formatToParts(new Date());
    const zoneName = parts.find(p => p.type === 'timeZoneName')?.value;
    if (zoneName && !zoneName.includes('/')) return zoneName;
  } catch {
    /* fall through */
  }

  // Tier 2: long (seasonal)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'long',
    }).formatToParts(new Date());
    const zoneName = parts.find(p => p.type === 'timeZoneName')?.value;
    if (zoneName) return zoneName;
  } catch {
    /* fall through */
  }

  // Tier 3: last segment of IANA string
  return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}
