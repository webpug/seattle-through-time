// Denny Hill, standing and being taken down: the hill as a 3-D surface that the five regrades eat away between
// 1898 and 1930, with the hydraulic giants, the flume, the conveyor trestle down Battery Street and the dump scows.
// The surface comes from regrade-field.js (an estimate fitted to recorded cut depths and volumes); the machines
// are period-typical and work far faster than life.
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import { frame, poly, box, ngon } from './scene.js';
import { LON0, LAT0, mx, my, ilon, ilat, sstep, BOX, PHASES, LAST, DUR, ungrid, sampleM, cut, clearYear, left } from './regrade-field.js';

export const EX = 1.6;        // the hill is drawn this much taller than it stood
const CELL = 8, FRESH = 2.5;  // mesh spacing m; years the scraped ground stays bare
const NX = Math.ceil((BOX[2] - BOX[0]) / CELL) + 1, NY = Math.ceil((BOX[3] - BOX[1]) / CELL) + 1, N = NX * NY;
const VLON = new Float32Array(N), VLAT = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N), VC = new Float32Array(N), VT = new Float32Array(N), VP = new Uint8Array(N);
for (let r = 0, i = 0; r < NY; r++) for (let c = 0; c < NX; c++, i++) {
  VX[i] = BOX[0] + c * CELL; VY[i] = BOX[1] + r * CELL; VLON[i] = ilon(VX[i]); VLAT[i] = ilat(VY[i]);
  const q = sampleM(VX[i], VY[i]); VC[i] = q.c; VT[i] = q.t; VP[i] = q.p;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const EARTH = [198, 170, 128], MUD = [172, 148, 112];
const SUN = [0.33, 0.6, 0.73];

// what stands on the hill needs to know how high the ground is
export const height = (lon, lat, year) => { const c = cut(lon, lat); return c > 0 ? EX * c * left(clearYear(lon, lat), year) : 0; };
// a building that still stands cannot have been there before its lot was cut down to today's grade
export function delay(lon, lat, year) { if (cut(lon, lat) < 3) return year; const t = clearYear(lon, lat); return year < t ? t + 0.25 : year; }
// a building that is gone: [ground height it stood on, the year the regrade took it]; null if it never stood on the hill
export function perch(lon, lat, start) { const c = cut(lon, lat); if (c < 1.2) return null; const t = clearYear(lon, lat); return start < t - 0.3 ? [EX * c, t - DUR - 0.03] : [0, 0, t + 0.3]; }

// the streets that ran over the hill, sampled along the grid so they can be draped on it
const STREETS = [];
{
  const line = (f, n) => { const pts = []; for (let k = 0; k <= n; k++) { const [lon, lat] = f(k / n), x = mx(lon), y = my(lat), q = sampleM(x, y); pts.push({ lon, lat, c: q.c, t: q.t }); } STREETS.push(pts); };
  for (let a = -1; a <= 6; a++) line((u) => ungrid(a, -0.9 + u * 8.6), 120);
  for (let s = 0; s <= 7; s++) line((u) => ungrid(-1.6 + u * 8.4, s), 110);
}

const Z = new Float32Array(N), POS = new Float32Array(N * 3), COL = new Float32Array(N * 3);
let step = -1, mesh = null, streets = [], faces = [];
function rebuild(year, ground) {
  let any = false;
  for (let i = 0; i < N; i++) {
    const c = VC[i];
    let z = c > 0 ? EX * c * left(VT[i], year) : 0;
    if (z < 0.05) z = c > 0.8 && year >= VT[i] && year - VT[i] < FRESH ? 0.5 : 0;
    Z[i] = z; if (z) any = true;
    POS[i * 3] = VX[i]; POS[i * 3 + 1] = VY[i]; POS[i * 3 + 2] = z;
  }
  faces = [];
  if (!any) { mesh = null; streets = []; return; }
  const cand = [];
  for (let r = 0, i = 0; r < NY; r++) for (let c = 0; c < NX; c++, i++) {
    // the hill wears the same ground colour as the flat map around it, so its foot has no seam
    const top = ground(VLON[i], VLAT[i], year);
    if (!Z[i]) { COL[i * 3] = top[0] / 255; COL[i * 3 + 1] = top[1] / 255; COL[i * 3 + 2] = top[2] / 255; continue; }
    const a = i - (c > 0 ? 1 : 0), b = i + (c < NX - 1 ? 1 : 0), u = i + (r < NY - 1 ? NX : 0), d = i - (r > 0 ? NX : 0);
    let nx = -(Z[b] - Z[a]) / ((b - a || 1) * CELL), ny = -(Z[u] - Z[d]) / (((u - d) / NX || 1) * CELL), nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const shade = 0.64 + 0.5 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
    const rem = left(VT[i], year), working = rem > 0 && rem < 1, age = year - VT[i];
    let col;
    if (Z[i] <= 0.5 && rem === 0) col = mix(MUD, top, sstep(0.2, FRESH, age));      // scraped ground, slowly built over
    else {
      // grass and yards on top, raw clay on the cut faces and wherever the giants are working
      const bare = Math.max(sstep(0.12, 0.42, 1 - nz), working ? 1 : 0, 1 - sstep(0, 0.2, VT[i] - year - DUR));
      col = mix(top, EARTH, bare).map((v) => v * shade);
    }
    COL[i * 3] = col[0] / 255; COL[i * 3 + 1] = col[1] / 255; COL[i * 3 + 2] = col[2] / 255;
    if (working && rem > 0.3 && rem < 0.7 && VC[i] > 5) cand.push([i, nx, ny]);
  }
  const idx = [];
  for (let r = 0; r < NY - 1; r++) for (let c = 0; c < NX - 1; c++) {
    const i = r * NX + c, j = i + NX;
    if (Z[i] || Z[i + 1] || Z[j] || Z[j + 1]) idx.push(i, i + 1, j, i + 1, j + 1, j);
  }
  mesh = { attributes: { positions: { value: POS.slice(), size: 3 }, colors: { value: COL.slice(), size: 3 } }, indices: { value: new Uint32Array(idx), size: 1 } };
  // working faces, spread out along the front
  cand.sort((p, q) => VX[p[0]] + VY[p[0]] * 1.7 - VX[q[0]] - VY[q[0]] * 1.7);
  const want = Math.min(7, cand.length);
  for (let k = 0; k < want; k++) {
    const [i, nx, ny] = cand[Math.floor(((k + 0.5) * cand.length) / want)], l = Math.hypot(nx, ny) || 1;
    faces.push({ x: VX[i], y: VY[i], z: Z[i], dx: nx / l, dy: ny / l, k: i });
  }
  // streets, only where the hill is still untouched
  streets = [];
  if (year >= 1874) for (const pts of STREETS) {
    let run = null;
    for (const p of pts) {
      if (p.c > 0.6 && year < p.t - DUR) { if (!run) streets.push((run = [])); run.push([p.lon, p.lat, EX * p.c + 0.9]); } else run = null;
    }
  }
  streets = streets.filter((s) => s.length > 1);
}

// ---------- machines ----------
const head = (ax, ay, bx, by) => (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
function along(out, pts, seg, fn) {
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = mx(pts[i][0]), ay = my(pts[i][1]), bx = mx(pts[i + 1][0]), by = my(pts[i + 1][1]), len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / seg)), l = len / n;
    for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; fn(frame(ilon(ax + (bx - ax) * f), ilat(ay + (by - ay) * f), head(ax, ay, bx, by)), l, k); }
  }
}
// wooden flume from the tunnel mouth below 2nd Avenue out over the bay, foot of Bell Street
const FLUME = [[-122.3466, 47.6133], [-122.3488, 47.6115], [-122.3499, 47.6106]], OUTFALL = FLUME[2];
// covered conveyor trestle: 5th and Battery to a dock at the foot of Battery Street
const BELT = [[-122.3444, 47.6168], [-122.3487, 47.6135], [-122.3501, 47.6123], [-122.35135, 47.61134]], DOCK = BELT[3], DUMP = [-122.3668, 47.6068];
const WOOD = [150, 126, 92], DARK = [84, 74, 64];
function shovel(out, o, t, k) {
  box(out, o, -3.2, -4.6, -1.5, 4.6, 0, 1.3, [42, 40, 40]); box(out, o, 1.5, -4.6, 3.2, 4.6, 0, 1.3, [42, 40, 40]);
  box(out, o, -3.1, -5.4, 3.1, 2.6, 1.3, 4.6, [164, 62, 44]); box(out, o, -3.3, -5.6, 3.3, 2.8, 5.9, 0.4, [70, 62, 58]);
  for (let j = 0; j < 6; j++) box(out, o, -0.45, 2.6 + j * 2, 0.45, 4.8 + j * 2, 3.6 + j * 1.5, 1, [62, 62, 66]);
  const dip = 0.5 + 0.5 * Math.sin(t * 1.7 + k);
  box(out, o, -0.3, 9.6, 0.3, 14.4, 4.5 + dip * 4, 0.8, [62, 62, 66]); box(out, o, -1.2, 13.4, 1.2, 15.8, 2.2 + dip * 4.6, 2.3, [38, 38, 40]);
}
function scow(out, o, loaded) {
  poly(out, o, [[-5, -15], [5, -15], [5.6, 12], [3.5, 16], [-3.5, 16], [-5.6, 12]], 0, 2.4, [70, 68, 66]);
  if (loaded) { poly(out, o, [[-4.4, -13], [4.4, -13], [4.6, 11], [-4.6, 11]], 2.4, 1.6, EARTH); poly(out, o, [[-3, -10], [3, -10], [3.2, 8], [-3.2, 8]], 4, 1.4, [184, 156, 116]); poly(out, o, ngon(2.2, 7, 0, -1), 5.4, 1.1, [176, 150, 112]); }
  // the tug on a short towline ahead
  poly(out, o, [[0, 43], [2.6, 39], [2.9, 28], [2, 25], [-2, 25], [-2.9, 28], [-2.6, 39]], 0, 2.4, [34, 34, 36]);
  box(out, o, -1.9, 29, 1.9, 36, 2.4, 2.4, [168, 56, 42]); poly(out, o, ngon(0.8, 8, 0, 31), 4.8, 3.4, [30, 30, 32]);
}
const OFFS = { depthWriteEnabled: false };
function machines(year, t, zoom) {
  const prisms = [], dots = [], pools = [], belts = [];
  const hyd = year < 1911.3 && PHASES.slice(0, 4).some(([, a, b]) => year >= a && year <= b + 0.05);
  const k = Math.max(1.5, Math.min(3.2, 2 ** (15.6 - zoom)));
  const plume = (p, dirx, diry, n, reach, a0) => {
    for (let i = 0; i < n; i++) {
      const f = (i / n + t * 0.035) % 1, w = Math.sin(i * 2.4 + f * 5) * 0.22 * f * reach;
      pools.push({ p: [p[0] + (dirx * f * reach - diry * w) / 75000, p[1] + (diry * f * reach + dirx * w) / 111000, 0.4], r: 22 + f * reach * 0.24, c: [150, 124, 88, a0 * (1 - f) ** 1.3] });
    }
  };
  if (year >= 1903.4 && year < 1911.5) {
    along(prisms, FLUME, 14, (o, l, i) => { box(prisms, o, -1.3, -l / 2, 1.3, l / 2, 4, 1, WOOD); if (i % 2 === 0) for (const x of [-1.2, 1.2]) box(prisms, o, x - 0.3, -0.3, x + 0.3, 0.3, 0, 4, DARK); });
  }
  if (hyd) {
    // hydraulic giants: jets of salt water from the cleared ground into the face of the hill
    for (const f of faces) {
      const nxm = f.x + f.dx * 58, nym = f.y + f.dy * 58, o = frame(ilon(nxm), ilat(nym), head(nxm, nym, f.x, f.y), k);
      box(prisms, o, -0.9, -1.4, 0.9, 1.4, 0, 1.2, [60, 56, 54]); box(prisms, o, -0.3, 0.4, 0.3, 3.4, 1.2, 0.7, [40, 40, 44]);
      for (let j = 0; j < 12; j++) {
        const u = (j / 12 + t * 0.8 + f.k * 0.13) % 1, x = nxm + (f.x - nxm) * u, y = nym + (f.y - nym) * u, z = 2.5 + (f.z * 0.55 - 2.5) * u + 13 * 4 * u * (1 - u);
        dots.push({ p: [ilon(x), ilat(y), z], r: 1.6 + u * 2.2, c: [226, 238, 250, 215] });
      }
      for (let j = 0; j < 4; j++) { const u = (t * 0.6 + j / 4 + f.k * 0.07) % 1; dots.push({ p: [ilon(f.x + f.dx * u * 14), ilat(f.y + f.dy * u * 14), f.z * 0.55 + u * 9], r: 5 + u * 8, c: [236, 240, 240, 120 * (1 - u)] }); }
    }
    // the spoil went down the flume into Elliott Bay (from 1898 a simple ditch did the same job)
    plume(OUTFALL, -0.82, -0.57, 16, 520, 105);
  }
  if (year >= 1929.15 && year < 1931.0) {
    along(prisms, BELT, 16, (o, l, i) => { box(prisms, o, -2.4, -l / 2, 2.4, l / 2, 6.5, 3, WOOD); box(prisms, o, -2.7, -l / 2, 2.7, l / 2, 9.5, 0.5, DARK); if (i % 2 === 0) for (const x of [-2, 2]) box(prisms, o, x - 0.4, -0.4, x + 0.4, 0.4, 0, 6.5, DARK); });
    const hop = frame(DOCK[0], DOCK[1], head(mx(BELT[2][0]), my(BELT[2][1]), mx(DOCK[0]), my(DOCK[1])));
    box(prisms, hop, -5, -5, 5, 5, 0, 2, DARK); box(prisms, hop, -4, -4, 4, 4, 2, 11, WOOD);
  }
  if (year >= PHASES[4][1] && year <= LAST + 0.02) {
    // electric shovels at the face, feeding portable belts that run back to the main conveyor
    for (const f of faces.filter((_, i) => i !== 1 && i !== 4)) {
      const sx = f.x + f.dx * 15, sy = f.y + f.dy * 15;
      shovel(prisms, frame(ilon(sx), ilat(sy), head(sx, sy, f.x, f.y), k, 0.5), t, f.k);
      belts.push([[ilon(sx + f.dx * 8), ilat(sy + f.dy * 8), 2], [BELT[0][0], BELT[0][1], 8]]);
    }
    // self-dumping scows: out loaded, tipped off Duwamish Head, back empty
    const ax = mx(DOCK[0]), ay = my(DOCK[1]), bx = mx(DUMP[0]), by = my(DUMP[1]), ks = Math.max(1, Math.min(2.3, 2 ** (14.4 - zoom)));
    for (let i = 0; i < 2; i++) {
      const c = (t / 28 + i * 0.5) % 1, outb = c < 0.5, u = outb ? c * 2 : 2 - c * 2, e = u * u * (3 - 2 * u), x = ax + (bx - ax) * (0.04 + e * 0.96), y = ay + (by - ay) * (0.04 + e * 0.96);
      scow(prisms, frame(ilon(x), ilat(y), outb ? head(ax, ay, bx, by) : head(bx, by, ax, ay), ks), outb && u < 0.97);
    }
    plume(DUMP, -0.5, 0.86, 12, 420, 95);
  }
  return { prisms, dots, pools, belts };
}

export function layers(year, t, zoom, mat, tint) {
  if (zoom < 10.8 || year > LAST + FRESH + 0.1) return { ground: [], fx: [] };
  const s = year < PHASES[0][1] - 0.2 ? Math.floor(year) : Math.round(year * 40) / 40;   // before 1898 only the ground colour changes
  if (s !== step) { step = s; rebuild(s, tint); }
  const ground = [], fx = [];
  if (mesh) ground.push(new SimpleMeshLayer({ id: 'denny-hill', data: [0], mesh, getPosition: [LON0, LAT0, 0], getColor: [255, 255, 255], material: false }));
  if (streets.length) ground.push(new PathLayer({ id: 'denny-streets', data: streets, getPath: (d) => d, getWidth: 7, widthUnits: 'meters', widthMinPixels: 0.6, getColor: [240, 233, 216, 255 * sstep(1874, 1884, year)], updateTriggers: { getColor: Math.min(year, 1885) } }));
  if (zoom < 11.8) return { ground, fx };
  const m = machines(year, t, zoom);
  if (m.pools.length) ground.push(new ScatterplotLayer({ id: 'spoil', data: m.pools, getPosition: (d) => d.p, getRadius: (d) => d.r, getFillColor: (d) => d.c, parameters: { ...OFFS, depthCompare: 'always' } }));
  if (m.belts.length) fx.push(new PathLayer({ id: 'feeder-belts', data: m.belts, getPath: (d) => d, getWidth: 2.4, widthUnits: 'meters', widthMinPixels: 1, getColor: [70, 62, 56] }));
  if (m.prisms.length) fx.push(new SolidPolygonLayer({ id: 'regrade-works', data: m.prisms, getPolygon: (d) => d.p, getElevation: (d) => d.h, getFillColor: (d) => d.c, extruded: true, material: mat }));
  if (m.dots.length) fx.push(new ScatterplotLayer({ id: 'giants', data: m.dots, getPosition: (d) => d.p, getRadius: (d) => d.r, getFillColor: (d) => d.c, billboard: true, parameters: OFFS }));
  return { ground, fx };
}
