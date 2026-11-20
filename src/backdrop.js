// The world beyond the map: a sea of cloud around King County with the Olympics, the Cascades and Rainier
// rising out of it. The ranges are real elevation data (pipeline/07_backdrop.py) but staged, not surveyed:
// everything outside the mapped rectangle is pulled in to about a third of its true distance and all relief
// is exaggerated, so the mountains read from the city the way they do on a clear day.
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { BitmapLayer, IconLayer } from '@deck.gl/layers';

export const STAGE = [-122.55, 47.07, -121.05, 47.79]; // the mapped rectangle: west, south, east, north
const LON0 = -121.8, LAT0 = 47.43;                      // mesh anchor
const R = 6378137, RAD = Math.PI / 180, C0 = Math.cos(LAT0 * RAD);
const SQUEEZE = 0.36, EX_IN = 1.4, EX_OUT = 1.9;
export const CLOUD = [238, 242, 246];
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const Y0M = mercY(LAT0);
// lon/lat -> metres in the anchor's Mercator-linear frame (what the mesh layer's metre offsets really are)
const mx = (lon) => (lon - LON0) * RAD * R * C0, my = (lat) => (mercY(lat) - Y0M) * R * C0;
const ilon = (x) => LON0 + x / (RAD * R * C0), ilat = (y) => (2 * Math.atan(Math.exp(Y0M + y / (R * C0))) - Math.PI / 2) / RAD;
const SX0 = mx(STAGE[0]), SX1 = mx(STAGE[2]), SY0 = my(STAGE[1]), SY1 = my(STAGE[3]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// signed distance (m) outside the stage outline (King County); negative inside. Built once from the outline
// by rasterising it and running a two-pass chamfer distance transform.
let sdf = null;
function buildSdf(ring) {
  const G = 640, pad = 80000, x0 = SX0 - pad, x1 = SX1 + pad, y0 = SY0 - pad, y1 = SY1 + pad, cell = (x1 - x0) / G, H = Math.ceil((y1 - y0) / cell);
  const cv = document.createElement('canvas'); cv.width = G; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.beginPath();
  ring.forEach(([lon, lat], i) => { const px = (mx(lon) - x0) / cell, py = (y1 - my(lat)) / cell; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.closePath(); ctx.fill();
  const inside = ctx.getImageData(0, 0, G, H).data, out = new Float32Array(G * H), inn = new Float32Array(G * H);
  for (let i = 0; i < G * H; i++) { const m = inside[i * 4 + 3] > 127; out[i] = m ? 0 : 1e9; inn[i] = m ? 1e9 : 0; }
  for (const d of [out, inn]) {
    for (let r = 0; r < H; r++) for (let c = 0; c < G; c++) { const i = r * G + c; let v = d[i];
      if (c > 0) v = Math.min(v, d[i - 1] + 1); if (r > 0) { v = Math.min(v, d[i - G] + 1); if (c > 0) v = Math.min(v, d[i - G - 1] + 1.414); if (c < G - 1) v = Math.min(v, d[i - G + 1] + 1.414); } d[i] = v; }
    for (let r = H - 1; r >= 0; r--) for (let c = G - 1; c >= 0; c--) { const i = r * G + c; let v = d[i];
      if (c < G - 1) v = Math.min(v, d[i + 1] + 1); if (r < H - 1) { v = Math.min(v, d[i + G] + 1); if (c < G - 1) v = Math.min(v, d[i + G + 1] + 1.414); if (c > 0) v = Math.min(v, d[i + G - 1] + 1.414); } d[i] = v; }
  }
  const f = new Float32Array(G * H);
  for (let i = 0; i < G * H; i++) f[i] = (out[i] > 0 ? out[i] - 0.5 : 0.5 - inn[i]) * cell;
  sdf = { f, G, H, x0, y1, cell, x1, y0 };
}
function outside(x, y) {
  const { f, G, H, cell } = sdf, u = clamp((x - sdf.x0) / cell - 0.5, 0, G - 1.001), v = clamp((sdf.y1 - y) / cell - 0.5, 0, H - 1.001);
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * G + i;
  const d = f[k] * (1 - a) * (1 - b) + f[k + 1] * a * (1 - b) + f[k + G] * (1 - a) * b + f[k + G + 1] * a * b;
  // beyond the grid: add the distance to it
  return d + Math.hypot(Math.max(sdf.x0 - x, 0, x - sdf.x1), Math.max(sdf.y0 - y, 0, y - sdf.y1));
}
// value noise
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  const p = hash(i, j), q = hash(i + 1, j), r = hash(i, j + 1), s = hash(i + 1, j + 1);
  return p + (q - p) * a + (r - p) * b + (p - q - r + s) * a * b;
}
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * noise(x * f, y * f); a *= 0.5; f *= 2.03; } return s / (1 - 0.5 ** o); };

// ---------- mountains ----------
function buildMesh(buf) {
  const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const n = h.w * h.h, elev = new Uint16Array(buf.slice(4 + hl, 4 + hl + n * 2)), rel = new Uint16Array(buf.slice(4 + hl + n * 2, 4 + hl + n * 4));
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), far = new Float32Array(n);
  for (let r = 0, i = 0; r < h.h; r++) {
    const y = my(h.y1 - r * h.dy);
    for (let c = 0; c < h.w; c++, i++) {
      const x = mx(h.x0 + c * h.dx), qx = clamp(x, SX0, SX1), qy = clamp(y, SY0, SY1), d = Math.hypot(x - qx, y - qy);
      far[i] = d;
      pos[i * 3] = qx + (x - qx) * SQUEEZE; pos[i * 3 + 1] = qy + (y - qy) * SQUEEZE;
      // fade the relief in from the stage edge so nothing stands in the cloud wall itself
      pos[i * 3 + 2] = rel[i] * (EX_IN + (EX_OUT - EX_IN) * sstep(0, 12000, d)) * (d > 0 ? 0.25 + 0.75 * sstep(0, 9000, d) : 1);
    }
  }
  // colour: forest -> rock -> snow by elevation and steepness, shaded from the north-east like the city, hazed with distance
  const L = [0.33, 0.6, 0.73];
  for (let r = 0, i = 0; r < h.h; r++) for (let c = 0; c < h.w; c++, i++) {
    const a = i - (c > 0 ? 1 : 0), b = i + (c < h.w - 1 ? 1 : 0), u = i - (r > 0 ? h.w : 0), d = i + (r < h.h - 1 ? h.w : 0);
    // normal of the warped surface: cross(east tangent, north tangent)
    const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2];
    const nx0 = pos[u * 3] - pos[d * 3], ny0 = pos[u * 3 + 1] - pos[d * 3 + 1], nz0 = pos[u * 3 + 2] - pos[d * 3 + 2];
    let nx = ey * nz0 - ez * ny0, ny = ez * nx0 - ex * nz0, nz = ex * ny0 - ey * nx0; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), shade = 0.5 + 0.72 * lit;
    const e = elev[i], steep = 1 - nz, z = pos[i * 3 + 2], jit = noise(c * 0.37, r * 0.37);
    let R0 = 86, G0 = 118, B0 = 80;                                             // conifer forest
    const hi = sstep(900, 1500, e + jit * 250); R0 += (62 - R0) * hi * 0.6; G0 += (88 - G0) * hi * 0.6; B0 += (66 - B0) * hi * 0.6;   // darker fir higher up
    const rock = Math.max(sstep(1350, 1750, e + jit * 200), sstep(0.5, 0.75, steep) * sstep(700, 1200, e));
    R0 += (132 - R0) * rock; G0 += (126 - G0) * rock; B0 += (118 - B0) * rock;
    const snow = sstep(1650, 2050, e + jit * 260 - steep * 500 + (ny < 0 ? 140 : 0));  // snow sits lower on north faces
    R0 += (248 - R0) * snow; G0 += (250 - G0) * snow; B0 += (254 - B0) * snow;
    let cr = R0 * shade, cg = G0 * shade, cb = B0 * (shade + (1 - lit) * 0.06 * snow);
    const foot = 1 - sstep(0, 160, z);                                          // meet the flat map in its own forest green
    cr += (112 - cr) * foot; cg += (146 - cg) * foot; cb += (97 - cb) * foot;
    const haze = Math.min(0.4, far[i] / 380000) + (far[i] > 0 ? 0.04 : 0);      // aerial perspective
    col[i * 3] = (cr + (196 - cr) * haze) / 255; col[i * 3 + 1] = (cg + (212 - cg) * haze) / 255; col[i * 3 + 2] = (cb + (230 - cb) * haze) / 255;
  }
  const idx = [];
  for (let r = 0; r < h.h - 1; r++) for (let c = 0; c < h.w - 1; c++) {
    const i = r * h.w + c, j = i + h.w;
    if (!(pos[i * 3 + 2] || pos[i * 3 + 5] || pos[j * 3 + 2] || pos[j * 3 + 5])) continue;
    idx.push(i, j, i + 1, i + 1, j, j + 1);
  }
  return { attributes: { positions: { value: pos, size: 3 }, colors: { value: col, size: 3 } }, indices: { value: new Uint32Array(idx), size: 1 } };
}

// ---------- cloud sheets ----------
// A soft-edged sheet of cloud over everything outside the stage. `inner`/`outer` are where it starts and where it is solid.
function sheet(size, bounds, inner, outer, wobble, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const x0 = mx(bounds[0]), x1 = mx(bounds[2]), y0 = my(bounds[1]), y1 = my(bounds[3]);
  for (let r = 0, k = 0; r < size; r++) {
    const y = y1 + ((r + 0.5) / size) * (y0 - y1);
    for (let c = 0; c < size; c++, k += 4) {
      const x = x0 + ((c + 0.5) / size) * (x1 - x0);
      const big = fbm(x / 9000 + seed, y / 9000 - seed, 4), dist = outside(x, y) + (big - 0.5) * 2 * wobble;
      const a = sstep(inner, outer, dist);
      if (a <= 0) { d[k + 3] = 0; continue; }
      // billows: lit from the north-east, blue-grey in the hollows
      const n1 = fbm(x / 16000 + seed * 3, y / 16000, 5), n2 = fbm((x + 1500) / 16000 + seed * 3, (y + 2600) / 16000, 5);
      const v = clamp(0.62 + (n1 - 0.5) * 0.9 + (n2 - n1) * 3.2, 0, 1);
      d[k] = 196 + (CLOUD[0] + 14 - 196) * v; d[k + 1] = 208 + (CLOUD[1] + 11 - 208) * v; d[k + 2] = 226 + (CLOUD[2] + 8 - 226) * v; d[k + 3] = 255 * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
// billboard puffs: four soft cumulus sprites on one atlas
function puffAtlas() {
  const S = 256, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S;
  const ctx = cv.getContext('2d'), mapping = {};
  for (let k = 0; k < 4; k++) {
    mapping[`p${k}`] = { x: k * S, y: 0, width: S, height: S, anchorY: S * 0.62 };
    for (let pass = 0; pass < 2; pass++) for (let b = 0; b < 11; b++) {
      const u = hash(k * 31 + b, 7), v = hash(k * 17 + b, 11), w = hash(k * 13 + b, 5);
      const cx = k * S + S * (0.24 + 0.52 * u), cy = S * (0.5 + 0.2 * (v - 0.5) - 0.12 * Math.sin(u * Math.PI)) + (pass ? -S * 0.035 : S * 0.03), r = S * (0.13 + 0.11 * w);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const cc = pass ? '255,255,255' : '190,204,224';   // shaded underside first, lit tops over it
      g.addColorStop(0, `rgba(${cc},${pass ? 0.85 : 0.6})`); g.addColorStop(0.55, `rgba(${cc},${pass ? 0.42 : 0.3})`); g.addColorStop(1, `rgba(${cc},0)`);
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
  return { cv, mapping };
}
function seedPuffs() {
  // most hug the edge of the stage, some drift far out among the peaks
  const out = [], pad = 45000;
  for (let i = 0; out.length < 640 && i < 200000; i++) {
    const x = SX0 - pad + hash(i, 1) * (SX1 - SX0 + 2 * pad), y = SY0 - pad + hash(i, 2) * (SY1 - SY0 + 2 * pad), d = outside(x, y);
    if (d < -500 || hash(i, 7) > Math.exp(-Math.max(0, d) / 7000)) continue;
    const w = hash(i, 3);
    out.push({ x, y, z: 120 + w * 520 + Math.max(0, d) * 0.012, size: 2600 + hash(i, 4) * 4200 + Math.max(0, d) * 0.07, icon: `p${out.length % 4}`, ph: hash(i, 5), sp: 0.6 + hash(i, 6) * 0.8 });
  }
  return out;
}

export function createBackdrop(terrainBuf, stage) {
  buildSdf(stage.inner);
  const mesh = buildMesh(terrainBuf);
  const B = [-126.4, 44.9, -117.4, 49.9];
  const ground = sheet(1536, B, -1500, 400, 500, 1.7), deck = sheet(1024, B, 1500, 7000, 2400, 9.3);
  const corners = (z) => [[B[0], B[1], z], [B[0], B[3], z], [B[2], B[3], z], [B[2], B[1], z]];
  const atlas = puffAtlas(), puffs = seedPuffs();
  const soft = { depthWriteEnabled: false };
  const linear = { minFilter: 'linear', magFilter: 'linear' };
  const mountains = new SimpleMeshLayer({ id: 'mountains', data: [0], mesh, getPosition: [LON0, LAT0, 0], getColor: [255, 255, 255], material: false });
  const sheets = [
    new BitmapLayer({ id: 'fog', image: ground, bounds: corners(25), parameters: soft, textureParameters: linear }),
    new BitmapLayer({ id: 'cloud-deck', image: deck, bounds: corners(430), parameters: soft, textureParameters: linear }),
  ];
  return {
    // the base map paints everything beyond this outline cloud-white, so nothing of the empty map shows at any distance
    outsideFill: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-179, -80], [-179, 84], [179, 84], [179, -80], [-179, -80]], stage.outer] } },
    mountains, sheets,
    puffs(tSec, cam, look) {
      // puffs drift north-east on the prevailing south-westerly, fading in and out over each 9 km run;
      // the ones standing between the camera and what it is looking at thin out so they never hide the city
      const ax = mx(cam[0]), ay = my(cam[1]), vx = mx(look[0]) - ax, vy = my(look[1]) - ay, D = Math.hypot(vx, vy);
      const data = puffs.map((p) => {
        const f = (tSec * 0.012 * p.sp + p.ph) % 1, s = (f - 0.5) * 9000, x = p.x + s * 0.8, y = p.y + s * 0.6;
        let k = 1;
        if (D > 2500) { const t = ((x - ax) * vx + (y - ay) * vy) / (D * D), lat = Math.abs((x - ax) * vy - (y - ay) * vx) / (D * D); k = Math.max(sstep(0.8, 1.15, t), sstep(0.35, 0.7, lat)); }
        return { p: [ilon(x), ilat(y), p.z], size: p.size, icon: p.icon, a: 235 * k * Math.sin(Math.PI * f) ** 0.6 };
      });
      return new IconLayer({ id: 'puffs', data, iconAtlas: atlas.cv, iconMapping: atlas.mapping, getIcon: (d) => d.icon, getPosition: (d) => d.p, getSize: (d) => d.size, sizeUnits: 'meters',
        getColor: (d) => [255, 255, 255, d.a], billboard: true, alphaCutoff: 0.004, parameters: soft });
    },
  };
}
