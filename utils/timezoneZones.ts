// MIRROR: tribelife-backend/src/config/timezoneZones.ts — keep in sync.
// ── Phase 15 (D-01): Canonical Timezone Zone Configuration (mobile mirror) ────
// Hand-mirrored from the backend canonical zone config. The shape and 25-zone
// list MUST stay byte-identical to the backend file (per Phase 10 chatNotification
// + Phase 14 SearchResult precedent — no shared types package).
//
// IMPORTANT (RESEARCH §E6): This module does NOT call the runtime Intl API —
// it is a pure IANA→slug map lookup. `displayName` values are read directly
// from the hardcoded zone config to avoid Android Hermes longGeneric drift.
// The companion `timezoneLabel.ts` continues to handle the runtime locale lookup
// for human labels — the two files are complementary.
//
// Phase 17 NOTE: members arrays are expanded to match the backend file.
// The offset algorithm (computeStandardOffsetHours, OFFSET_TO_SLUG, FALLBACK_SLUG_CACHE)
// is NOT mirrored here — Hermes Intl is unreliable for offset computation (Pitfall 4).

export interface TimezoneZone {
  slug: string; // kebab-case, used as room key suffix
  displayName: string; // user-facing label (matches Intl longGeneric where possible)
  utcOffsetHours: number; // representative offset (standard time); half-hour zones use fraction
  members: string[]; // IANA strings that map to this zone
}

export type ZoneSlug = string;

export const TIMEZONE_ZONES: TimezoneZone[] = [
  // ── North America ────────────────────────────────────────────────────────
  {
    slug: 'hawaii-time',
    displayName: 'Hawaii-Aleutian Time',
    utcOffsetHours: -10,
    members: ['Pacific/Honolulu', 'Pacific/Johnston', 'America/Adak'],
  },
  {
    slug: 'alaska-time',
    displayName: 'Alaska Time',
    utcOffsetHours: -9,
    members: [
      'America/Anchorage',
      'America/Juneau',
      'America/Nome',
      'America/Sitka',
      'America/Yakutat',
      // US/Canada completeness 2026-06-06
      'America/Metlakatla',
    ],
  },
  {
    slug: 'pacific-time',
    displayName: 'Pacific Time',
    utcOffsetHours: -8,
    members: ['America/Los_Angeles', 'America/Vancouver', 'America/Tijuana'],
  },
  {
    slug: 'mountain-time',
    displayName: 'Mountain Time',
    utcOffsetHours: -7,
    members: [
      'America/Denver',
      'America/Edmonton',
      'America/Phoenix',
      'America/Boise',
      'America/Mazatlan',
      // Phase 17: well-known missing sub-zones (standard UTC-7, no DST)
      'America/Whitehorse',
      'America/Dawson_Creek',
      'America/Fort_Nelson',
      'America/Hermosillo',
      'America/Cambridge_Bay',
      // Phase 17 (prod coverage 2026-06-06): offset_fallback promotion — `US/Mountain` is a legacy alias for America/Denver
      'US/Mountain',
      // US/Canada completeness 2026-06-06
      'America/Creston',
      'America/Dawson',
      'America/Inuvik',
    ],
  },
  {
    slug: 'central-time',
    displayName: 'Central Time',
    utcOffsetHours: -6,
    members: [
      'America/Chicago',
      'America/Winnipeg',
      'America/Mexico_City',
      'America/Regina',
      'America/Indiana/Knox',
      // Phase 17: well-known missing sub-zones (standard UTC-6)
      'America/Indiana/Tell_City',
      'America/North_Dakota/Center',
      'America/North_Dakota/New_Salem',
      'America/North_Dakota/Beulah',
      // US/Canada completeness 2026-06-06
      'America/Menominee',
      'America/Rankin_Inlet',
      'America/Resolute',
      'America/Swift_Current',
    ],
  },
  {
    slug: 'eastern-time',
    displayName: 'Eastern Time',
    utcOffsetHours: -5,
    members: [
      'America/New_York',
      'America/Detroit',
      'America/Toronto',
      'America/Indianapolis',
      'America/Kentucky/Louisville',
      // Phase 17: well-known missing sub-zones (standard UTC-5)
      'America/Indiana/Indianapolis',
      'America/Indiana/Marengo',
      'America/Indiana/Petersburg',
      'America/Indiana/Vevay',
      'America/Indiana/Vincennes',
      'America/Indiana/Winamac',
      'America/Kentucky/Monticello',
      'America/Louisville',
      'America/Cancun',
      'America/Jamaica',
      'America/Panama',
      'America/Grand_Turk',
      'America/Havana',
      'America/Nassau',
      'America/Port-au-Prince',
      // US/Canada completeness 2026-06-06
      'America/Iqaluit',
    ],
  },
  {
    slug: 'atlantic-time',
    displayName: 'Atlantic Time',
    utcOffsetHours: -4,
    members: [
      'America/Halifax',
      'America/Bermuda',
      'America/Barbados',
      'America/Puerto_Rico',
      // Phase 17: well-known missing sub-zones (standard UTC-4)
      'America/Glace_Bay',
      'America/Moncton',
      'America/Goose_Bay',
      // US/Canada completeness 2026-06-06
      'America/Blanc-Sablon',
      'America/St_Thomas',
    ],
  },
  {
    slug: 'newfoundland-time',
    displayName: 'Newfoundland Time',
    utcOffsetHours: -3.5,
    members: ['America/St_Johns'],
  },
  // ── South America ────────────────────────────────────────────────────────
  {
    slug: 'brasilia-time',
    displayName: 'Brasilia Time',
    utcOffsetHours: -3,
    members: [
      'America/Sao_Paulo',
      'America/Recife',
      'America/Manaus',
      'America/Fortaleza',
      'America/Belem',
    ],
  },
  {
    slug: 'argentina-time',
    displayName: 'Argentina Time',
    utcOffsetHours: -3,
    members: [
      'America/Argentina/Buenos_Aires',
      'America/Argentina/Cordoba',
      'America/Argentina/Mendoza',
    ],
  },
  {
    slug: 'chile-time',
    displayName: 'Chile Time',
    utcOffsetHours: -4,
    members: ['America/Santiago', 'Pacific/Easter'],
  },
  {
    slug: 'colombia-peru-time',
    displayName: 'Colombia Time',
    utcOffsetHours: -5,
    members: [
      'America/Bogota',
      'America/Lima',
      'America/Guayaquil',
      'America/Caracas',
    ],
  },
  // ── Europe / Africa ──────────────────────────────────────────────────────
  {
    slug: 'greenwich-mean-time',
    displayName: 'Greenwich Mean Time',
    utcOffsetHours: 0,
    members: [
      'Europe/London',
      'Europe/Dublin',
      'Atlantic/Reykjavik',
      'Africa/Casablanca',
      'Africa/Abidjan',
      // Phase 17: well-known missing sub-zones (standard UTC+0)
      'Europe/Lisbon',
      'Atlantic/Canary',
      'Europe/Isle_of_Man',
      'Europe/Guernsey',
      'Europe/Jersey',
      // Phase 17 (prod coverage 2026-06-06): offset_fallback promotion — `Eire` is a legacy alias for Europe/Dublin
      'Eire',
    ],
  },
  {
    slug: 'central-european-time',
    displayName: 'Central European Time',
    utcOffsetHours: 1,
    members: [
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Zurich',
      'Europe/Vienna',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Warsaw',
      'Europe/Prague',
      'Europe/Budapest',
      // Phase 17: well-known missing sub-zones (standard UTC+1)
      'Europe/Belgrade',
      'Europe/Ljubljana',
      'Europe/Bratislava',
      'Europe/Zagreb',
      'Europe/Sarajevo',
      'Europe/Tirane',
      // Phase 17 (prod coverage 2026-06-06): offset_fallback promotion — Africa/Lagos (WAT, UTC+1)
      'Africa/Lagos',
    ],
  },
  {
    slug: 'eastern-european-time',
    displayName: 'Eastern European Time',
    utcOffsetHours: 2,
    members: [
      'Europe/Bucharest',
      'Europe/Athens',
      'Europe/Helsinki',
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Harare',
      // Phase 17: well-known missing sub-zones (standard UTC+2)
      // NOTE: jerusalem-time (Asia/Jerusalem) stays in its own explicit entry below —
      // these +2 IANAs are culturally EET, not Israel. Never add Jerusalem here.
      'Europe/Kyiv',
      'Europe/Kiev',
      'Europe/Chisinau',
      'Europe/Sofia',
      'Europe/Tallinn',
      'Europe/Riga',
      'Europe/Vilnius',
      'Asia/Nicosia',
      'Asia/Beirut',
    ],
  },
  {
    slug: 'jerusalem-time',
    displayName: 'Israel Time',
    utcOffsetHours: 2,
    members: ['Asia/Jerusalem'],
  },
  {
    slug: 'moscow-time',
    displayName: 'Moscow Time',
    utcOffsetHours: 3,
    members: [
      'Europe/Moscow',
      'Europe/Istanbul',
      'Asia/Riyadh',
      'Asia/Baghdad',
      'Africa/Nairobi',
      // Phase 17: well-known missing sub-zones (standard UTC+3)
      'Asia/Amman',
      'Asia/Damascus',
      'Europe/Minsk',
    ],
  },
  // ── Asia / Pacific ───────────────────────────────────────────────────────
  {
    slug: 'india-standard-time',
    displayName: 'India Standard Time',
    utcOffsetHours: 5.5,
    members: [
      'Asia/Kolkata',
      'Asia/Colombo',
      // Phase 17: deprecated Kolkata alias — older Android devices emit this
      'Asia/Calcutta',
    ],
  },
  {
    slug: 'dubai-time',
    displayName: 'Gulf Standard Time',
    utcOffsetHours: 4,
    members: ['Asia/Dubai', 'Asia/Muscat'],
  },
  // {
  //   slug: 'pakistan-time',
  //   displayName: 'Pakistan Time',
  //   utcOffsetHours: 5,
  //   members: ['Asia/Karachi'],
  // },
  {
    slug: 'indochina-time',
    displayName: 'Southeast Asia Time',
    utcOffsetHours: 7,
    members: [
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Ho_Chi_Minh',
      'Asia/Saigon',
      'Asia/Phnom_Penh',
      'Asia/Vientiane',
      'Asia/Pontianak',
    ],
  },
  {
    slug: 'china-standard-time',
    displayName: 'China Standard Time',
    utcOffsetHours: 8,
    members: [
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Hong_Kong',
      'Asia/Taipei',
      'Asia/Kuala_Lumpur',
      // Phase 17 (prod coverage 2026-06-06): offset_fallback promotion — Asia/Manila (PHT, UTC+8)
      'Asia/Manila',
    ],
  },
  {
    slug: 'japan-standard-time',
    displayName: 'Japan Standard Time',
    utcOffsetHours: 9,
    members: ['Asia/Tokyo', 'Asia/Seoul'],
  },
  {
    slug: 'australia-central-time',
    displayName: 'Australian Central Time',
    utcOffsetHours: 9.5,
    members: ['Australia/Adelaide', 'Australia/Darwin', 'Australia/Broken_Hill'],
  },
  {
    slug: 'australia-eastern-time',
    displayName: 'Australian Eastern Time',
    utcOffsetHours: 10,
    members: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Pacific/Port_Moresby',
      // Phase 17: well-known missing sub-zone (standard UTC+10)
      'Australia/Hobart',
    ],
  },
  {
    slug: 'new-zealand-time',
    displayName: 'New Zealand Time',
    utcOffsetHours: 12,
    members: ['Pacific/Auckland', 'Pacific/Fiji'],
  },
  // ── UTC fallback ─────────────────────────────────────────────────────────
  {
    slug: 'utc',
    displayName: 'Coordinated Universal Time',
    utcOffsetHours: 0,
    members: ['UTC', 'Etc/UTC', 'Etc/GMT'],
  },
];

// Module-load-time reverse-lookup map (O(1) per call) built from TIMEZONE_ZONES.
const IANA_TO_SLUG = new Map<string, ZoneSlug>(
  TIMEZONE_ZONES.flatMap((z) =>
    z.members.map((iana) => [iana, z.slug] as [string, ZoneSlug]),
  ),
);

/**
 * Translate an IANA timezone string to a canonical zone slug.
 * Falls back to 'utc' for any IANA not in the curated map (with console.warn).
 *
 * Phase 17 (TZONE-04): This function is now a FALLBACK / display-label helper
 * only. The backend stamps the resolved slug as `timezoneZone` on every
 * IANA-bearing API response. Mobile read-sites (local.tsx, chatsStore.ts,
 * notifications.tsx) prefer the stamped slug and call this only when the field
 * is absent (old API responses pre-Phase-17). Do NOT add Intl/offset logic here
 * — Hermes Intl is unreliable for offset computation (Pitfall 4, 17-RESEARCH §1).
 */
export function getZoneForTimezone(iana: string): ZoneSlug {
  const slug = IANA_TO_SLUG.get(iana);
  if (!slug) {
    console.warn(`[tzzone] unknown IANA "${iana}" — fallback to utc`);
    return 'utc';
  }
  return slug;
}

/** Check if a slug corresponds to a valid Timezone zone. */
export function isValidTimezoneRoom(slug: string): boolean {
  return TIMEZONE_ZONES.some((z) => z.slug === slug);
}

/** Find a Timezone zone by slug. */
export function getTimezoneZone(slug: ZoneSlug): TimezoneZone | undefined {
  return TIMEZONE_ZONES.find((z) => z.slug === slug);
}
