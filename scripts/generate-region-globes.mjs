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
  'israel':        { lon: 35.2, lat: 31.5, scale: 2900, match: ['ISR', 'PSX'] },
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
// tile size. Applied LAST, after the simplify pipeline (simplify in float space,
// then round).
const roundPath = (path) => (path ?? '').replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n))));

// ── Vector point-count optimization (pure JS, no new deps) ────────────────────
//
// The component clips everything to a circle (cx=100, cy=100, r=100) inside the
// 200×200 viewBox. Each tile projects the WHOLE planet at that tile's zoom, so
// most of the `world` path is off-disc and invisible. We:
//   1. parse the M/L/Z path into subpaths (geoPath(orthographic) emits only
//      straight segments — no curves/arcs),
//   2. drop subpaths whose bbox lies entirely outside the disc (r=105 margin),
//   3. Douglas–Peucker simplify each surviving subpath in viewBox-coordinate
//      space (so the tolerance maps directly to invisible sub-pixel error at the
//      rendered 44–56px size),
//   4. drop degenerate subpaths (<3 pts / zero-area),
//   5. re-emit as 'M x y L x y … Z'.
// All of this happens in float space; integer rounding is applied afterward.

const DISC_CX = 100;
const DISC_CY = 100;
const DISC_R_MARGIN = 105; // keep partially-visible shapes (5-unit margin past r=100)

// Tokenize a geoPath M/L/Z string into subpaths: [{ points: [[x,y],…], closed }].
function parseSubpaths(path) {
  const subpaths = [];
  let current = null;
  // Match commands: M x y | L x y | Z. Coords may be space- or comma-separated.
  const re = /([MLZ])\s*(-?\d*\.?\d+)?[\s,]*(-?\d*\.?\d+)?/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    const cmd = m[1];
    if (cmd === 'M') {
      if (current && current.points.length) subpaths.push(current);
      current = { points: [[parseFloat(m[2]), parseFloat(m[3])]], closed: false };
    } else if (cmd === 'L') {
      if (current) current.points.push([parseFloat(m[2]), parseFloat(m[3])]);
    } else if (cmd === 'Z') {
      if (current) {
        current.closed = true;
        subpaths.push(current);
        current = null;
      }
    }
  }
  if (current && current.points.length) subpaths.push(current);
  return subpaths;
}

// Does a subpath's bounding box intersect the disc (circle r=DISC_R_MARGIN)?
function bboxIntersectsDisc(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // Closest point on the bbox to the disc center, then distance test.
  const nx = Math.max(minX, Math.min(DISC_CX, maxX));
  const ny = Math.max(minY, Math.min(DISC_CY, maxY));
  const dx = nx - DISC_CX;
  const dy = ny - DISC_CY;
  return dx * dx + dy * dy <= DISC_R_MARGIN * DISC_R_MARGIN;
}

// Perpendicular distance from point p to the line through a–b.
function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  // |cross product| / |a-b|
  const cross = Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy);
  return cross / Math.sqrt(len2);
}

// Indices of the extreme bbox vertices (min-x, max-x, min-y, max-y). Force-kept
// when preserveBbox is set so the simplified ring's bounding box is identical to
// the input's — guarantees the approved region framing survives DP, since a
// near-collinear limb arc can otherwise lose its single extreme vertex.
function extremeIndices(points) {
  let iMinX = 0, iMaxX = 0, iMinY = 0, iMaxY = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[iMinX][0]) iMinX = i;
    if (points[i][0] > points[iMaxX][0]) iMaxX = i;
    if (points[i][1] < points[iMinY][1]) iMinY = i;
    if (points[i][1] > points[iMaxY][1]) iMaxY = i;
  }
  return [iMinX, iMaxX, iMinY, iMaxY];
}

// Iterative Douglas–Peucker. Keeps first/last points. When preserveBbox is true,
// also force-keeps the four extreme bbox vertices and seeds the recursion from
// them so the output bounding box matches the input exactly.
function douglasPeucker(points, epsilon, preserveBbox = false) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  // Force-keep extreme bbox vertices, then run DP between each consecutive pair
  // of anchor indices so the recursion never spans across a forced vertex.
  let anchors = [0, points.length - 1];
  if (preserveBbox) {
    for (const i of extremeIndices(points)) keep[i] = true;
    anchors = [...new Set([0, points.length - 1, ...extremeIndices(points)])]
      .sort((a, b) => a - b);
  }

  const stack = [];
  for (let a = 0; a + 1 < anchors.length; a++) stack.push([anchors[a], anchors[a + 1]]);

  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > epsilon && idx !== -1) {
      keep[idx] = true;
      stack.push([start, idx]);
      stack.push([idx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Approximate polygon area (shoelace) — used to drop zero-area degenerates.
function polyArea(points) {
  let area = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

// Full pipeline: (optionally) clip off-disc subpaths, simplify, drop
// degenerates, re-emit.
//
// `clip` is enabled for the WORLD path — that path projects the whole planet at
// the tile's zoom, so most subpaths are off-disc and invisible; dropping them is
// where the point savings live. It is DISABLED for the REGION path so the
// highlighted shape's measured bounding box stays byte-identical to the approved
// baked framing (the off-disc parts of a region are clipped at render anyway, so
// keeping them changes nothing visible — but preserves the ±1 framing contract).
function simplifyPath(path, epsilon, clip = true, preserveBbox = false) {
  const subpaths = parseSubpaths(path ?? '');
  const out = [];
  for (const sp of subpaths) {
    // 2. Drop subpaths whose bbox is entirely off-disc (world path only).
    if (clip && !bboxIntersectsDisc(sp.points)) continue;

    // For a closed ring, the first point is usually repeated as the last.
    // Simplify on the open point list, then re-close.
    let pts = sp.points;
    const wasClosed = sp.closed;
    let dropLast = false;
    if (wasClosed && pts.length > 1) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) {
        pts = pts.slice(0, -1);
        dropLast = true;
      }
    }

    // 3. Douglas–Peucker.
    let simplified = douglasPeucker(pts, epsilon, preserveBbox);

    // 4. Drop degenerate subpaths. The zero-area drop is skipped when
    // preserveBbox is set (region path): a tiny off-disc island fragment can sit
    // on a region's extreme bbox vertex, and dropping it would shift the measured
    // framing even though the fragment is invisible (clipped at render). The
    // <3-point guard still removes truly broken subpaths.
    if (simplified.length < 3) continue;
    if (!preserveBbox && wasClosed && polyArea(simplified) < 0.5) continue;

    // 5. Re-emit.
    void dropLast; // ring re-closed below via explicit Z
    const d = 'M' + simplified.map(([x, y]) => `${x} ${y}`).join('L');
    out.push(wasClosed ? d + 'Z' : d);
  }
  return out.join('');
}

// world: epsilon 1.5 (~0.4px at 56px — invisible). region: epsilon 0.5
// (~0.13px — conservative). The region path also force-keeps its four extreme
// bbox vertices (preserveBbox), so the approved framing survives DP exactly.
const WORLD_EPSILON = 1.5;
const REGION_EPSILON = 0.5;
const bakeWorld = (path) => roundPath(simplifyPath(path, WORLD_EPSILON, true, false));
const bakeRegion = (path) => roundPath(simplifyPath(path, REGION_EPSILON, false, true));

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
  const worldPath = bakeWorld(pathGen(worldCollection));

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

  const regionPath = bakeRegion(pathGen(regionFeatures));

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
