// The animated layer: period ships, trains and aircraft, a handful of hand-built landmarks,
// and an illustrative reconstruction of buildings that no longer stand.
// Everything is drawn from extruded prisms so it shares the buildings' lighting.

export const KY = 110950;
export const kx = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const SUN = (() => { const v = [1.2, 2.2, 2.6], l = Math.hypot(...v); return v.map((x) => x / l); })();
export const shade = (nx, ny, nz) => 0.7 + 0.34 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
const hash = (i) => { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };

// ---------- hip roofs (shared with the surviving-building tiles) ----------
// Pushes 4 sloped faces (closed rings, xyz) for a box centred (cx,cy) m with long half-axis a along (ux,uy), short half-axis b.
export function hipRoof(pos, col, start, fvPush, cx, cy, ux, uy, a, b, z0, rh, c, sx, sy) {
  const vx = -uy, vy = ux, r = Math.max(0, a - b);
  const P = [[cx - ux * a - vx * b, cy - uy * a - vy * b], [cx + ux * a - vx * b, cy + uy * a - vy * b], [cx + ux * a + vx * b, cy + uy * a + vy * b], [cx - ux * a + vx * b, cy - uy * a + vy * b]];
  const R1 = [cx - ux * r, cy - uy * r], R2 = [cx + ux * r, cy + uy * r];
  const sl = Math.hypot(b, rh), nh = rh / sl, nz = b / sl;
  const faces = [[[P[0], 0], [P[1], 0], [R2, 1], [R1, 1]], [[P[2], 0], [P[3], 0], [R1, 1], [R2, 1]], [[P[1], 0], [P[2], 0], [R2, 1]], [[P[3], 0], [P[0], 0], [R1, 1]]];
  const normals = [[-vx, -vy], [vx, vy], [ux, uy], [-ux, -uy]];
  for (let f = 0; f < 4; f++) {
    const s = shade(normals[f][0] * nh, normals[f][1] * nh, nz), ring = faces[f];
    for (let k = 0; k <= ring.length; k++) {
      const [p, top] = ring[k % ring.length];
      pos.push(p[0] * sx, p[1] * sy, z0 + (top ? rh : 0)); col.push(c[0] * s, c[1] * s, c[2] * s, 255); fvPush();
    }
    start.push(pos.length / 3);
  }
}

// ---------- lost buildings ----------
const LOST_WALLS = [
  [[104, 84, 64], [118, 96, 72], [92, 76, 60]], // 0 log cabin
  [[236, 230, 214], [220, 210, 188], [200, 190, 170], [226, 214, 180], [190, 196, 184], [208, 192, 176]], // 1 frame house
  [[214, 200, 170], [188, 164, 132], [232, 224, 204], [170, 150, 124], [204, 180, 140], [150, 128, 104]], // 2 false-front store
  [[160, 84, 66], [146, 78, 62], [172, 98, 76], [134, 72, 60], [180, 150, 124]], // 3 brick block
  [[128, 116, 100], [108, 98, 86], [142, 126, 104], [96, 92, 88]], // 4 shack
];
const LOST_ROOF = [[98, 86, 72], [108, 98, 88], [90, 86, 80], [70, 64, 60], [92, 84, 76]];
export function buildLost(L, origin, perch) {
  const n = L.x.length, sx = 1 / kx(origin[1]), sy = 1 / KY, KX0 = kx(origin[1]);
  const wp = [], we = [], wc = [], wf = [], ws = [0];
  const rp = [], rc = [], rf = [], rs = [0];
  const burning = [];
  for (let i = 0; i < n; i++) {
    const cx = (L.x[i] - origin[0]) * KX0, cy = (L.y[i] - origin[1]) * KY, a = (L.a[i] * Math.PI) / 180, t = L.t[i];
    const ux = Math.cos(a), uy = Math.sin(a), hw = L.w[i] / 2, hd = L.d[i] / 2, s = hash(i);
    const wall = LOST_WALLS[t][s % LOST_WALLS[t].length];
    const roofed = t === 0 || t === 1;
    // on Denny Hill: stand on the hill, and go when the regrade gets there (or wait for it, if built afterwards)
    const P = perch ? perch(L.x[i], L.y[i], L.s[i]) : null, lift = P && !P[2] ? 1.2 : 0, base = lift ? P[0] - lift : 0;
    const S0 = P && P[2] ? Math.max(L.s[i], P[2]) : L.s[i], E0 = lift ? Math.min(L.e[i], P[1]) : L.e[i];
    const rh = roofed ? Math.min(hw * 0.7, 2.6) : 0, eave = L.h[i] - rh;
    const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
    for (const [ox, oy] of c) { wp.push((cx + ox * ux - oy * uy) * sx, (cy + ox * uy + oy * ux) * sy, base); we.push(eave + lift); wc.push(wall[0], wall[1], wall[2], 255); wf.push(S0, E0); }
    ws.push(wp.length / 3);
    if (roofed) {
      // long axis of the lot is its depth (perpendicular to the street)
      const long = hd >= hw;
      hipRoof(rp, rc, rs, () => rf.push(S0, E0), cx, cy, long ? -uy : ux, long ? ux : uy, Math.max(hw, hd) + 0.3, Math.min(hw, hd) + 0.3, base + lift + eave, rh, LOST_ROOF[s % 3], sx, sy);
    } else if (t === 2 || t === 3) {
      // false front / cornice: a slightly taller slab along the street side
      const d0 = -hd, d1 = -hd + 0.8, hh = t === 3 ? 1.2 : 1.6;
      for (const [ox, oy] of [[-hw, d0], [hw, d0], [hw, d1], [-hw, d1], [-hw, d0]]) { wp.push((cx + ox * ux - oy * uy) * sx, (cy + ox * uy + oy * ux) * sy, base); we.push(L.h[i] + hh + lift); wc.push(wall[0] * 0.92, wall[1] * 0.92, wall[2] * 0.92, 255); wf.push(S0, E0); }
      ws.push(wp.length / 3);
    }
    if ((L.e[i] > 1889.43 && L.e[i] < 1889.9 && t !== 3) || (t === 4 && i % 6 === 0)) burning.push({ lon: L.x[i], lat: L.y[i], e: L.e[i], k: i });
  }
  const bin = (p, size, c, f, st, e) => ({ length: st.length - 1, startIndices: new Uint32Array(st), attributes: {
    getPolygon: { value: new Float32Array(p), size }, getFillColor: { value: new Uint8Array(c), size: 4, normalized: true }, getFilterValue: { value: new Float32Array(f), size: 2 },
    ...(e ? { getElevation: { value: new Float32Array(e), size: 1 } } : {}) } });
  return { origin: [origin[0], origin[1], 0], walls: bin(wp, 3, wc, wf, ws, we), roofs: bin(rp, 3, rc, rf, rs), burning };
}

// ---------- prism helpers for models ----------
// frame o: {lon, lat, c, s (cos/sin of heading), k (display scale), z}. Local x = starboard, y = forward, metres.
export function frame(lon, lat, heading, k = 1, z = 0) { const r = (heading * Math.PI) / 180; return { lon, lat, c: Math.cos(r), s: Math.sin(r), k, z, ikx: 1 / kx(lat) }; }
export function poly(out, o, pts, z, h, color) {
  const ring = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] * o.k, y = pts[i][1] * o.k;
    ring[i] = [o.lon + (x * o.c + y * o.s) * o.ikx, o.lat + (-x * o.s + y * o.c) / KY, o.z + z * o.k];
  }
  out.push({ p: ring, h: h * o.k, c: color });
}
export const box = (out, o, x0, y0, x1, y1, z, h, c) => poly(out, o, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z, h, c);
export const ngon = (r, n = 10, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 6.2832), cy + r * Math.sin((i / n) * 6.2832)]);
const hull = (L, W, bow = 0.3, stern = 0.12) => [[0, L / 2], [W * 0.36, L / 2 - L * bow * 0.5], [W / 2, L / 2 - L * bow], [W / 2, -L / 2 + L * stern], [W * 0.3, -L / 2], [-W * 0.3, -L / 2], [-W / 2, -L / 2 + L * stern], [-W / 2, L / 2 - L * bow], [-W * 0.36, L / 2 - L * bow * 0.5]];
const inset = (pts, f, g = f) => pts.map(([x, y]) => [x * f, y * g]);

const C = { black: [38, 36, 36], white: [246, 244, 236], cream: [236, 226, 198], wood: [122, 92, 64], deck: [196, 168, 124], sail: [240, 234, 214], brick: [150, 78, 60],
  red: [168, 52, 40], green: [36, 110, 84], silver: [198, 204, 208], rust: [128, 62, 44], navy: [34, 52, 84], grey: [150, 152, 150], olive: [98, 104, 70], yellow: [232, 190, 60], steel: [88, 96, 104] };
const CONTAINERS = [[176, 58, 46], [40, 92, 150], [226, 226, 220], [44, 128, 96], [224, 150, 44], [110, 60, 44], [70, 150, 180]];

// ---------- models. Each returns smoke emitters as [x, y, z, strength] in local metres ----------
const MODELS = {
  canoe(out, o) {
    poly(out, o, hull(11, 1.5, 0.42, 0.4), 0, 0.7, [84, 56, 40]);
    for (const y of [-2.5, 0, 2.5]) box(out, o, -0.3, y - 0.3, 0.3, y + 0.3, 0.7, 0.9, [60, 44, 36]);
  },
  schooner(out, o) {
    const H = hull(31, 7.4, 0.36, 0.1);
    poly(out, o, H, 0, 3, [52, 46, 42]); poly(out, o, inset(H, 0.88, 0.95), 3, 0.25, C.deck);
    box(out, o, -1.6, -11, 1.6, -6, 3.2, 2, C.cream);
    for (const y of [5.5, -5]) { box(out, o, -0.3, y - 0.3, 0.3, y + 0.3, 3, 25, C.wood); box(out, o, -0.18, y - 9.5, 0.18, y - 0.5, 6.5, 15, C.sail); }
    poly(out, o, [[-0.15, 7], [0.15, 7], [0.15, 19.5], [-0.15, 19.5]], 5, 9, C.sail);
    box(out, o, -0.2, 15, 0.2, 21, 3, 0.4, C.wood);
  },
  bark(out, o, v) {
    const H = hull(58, 10.5, 0.3, 0.1), dark = v === 'navy';
    poly(out, o, H, 0, 4.2, dark ? [30, 30, 32] : [56, 44, 38]);
    if (dark) poly(out, o, inset(H, 1.01, 1.002), 2.4, 0.8, C.white);
    poly(out, o, inset(H, 0.9, 0.96), 4.2, 0.3, C.deck);
    box(out, o, -2.2, -22, 2.2, -14, 4.4, 2.4, C.cream);
    for (const [y, m] of [[15, 1], [-1, 1.08], [-16, 0.86]]) {
      box(out, o, -0.38, y - 0.38, 0.38, y + 0.38, 4.2, 36 * m, C.wood);
      box(out, o, -9 * m, y + 0.5, 9 * m, y + 0.95, 9, 9 * m, C.sail); box(out, o, -7.4 * m, y + 0.5, 7.4 * m, y + 0.95, 19 * m + 1, 8 * m, C.sail); box(out, o, -5.4 * m, y + 0.5, 5.4 * m, y + 0.95, 28 * m + 1, 6 * m, C.sail);
    }
    box(out, o, -0.25, 27, 0.25, 39, 4.2, 0.5, C.wood);
  },
  steamer(out, o, v) {
    const H = hull(44, 8.6, 0.32, 0.12);
    poly(out, o, H, 0, 2.6, C.white); poly(out, o, inset(H, 1.01, 1.003), 0, 0.9, [70, 40, 34]);
    poly(out, o, inset(H, 0.84, 0.8), 2.6, 3, C.white); poly(out, o, inset(H, 0.86, 0.82), 5.6, 0.25, [150, 60, 46]);
    box(out, o, -2.2, 7, 2.2, 12, 5.8, 2.6, C.cream);
    poly(out, o, ngon(1.15, 8, 0, 0), 5.8, 7.5, C.black); poly(out, o, ngon(1.2, 8, 0, 0), 12.2, 0.9, C.red);
    box(out, o, -0.2, 16, 0.2, 16.4, 2.6, 11, C.wood);
    if (v === 'wheel') { box(out, o, -4, -27, 4, -21.5, 0.3, 4.6, C.red); box(out, o, -4.3, -22, 4.3, -21.2, 0, 5.4, C.white); }
    return [[0, 0, 14, 1]];
  },
  kalakala(out, o) {
    const H = [[0, 42], [5, 39], [8, 32], [8.5, 0], [8.5, -34], [5, -41], [-5, -41], [-8.5, -34], [-8.5, 0], [-8, 32], [-5, 39]];
    poly(out, o, H, 0, 5, C.silver); poly(out, o, inset(H, 0.93, 0.93), 5, 3.4, [210, 214, 218]); poly(out, o, inset(H, 0.74, 0.78), 8.4, 2.8, C.silver);
    poly(out, o, ngon(3.2, 10, 0, 22), 11.2, 2.4, [214, 218, 220]); poly(out, o, ngon(1.5, 8, 0, -6), 11.2, 4, C.silver);
    return [[0, -6, 15.5, 0.5]];
  },
  ferry(out, o) {
    const H = [[0, 56], [8, 50], [12, 38], [12, -38], [8, -50], [0, -56], [-8, -50], [-12, -38], [-12, 38], [-8, 50]];
    poly(out, o, H, 0, 5.2, C.white); poly(out, o, inset(H, 1.006, 1.002), 3.2, 0.9, C.green); poly(out, o, inset(H, 1.004, 1.001), 0, 1.4, [44, 46, 50]);
    poly(out, o, inset(H, 0.9, 0.78), 5.2, 5.6, C.white); poly(out, o, inset(H, 0.92, 0.8), 7.4, 0.8, [70, 96, 110]);
    poly(out, o, inset(H, 0.7, 0.5), 10.8, 2.6, C.white);
    for (const y of [26, -26]) box(out, o, -4.5, y - 3, 4.5, y + 3, 13.4, 3, C.white);
    for (const y of [5, -5]) { poly(out, o, ngon(1.8, 8, 0, y), 13.4, 5, C.white); poly(out, o, ngon(1.85, 8, 0, y), 17, 1.4, C.green); }
  },
  freighter(out, o) {
    const H = hull(128, 17.5, 0.2, 0.1);
    poly(out, o, H, 0, 8, C.black); poly(out, o, inset(H, 1.004, 1.001), 0, 2.4, C.rust); poly(out, o, inset(H, 0.93, 0.97), 8, 0.4, [150, 84, 60]);
    box(out, o, -7, -12, 7, 8, 8.4, 7.5, C.white); box(out, o, -5.5, -2, 5.5, 7, 15.9, 3, C.white);
    poly(out, o, ngon(2.3, 8, 0, -6), 15.9, 9, C.black); poly(out, o, ngon(2.35, 8, 0, -6), 21, 2, C.red);
    for (const y of [38, 22, -30, -46]) { box(out, o, -0.5, y - 0.5, 0.5, y + 0.5, 8.4, 18, C.yellow); box(out, o, -5, y + 3, 5, y + 13, 8.4, 1.6, [110, 104, 96]); }
    return [[0, -6, 25.5, 1.3]];
  },
  container(out, o, v, seed) {
    const H = hull(262, 32, 0.16, 0.06);
    poly(out, o, H, 0, 12, C.navy); poly(out, o, inset(H, 1.003, 1.001), 0, 3, C.rust);
    let k = seed * 7;
    for (let y = 104; y > -70; y -= 14.5) for (let x = -13.5; x < 13; x += 9) {
      const hgt = 5 + (hash(k) % 4) * 2.6, taper = y > 84 ? 0.7 : 1; k++;
      box(out, o, x * taper, y - 13, (x + 8.6) * taper, y, 12, hgt, CONTAINERS[hash(k * 3) % CONTAINERS.length]);
    }
    box(out, o, -14, -108, 14, -90, 12, 24, C.white); box(out, o, -16, -106, 16, -100, 33, 3, C.white);
    poly(out, o, ngon(3, 8, 0, -116), 12, 22, [50, 70, 110]);
    return [[0, -116, 35, 0.8]];
  },
  cruise(out, o) {
    const H = hull(292, 37, 0.17, 0.05);
    poly(out, o, H, 0, 14, C.white); poly(out, o, inset(H, 1.003, 1.001), 0, 3, C.navy);
    poly(out, o, inset(H, 0.95, 0.86), 14, 9, C.white); poly(out, o, inset(H, 0.955, 0.865), 17, 1.2, [60, 90, 120]); poly(out, o, inset(H, 0.955, 0.865), 20.4, 1.2, [60, 90, 120]);
    poly(out, o, inset(H, 0.86, 0.72), 23, 6, C.white); poly(out, o, inset(H, 0.7, 0.5), 29, 4, C.white);
    poly(out, o, [[-5, -70], [5, -70], [4, -50], [-4, -50]], 33, 11, [30, 60, 110]);
    for (let y = -90; y < 80; y += 22) box(out, o, 16.8, y, 19.2, y + 11, 15, 3.2, [232, 150, 50]);
    for (let y = -90; y < 80; y += 22) box(out, o, -19.2, y, -16.8, y + 11, 15, 3.2, [232, 150, 50]);
  },
  tug(out, o) {
    const H = hull(26, 8, 0.34, 0.2);
    poly(out, o, H, 0, 3, C.black); box(out, o, -2.6, -2, 2.6, 7, 3, 3, C.red); box(out, o, -2, 2, 2, 6, 6, 2.4, C.white);
    poly(out, o, ngon(0.9, 8, 0, -0.5), 6, 4, C.black);
    // log raft in tow
    for (let x = -11; x <= 11; x += 2.2) box(out, o, x, -92, x + 1.5, -34, 0, 0.7, [120, 88, 58]);
    return [[0, -0.5, 10.5, 0.7]];
  },
  // rail vehicles are one car per call
  steamloco(out, o) {
    box(out, o, -1.5, -8, 1.5, 9, 0, 1, C.black); poly(out, o, [[-1.25, -2], [1.25, -2], [1.25, 8.5], [-1.25, 8.5]], 1, 2.5, [44, 44, 46]);
    box(out, o, -1.55, -8, 1.55, -2.2, 1, 3.6, C.black); poly(out, o, ngon(0.55, 8, 0, 6.6), 3.5, 1.8, C.black); poly(out, o, ngon(0.5, 8, 0, 2.5), 3.5, 0.8, [150, 120, 50]);
    poly(out, o, [[-1.5, 9], [1.5, 9], [0, 11.3]], 0, 1.2, C.red);
    return [[0, 6.6, 6, 1]];
  },
  tender(out, o) { box(out, o, -1.5, -5, 1.5, 5, 0.6, 3, C.black); },
  boxcar(out, o, v, seed) { const c = [[128, 60, 44], [110, 70, 50], [74, 78, 70], [142, 84, 52]][seed % 4]; box(out, o, -1.5, -6.6, 1.5, 6.6, 0.8, 3.4, c); },
  coalcar(out, o) { box(out, o, -1.5, -5.5, 1.5, 5.5, 0.8, 2, [60, 58, 56]); box(out, o, -1.2, -5, 1.2, 5, 2.8, 0.7, [24, 24, 26]); },
  coach(out, o) { box(out, o, -1.5, -11, 1.5, 11, 0.8, 3, [52, 78, 58]); box(out, o, -1.1, -10, 1.1, 10, 3.8, 0.6, [70, 66, 60]); box(out, o, -1.53, -10, 1.53, 10, 2.2, 0.8, [226, 214, 170]); },
  diesel(out, o) { box(out, o, -1.55, -10, 1.55, 10, 0.8, 3.6, [226, 110, 34]); box(out, o, -1.57, -10, 1.57, 10, 1.8, 0.7, [34, 60, 44]); box(out, o, -1.55, 6, 1.55, 9.5, 4.4, 0.5, [34, 60, 44]); return [[0, 0, 5, 0.25]]; },
  wellcar(out, o, v, seed) { box(out, o, -1.4, -9, 1.4, 9, 0.5, 0.6, [60, 60, 64]); box(out, o, -1.25, -8.6, 1.25, 8.6, 1.1, 2.6, CONTAINERS[seed % 7]); if (seed % 3) box(out, o, -1.25, -8.6, 1.25, 8.6, 3.7, 2.6, CONTAINERS[(seed * 5 + 2) % 7]); },
  // aircraft
  biplane(out, o) {
    box(out, o, -0.5, -4.5, 0.5, 3.5, 1.4, 1.1, C.cream); box(out, o, -6.5, 0.2, 6.5, 2, 1.3, 0.2, [226, 206, 150]); box(out, o, -6.5, 0.2, 6.5, 2, 3.1, 0.2, [226, 206, 150]);
    box(out, o, -1.8, -4.6, 1.8, -3.5, 2, 0.15, C.cream); box(out, o, -0.08, -4.6, 0.08, -3.3, 2, 1.5, C.cream);
    for (const x of [-1.6, 1.6]) box(out, o, x - 0.35, -3, x + 0.35, 4, 0, 0.6, C.wood);
  },
  prop(out, o) {
    poly(out, o, [[0, 10], [1.3, 8], [1.3, -6], [0.4, -10], [-0.4, -10], [-1.3, -6], [-1.3, 8]], 0.8, 2.4, C.silver);
    poly(out, o, [[-14, 0.5], [-14, 2.2], [-1.3, 5], [1.3, 5], [14, 2.2], [14, 0.5], [1.3, 0], [-1.3, 0]], 1.2, 0.4, [186, 192, 196]);
    box(out, o, -4.6, -10, 4.6, -8, 2.4, 0.3, C.silver); box(out, o, -0.12, -10, 0.12, -6.6, 3.2, 3.4, C.silver);
    for (const x of [-4.6, 4.6]) box(out, o, x - 0.7, 3, x + 0.7, 6.4, 0.9, 1.3, [70, 72, 76]);
  },
  b17(out, o) {
    poly(out, o, [[0, 11.5], [1.2, 9.5], [1.2, -7], [0.5, -11.2], [-0.5, -11.2], [-1.2, -7], [-1.2, 9.5]], 1, 2.5, C.olive);
    poly(out, o, [[-15.8, 1], [-15.8, 2.8], [-1.2, 6], [1.2, 6], [15.8, 2.8], [15.8, 1], [1.2, 0.5], [-1.2, 0.5]], 1.4, 0.45, [108, 112, 76]);
    box(out, o, -6.5, -11, 6.5, -8.6, 2.6, 0.3, C.olive); poly(out, o, [[-0.14, -11], [0.14, -11], [0.14, -5], [-0.14, -5]], 3.5, 4.4, C.olive);
    for (const x of [-9.4, -4.8, 4.8, 9.4]) box(out, o, x - 0.75, 3.5, x + 0.75, 7.4, 1.1, 1.4, [58, 58, 54]);
  },
  jet(out, o, v) {
    const k = v === 'wide' ? 1.45 : 1, body = v === 'wide' ? C.white : [236, 236, 232];
    poly(out, o, [[0, 22 * k], [1.5 * k, 19 * k], [1.9 * k, 14 * k], [1.9 * k, -15 * k], [0.6 * k, -22 * k], [-0.6 * k, -22 * k], [-1.9 * k, -15 * k], [-1.9 * k, 14 * k], [-1.5 * k, 19 * k]], 1.6, 3.8 * k, body);
    poly(out, o, [[1.9 * k, 6 * k], [20 * k, -9 * k], [20 * k, -12 * k], [1.9 * k, -4 * k], [-1.9 * k, -4 * k], [-20 * k, -12 * k], [-20 * k, -9 * k], [-1.9 * k, 6 * k]], 2.2, 0.6, C.grey);
    poly(out, o, [[0.8 * k, -15 * k], [7.5 * k, -21 * k], [7.5 * k, -23 * k], [-7.5 * k, -23 * k], [-7.5 * k, -21 * k], [-0.8 * k, -15 * k]], 4.6, 0.4, C.grey);
    poly(out, o, [[-0.2, -22 * k], [0.2, -22 * k], [0.2, -14 * k], [-0.2, -14 * k]], 5.4 * k, 7 * k, v === 'wide' ? [30, 70, 130] : [150, 40, 40]);
    for (const x of [-12, -6.5, 6.5, 12]) if (v !== 'wide' || Math.abs(x) < 8) box(out, o, x * k - 0.9 * k, -6 * k - Math.abs(x) * 0.25, x * k + 0.9 * k, -1 * k - Math.abs(x) * 0.25, 0.7, 1.5 * k, [80, 84, 90]);
  },
  floatplane(out, o) {
    box(out, o, -0.65, -4.6, 0.65, 4.4, 1.7, 1.5, C.yellow); box(out, o, -7.3, 0.4, 7.3, 2.2, 3.2, 0.25, C.white);
    box(out, o, -2.2, -4.8, 2.2, -3.8, 2.6, 0.15, C.white); box(out, o, -0.08, -4.8, 0.08, -3.4, 2.6, 1.6, C.yellow);
    for (const x of [-1.5, 1.5]) box(out, o, x - 0.4, -3.2, x + 0.4, 4.6, 0, 0.8, C.silver);
  },
};

// ---------- routes ----------
function makeRoute(pts, loop) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * kx(pts[i][1]), (pts[i][1] - pts[i - 1][1]) * KY));
  return { pts, cum, len: cum[cum.length - 1], loop };
}
function at(r, d) {
  d = Math.max(0, Math.min(r.len, d));
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= d) lo = m; else hi = m; }
  const f = (d - r.cum[lo]) / Math.max(1e-6, r.cum[hi] - r.cum[lo]), a = r.pts[lo], b = r.pts[hi];
  const head = (Math.atan2((b[0] - a[0]) * kx(a[1]), (b[1] - a[1]) * KY) * 180) / Math.PI;
  return { lon: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, z: (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * f, head };
}
// ping-pong (ships, trains) or loop (aircraft): distance along the route and direction of travel
function travel(r, t, v, phase) {
  if (r.loop) return { d: (t * v + phase * r.len) % r.len, dir: 1 };
  const d = (t * v + phase * 2 * r.len) % (2 * r.len);
  return d <= r.len ? { d, dir: 1 } : { d: 2 * r.len - d, dir: -1 };
}

const AIR = {
  seatac: [[-122.3400, 47.7400, 2100], [-122.3260, 47.6100, 1200], [-122.3110, 47.5000, 330], [-122.3079, 47.4638, 6], [-122.3079, 47.4315, 6], [-122.3079, 47.4050, 520], [-122.3000, 47.2900, 2500]],
  boeing: [[-122.3600, 47.6800, 1000], [-122.3290, 47.5900, 400], [-122.3110, 47.5425, 5], [-122.2945, 47.5195, 5], [-122.2760, 47.4900, 520], [-122.2300, 47.3900, 2000]],
  union: [[-122.3200, 47.7100, 600], [-122.3300, 47.6650, 170], [-122.3345, 47.6440, 0.5], [-122.3368, 47.6300, 0.5]],
};
// [model, variant, route, from, to, count, speed m/s (already exaggerated), class, consist]
const FLEET = [
  ['canoe', 0, 'canoe_bay', 1851, 1886, 3, 30, 'boat'], ['canoe', 0, 'canoe_shilshole', 1851, 1882, 2, 30, 'boat'], ['canoe', 0, 'canoe_lake', 1851, 1890, 2, 30, 'boat'],
  ['schooner', 0, 'alki', 1851.86, 1858, 1, 45, 'ship'], ['schooner', 0, 'sound_north', 1852.3, 1908, 2, 60, 'ship'], ['schooner', 0, 'sound_south', 1853.2, 1900, 2, 60, 'ship'],
  ['bark', 0, 'sound_north', 1858, 1916, 2, 65, 'ship'], ['bark', 0, 'duwamish', 1872, 1912, 1, 55, 'ship'],
  ['steamer', 'wheel', 'alki', 1869, 1921, 1, 70, 'ship'], ['steamer', 0, 'bainbridge', 1880, 1938, 2, 90, 'ship'], ['steamer', 0, 'sound_south', 1874, 1931, 2, 105, 'ship'],
  ['steamer', 0, 'sound_north', 1882, 1936, 1, 100, 'ship'], ['steamer', 'wheel', 'lakewa_bellevue', 1886, 1941, 1, 60, 'ship'], ['steamer', 0, 'lakewa_kirkland', 1890, 1950.7, 1, 65, 'ship'],
  ['steamer', 0, 'vashon', 1892, 1951.4, 1, 60, 'ship'],
  ['kalakala', 0, 'bremerton', 1935.5, 1967.8, 1, 110, 'ship'],
  ['ferry', 0, 'bainbridge', 1951.4, 9999, 2, 110, 'ship'], ['ferry', 0, 'bremerton', 1951.4, 9999, 1, 110, 'ship'], ['ferry', 0, 'vashon', 1951.4, 9999, 1, 80, 'ship'],
  ['freighter', 0, 'duwamish', 1901, 1974, 2, 70, 'ship'], ['freighter', 0, 'sound_north', 1908, 1978, 1, 85, 'ship'], ['freighter', 0, 'sound_south', 1915, 1972, 1, 85, 'ship'],
  ['tug', 0, 'sound_south', 1899, 1985, 1, 40, 'ship'],
  ['container', 0, 'duwamish', 1964.5, 9999, 2, 75, 'ship'], ['container', 0, 'sound_south', 1972, 9999, 1, 95, 'ship'],
  ['cruise', 0, 'cruise', 1999.5, 9999, 1, 80, 'ship'],
  ['train', 'steam', 'rail_south', 1884.45, 1954, 5, 150, 'rail', ['steamloco', 'tender', 'coalcar', 'coalcar', 'boxcar', 'boxcar', 'coach', 'coach']],
  ['train', 'steam', 'rail_north', 1893.02, 1954, 3, 150, 'rail', ['steamloco', 'tender', 'coach', 'coach', 'coach', 'boxcar', 'boxcar']],
  ['train', 'diesel', 'rail_south', 1954, 9999, 4, 170, 'rail', ['diesel', 'diesel', 'wellcar', 'wellcar', 'wellcar', 'wellcar', 'boxcar', 'wellcar', 'wellcar', 'wellcar']],
  ['train', 'diesel', 'rail_north', 1954, 9999, 2, 170, 'rail', ['diesel', 'diesel', 'wellcar', 'wellcar', 'boxcar', 'wellcar', 'wellcar', 'wellcar']],
  ['biplane', 0, 'union', 1916.54, 1931, 1, 260, 'air'],
  ['prop', 0, 'boeing', 1928.57, 1941.9, 1, 520, 'air'], ['b17', 0, 'boeing', 1941.9, 1945.7, 4, 560, 'air'], ['prop', 0, 'boeing', 1945.7, 1954.5, 1, 520, 'air'], ['jet', 0, 'boeing', 1954.54, 9999, 1, 800, 'air'],
  ['prop', 0, 'seatac', 1947, 1960, 2, 560, 'air'], ['jet', 0, 'seatac', 1958.8, 1971, 2, 850, 'air'], ['jet', 0, 'seatac', 1971, 9999, 3, 850, 'air'], ['jet', 'wide', 'seatac', 1970, 9999, 3, 850, 'air'],
  ['floatplane', 0, 'union', 1946, 9999, 2, 300, 'air'],
];
// runways: [from, width m, [lon, lat], [lon, lat]] (hand-placed, approximate)
const RUNWAYS = [[1928.57, 60, [-122.3110, 47.5425], [-122.2945, 47.5195]], [1944.8, 60, [-122.3079, 47.4638], [-122.3079, 47.4315]],
  [1970, 60, [-122.3110, 47.4636], [-122.3110, 47.4380]], [2008.9, 60, [-122.3180, 47.4638], [-122.3180, 47.4405]]];
// road traffic: [route, from, vehicles per km, speed]
const TRAFFIC = [['sr99', 1932.14, 5, 190], ['i90', 1940.5, 5, 260], ['sr520', 1963.66, 6, 260], ['i405', 1965.5, 5, 280], ['i5', 1967.08, 7, 280]];

// ---------- landmarks ----------
function stack(out, o, levels, n, color) { for (const [z0, z1, r, c] of levels) poly(out, o, ngon(r, n), z0, z1 - z0, c || color); }
const LANDMARKS = [
  { from: 1853.2, to: 1889.44, lon: -122.3353, lat: 47.6019, head: 268, draw(out, o, t, smoke) {
    box(out, o, -7, -20, 7, 20, 0, 6, [124, 98, 70]); box(out, o, -7.6, -20.6, 7.6, 20.6, 6, 0.5, [86, 76, 66]); box(out, o, -3, -20, 3, 20, 6.5, 1.6, [92, 80, 68]);
    box(out, o, 8, -8, 16, 4, 0, 4.5, [112, 90, 66]); poly(out, o, ngon(1.1, 8, 12, -2), 0, 17, C.brick);
    box(out, o, -6, 20, 6, 135, 0, 1.6, [172, 152, 122]); box(out, o, -18, 96, 18, 135, 0, 1.6, [172, 152, 122]);
    for (let i = 0; i < 16; i++) box(out, o, -34 + (i % 4) * 5, 24 + Math.floor(i / 4) * 13, -30.6 + (i % 4) * 5, 36 + Math.floor(i / 4) * 13, 0, 0.9, [118, 84, 54]);
    for (let i = 0; i < 9; i++) box(out, o, 18 + (i % 3) * 7, -20 + Math.floor(i / 3) * 9, 23 + (i % 3) * 7, -13 + Math.floor(i / 3) * 9, 0, 2 + (i % 2), [214, 184, 130]);
    smoke.push([12, -2, 18, 1.6]);
  } },
  { from: 1855.85, to: 1873, lon: -122.3349, lat: 47.6033, head: 328, draw(out, o) { box(out, o, -4, -4, 4, 4, 0, 3.6, [104, 84, 62]); box(out, o, -5, -5, 5, 5, 3.6, 3.2, [112, 90, 66]); box(out, o, -5.4, -5.4, 5.4, 5.4, 6.8, 0.5, [80, 70, 60]); } },
  // sloop-of-war Decatur at anchor during the Battle of Seattle
  { from: 1855.76, to: 1856.6, lon: -122.3442, lat: 47.6032, head: 350, ship: true, draw(out, o, t, smoke, year) { MODELS.bark(out, o, 'navy'); if (year > 1856.04 && year < 1856.12) for (const y of [-12, 0, 12]) if (Math.sin(t * 3 + y) > 0.2) smoke.push([7, y, 4, 0.9]); } },
  // the Exact, off Alki
  { from: 1851.84, to: 1851.93, lon: -122.4165, lat: 47.5825, head: 200, ship: true, draw(out, o) { MODELS.schooner(out, o); } },
  { from: 1861.84, to: 1908.5, lon: -122.3353, lat: 47.6083, head: 238, draw(out, o) {
    box(out, o, -12, -8, 12, 8, 0, 9, C.white); box(out, o, -12.6, -8.6, 12.6, 8.6, 9, 0.6, [120, 112, 104]); box(out, o, -9, -5, 9, 5, 9.6, 1.6, [110, 104, 98]);
    box(out, o, -5.5, 8, 5.5, 11.5, 0, 0.6, C.white); for (const x of [-4.6, -1.6, 1.6, 4.6]) poly(out, o, ngon(0.45, 6, x, 10.8), 0.6, 7.6, C.white);
    box(out, o, -5.8, 8, 5.8, 11.8, 8.2, 1.2, C.white); poly(out, o, ngon(2, 8), 11.2, 3.4, C.white); poly(out, o, ngon(1.4, 8), 14.6, 1.6, [110, 104, 98]);
  } },
  // Denny (Washington) Hotel on top of Denny Hill
  { from: 1890.5, to: 1906.6, lon: -122.34035, lat: 47.61196, head: 328, hill: true, draw(out, o) {
    box(out, o, -16, -47, 16, 47, -9, 9, [196, 170, 128]);
    box(out, o, -14, -45, 14, 45, 0, 20, [150, 96, 76]); box(out, o, -14.6, -45.6, 14.6, 45.6, 20, 1, [80, 70, 66]); box(out, o, -9, -40, 9, 40, 21, 4, [92, 78, 72]);
    for (const y of [-45, 0, 45]) { poly(out, o, ngon(7, 8, 0, y), 0, 29, [162, 104, 82]); poly(out, o, ngon(5, 8, 0, y), 29, 5, [88, 76, 70]); poly(out, o, ngon(2.4, 8, 0, y), 34, 5, [88, 76, 70]); }
  } },
  { from: 1962.3, to: 9999, lon: -122.34930, lat: 47.62051, head: 0, draw(out, o, t, smoke, year) {
    const lv = [];
    for (let z = 0; z < 136; z += 8) { const f = Math.max(0, 1 - z / 112); lv.push([z, z + 8, 3.6 + 15 * f ** 2.1 + (z > 112 ? (z - 112) * 0.12 : 0)]); }
    const halo = year < 1968 ? [232, 150, 50] : year < 2000 ? [226, 196, 110] : C.white;
    lv.push([136, 141, 8], [141, 145, 13], [145, 149, 18, halo], [149, 152, 21, halo], [152, 155.5, 20.5], [155.5, 158.5, 17, [70, 80, 90]], [158.5, 161, 20, halo], [161, 164, 13], [164, 167, 7], [167, 184, 1.1, [210, 90, 60]]);
    stack(out, o, lv, 12, [240, 238, 230]);
  } },
  { from: 1976.24, to: 2000.23, lon: -122.3316, lat: 47.5952, head: 0, draw(out, o) {
    const lv = [[0, 30, 101]];
    for (let i = 0; i < 9; i++) { const a0 = (i / 9) * 1.45, a1 = ((i + 1) / 9) * 1.45; lv.push([30 + 46 * Math.sin(a0), 30 + 46 * Math.sin(a1), 100 * Math.cos(a0) ** 0.8]); }
    stack(out, o, lv, 28, [196, 192, 184]); poly(out, o, ngon(5, 8), 76, 3, [170, 166, 160]);
  } },
  // the Great Wheel on Pier 57
  { from: 2012.5, to: 9999, lon: -122.3425, lat: 47.6061, head: 58, draw(out, o, t) {
    box(out, o, -1.2, -3, 1.2, 3, 0, 30, C.white);
    for (let i = 0; i < 21; i++) { const a = (i / 21) * 6.2832 + t * 0.25, y = 25 * Math.cos(a), z = 30 + 25 * Math.sin(a); box(out, o, -1.3, y - 1.5, 1.3, y + 1.5, z - 1.4, 2.8, i % 2 ? C.white : [200, 214, 226]); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 3.1416 + t * 0.25; const y = 12.5 * Math.cos(a); box(out, o, -0.3, -Math.abs(y) * 2, 0.3, Math.abs(y) * 2, 30 + 12.5 * Math.sin(a) * 0 - 0.3, 0.6, C.white); }
  } },
];
// Alaskan Way Viaduct, 1953-2019 (hand-traced, approximate)
const VIADUCT = makeRoute([[-122.3369, 47.5900], [-122.3363, 47.5955], [-122.3361, 47.5990], [-122.3366, 47.6015], [-122.3391, 47.6040], [-122.3413, 47.6065], [-122.3427, 47.6083], [-122.3449, 47.6106], [-122.3479, 47.6136]]);

export function createScene(data, ground) {
  const routes = {};
  for (const k in data.routes) if (data.routes[k]) routes[k] = makeRoute(data.routes[k], false);
  for (const k in AIR) routes[k] = makeRoute(AIR[k], k !== 'union');
  const fleet = FLEET.filter((f) => routes[f[2]]).map((f, i) => ({ model: f[0], variant: f[1], route: routes[f[2]], from: f[3], to: f[4], n: f[5], v: f[6], cls: f[7], consist: f[8], seed: i }));
  const traffic = TRAFFIC.filter((r) => routes[r[0]]).map((r, i) => ({ route: routes[r[0]], from: r[1], per: r[2], v: r[3], seed: i }));
  const CAR = [[226, 226, 220], [60, 62, 68], [150, 40, 36], [44, 74, 120], [200, 200, 204], [30, 30, 32], [176, 150, 90]];

  // prisms + smoke + traffic dots for the given moment
  function build(year, t, zoom, bounds) {
    const prisms = [], smoke = [], cars = [];
    const roads = traffic.filter((r) => year >= r.from).map((r) => r.route.pts);
    const strips = RUNWAYS.filter((r) => year >= r[0]).map((r) => ({ path: [r[2], r[3]], w: r[1] }));
    if (zoom < 10.3) return { prisms, smoke, cars, strips, roads };
    const w = bounds.getWest(), e = bounds.getEast(), s = bounds.getSouth(), n = bounds.getNorth(), padX = (e - w) * 0.15 + 0.01, padY = (n - s) * 0.15 + 0.01;
    const vis = (lon, lat) => lon > w - padX && lon < e + padX && lat > s - padY && lat < n + padY;
    const kShip = Math.max(1, Math.min(2.3, 2 ** (14.4 - zoom))), kAir = Math.max(1.8, Math.min(9, 2 ** (15.6 - zoom))), kRail = Math.max(1.4, Math.min(6, 2 ** (15.7 - zoom)));
    const puff = (o, em, speedTrail, idSeed) => {
      if (!em) return;
      for (const [x, y, z, str] of em) for (let i = 0; i < 7; i++) {
        const age = (t * 0.22 + i / 7 + idSeed * 0.137) % 1, back = -age * speedTrail, drift = age * 14 * o.k;
        const lx = x * o.k, ly = y * o.k + back;
        smoke.push({ p: [o.lon + (lx * o.c + ly * o.s) * o.ikx + drift * 0.6 * o.ikx, o.lat + (-lx * o.s + ly * o.c) / KY + (drift * 0.3) / KY, o.z + (z + age * 26 * str) * o.k], r: (2.2 + age * 9) * str * o.k, a: (1 - age) * 150 });
      }
    };
    for (const f of fleet) {
      if (year < f.from || year >= f.to) continue;
      const k = f.cls === 'air' ? kAir : f.cls === 'rail' ? kRail : f.cls === 'boat' ? kShip * 1.6 : kShip;
      for (let i = 0; i < f.n; i++) {
        const tr = travel(f.route, t, f.v, (i + hash(f.seed * 13 + 1) / 4294967296) / f.n);
        if (f.consist) {
          let d = tr.d;
          for (let c = 0; c < f.consist.length; c++) {
            const p = at(f.route, d);
            if (d > 0 && d < f.route.len && vis(p.lon, p.lat)) {
              const o = frame(p.lon, p.lat, tr.dir > 0 ? p.head : p.head + 180, k);
              puff(o, MODELS[f.consist[c]](prisms, o, 0, hash(f.seed * 31 + i * 7 + c)), 60 * k, f.seed + i);
            }
            d -= tr.dir * (f.consist[c].includes('coach') || f.consist[c] === 'diesel' ? 23.5 : f.consist[c] === 'wellcar' ? 19.5 : f.consist[c] === 'tender' ? 14.5 : 15) * k;
          }
          continue;
        }
        const p = at(f.route, tr.d);
        if (!vis(p.lon, p.lat)) continue;
        // ease in and out of the dock at each end of a ship's run
        const o = frame(p.lon, p.lat, tr.dir > 0 ? p.head : p.head + 180, k, f.cls === 'air' ? p.z : 0);
        puff(o, MODELS[f.model](prisms, o, f.variant, f.seed + i), f.cls === 'ship' ? 40 * k : 0, f.seed * 3 + i);
      }
    }
    for (const L of LANDMARKS) {
      if (year < L.from || year >= L.to || !vis(L.lon, L.lat)) continue;
      const o = frame(L.lon, L.lat, L.head, L.ship ? kShip : 1, L.hill && ground ? ground(L.lon, L.lat, year) : 0), em = [];
      L.draw(prisms, o, t, em, year); puff(o, em, 0, 5);
    }
    if (year >= 1953.25 && year < 2019.45 && zoom >= 12 && vis(-122.339, 47.604)) {
      for (let d = 0; d < VIADUCT.len - 14; d += 14) {
        const p = at(VIADUCT, d + 7), o = frame(p.lon, p.lat, p.head, 1);
        box(prisms, o, -8, -7.6, 8, 7.6, 12.5, 1.6, [150, 148, 142]); box(prisms, o, -8, -7.6, 8, 7.6, 6.2, 1.2, [138, 136, 130]);
        if (Math.round(d / 14) % 2 === 0) for (const x of [-7, 7]) box(prisms, o, x - 0.8, -0.8, x + 0.8, 0.8, 0, 12.5, [128, 126, 120]);
      }
    }
    if (zoom >= 11.5) for (const r of traffic) {
      if (year < r.from) continue;
      const cnt = Math.min(420, Math.round((r.route.len / 1000) * r.per * Math.min(1, 0.35 + (year - r.from) / 30)));
      for (let i = 0; i < cnt; i++) {
        const h = hash(r.seed * 977 + i), dir = i % 2 ? 1 : -1, sp = r.v * (0.8 + (h % 100) / 250);
        let d = ((h % 100000) / 100000) * r.route.len + dir * t * sp; d = ((d % r.route.len) + r.route.len) % r.route.len;
        const p = at(r.route, d);
        if (!vis(p.lon, p.lat)) continue;
        const rad = ((p.head + 90) * Math.PI) / 180, off = dir * 7;
        cars.push({ p: [p.lon + (Math.sin(rad) * off) / kx(p.lat), p.lat + (Math.cos(rad) * off) / KY], c: CAR[h % CAR.length] });
      }
    }
    return { prisms, smoke, cars, strips, roads };
  }
  return { build };
}
