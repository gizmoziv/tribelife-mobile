// generate-region-globes.mjs
//
// BUILD-TIME ONLY — never imported by app/runtime code.
//
// Usage: node scripts/generate-region-globes.mjs
//   Run from tribelife-mobile/ to (re)bake constants/regionGlobes.generated.ts.
//
// Data source:
//   URL:     https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/cultural/ne_110m_admin_0_countries.json
//   Format:  GeoJSON FeatureCollection (already GeoJSON — no topojson conversion needed)
//   License: Public Domain (CC0) — Natural Earth data is made with natural earth.
//            Free vector and raster map data @ naturalearthdata.com.
//   Vendored at: scripts/vendor/ne_110m_admin_0_countries.json for reproducible offline runs.
//
// Country identity key: ADM0_A3 (always populated for all 177 features).
//   NOTE: ISO_A2 is "-99" for France, Norway, N.Cyprus, Somaliland in this dataset —
//   matching Europe by ISO_A2 would DROP France. ADM0_A3 (FRA, NOR, …) is reliable.
//
// Per-region TUNABLES: each region entry has { lon, lat, scale, match }.
//   lon/lat: the TRUE geographic centroid of the region (longitude, latitude).
//     d3-geo orthographic rotation centers the view on [-lon, -lat] — BOTH negated.
//   scale: controls the zoom/tight framing — higher = more zoomed in.
//     These are the knobs to adjust if a region looks too small or off-center
//     on device. Edit, then re-run: node scripts/generate-region-globes.mjs.
//   match: either an array of ADM0_A3 codes, or a predicate (props) => boolean.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as d3geo from 'd3-geo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load vendored geometry ────────────────────────────────────────────────────
const vendorPath = join(__dirname, 'vendor', 'ne_110m_admin_0_countries.json');
const rawData = JSON.parse(readFileSync(vendorPath, 'utf8'));

// ADM0_A3 is always populated (unlike ISO_A2 which is "-99" for several states).
const identityKey = 'ADM0_A3';
console.log(`[generate-region-globes] Using country identity key: ${identityKey}`);
console.log(`[generate-region-globes] Feature count: ${rawData.features.length}`);

// Data is already GeoJSON FeatureCollection — use directly.
const worldCollection = rawData;

// ── Region config — all 7 region slugs ───────────────────────────────────────
//
// TUNABLES per region: { lon, lat, scale, match }
//   lon: longitude of the region centroid (positive = East)
//   lat: latitude of the region centroid  (positive = North)
//   scale: zoom factor — higher number = more zoomed in, region fills more of disc.
//   match: ADM0_A3 code array OR predicate using props.CONTINENT / props.ADM0_A3.
//
// d3 geoOrthographic centers on [-lon, -lat] — BOTH coords negated in the
// projection below. Adjust lon/lat/scale per region, re-run, reload.
const REGION_CONFIG = {
  'north-america': { lon: -100, lat: 50, scale: 175, match: ['USA', 'CAN', 'MEX'] },
  'israel':        { lon: 35.2, lat: 31.5, scale: 3800, match: ['ISR', 'PSX'] },
  'europe':        { lon: 12, lat: 50, scale: 300,
                     match: (p) => p.CONTINENT === 'Europe' && !['GBR', 'IRL', 'RUS', 'ISL'].includes(p.ADM0_A3) },
  'uk-ireland':    { lon: -4, lat: 54, scale: 1100, match: ['GBR', 'IRL'] },
  'latin-america': { lon: -70, lat: -15, scale: 120,
                     match: (p) => p.CONTINENT === 'South America' || (p.CONTINENT === 'North America' && !['USA', 'CAN', 'GRL'].includes(p.ADM0_A3)) },
  'australia-nz':  { lon: 147, lat: -33, scale: 200, match: ['AUS', 'NZL'] },
  'south-africa':  { lon: 25, lat: -29, scale: 520, match: ['ZAF'] },
};

// ── Disc dimensions ───────────────────────────────────────────────────────────
const WIDTH = 200;
const HEIGHT = 200;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

// Round all coordinates to integers to cut baked file size (7× full world path
// is heavy). Integer precision on a 200-unit canvas is visually lossless at
// tile size. Applied to both world and region paths.
const roundPath = (path) => (path ?? '').replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n))));

// ── Build paths per region ────────────────────────────────────────────────────
const results = {};

for (const [slug, cfg] of Object.entries(REGION_CONFIG)) {
  console.log(`[generate-region-globes] Processing slug: ${slug}`);

  // d3-geo orthographic projection rotated to region centroid.
  // Convention: rotate takes [-longitude, -latitude] — BOTH negated (the NA fix).
  const projection = d3geo.geoOrthographic()
    .rotate([-cfg.lon, -cfg.lat])
    .scale(cfg.scale)
    .translate([CX, CY])
    .clipAngle(90);

  const pathGen = d3geo.geoPath(projection);

  // World land — all countries as muted backdrop.
  const worldPath = roundPath(pathGen(worldCollection));

  // Region highlight — filter to only the region's country set.
  const matchFn = Array.isArray(cfg.match)
    ? (p) => cfg.match.includes(p[identityKey])
    : cfg.match;

  const matched = worldCollection.features.filter((f) => matchFn(f.properties));
  const regionFeatures = {
    type: 'FeatureCollection',
    features: matched,
  };

  console.log(
    `  Matched ${matched.length} countries: ` +
    matched.map((f) => f.properties[identityKey]).join(', '),
  );

  const regionPath = roundPath(pathGen(regionFeatures));

  results[slug] = {
    world: worldPath,
    region: regionPath,
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
  };
}

// ── Emit constants/regionGlobes.generated.ts ─────────────────────────────────
const outputPath = join(ROOT, 'constants', 'regionGlobes.generated.ts');

const lines = [
  '// AUTO-GENERATED by scripts/generate-region-globes.mjs — DO NOT EDIT BY HAND.',
  '// Re-bake: node scripts/generate-region-globes.mjs',
  '//',
  '// Source: Natural Earth 110m Admin-0 Countries (CC0 Public Domain)',
  '//   https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/cultural/ne_110m_admin_0_countries.json',
  '// All 7 regions baked. Coordinates rounded to integers (visually lossless at tile size).',
  '// No d3-geo or topojson imports — plain string literals only.',
  '',
  'export type RegionGlobeData = {',
  '  world: string;',
  '  region: string;',
  '  viewBox: string;',
  '};',
  '',
  `export const REGION_GLOBES: Record<string, RegionGlobeData> = {`,
];

for (const [slug, data] of Object.entries(results)) {
  lines.push(`  '${slug}': {`);
  lines.push(`    world: '${data.world}',`);
  lines.push(`    region: '${data.region}',`);
  lines.push(`    viewBox: '${data.viewBox}',`);
  lines.push(`  },`);
}

lines.push('};');
lines.push('');

writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`[generate-region-globes] Wrote ${outputPath}`);
console.log('[generate-region-globes] Done.');
