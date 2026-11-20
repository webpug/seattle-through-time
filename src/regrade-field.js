// Denny Hill as a field: how much ground each regrade took away, and when.
//
// The flat map is today's ground, so the hill is drawn as the earth that has since been removed: cut(x, y) is the
// depth of the cut in metres, clearYear(x, y) the year the regrade reached that spot. Neither is surveyed. The cut is
// a smooth surface fitted to the figures on record (107 ft at 4th and Blanchard, 89 ft maximum east of 5th, 17 ft on
// 1st Avenue, about 60 ft at Denny Park, the hotel summit between 2nd and 3rd on Stewart) and scaled so each
// regrade's volume comes out near the reported one. The fronts sweep across each project's blocks between its
// recorded start and finish; their exact course is a guess.
// Sources: HistoryLink essay 21204 (D. B. Williams), Seattle historic context statements for Belltown and the
// Denny Triangle, UW CSPN "Building Nature" documents.

export const LON0 = -122.3445, LAT0 = 47.6158;
const R = 6378137, RAD = Math.PI / 180, C0 = Math.cos(LAT0 * RAD);
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)), Y0M = mercY(LAT0);
// lon/lat <-> metres in the anchor's Mercator-linear frame (the frame the mesh layer draws in)
export const mx = (lon) => (lon - LON0) * RAD * R * C0, my = (lat) => (mercY(lat) - Y0M) * R * C0;
export const ilon = (x) => LON0 + x / (RAD * R * C0), ilat = (y) => (2 * Math.atan(Math.exp(Y0M + y / (R * C0))) - Math.PI / 2) / RAD;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Belltown's street grid, measured from the road data: a = avenue (2nd = 0, 5th = 3, 1st = -1), s = blocks north-west
// of Virginia Street along the avenues (Lenora 1, Blanchard 2, Bell 3, Battery 4, Wall 5, Vine 6, Cedar 7).
const O = [-122.3418, 47.6117], S = [-0.001143, 0.000686], A = [0.000867, 0.000667], DET = S[0] * A[1] - S[1] * A[0];
const BS = 114.7, BA = 103; // block lengths, m
export const grid = (lon, lat) => { const dx = lon - O[0], dy = lat - O[1]; return [(S[0] * dy - S[1] * dx) / DET, (dx * A[1] - dy * A[0]) / DET]; };
export const ungrid = (a, s) => [O[0] + s * S[0] + a * A[0], O[1] + s * S[1] + a * A[1]];

// foot of the hill: Western Avenue, Pine Street, Westlake Avenue, Harrison Street, Broad Street
const FOOT = [[-122.3420, 47.6092], [-122.3437, 47.6103], [-122.3461, 47.6120], [-122.3487, 47.6135], [-122.3515, 47.6151], [-122.3534, 47.6163], [-122.3517, 47.6176],
  [-122.3508, 47.6182], [-122.3495, 47.6195], [-122.3478, 47.6212], [-122.3455, 47.6224], [-122.3390, 47.6224], [-122.3383, 47.6186], [-122.3381, 47.6164], [-122.3377, 47.6148],
  [-122.3372, 47.6130], [-122.3363, 47.6114], [-122.3385, 47.6102], [-122.3405, 47.6095]].map(([lon, lat]) => [mx(lon), my(lat)]);
export const BOX = FOOT.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
// distance inside the foot line (m), 0 outside
function inside(x, y) {
  let inn = false, d2 = 1e18;
  for (let i = 0, j = FOOT.length - 1; i < FOOT.length; j = i++) {
    const [xi, yi] = FOOT[i], [xj, yj] = FOOT[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
    const ex = xj - xi, ey = yj - yi, t = clamp(((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey), 0, 1), px = xi + ex * t - x, py = yi + ey * t - y;
    d2 = Math.min(d2, px * px + py * py);
  }
  return inn ? Math.sqrt(d2) : 0;
}

// the hill's shape: [avenue, block, cut m, spread across the avenues m, spread along them m]
const BUMPS = [
  [2.0, 2.0, 32.6, 200, 300],   // north summit, 4th and Blanchard: the 107 ft cut
  [0.95, -0.55, 28, 165, 150],  // south summit under the Denny (Washington) Hotel
  [4.2, 3.0, 14, 140, 200],     // the half left standing east of 5th until 1929
  [6.0, 4.8, 18, 105, 105],     // Denny Park, lowered about 60 ft in 1930
  [3.2, 6.6, 8, 130, 170],     // the long north slope down to Thomas Street
];
function cutM(x, y, a, s) {
  const m = inside(x, y);
  if (m <= 0) return 0;
  let sum = 0;
  for (const [a0, s0, h, sa, ss] of BUMPS) sum += (h * Math.exp(-0.5 * ((((a - a0) * BA) / sa) ** 2 + (((s - s0) * BS) / ss) ** 2))) ** 3;
  // the west side fell away steeply to 2nd and 1st Avenues, where only the streets themselves were cut down
  let c = Math.cbrt(sum) * sstep(0, 130, m) * (0.1 + 0.2 * sstep(-1.2, -0.4, a) + 0.7 * sstep(0.2, 1.0, a));
  if (a > 3) c = Math.min(c, 27.1);                         // 89 ft was the deepest cut of the second regrade
  if (a < -0.5) c = Math.min(c, 5.2);                       // and 17 ft the deepest on 1st Avenue
  return c;
}

// value noise, for ragged fronts
const h2 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  const p = h2(i, j), q = h2(i + 1, j), r = h2(i, j + 1), t = h2(i + 1, j + 1);
  return p + (q - p) * a + (r - p) * b + (p - q - r + t) * a * b;
}

// The five regrades: [name, first year, last year]
export const PHASES = [
  ['First Avenue regrade', 1898.2, 1899.2],
  ['Second Avenue regrade', 1903.4, 1905.95],
  ['Washington Hotel site', 1906.7, 1908.1],
  ['Denny Regrade No. 1', 1908.62, 1911.3],
  ['Denny Regrade No. 2', 1929.4, 1930.94],
];
const DENNY_WAY = my(47.6186), HEAD = [mx(-122.3444), my(47.6168)], PARK = [mx(-122.3420), my(47.6190)];
export function phaseOf(y, a, s) {
  if (a > 3 || y > DENNY_WAY) return 4;
  if (a < -0.5) return 0;
  if (a < 0.5) return 1;
  return s < 0 ? 2 : 3;
}
// spite mounds: lots whose owners held out, left standing as pinnacles for years after the streets were cut
const MOUNDS = [[1.5, 0.5, 1912.4], [2.5, 1.45, 1913.2], [1.45, 2.5, 1911.9], [2.55, 2.55, 1916.5], [1.5, 3.45, 1912.8], [2.45, 4.5, 1914.3], [1.55, 5.5, 1913.6], [2.5, 0.55, 1920.5], [1.45, 1.55, 1912.1], [2.55, 3.5, 1924.0]]
  .map(([a, s, t]) => { const [lon, lat] = ungrid(a, s); return [mx(lon), my(lat), t]; });
function clearM(x, y, a, s) {
  const p = phaseOf(y, a, s), [, t0, t1] = PHASES[p];
  let f;
  if (p === 4) {
    // the shovels started on Battery Street at 5th and worked outward; Denny Park went last, in December 1930
    f = Math.min(1, Math.hypot(x - HEAD[0], y - HEAD[1]) / 780) ** 0.85 * 0.9;
    f = Math.max(f, 1 - sstep(60, 300, Math.hypot(x - PARK[0], y - PARK[1])) * (1 - f));
  } else if (p === 3) f = 0.5 * clamp((a - 0.5) / 2.5, 0, 1) + 0.5 * clamp(s / 7.6, 0, 1);
  else if (p === 2) f = 0.6 * clamp((a - 0.5) / 2.5, 0, 1) + 0.4 * clamp((s + 2.4) / 2.4, 0, 1);
  else f = clamp((s + 2.6) / 11, 0, 1);
  f = clamp(f + (noise(x / 85, y / 85) - 0.5) * 0.16, 0, 1);
  let t = t0 + (t1 - t0) * f;
  if (p === 3) for (const [qx, qy, tm] of MOUNDS) { const d = Math.hypot(x - qx, y - qy); if (d < 20) t += (tm - t) * (1 - sstep(9, 20, d)); }
  return t;
}

export const DUR = 0.14;   // years a cut face takes to pass a given spot
export const LAST = 1930.94;
const inBox = (x, y) => x > BOX[0] && x < BOX[2] && y > BOX[1] && y < BOX[3];
// metres-frame versions, for the mesh
export function sampleM(x, y) {
  const [a, s] = grid(ilon(x), ilat(y)), c = cutM(x, y, a, s);
  return { c, t: c > 0 ? clearM(x, y, a, s) : 0, p: phaseOf(y, a, s) };
}
// lon/lat versions, for everything that stands on the hill
export function cut(lon, lat) { const x = mx(lon), y = my(lat); if (!inBox(x, y)) return 0; const [a, s] = grid(lon, lat); return cutM(x, y, a, s); }
export function clearYear(lon, lat) { const [a, s] = grid(lon, lat); return clearM(mx(lon), my(lat), a, s); }
export const left = (t, year) => { const r = clamp((t - year) / DUR, 0, 1); return r * r * (3 - 2 * r); };
