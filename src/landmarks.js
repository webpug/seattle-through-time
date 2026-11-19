// Static hand-built models: the tallest towers (real footprints, Wikipedia heights and completion years,
// stylised massing), stadiums, the Spheres, Climate Pledge Arena and the port's container cranes.
import { frame, poly, box, ngon, kx, KY } from './scene.js';

const GREEN = [78, 142, 72];
// band between two ellipses from angle t0 to t1 (degrees clockwise from +y), as one polygon
function cband(out, o, a0, b0, a1, b1, t0, t1, z, h, c, cx = 0, cy = 0) {
  const pts = [], n = Math.max(6, Math.round((t1 - t0) / 9));
  for (let i = 0; i <= n; i++) { const t = ((t0 + ((t1 - t0) * i) / n) * Math.PI) / 180; pts.push([cx + a1 * Math.sin(t), cy + b1 * Math.cos(t)]); }
  for (let i = n; i >= 0; i--) { const t = ((t0 + ((t1 - t0) * i) / n) * Math.PI) / 180; pts.push([cx + a0 * Math.sin(t), cy + b0 * Math.cos(t)]); }
  poly(out, o, pts, z, h, c);
}
function dome(out, o, cx, cy, r, hgt, c0, c1) {
  for (let i = 0; i < 7; i++) { const a0 = (i / 7) * 1.5, a1 = ((i + 1) / 7) * 1.5; poly(out, o, ngon(r * Math.cos(a0), 14, cx, cy), hgt * Math.sin(a0), hgt * (Math.sin(a1) - Math.sin(a0)), i % 2 ? c1 : c0); }
}

// ---------- towers ----------
function towerKit(out, T) {
  const lat0 = T.ring.reduce((s, p) => s + p[1], 0) / T.ring.length, lon0 = T.ring.reduce((s, p) => s + p[0], 0) / T.ring.length, K = kx(lat0);
  const P = T.ring.map(([x, y]) => [(x - lon0) * K, (y - lat0) * KY]);
  let best = 0, ux = 1, uy = 0;
  for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = dx * dx + dy * dy; if (l > best) { best = l; ux = dx; uy = dy; } }
  const l = Math.sqrt(best) || 1; ux /= l; uy /= l;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  const Q = P.map(([x, y]) => { const pu = x * ux + y * uy, pv = -x * uy + y * ux; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); return [pu, pv]; });
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, a = (u1 - u0) / 2, b = (v1 - v0) / 2;
  const W = (pu, pv, z) => { const x = pu * ux - pv * uy, y = pu * uy + pv * ux; return [lon0 + x / K, lat0 + y / KY, z]; };
  // E: the real footprint scaled about the box centre; B: a rectangle in box coordinates (-1..1)
  const E = (z0, z1, c, su = 1, sv = su, du = 0, dv = 0) => out.push({ p: Q.map(([pu, pv]) => W(cu + (pu - cu) * su + du * a, cv + (pv - cv) * sv + dv * b, z0)), h: z1 - z0, c });
  const B = (z0, z1, c, x0, x1, y0, y1) => out.push({ p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => W(cu + x * a, cv + y * b, z0)), h: z1 - z0, c });
  const bands = (z0, z1, step, c, su = 1, sv = su, du = 0, dv = 0) => { for (let z = z0 + step; z < z1 - 1; z += step) E(z, z + 1.3, c, su * 1.014, sv * 1.014, du, dv); };
  return { E, B, bands, H: T.h, east: ux };
}
const STONE = [196, 190, 180];
const STYLES = {
  columbia({ E, bands, H }) { const k = [44, 48, 58], l = [74, 82, 98]; E(0, H * 0.58, k); E(H * 0.58, H * 0.8, k, 0.86, 0.9, 0.12, 0); E(H * 0.8, H, k, 0.66, 0.8, 0.26, 0); bands(0, H * 0.58, 13, l); bands(H * 0.58, H * 0.8, 13, l, 0.86, 0.9, 0.12, 0); bands(H * 0.8, H, 13, l, 0.66, 0.8, 0.26, 0); },
  rainier_sq({ E, bands, H }) { const g = [124, 156, 184]; for (let i = 0; i < 12; i++) { const su = 1 - 0.52 * (i / 11) ** 1.5; E((H * 0.5 * i) / 12, (H * 0.5 * (i + 1)) / 12, g, su, 0.92, 1 - su, 0); } E(H * 0.5, H, g, 0.48, 0.92, 0.52, 0); bands(H * 0.5, H, 12, [160, 188, 210], 0.48, 0.92, 0.52, 0); },
  '1201third'({ E, bands, H }) { const s = [200, 182, 164], g = [100, 130, 166]; E(0, 22, s); E(22, H * 0.8, s, 0.8); bands(22, H * 0.8, 9, g, 0.8); for (let i = 0; i < 6; i++) E(H * (0.8 + i * 0.033), H * (0.8 + (i + 1) * 0.033), i % 2 ? g : s, 0.8 * (1 - i * 0.15)); },
  twounion({ E, bands, H }) { const g = [122, 148, 174]; E(0, H * 0.86, g); E(H * 0.86, H * 0.94, g, 0.9); E(H * 0.94, H, g, 0.7); bands(0, H * 0.86, 11, [156, 180, 200]); },
  municipal({ E, bands, H }) { const s = [158, 122, 110], g = [96, 118, 142]; E(0, 30, s); E(30, H * 0.87, s, 0.62, 0.76); bands(30, H * 0.87, 10, g, 0.62, 0.76); E(H * 0.87, H * 0.93, s, 0.62, 0.6); E(H * 0.93, H * 0.97, s, 0.62, 0.42); E(H * 0.97, H, s, 0.62, 0.2); },
  f5({ E, bands, H }) { const g = [62, 76, 96]; E(0, H * 0.68, g); E(H * 0.68, H * 0.84, g, 0.9, 1, 0.1, 0); E(H * 0.84, H * 0.93, g, 0.76, 0.94, 0.24, 0); E(H * 0.93, H, g, 0.6, 0.86, 0.4, 0); bands(0, H * 0.68, 14, [92, 108, 130]); },
  safeco({ E, bands, H }) { const k = [70, 60, 54]; E(0, 8, STONE); E(8, H, k, 0.74); bands(8, H, 8, [118, 102, 86], 0.74); },
  russell({ E, bands, H }) { const g = [140, 170, 190]; E(0, 34, STONE); E(34, H, g, 0.6, 0.66); bands(34, H, 12, [176, 200, 214], 0.6, 0.66); },
  usbank({ E, bands, H }) { const s = [196, 174, 156], g = [98, 122, 152]; E(0, 26, s); E(26, H * 0.88, s, 0.56, 0.62); bands(26, H * 0.88, 9, g, 0.56, 0.62); E(H * 0.88, H * 0.95, s, 0.48, 0.54); E(H * 0.95, H, g, 0.36, 0.42); },
  wells({ E, bands, H }) { const k = [126, 108, 94]; E(0, H * 0.9, k, 0.84); E(H * 0.9, H, k, 0.62, 0.74, 0.1, 0); bands(0, H * 0.9, 11, [158, 138, 120], 0.84); },
  '800fifth'({ E, bands, H }) { const g = [114, 150, 152]; E(0, 22, STONE); E(22, H, g, 0.62, 0.7); bands(22, H, 12, [150, 182, 182], 0.62, 0.7); },
  '901fifth'({ E, bands, H }) { E(0, H, [58, 58, 62]); bands(0, H, 8, [206, 202, 192]); },
  madison({ E, bands, H }) { const g = [150, 178, 198]; E(0, H * 0.95, g); E(H * 0.95, H, g, 0.8); bands(0, H * 0.95, 13, [186, 206, 220]); },
  qualtrics({ E, bands, H }) { const g = [126, 158, 184]; E(0, 58, [156, 166, 176]); E(58, H, g, 0.7, 0.76); bands(58, H, 12, [164, 190, 208], 0.7, 0.76); },
  doppler({ E, bands, H }) { const g = [114, 144, 162]; E(0, 28, [174, 172, 166]); E(28, H * 0.94, g, 0.62, 0.72); E(H * 0.94, H, [90, 100, 110], 0.5, 0.6); bands(28, H * 0.94, 12, [150, 176, 190], 0.62, 0.72); },
  day1({ E, bands, H }) { const g = [108, 138, 160]; E(0, 26, [174, 172, 166]); E(26, H * 0.94, g, 0.62, 0.72); E(H * 0.94, H, [90, 100, 110], 0.5, 0.6); bands(26, H * 0.94, 12, [146, 172, 190], 0.62, 0.72); },
  reinvent({ E, bands, H }) { const g = [122, 150, 168]; E(0, 30, [174, 172, 166]); E(30, H * 0.5, g, 0.62, 0.72, -0.06, 0); E(H * 0.5, H, g, 0.62, 0.72, 0.06, 0); bands(30, H, 12, [156, 180, 194], 0.63, 0.73); },
  hyatt({ E, bands, H }) { const g = [150, 172, 188]; E(0, 30, STONE); E(30, H, g, 0.52, 0.82); bands(30, H, 11, [184, 200, 212], 0.52, 0.82); },
  rainier_tower({ E, bands, H }) { const w = [218, 214, 204]; for (let i = 0; i < 8; i++) E((37 * i) / 8, (37 * (i + 1)) / 8, w, 0.44 + 0.56 * (i / 7) ** 1.6); E(37, H, w); bands(37, H, 9, [140, 144, 150]); },
  fourthmad({ E, bands, H }) { const g = [150, 164, 176]; E(0, 22, STONE); E(22, H * 0.93, g, 0.8); E(H * 0.93, H, g, 0.62); bands(22, H * 0.93, 12, [182, 194, 204], 0.8); },
  smith({ E, bands, east }) {
    const w = [236, 230, 214], du = (east > 0 ? -1 : 1) * 0.6; // the tower rises over the Second Avenue (west) end
    E(0, 84, w); bands(0, 84, 8, [206, 198, 180]); E(84, 86, [200, 192, 176], 1.03);
    E(86, 122, w, 0.4, 0.86, du, 0); bands(86, 122, 8, [206, 198, 180], 0.4, 0.86, du, 0); E(122, 124, [200, 192, 176], 0.43, 0.9, du, 0);
    for (let i = 0; i < 7; i++) E(124 + i * 2.3, 124 + (i + 1) * 2.3, [226, 220, 206], 0.36 * (1 - i / 7.6), 0.78 * (1 - i / 7.6), du, 0);
    E(140, 141.5, [220, 190, 110], 0.03, 0.06, du, 0);
  },
};

// ---------- everything static, as prisms tagged with the years they stand ----------
export function buildStatic(data) {
  const all = [];
  const add = (from, to, fn) => { const out = []; fn(out); for (const p of out) { p.f = [from, to]; all.push(p); } };
  for (const T of data.towers || []) if (STYLES[T.id]) add(T.year, 1e5, (out) => STYLES[T.id](towerKit(out, T)));

  // Lumen Field (2002)
  add(2002.55, 1e5, (out) => {
    const o = frame(-122.3316, 47.5952, 0);
    box(out, o, -36, -62, 36, 62, 0, 0.6, GREEN);
    for (let k = 0; k < 6; k++) cband(out, o, 42 + k * 10, 68 + k * 10, 52 + k * 10, 78 + k * 10, k < 2 ? 0.5 : 28, k < 2 ? 359.5 : 332, 0, 5 + k * 7, k === 5 ? [196, 196, 192] : k % 2 ? [58, 88, 128] : [42, 66, 106]);
    for (const s of [-1, 1]) for (let j = 0; j < 10; j++) { const y = -110 + j * 22, z = 56 + 17 * (1 - ((y + 11) / 110) ** 2); box(out, o, s > 0 ? 70 : -112, y, s > 0 ? 112 : -70, y + 22, z, 3, [240, 240, 236]); box(out, o, s * 112 - 2, y, s * 112 + 2, y + 22, z + 3, 5, [226, 226, 222]); }
    box(out, o, -9, 128, 9, 141, 0, 58, [204, 204, 200]);
  });
  // T-Mobile Park (1999): home plate to the south-west, roof parked over the tracks to the east
  add(1999.54, 1e5, (out) => {
    const o = frame(-122.3325, 47.5914, 45);
    const fan = [[0, -78]]; for (let t = -45; t <= 45; t += 9) fan.push([125 * Math.sin((t * Math.PI) / 180), -78 + 125 * Math.cos((t * Math.PI) / 180)]);
    poly(out, o, fan, 0, 0.6, GREEN); poly(out, o, [[0, -78], [19, -59], [0, -40], [-19, -59]], 0.6, 0.2, [176, 136, 96]);
    for (let k = 0; k < 4; k++) cband(out, o, 30 + k * 11, 30 + k * 11, 41 + k * 11, 41 + k * 11, 62, 298, 0, 7 + k * 9, k === 3 ? [168, 122, 100] : k % 2 ? [44, 100, 78] : [32, 80, 62], 0, -62);
    cband(out, o, 132, 132, 146, 146, -44, 44, 0, 11, [44, 100, 78], 0, -78);
    const r = frame(-122.3325, 47.5914, 0);
    for (let i = 0; i < 3; i++) box(out, r, 92 + i * 16, -108, 150 + i * 16, 108, 60 + i * 6, 5, [150, 158, 164]);
    for (const y of [-112, 106]) { box(out, r, -120, y, 186, y + 6, 46, 6, [128, 132, 136]); for (let x = -116; x < 186; x += 42) box(out, r, x, y, x + 5, y + 6, 0, 46, [128, 132, 136]); }
  });
  // Washington State Coliseum (1962), KeyArena, Climate Pledge Arena: the pyramid roof has survived every rebuild
  add(1962.3, 1e5, (out) => {
    const o = frame(-122.3540, 47.6221, 0);
    box(out, o, -57, -57, 57, 57, 0, 9, [148, 172, 186]);
    for (let i = 0; i < 10; i++) { const s = 60 * (1 - i / 10.6); box(out, o, -s, -s, s, s, 9 + i * 2.5, 2.5, i % 2 ? [222, 222, 216] : [234, 234, 228]); }
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) poly(out, o, [[x * 62, y * 62], [x * 52, y * 62], [x * 62, y * 52]], 0, 9, [196, 194, 188]);
  });
  // The Spheres (2018)
  add(2018.07, 1e5, (out) => {
    const fp = (data.footprints || {})['Amazon.com The Spheres'];
    let lon = -122.3394, lat = 47.6157, head = 148;
    if (fp) { lon = fp.reduce((s, p) => s + p[0], 0) / fp.length; lat = fp.reduce((s, p) => s + p[1], 0) / fp.length;
      let best = 0; for (const a of fp) for (const b of fp) { const dx = (b[0] - a[0]) * kx(lat), dy = (b[1] - a[1]) * KY, l = dx * dx + dy * dy; if (l > best) { best = l; head = (Math.atan2(dx, dy) * 180) / Math.PI; } } }
    const o = frame(lon, lat, head), g0 = [168, 204, 218], g1 = [222, 234, 238];
    box(out, o, -19, -42, 19, 42, 0, 1.5, [204, 204, 198]);
    dome(out, o, 0, 0, 20, 27, g0, g1); dome(out, o, 0, 27, 16, 21, g1, g0); dome(out, o, 0, -27, 16, 21, g1, g0);
  });
  // Husky Stadium: 1920 bowl open to the lake, south upper deck 1950, north 1987
  const husky = frame(-122.3017, 47.6503, 97), PURPLE = [78, 54, 122];
  add(1920.9, 1e5, (out) => {
    box(out, husky, -34, -60, 34, 60, 0, 0.6, GREEN);
    for (let k = 0; k < 4; k++) cband(out, husky, 42 + k * 8, 70 + k * 8, 50 + k * 8, 78 + k * 8, 38, 322, 0, 5 + k * 5, k % 2 ? [98, 72, 142] : PURPLE);
  });
  const deck = (s) => (out) => {
    for (let k = 0; k < 4; k++) box(out, husky, s > 0 ? 74 + k * 9 : -83 - k * 9, -78, s > 0 ? 83 + k * 9 : -74 - k * 9, 78, 0, 28 + k * 8, k % 2 ? [98, 72, 142] : PURPLE);
    box(out, husky, s > 0 ? 70 : -116, -84, s > 0 ? 116 : -70, 84, 63, 3, [208, 210, 212]); box(out, husky, s > 0 ? 110 : -114, -84, s > 0 ? 114 : -110, 84, 0, 63, [170, 172, 176]);
  };
  add(1950.7, 1e5, deck(1)); add(1987.7, 1e5, deck(-1));
  // container cranes
  for (const [lon, lat, head, from] of data.cranes || []) add(from, 1e5, (out) => {
    const o = frame(lon, lat, head), c = from < 1980 ? [206, 84, 52] : [226, 100, 48], w = [232, 232, 226];
    for (const x of [-13, 13]) for (const y of [-14, 9]) box(out, o, x - 1.2, y - 1.2, x + 1.2, y + 1.2, 0, 46, c);
    box(out, o, -14.2, -15.2, 14.2, -12.8, 20, 2.4, c); box(out, o, -14.2, 7.8, 14.2, 10.2, 20, 2.4, c); box(out, o, -14.2, -15.2, 14.2, 10.2, 46, 3, c);
    box(out, o, -5, -24, 5, -10, 49, 7, w); box(out, o, -2.2, -34, 2.2, 62, 50, 3, c); box(out, o, -1.4, -6, 1.4, -2, 53, 24, c); box(out, o, -3, 28, 3, 34, 44, 6, w);
  });
  return all;
}
