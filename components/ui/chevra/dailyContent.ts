// dailyContent.ts — type definitions for daily Jewish content.
// The mock function implementations have been retired in Plan 18-03.
// All live data now flows from /api/tribe/today via tribeApi.today().
// Types are kept here for backward-compat import paths used by
// ChevraDailyBanner and ChevraTodaySection.

export type DailyBanner = {
  hebrewDate: string;        // Localized Hebrew date string
  gregorianLabel: string;    // e.g. "Tue, May 17"
  parshaName: string;        // e.g. "Parashat Naso"
  parshaHebrew: string;      // e.g. "פרשת נשא"
};

export type ShabbatInfo = {
  candleLightingTime: string;   // e.g. "7:42 PM"
  havdalahTime: string;         // e.g. "8:51 PM"
  locationLabel: string;        // e.g. "New York, US"
  daysUntil: number;            // 0 = today, 1 = tomorrow…
  parshaName: string;           // e.g. "Parashat Naso"
  parshaHebrew: string;         // e.g. "פרשת נשא"
  hebrewDate: string;           // e.g. "ה׳ סיון ה׳תשפ״ו"
  gregorianLabel: string;       // e.g. "Sat, Jun 7"
};

export type DafYomi = {
  tractate: string;
  page: string;       // e.g. "12a"
  englishName: string; // e.g. "Sukkah 12a"
};

export type RabbiNote = {
  title: string;
  preview: string;     // 1–2 sentence teaser
  author: string;
};
