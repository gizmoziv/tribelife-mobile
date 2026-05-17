// Stubbed daily Jewish content for Chevra v2.
// TODO: wire to a server endpoint backed by Hebcal (Hebrew date, parsha,
// candle-lighting per region) and Sefaria (Daf Yomi). The Rabbi's note is
// editorial — needs a CMS or a daily-pull job.
//
// Keeping shape and call-site stable so swapping the data source later is
// a one-file change.

export type DailyBanner = {
  hebrewDate: string;        // Localized Hebrew date string
  gregorianLabel: string;    // e.g. "Tue, May 17"
  parshaName: string;        // e.g. "Parashat Naso"
  parshaHebrew: string;      // e.g. "פרשת נשא"
};

export type ShabbatInfo = {
  candleLightingTime: string;   // e.g. "7:42 PM"
  havdalahTime: string;         // e.g. "8:51 PM"
  region: string;               // e.g. "New York"
  daysUntil: number;            // 0 = today, 1 = tomorrow…
};

export type DafYomi = {
  tractate: string;
  page: string;       // e.g. "12a"
  englishName: string; // e.g. "Sukkah"
};

export type RabbiNote = {
  title: string;
  preview: string;     // 1–2 sentence teaser
  author: string;
};

export function getDailyBanner(): DailyBanner {
  return {
    hebrewDate: "ה׳ סיון ה׳תשפ״ו",
    gregorianLabel: "Today",
    parshaName: "Parashat Naso",
    parshaHebrew: "פרשת נשא",
  };
}

export function getShabbatInfo(): ShabbatInfo {
  return {
    candleLightingTime: "7:42 PM",
    havdalahTime: "8:51 PM",
    region: "New York",
    daysUntil: 3,
  };
}

export function getDafYomi(): DafYomi {
  return {
    tractate: "Sukkah",
    page: "12a",
    englishName: "Sukkah 12a",
  };
}

export function getRabbiNote(): RabbiNote {
  return {
    title: "A note from the Rabbi",
    preview: "Every encounter you'll have today is a chance to bring a little more light into the world.",
    author: "Rabbi Ari Levine",
  };
}
