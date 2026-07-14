// Beacon flame — vector-traced from the CPO's hand-drawn reference (potrace),
// then smoothed (blur → re-threshold + max corner rounding) and normalized.
// It is a *hollow* flame: an outer silhouette plus a self-shaped inner cutout,
// so it must always be rendered with `fillRule="evenodd"`. Shared by the beacon
// tab icon, the beacon-page hero flame, and the no-matches empty state so all
// three read as the same brand flame. Fill it with the brand gradient
// (#9333EA → #E879A0 → #F59E0B) or a solid color; the shape is fill-agnostic.
//
// ⚠ UNCOMMITTED PREVIEW: currently set to variant A (light smoothing) so the
// CPO can see it on-device. The committed/shipped shape is variant B (balanced
// smoothing). To revert to B: `git checkout constants/beaconFlame.ts`.

// 24×24 viewBox — tab icon and small page usages. [variant A — preview]
export const BEACON_FLAME_PATH =
  'M12.28 1.732C9.736 3.062 8.999 5.776 10.615 7.816C11.584 9.03 11.632 10.571 10.711 11.069C9.558 11.69 8.699 11.246 8.399 9.875C7.778 6.984 4.9 11.601 4.641 15.905C4.395 19.901 6.973 22.391 11.386 22.439C16.713 22.5 19.605 18.837 18.861 12.965C18.548 10.476 17.293 8.198 14.626 5.292C13.535 4.105 13.119 3.355 13.03 2.407C12.962 1.718 12.723 1.5 12.28 1.732ZM13.371 7.768C13.432 7.857 13.61 8.143 13.766 8.416C13.923 8.689 14.319 9.343 14.639 9.882C15.717 11.683 15.813 11.86 15.969 12.46C16.658 15.059 15.751 17.596 13.712 18.783C11.591 20.017 10.083 19.983 8.89 18.674C7.71 17.385 7.355 14.165 8.46 14.813C9.62 15.495 12.703 14.322 13.234 12.992C13.528 12.249 13.432 10.639 13.023 9.575C12.689 8.696 12.975 7.215 13.371 7.768Z';

// 100×130 viewBox, base near y≈118 — the animated hero flame. [variant A — preview]
export const BEACON_FLAME_HERO_PATH =
  'M51.397 13.691C38.685 20.337 35.004 33.901 43.082 44.091C47.921 50.158 48.16 57.86 43.559 60.348C37.799 63.449 33.505 61.234 32.005 54.384C28.904 39.934 14.522 63.006 13.227 84.511C12 104.483 24.883 116.922 46.933 117.161C73.55 117.467 88 99.166 84.285 69.822C82.717 57.383 76.447 46 63.121 31.482C57.668 25.552 55.589 21.803 55.146 17.065C54.805 13.623 53.613 12.533 51.397 13.691ZM56.85 43.853C57.157 44.296 58.043 45.727 58.827 47.091C59.611 48.454 61.587 51.726 63.189 54.418C68.574 63.415 69.051 64.301 69.835 67.3C73.277 80.285 68.744 92.963 58.554 98.893C47.955 105.062 40.423 104.891 34.459 98.348C28.563 91.907 26.791 75.821 32.312 79.058C38.106 82.466 53.51 76.604 56.169 69.959C57.634 66.244 57.157 58.201 55.112 52.884C53.442 48.488 54.874 41.092 56.85 43.853Z';
