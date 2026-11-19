import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import './style.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { COORDINATE_SYSTEM, LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { SolidPolygonLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';
import { POP, PLACES, EVENTS, STORY, PARK_YEARS } from './content.js';
import { createScene, buildLost, hipRoof, kx, KY } from './scene.js';
import { buildStatic } from './landmarks.js';

const Y0 = 1851, Y1 = 2026.99;
const $ = (id) => document.getElementById(id);
const DATA = `${import.meta.env.BASE_URL}data/`;
const state = { year: Y0, playing: false, speed: 6 };
const filterExt = new DataFilterExtension({ filterSize: 1 });
const filterExt2 = new DataFilterExtension({ filterSize: 2 });

// ---------- loading helpers ----------
async function fetchBin(path) {
  const r = await fetch(DATA + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  let buf = await r.arrayBuffer();
  const m = new Uint8Array(buf, 0, 2);
  if (m[0] === 0x1f && m[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return buf;
}
const fetchJSON = (path) => fetch(DATA + path).then((r) => r.json());

// ---------- URL state ----------
function readHash() {
  const t = new URLSearchParams(location.hash.replace(/^#/, ''));
  const n = (k) => (t.has(k) && Number.isFinite(Number(t.get(k))) ? Number(t.get(k)) : undefined);
  const o = { year: n('year'), zoom: n('z'), pitch: n('p'), bearing: n('b') };
  const c = t.get('c');
  if (c) { const [a, b] = c.split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) o.center = [a, b]; }
  return o;
}
const init = readHash();
if (init.year !== undefined) state.year = Math.max(Y0, Math.min(Y1, init.year));
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const c = map.getCenter();
    history.replaceState(null, '', `${location.href.split('#')[0]}#year=${state.year.toFixed(1)}&c=${c.lng.toFixed(5)},${c.lat.toFixed(5)}&z=${map.getZoom().toFixed(2)}&p=${map.getPitch().toFixed(0)}&b=${map.getBearing().toFixed(0)}`);
  }, 250);
}

// ---------- base map (no tiles: everything is drawn from our own data) ----------
const WATER = '#a9cbd8';
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      forest: { type: 'geojson', data: DATA + 'forest.geojson' },
      parks: { type: 'geojson', data: DATA + 'parks.geojson' },
      water: { type: 'geojson', data: DATA + 'water.geojson' },
      rivers: { type: 'geojson', data: DATA + 'rivers.geojson' },
      cities: { type: 'geojson', data: DATA + 'cities.geojson' },
      tideflats: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      harbor: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-122.36, 47.564], [-122.3425, 47.564], [-122.3425, 47.592], [-122.36, 47.592], [-122.36, 47.564]]] } } },
      dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 12, encoding: 'terrarium' },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#8aa56f' } },
      { id: 'forest', type: 'fill', source: 'forest', paint: { 'fill-color': '#6f9160', 'fill-opacity': 0.85 } },
      { id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': '#a8c686', 'fill-opacity': 0 } },
      { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#3d4a36', 'hillshade-highlight-color': '#fff8e0', 'hillshade-accent-color': '#5d6b4c' } },
      { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': WATER, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 5] } },
      { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': WATER } },
      { id: 'tideflats', type: 'fill', source: 'tideflats', paint: { 'fill-color': '#b9cfc6', 'fill-opacity': 0.9 } },
      { id: 'harbor', type: 'fill', source: 'harbor', paint: { 'fill-color': WATER } },
      { id: 'shore', type: 'line', source: 'water', paint: { 'line-color': '#7fa9ba', 'line-width': 0.8, 'line-opacity': 0.7 } },
      { id: 'cities', type: 'line', source: 'cities', minzoom: 9, paint: { 'line-color': '#5d564d', 'line-width': 0.7, 'line-dasharray': [3, 3], 'line-opacity': 0 } },
    ],
  },
  center: init.center ?? [-122.335, 47.608],
  zoom: init.zoom ?? 12.6,
  pitch: init.pitch ?? 55,
  bearing: init.bearing ?? -18,
  maxPitch: 78, minZoom: 8.2, maxZoom: 18.5,
  maxBounds: [[-123.6, 46.6], [-120.4, 48.3]],
  attributionControl: false,
  canvasContextAttributes: { antialias: true },
});
map.dragRotate.enable();
map.touchZoomRotate.enableRotation();

// Elliott Bay's tide flats, filled 1895-1917 (approximate outline of the fill south of King Street).
const TIDEFLATS = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
  [-122.3372, 47.5990], [-122.3290, 47.5985], [-122.3215, 47.5935], [-122.3200, 47.5850], [-122.3215, 47.5760], [-122.3260, 47.5690],
  [-122.3330, 47.5650], [-122.3420, 47.5640], [-122.3600, 47.5650], [-122.3640, 47.5720], [-122.3620, 47.5850], [-122.3530, 47.5905], [-122.3420, 47.5950], [-122.3372, 47.5990]]] } };

// ---------- growth raster: cleared / built-up land by year, on a canvas source ----------
let growth = null;
async function loadGrowth() {
  const buf = await fetchBin('growth.bin.gz');
  const hl = new DataView(buf).getUint32(0, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const off = 4 + hl + ((4 - (hl % 4)) % 4);
  const n = h.w * h.h;
  const g1s = new Uint16Array(buf.slice(off, off + n * 2)), g4s = new Uint16Array(buf.slice(off + n * 2, off + n * 4));
  // resample rows from equal-latitude to equal-Mercator spacing so the canvas lines up with the map
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const latS = h.y1 - h.h * h.ch, mN = merc(h.y1), mS = merc(latS);
  const g1 = new Uint16Array(n), g4 = new Uint16Array(n);
  for (let r = 0; r < h.h; r++) {
    const m = mN + ((r + 0.5) / h.h) * (mS - mN);
    const lat = (Math.atan(Math.exp(m)) * 360) / Math.PI - 90;
    const sr = Math.min(h.h - 1, Math.max(0, Math.floor((h.y1 - lat) / h.ch)));
    g1.set(g1s.subarray(sr * h.w, (sr + 1) * h.w), r * h.w); g4.set(g4s.subarray(sr * h.w, (sr + 1) * h.w), r * h.w);
  }
  // halo: the land around the first buildings is cleared too (3x3 minimum of the first-building year)
  const halo = new Uint16Array(n);
  for (let r = 0; r < h.h; r++) for (let c = 0; c < h.w; c++) {
    let m = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= h.h || cc >= h.w) continue;
      const v = g1[rr * h.w + cc]; if (v && (!m || v < m)) m = v;
    }
    halo[r * h.w + c] = m;
  }
  const canvas = document.createElement('canvas'); canvas.width = h.w; canvas.height = h.h;
  const ctx = canvas.getContext('2d'); const img = ctx.createImageData(h.w, h.h);
  const x1 = h.x0 + h.w * h.cw;
  growth = { g1: halo, g4: g1, canvas, ctx, img, n, last: -1, coords: [[h.x0, h.y1], [x1, h.y1], [x1, latS], [h.x0, latS]] };
}
function drawGrowth() {
  if (!growth) return;
  const y = Math.floor(state.year);
  if (y === growth.last) return;
  growth.last = y;
  const { g1, g4, img, n } = growth, d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = g1[i], b = g4[i];
    if (a && a <= y) {
      const dense = b && b <= y;
      const age = Math.min(1, (y - a) / 12);
      d[j] = dense ? 230 : 224; d[j + 1] = dense ? 220 : 216; d[j + 2] = dense ? 196 : 178;
      d[j + 3] = dense ? 215 + 40 * age : 120 + 70 * age;
    } else d[j + 3] = 0;
  }
  growth.ctx.putImageData(img, 0, 0);
  const s = map.getSource('growth');
  if (s) { s.play(); s.pause(); }
}

// ---------- binary decoders ----------
const PALETTES = {
  old: [[170, 98, 78], [152, 104, 86], [186, 120, 92], [214, 198, 170], [196, 178, 150], [160, 86, 70]],
  mid: [[226, 214, 190], [214, 196, 164], [204, 186, 160], [190, 150, 120], [232, 224, 206], [198, 190, 176]],
  post: [[230, 224, 210], [214, 210, 198], [222, 206, 180], [200, 204, 200], [236, 226, 204], [206, 196, 186], [196, 206, 212]],
  new: [[206, 210, 212], [188, 198, 206], [224, 222, 216], [176, 190, 200], [214, 204, 190], [196, 200, 198]],
  glass: [[150, 172, 190], [168, 186, 200], [136, 158, 178], [184, 196, 204], [120, 146, 168]],
};
function colourFor(year, h, seed) {
  const p = h > 55 ? (year >= 1960 ? PALETTES.glass : PALETTES.mid) : year < 1915 ? PALETTES.old : year < 1946 ? PALETTES.mid : year < 1985 ? PALETTES.post : PALETTES.new;
  return p[seed % p.length];
}
// houses: painted wood walls and a shingled hip roof, by era
const HOUSE = [
  [1915, [[236, 230, 214], [222, 212, 188], [200, 204, 190], [226, 212, 176], [190, 176, 156], [208, 190, 172], [178, 190, 196]], [[104, 92, 80], [92, 88, 82], [112, 100, 90]]],
  [1946, [[232, 226, 208], [214, 200, 172], [196, 180, 152], [220, 222, 212], [184, 150, 124], [206, 212, 196]], [[110, 98, 88], [96, 104, 96], [128, 92, 80], [100, 96, 92]]],
  [1978, [[234, 228, 212], [218, 222, 214], [226, 208, 180], [200, 208, 212], [214, 196, 176], [190, 200, 184]], [[142, 138, 132], [120, 114, 108], [150, 126, 108], [112, 112, 114]]],
  [9999, [[222, 218, 208], [198, 204, 206], [214, 202, 184], [180, 188, 192], [226, 222, 214], [170, 160, 150]], [[104, 102, 102], [88, 90, 94], [124, 118, 112]]],
];
const SKIP = [[-122.3493, 47.6205, 150]]; // drawn as hand-built landmarks instead: [lon, lat, min height]
function decodeBuildings(buf) {
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true), nv = dv.getUint32(4, true);
  const ox = dv.getFloat64(8, true), oy = dv.getFloat64(16, true), qx = dv.getFloat64(24, true), qy = dv.getFloat64(32, true);
  let o = 40;
  const years = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const hts = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const cnt = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const xy = new Int16Array(buf.slice(o, o + nv * 4));
  const pos = new Float32Array(nv * 2), elev = new Float32Array(nv), col = new Uint8Array(nv * 4), fv = new Float32Array(nv), start = new Uint32Array(n + 1);
  const mx = qx * kx(oy), my = qy * KY, sx = 1 / kx(oy), sy = 1 / KY;
  const rp = [], rc = [], rf = [], rs = [0];
  let v = 0;
  for (let i = 0; i < n; i++) {
    start[i] = v;
    let h = Math.min(hts[i] / 10, 290), yr = years[i];
    const m = cnt[i], seed = (xy[v * 2] * 31 + xy[v * 2 + 1] * 17 + i) >>> 0;
    let c = colourFor(yr, h, seed);
    if (h > 100) for (const sk of SKIP) if (h >= sk[2] && Math.abs(ox + xy[v * 2] * qx - sk[0]) < 0.0008 && Math.abs(oy + xy[v * 2 + 1] * qy - sk[1]) < 0.0006) yr = 9999;
    if (h <= 12.5 && m >= 4 && m <= 14) {
      // oriented bounding box along the longest wall
      let best = 0, ux = 1, uy = 0, area = 0;
      for (let k = 0; k < m - 1; k++) {
        const x0 = xy[(v + k) * 2] * mx, y0 = xy[(v + k) * 2 + 1] * my, x1 = xy[(v + k + 1) * 2] * mx, y1 = xy[(v + k + 1) * 2 + 1] * my;
        const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy; area += x0 * y1 - x1 * y0;
        if (l > best) { best = l; ux = dx; uy = dy; }
      }
      const l = Math.sqrt(best) || 1; ux /= l; uy /= l;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let k = 0; k < m - 1; k++) {
        const x = xy[(v + k) * 2] * mx, y = xy[(v + k) * 2 + 1] * my, pu = x * ux + y * uy, pv = -x * uy + y * ux;
        if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pv < v0) v0 = pv; if (pv > v1) v1 = pv;
      }
      let a = (u1 - u0) / 2, b = (v1 - v0) / 2; const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const cx = cu * ux - cv * uy, cy = cu * uy + cv * ux, box = 4 * a * b;
      if (box <= 560 && box > 14 && Math.abs(area) / 2 / box >= 0.7) {
        if (b > a) { const t = a; a = b; b = t; const tx = ux; ux = -uy; uy = tx; }
        const era = HOUSE.find((e) => yr < e[0]), rh = Math.min(b * 0.62, 3.3), eave = Math.max(2.2, h - rh);
        c = era[1][seed % era[1].length]; h = eave;
        hipRoof(rp, rc, rs, () => rf.push(yr), cx, cy, ux, uy, a + 0.3, b + 0.3, eave, rh, era[2][(seed >>> 3) % era[2].length], sx, sy);
      }
    }
    for (let k = 0; k < m; k++, v++) {
      pos[v * 2] = xy[v * 2] * qx; pos[v * 2 + 1] = xy[v * 2 + 1] * qy;
      elev[v] = h; fv[v] = yr; col[v * 4] = c[0]; col[v * 4 + 1] = c[1]; col[v * 4 + 2] = c[2]; col[v * 4 + 3] = 255;
    }
  }
  start[n] = v;
  return { origin: [ox, oy, 0], data: { length: n, startIndices: start, attributes: {
    getPolygon: { value: pos, size: 2 }, getElevation: { value: elev, size: 1 }, getFillColor: { value: col, size: 4, normalized: true }, getFilterValue: { value: fv, size: 1 } } },
    roofs: rs.length > 1 ? { length: rs.length - 1, startIndices: new Uint32Array(rs), attributes: {
      getPolygon: { value: new Float32Array(rp), size: 3 }, getFillColor: { value: new Uint8Array(rc), size: 4, normalized: true }, getFilterValue: { value: new Float32Array(rf), size: 1 } } } : null };
}
// roads: returns one binary dataset per class present
function decodeRoads(buf) {
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true), nv = dv.getUint32(4, true), ox = dv.getFloat64(8, true), oy = dv.getFloat64(16, true);
  let o = 24;
  const years = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const cnt = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const xy = new Int32Array(buf.slice(o, o + nv * 8)); o += nv * 8;
  const cls = new Uint8Array(buf, o, n);
  const by = new Map();
  let v = 0;
  for (let i = 0; i < n; i++) {
    let g = by.get(cls[i]);
    if (!g) by.set(cls[i], (g = { pos: [], fv: [], start: [0] }));
    for (let k = 0; k < cnt[i]; k++, v++) { g.pos.push(xy[v * 2] * 1e-6, xy[v * 2 + 1] * 1e-6); g.fv.push(years[i]); }
    g.start.push(g.fv.length);
  }
  const out = {};
  for (const [c, g] of by) {
    out[c] = { origin: [ox, oy, 0], data: { length: g.start.length - 1, startIndices: new Uint32Array(g.start),
      attributes: { getPath: { value: new Float32Array(g.pos), size: 2 }, getFilterValue: { value: new Float32Array(g.fv), size: 1 } } } };
  }
  return out;
}
function decodeDots(buf) {
  const n = new DataView(buf).getUint32(0, true);
  let o = 4;
  const x = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const y = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const yr = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
  const rad = new Uint8Array(buf, o, n); o += n; const hh = new Uint8Array(buf, o, n);
  const pos = new Float32Array(n * 2), fv = new Float32Array(n), r = new Float32Array(n), col = new Uint8Array(n * 4);
  const SX = 1.5 / 65535, SY = 0.72 / 65535;
  for (let i = 0; i < n; i++) {
    pos[i * 2] = x[i] * SX; pos[i * 2 + 1] = -y[i] * SY; fv[i] = yr[i]; r[i] = rad[i];
    const c = colourFor(yr[i], hh[i] * 2, (x[i] * 31 + y[i] * 17) >>> 0);
    col[i * 4] = c[0] * 0.86; col[i * 4 + 1] = c[1] * 0.84; col[i * 4 + 2] = c[2] * 0.8; col[i * 4 + 3] = 255;
  }
  return { origin: [-122.55, 47.79, 0], data: { length: n, attributes: { getPosition: { value: pos, size: 2 }, getRadius: { value: r, size: 1 },
    getFillColor: { value: col, size: 4, normalized: true }, getFilterValue: { value: fv, size: 1 } } } };
}

// ---------- tile cache (buildings + minor streets, fixed z13) ----------
const Z = 13;
function makeTiles(dir, decode, max) {
  return { dir, decode, max, have: new Set(), cache: new Map(), pending: new Set(), wanted: [] };
}
const bTiles = makeTiles('b', decodeBuildings, 150);
const sTiles = makeTiles('s', decodeRoads, 220);
const lon2x = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;
function wantTiles(t, limit) {
  const b = map.getBounds(), c = map.getCenter();
  const cx = lon2x(c.lng), cy = lat2y(c.lat);
  const reach = Math.max(2.2, (map.getContainer().clientWidth / 512) * 2 ** (Z - map.getZoom()) * 1.5);
  const x0 = Math.floor(Math.max(lon2x(b.getWest()), cx - reach)), x1 = Math.floor(Math.min(lon2x(b.getEast()), cx + reach));
  const y0 = Math.floor(Math.max(lat2y(b.getNorth()), cy - reach)), y1 = Math.floor(Math.min(lat2y(b.getSouth()), cy + reach));
  const list = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const k = `${x}_${y}`;
    if (t.have.has(k)) list.push([k, (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2]);
  }
  list.sort((a, b2) => a[1] - b2[1]);
  t.wanted = list.slice(0, limit).map((e) => e[0]);
  for (const k of t.wanted) {
    if (t.cache.has(k)) { const v = t.cache.get(k); t.cache.delete(k); t.cache.set(k, v); continue; }
    if (t.pending.has(k) || t.pending.size >= 8) continue;
    t.pending.add(k);
    fetchBin(`${t.dir}/${k}.bin.gz`).then((buf) => {
      t.cache.set(k, t.decode(buf));
      while (t.cache.size > t.max) t.cache.delete(t.cache.keys().next().value);
    }).catch((e) => console.warn(t.dir, k, e)).finally(() => { t.pending.delete(k); render(); if (t.pending.size < 4) updateTiles(); });
  }
}
function updateTiles() {
  const z = map.getZoom();
  if (z >= 12.4) wantTiles(bTiles, z > 14 ? 30 : 46); else bTiles.wanted = [];
  if (z >= 12.2) wantTiles(sTiles, 46); else sTiles.wanted = [];
}

// ---------- static data ----------
let roadsMajor = null, rail = null, dots = null, transit = null, parkLabels = [], seattleRings = null, scene = null, lost = null, statics = null;
const ROAD_STYLE = [ // class: colour, width m, min px
  { color: [122, 116, 108], w: 16, min: 1.4 }, { color: [150, 142, 130], w: 12, min: 1.1 }, { color: [244, 238, 222], w: 10, min: 0.8 },
  { color: [244, 238, 222], w: 8, min: 0.5 }, { color: [242, 236, 220], w: 7, min: 0.3 }, { color: [240, 233, 216], w: 6, min: 0 }];

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 250, 240], intensity: 1.45 }),
  sun: new DirectionalLight({ color: [255, 244, 224], intensity: 1.05, direction: [-1.2, -2.2, -2.6] }),
  fill: new DirectionalLight({ color: [220, 230, 255], intensity: 0.3, direction: [2, 1.5, -1] }),
});
const overlay = new MapboxOverlay({ interleaved: false, effects: [lighting], layers: [] });

const interp = (series, y) => {
  if (y < series[0][0]) return null;
  for (let i = 0; i < series.length - 1; i++) {
    const [a, pa] = series[i], [b, pb] = series[i + 1];
    if (y <= b) return pa * (pb / pa) ** ((y - a) / (b - a));
  }
  return series[series.length - 1][1];
};
function inRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function updatePopulation() {
  const c = map.getCenter();
  const inSeattle = map.getZoom() >= 10.4 && seattleRings && inRings(seattleRings, c.lng, c.lat);
  const key = inSeattle || state.year < 1853 ? 'Seattle' : 'King County';
  const v = interp(POP[key], state.year);
  $('population-value').textContent = v == null ? '—' : Math.round(v).toLocaleString('en-US');
  $('population-area').textContent = key === 'Seattle' && state.year < 1853.4 ? 'settlers on Elliott Bay' : key;
}

// ---------- trains ----------
let trainPaths = [];
function buildTrainPaths() {
  trainPaths = transit.lines.map((l) => ({ line: l, key: '', pts: [], cum: [], len: 0 }));
}
function refreshTrainPath(tp) {
  const open = tp.line.segments.filter((s) => s.start <= state.year && state.year < s.end);
  const key = open.map((s) => s.start).join(',');
  if (key === tp.key) return;
  tp.key = key;
  // order open segments by their position in the line and join them
  const pts = [];
  for (const s of tp.line.segments) if (open.includes(s)) for (const p of s.path) pts.push(p);
  const cum = [0]; const k = Math.cos((47.5 * Math.PI) / 180) * 111320;
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * k, (pts[i][1] - pts[i - 1][1]) * 110950));
  tp.pts = pts; tp.cum = cum; tp.len = cum[cum.length - 1] || 0;
}
function trainPositions(tSec) {
  const out = [];
  for (const tp of trainPaths) {
    refreshTrainPath(tp);
    if (tp.len < 300) continue;
    const kind = tp.line.kind, v = kind === 'sounder' ? 28 : kind === 'link' ? 22 : 10;
    const count = Math.max(1, Math.min(14, Math.round(tp.len / (kind === 'link' ? 4500 : kind === 'sounder' ? 30000 : 1500))));
    for (let i = 0; i < count; i++) {
      let d = (tSec * v * 14 + (i * 2 * tp.len) / count) % (2 * tp.len);
      if (d > tp.len) d = 2 * tp.len - d;
      let lo = 0, hi = tp.cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tp.cum[mid] <= d) lo = mid; else hi = mid; }
      const f = (d - tp.cum[lo]) / Math.max(1e-6, tp.cum[hi] - tp.cum[lo]);
      const a = tp.pts[lo], b = tp.pts[hi];
      out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], color: tp.line.color });
    }
  }
  return out;
}
const hex = (h, a = 255) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];

// ---------- layers ----------
let effect = null; // {kind:'fire', lon, lat, t0}
let marker = null;
const OFFS = COORDINATE_SYSTEM.LNGLAT_OFFSETS;
const MAT = { ambient: 0.42, diffuse: 0.62, shininess: 8, specularColor: [40, 40, 40] };
function labelLayers(zoom, year) {
  const vis = PLACES.filter((p) => p.start <= year && year < p.end && (
    p.tier === 1 || (p.tier === 2 && zoom >= 9.3) || (p.tier === 3 && zoom >= 11.7) || (p.tier === 4 && zoom >= 9) || (p.tier === 5 && zoom >= 10.6)));
  // white lettering with a dark outline reads on forest, water and rooftops alike
  const common = { fontFamily: 'Cormorant Garamond', fontWeight: 700, fontSettings: { sdf: true, fontSize: 72, buffer: 12, radius: 16, cutoff: 0.2 }, outlineWidth: 6, outlineColor: [38, 30, 24, 255],
    getPosition: (d) => [d.lon, d.lat, d.z || 0], getText: (d) => d.name, parameters: { depthCompare: 'always' }, billboard: true, characterSet: 'auto' };
  const SIZE = [0, 30, 21, 15.5, 19, 18], COLOR = [0, [255, 255, 250, 255], [255, 253, 244, 255], [250, 246, 234, 255], [214, 236, 250, 255], [255, 232, 176, 255]];
  const out = [
    new TextLayer({ ...common, id: 'labels', data: vis, getSize: (d) => SIZE[d.tier], getColor: (d) => COLOR[d.tier],
      getText: (d) => (d.tier === 3 ? d.name.toUpperCase() : d.name), updateTriggers: { getText: 1 } }),
  ];
  if (zoom >= 12.8) {
    const minHa = zoom >= 14.6 ? 2 : zoom >= 13.6 ? 12 : 40;
    out.push(new TextLayer({ ...common, id: 'labels-parks', data: parkLabels.filter((p) => p.ha >= minHa && p.start <= year), getSize: 15, getColor: [216, 244, 200, 255] }));
  }
  if (transit && zoom >= 13.4) {
    out.push(new TextLayer({ ...common, id: 'labels-stations', data: transit.stations.filter((s) => s.start <= year), getSize: 14, getColor: [255, 255, 255, 255], getPixelOffset: [0, -15] }));
  }
  return out;
}
function render() {
  const year = state.year, zoom = map.getZoom();
  const range = [0, year], soft = [0, year - 0.8];
  const layers = [];
  const road = (id, d, st, extra = {}) => new PathLayer({ id, data: d.data, coordinateSystem: OFFS, coordinateOrigin: d.origin, positionFormat: 'XY', _pathType: 'open',
    getColor: st.color, getWidth: st.w, widthUnits: 'meters', widthMinPixels: st.min, capRounded: false, jointRounded: false,
    extensions: [filterExt], filterRange: range, filterSoftRange: soft, parameters: { depthCompare: 'always' }, ...extra });
  if (zoom >= 12.2) for (const k of sTiles.wanted) { const t = sTiles.cache.get(k); if (t) for (const c in t) layers.push(road(`s-${k}-${c}`, t[c], ROAD_STYLE[5])); }
  if (roadsMajor) for (const c of [4, 3, 2, 1, 0]) {
    if (!roadsMajor[c] || (c === 4 && zoom < 10.6) || (c === 3 && zoom < 9.6)) continue;
    layers.push(road(`major-${c}`, roadsMajor[c], ROAD_STYLE[c]));
  }
  if (rail && rail[0]) layers.push(road('rail', rail[0], { color: [84, 76, 70], w: 3, min: 0.7 }));
  if (dots && zoom < 13.1) {
    layers.push(new ScatterplotLayer({ id: 'dots', data: dots.data, coordinateSystem: OFFS, coordinateOrigin: dots.origin, positionFormat: 'XY', radiusUnits: 'meters', radiusScale: 1.25,
      radiusMinPixels: zoom < 10 ? 0.55 : 0.7, opacity: Math.min(0.95, Math.max(0, (13.1 - zoom) * 2.2)), extensions: [filterExt], filterRange: range, filterSoftRange: soft, parameters: { depthCompare: 'always' } }));
  }
  if (transit) {
    const segs = [];
    for (const l of transit.lines) for (const s of l.segments) if (s.start <= year && year < s.end) segs.push({ path: s.path, color: hex(l.color), kind: l.kind });
    layers.push(new PathLayer({ id: 'transit', data: segs, getPath: (d) => d.path, getColor: (d) => d.color, getWidth: (d) => (d.kind === 'sounder' ? 9 : d.kind === 'streetcar' ? 6 : 14), widthUnits: 'meters',
      widthMinPixels: 1.5, capRounded: true, jointRounded: true, parameters: { depthCompare: 'always' } }));
  }
  if (zoom >= 12.4) for (const k of bTiles.wanted) {
    const t = bTiles.cache.get(k);
    if (t) layers.push(new SolidPolygonLayer({ id: `b-${k}`, data: t.data, coordinateSystem: OFFS, coordinateOrigin: t.origin, positionFormat: 'XY', extruded: true, _normalize: false, _windingOrder: 'CW',
      material: MAT, extensions: [filterExt], filterRange: range, filterSoftRange: soft }));
    if (t?.roofs) layers.push(new SolidPolygonLayer({ id: `r-${k}`, data: t.roofs, coordinateSystem: OFFS, coordinateOrigin: t.origin, positionFormat: 'XYZ', extruded: false, _normalize: false,
      material: false, extensions: [filterExt], filterRange: range, filterSoftRange: soft }));
  }
  if (lost && zoom >= 11.6) {
    const r2 = [[0, year], [year, 1e5]], s2 = [[0, year - 0.5], [year + 0.12, 1e5]];
    layers.push(new SolidPolygonLayer({ id: 'lost', data: lost.walls, coordinateSystem: OFFS, coordinateOrigin: lost.origin, positionFormat: 'XY', extruded: true, _normalize: false, _windingOrder: 'CCW',
      material: MAT, extensions: [filterExt2], filterRange: r2, filterSoftRange: s2 }));
    layers.push(new SolidPolygonLayer({ id: 'lost-roofs', data: lost.roofs, coordinateSystem: OFFS, coordinateOrigin: lost.origin, positionFormat: 'XYZ', extruded: false, _normalize: false,
      material: false, extensions: [filterExt2], filterRange: r2, filterSoftRange: s2 }));
  }
  if (scene) {
    const tSec = performance.now() / 1000, sc = scene.build(year, tSec, zoom, map.getBounds());
    // fires: the 1889 fire front and the burning of Hooverville follow the buildings as they go
    const flames = [];
    if (lost && ((year > 1889.4 && year < 1889.95) || (year > 1941.25 && year < 1941.5))) for (const b of lost.burning) {
      const dt = b.e - year; if (dt < -0.03 || dt > 0.06) continue;
      for (let j = 0; j < 3; j++) { const f = 0.5 + 0.5 * Math.sin(tSec * (6 + ((b.k + j) % 5)) + b.k + j * 2); flames.push({ p: [b.lon + (((b.k * 7 + j * 3) % 9) - 4) * 2e-5, b.lat + (((b.k * 5 + j * 4) % 9) - 4) * 1.4e-5, 4 + j * 5 + f * 5], r: 5 + f * 6 - j, c: [255, 120 + f * 110 - j * 20, 24, 215] }); }
      sc.smoke.push({ p: [b.lon, b.lat, 26 + ((tSec * 14 + b.k) % 60)], r: 12 + ((tSec * 4 + b.k) % 14), a: 110, dark: true });
    }
    if (sc.roads.length) layers.push(new PathLayer({ id: 'route-roads', data: sc.roads, getPath: (d) => d, getWidth: 17, widthUnits: 'meters', widthMinPixels: 1.4, getColor: [122, 116, 108], parameters: { depthCompare: 'always' } }));
    if (statics && zoom >= 11) layers.push(new SolidPolygonLayer({ id: 'statics', data: statics, getPolygon: (d) => d.p, getElevation: (d) => d.h, getFillColor: (d) => d.c, getFilterValue: (d) => d.f, extruded: true, material: MAT,
      extensions: [filterExt2], filterRange: [[0, year], [year, 2e5]], filterSoftRange: [[0, year - 0.6], [year, 2e5]] }));
    if (sc.strips.length) layers.push(new PathLayer({ id: 'runways', data: sc.strips, getPath: (d) => d.path, getWidth: (d) => d.w, widthUnits: 'meters', widthMinPixels: 1.5, getColor: [128, 126, 122], parameters: { depthCompare: 'always' } }));
    if (sc.cars.length) layers.push(new ScatterplotLayer({ id: 'cars', data: sc.cars, getPosition: (d) => d.p, getRadius: 4.2, radiusMinPixels: 1.1, radiusMaxPixels: 4, getFillColor: (d) => d.c, parameters: { depthCompare: 'always' } }));
    layers.push(new SolidPolygonLayer({ id: 'scene', data: sc.prisms, getPolygon: (d) => d.p, getElevation: (d) => d.h, getFillColor: (d) => d.c, extruded: true, material: MAT }));
    if (sc.smoke.length) layers.push(new ScatterplotLayer({ id: 'smoke', data: sc.smoke, getPosition: (d) => d.p, getRadius: (d) => d.r, billboard: true,
      getFillColor: (d) => (d.dark ? [70, 62, 58, d.a] : [236, 232, 226, d.a]), parameters: { depthWriteEnabled: false } }));
    if (flames.length) layers.push(new ScatterplotLayer({ id: 'flames', data: flames, getPosition: (d) => d.p, getRadius: (d) => d.r, getFillColor: (d) => d.c, billboard: true, parameters: { depthWriteEnabled: false } }));
  }
  if (transit && zoom >= 10.8) {
    layers.push(new ScatterplotLayer({ id: 'stations', data: transit.stations.filter((s) => s.start <= year && zoom >= 12), getPosition: (d) => [d.lon, d.lat], getRadius: 13, radiusMinPixels: 2.2, radiusMaxPixels: 7,
      getFillColor: [255, 255, 255], stroked: true, getLineColor: [40, 40, 40], lineWidthMinPixels: 1.2, parameters: { depthCompare: 'always' } }));
    layers.push(new ScatterplotLayer({ id: 'trains', data: trainPositions(performance.now() / 1000), getPosition: (d) => d.p, getRadius: 15, radiusMinPixels: 2.6, radiusMaxPixels: 8,
      getFillColor: [255, 252, 240], stroked: true, getLineColor: (d) => hex(d.color), lineWidthMinPixels: 1.6, parameters: { depthCompare: 'always' } }));
  }
  if (effect?.kind === 'fire') {
    const t = performance.now() / 1000, pts = [];
    for (let i = 0; i < 46; i++) { const a = i * 2.399, r = 30 + ((i * 53) % 190); pts.push({ p: [effect.lon + (Math.cos(a) * r) / 75000, effect.lat + (Math.sin(a) * r) / 111000], s: 0.5 + 0.5 * Math.sin(t * (5 + (i % 7)) + i) }); }
    layers.push(new ScatterplotLayer({ id: 'fire', data: pts, getPosition: (d) => d.p, getRadius: (d) => 22 + d.s * 30, getFillColor: (d) => [255, 110 + d.s * 110, 20, 150 + d.s * 80], updateTriggers: { getRadius: t, getFillColor: t }, parameters: { depthCompare: 'always' } }));
  }
  if (marker) layers.push(new ScatterplotLayer({ id: 'marker', data: [marker], getPosition: (d) => [d.lon, d.lat], getRadius: 9, radiusUnits: 'pixels', getFillColor: [181, 72, 47, 60], stroked: true, getLineColor: [181, 72, 47], lineWidthMinPixels: 2, parameters: { depthCompare: 'always' } }));
  layers.push(...labelLayers(zoom, year));
  overlay.setProps({ layers });
}

// ---------- year ----------
const slider = $('slider'), yearLabel = $('year-label');
function setYear(y, fromSlider) {
  state.year = Math.max(Y0, Math.min(Y1, y));
  if (!fromSlider) slider.value = state.year;
  slider.style.setProperty('--p', `${((state.year - Y0) / (Y1 - Y0)) * 100}%`);
  yearLabel.textContent = Math.floor(state.year);
  drawGrowth();
  if (map.getLayer('tideflats')) {
    map.setPaintProperty('tideflats', 'fill-opacity', 0.92 * Math.max(0, Math.min(1, (1913 - state.year) / 16)));
    map.setPaintProperty('harbor', 'fill-opacity', Math.max(0, Math.min(1, (1909.9 - state.year) / 3)));
    map.setPaintProperty('parks', 'fill-opacity', 0.8 * Math.max(0, Math.min(1, (state.year - 1884) / 40)));
    map.setPaintProperty('cities', 'line-opacity', 0.5 * Math.max(0, Math.min(1, (state.year - 1890) / 30)));
  }
  updatePopulation(); render(); writeHash();
}
slider.addEventListener('input', () => { story.interrupt(); setYear(Number(slider.value), true); });
let lastT = 0;
function setPlaying(p) {
  state.playing = p; $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  if (p) { if (state.year >= Y1 - 0.01) setYear(Y0); lastT = performance.now(); }
}
$('play').addEventListener('click', () => { if (story.active) story.exit(); setPlaying(!state.playing); });
$('speed').addEventListener('change', (e) => (state.speed = Number(e.target.value)));
function frame(t) {
  if (state.playing) {
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    setYear(state.year + dt * state.speed);
    if (state.year >= Y1) setPlaying(false);
  } else if (story.tick(t)) { /* story drives the year */ } else if (scene && map.getZoom() >= 10.3) render();
  requestAnimationFrame(frame);
}

// ---------- info card + events ----------
const info = $('info');
const fmtWhen = (y) => { const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Math.min(11, Math.floor((y % 1) * 12))]; return `${m} ${Math.floor(y)}`; };
function showInfo(ev, storyIdx) {
  marker = ev;
  info.innerHTML = `<button class="close" aria-label="Close">×</button><h2></h2><div class="when"></div><p></p><a target="_blank" rel="noopener">Read more</a>` +
    (storyIdx != null ? `<div class="nav"><button data-a="prev">‹ Back</button><button data-a="pause">Pause</button><button data-a="next">Next ›</button><span class="count">${storyIdx + 1} of ${STORY.length}</span></div>` : '');
  info.querySelector('h2').textContent = ev.title; info.querySelector('.when').textContent = fmtWhen(ev.year);
  info.querySelector('p').textContent = ev.text; info.querySelector('a').href = ev.url;
  info.hidden = false;
  info.querySelector('.close').onclick = () => (story.active ? story.exit() : hideInfo());
  info.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => story[b.dataset.a]()));
}
function hideInfo() { info.hidden = true; marker = null; effect = null; render(); }
function buildTicks() {
  const el = $('event-ticks');
  for (const ev of EVENTS) {
    const i = document.createElement('i');
    i.style.left = `${((ev.year - Y0) / (Y1 - Y0)) * 100}%`; i.title = `${Math.floor(ev.year)} · ${ev.title}`;
    i.addEventListener('click', () => { story.interrupt(); setPlaying(false); setYear(ev.year + 0.02); showInfo(ev);
      if (map.getBounds().contains([ev.lon, ev.lat]) === false || map.getZoom() < 11) map.flyTo({ center: [ev.lon, ev.lat], zoom: Math.max(map.getZoom(), ev.story?.zoom ?? 12.5), duration: 2200 }); });
    el.appendChild(i);
  }
}

// ---------- story ----------
const story = (() => {
  let idx = -1, phase = 'off', t0 = 0, dur = 0, yFrom = 0, paused = false, bearing0 = 0;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  function go(i) {
    idx = Math.max(0, Math.min(STORY.length - 1, i));
    const s = STORY[idx], c = map.getCenter();
    const dist = Math.hypot((c.lng - s.lon) * 75, (c.lat - s.lat) * 111);
    dur = Math.max(2600, Math.min(7000, 2600 + dist * 220)); yFrom = state.year; t0 = performance.now(); phase = 'fly'; paused = false; effect = null;
    map.flyTo({ center: [s.lon, s.lat], zoom: s.story.zoom, pitch: s.story.pitch, bearing: s.story.bearing, duration: dur, essential: true });
    showInfo(s, idx);
  }
  function dwell() {
    const s = STORY[idx];
    phase = 'dwell'; t0 = performance.now(); dur = Math.max(9000, s.text.length * 62); bearing0 = s.story.bearing;
    if (s.story.effect === 'fire') effect = { kind: 'fire', lon: s.lon, lat: s.lat };
    if (s.story.effect === 'shake') { $('map').classList.remove('shake'); void $('map').offsetWidth; $('map').classList.add('shake'); }
    map.easeTo({ bearing: bearing0 + 22, duration: dur, easing: (x) => x, essential: true });
  }
  const api = {
    get active() { return phase !== 'off'; },
    start() { setPlaying(false); $('story').setAttribute('aria-pressed', 'true'); go(0); },
    exit() { phase = 'off'; idx = -1; map.stop(); $('story').setAttribute('aria-pressed', 'false'); hideInfo(); },
    interrupt() { if (phase !== 'off') api.exit(); },
    next() { if (idx >= STORY.length - 1) api.exit(); else go(idx + 1); },
    prev() { go(idx - 1); },
    pause() {
      paused = !paused; const b = info.querySelector('[data-a="pause"]'); if (b) b.textContent = paused ? 'Resume' : 'Pause';
      if (paused) map.stop(); else if (phase === 'dwell') { t0 = performance.now(); map.easeTo({ bearing: map.getBearing() + 15, duration: dur, easing: (x) => x }); } else go(idx);
    },
    tick(t) {
      if (phase === 'off') return false;
      if (paused) { render(); return true; }
      const s = STORY[idx], f = Math.min(1, (t - t0) / dur);
      if (phase === 'fly') { setYear(yFrom + (s.year + 0.05 - yFrom) * ease(f)); if (f >= 1) dwell(); }
      else { setYear(Math.min(Y1, s.year + 0.05 + f * 1.2)); if (f >= 1) api.next(); }
      return true;
    },
  };
  return api;
})();
$('story').addEventListener('click', () => (story.active ? story.exit() : story.start()));
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); if (story.active) story.pause(); else setPlaying(!state.playing); }
  else if (e.key === 'Escape') { if (story.active) story.exit(); else hideInfo(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (story.active) { e.key === 'ArrowRight' ? story.next() : story.prev(); return; }
    if (document.activeElement === slider) return;
    setYear(Math.floor(state.year) + (e.key === 'ArrowRight' ? 1 : -1));
  }
});

// ---------- sources panel ----------
$('sources').innerHTML = `<h3>About this map</h3>
<p>Every building in King County, drawn in the year the county assessor says it was built.</p>
<p><b>What is real and what is illustration.</b> Buildings that still stand are real footprints with recorded dates. The buildings that are gone — the wooden town before the 1889 fire, the early villages, Hooverville — are an <i>illustrative reconstruction</i>: plausible lots laid along today’s streets, appearing as the census population grew and disappearing when the fire, the regrades or the building that stands there now replaced them. They are not surveyed footprints. Roof shapes, colours, ships, trains and aircraft are period-typical models, not individual vessels, and they move far faster than life. A few landmarks (Yesler’s mill, the Territorial University, the Denny Hotel, the Kingdome, the Viaduct, the Space Needle, the stadiums, the Spheres, the container cranes) are placed by hand. The twenty tallest towers and the Smith Tower use their real footprints, heights and completion years with stylised massing.</p>
<p><b>Buildings:</b> footprints and heights from <a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps</a> (OpenStreetMap, Microsoft and others), joined to year-built records from the <a href="https://info.kingcounty.gov/assessor/DataDownload/default.aspx" target="_blank" rel="noopener">King County Department of Assessments</a> through county parcel polygons. The assessor records anything from 1900 or earlier as “1900”; those buildings are spread over 1888–1900 by distance from the old town centres, which is an estimate. About 4% of buildings have no record and take the year of their nearest dated neighbour.</p>
<p><b>Streets</b> (OpenStreetMap via Overture) appear when the buildings along them do, which is also an estimate. Freeways use their opening years.</p>
<p><b>Transit:</b> OpenStreetMap routes with Sound Transit and City of Seattle opening dates. <b>Terrain:</b> Mapzen/AWS terrain tiles. <b>Population:</b> U.S. Census; 2026 from the Washington Office of Financial Management.</p>
<p>The historic tide-flat outline is approximate. Place names before 1853 are anglicised Lushootseed names of Duwamish villages.</p>
<p>Inspired by Theo Jaffee’s <a href="https://bay.theojaffee.net/" target="_blank" rel="noopener">Bay Area Through Time</a>.</p>`;
$('sources-btn').addEventListener('click', () => ($('sources').hidden = !$('sources').hidden));

// ---------- boot ----------
async function boot() {
  const loading = $('loading');
  let done = 0; const total = 9;
  const step = (p) => p.then((v) => { loading.textContent = `Loading Seattle… ${Math.round((++done / total) * 100)}%`; return v; });
  await Promise.all([document.fonts.load('700 20px "Cormorant Garamond"'), document.fonts.load('600 20px "Cormorant Garamond"'), document.fonts.load('italic 500 20px "Cormorant Garamond"'), new Promise((r) => map.once('load', r))]);
  map.addControl(overlay);
  const [bi, si] = await Promise.all([step(fetchJSON('b/index.json')), step(fetchJSON('s/index.json')),
    step(loadGrowth()),
    step(fetchBin('roads-major.bin.gz').then((b) => (roadsMajor = decodeRoads(b)))),
    step(fetchBin('rail.bin.gz').then((b) => (rail = decodeRoads(b)))),
    step(fetchJSON('scene.json').then((d) => { scene = createScene(d); lost = buildLost(d.lost, [-122.334, 47.6017]); statics = buildStatic(d); })),
    step(fetchJSON('transit.json').then((t) => { transit = t; buildTrainPaths(); })),
    step(fetchJSON('park-labels.json').then((p) => (parkLabels = p.map((x) => ({ ...x, start: PARK_YEARS[x.name] ?? 1935 }))))),
    step(fetchJSON('cities.geojson').then((c) => {
      const s = c.features.find((f) => f.properties.name === 'Seattle');
      if (s) seattleRings = s.geometry.type === 'Polygon' ? s.geometry.coordinates : s.geometry.coordinates.flat();
    })),
  ]);
  for (const t of bi.tiles) bTiles.have.add(`${t[0]}_${t[1]}`);
  for (const t of si.tiles) sTiles.have.add(`${t[0]}_${t[1]}`);
  map.getSource('tideflats').setData({ type: 'FeatureCollection', features: [TIDEFLATS] });
  map.addSource('growth', { type: 'canvas', canvas: growth.canvas, coordinates: growth.coords, animate: false });
  map.addLayer({ id: 'growth', type: 'raster', source: 'growth', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'parks');
  buildTicks();
  map.on('move', () => { updatePopulation(); render(); });
  map.on('moveend', () => { updateTiles(); render(); writeHash(); });
  let moveTimer = 0;
  map.on('move', () => { if (!moveTimer) moveTimer = setTimeout(() => { moveTimer = 0; updateTiles(); }, 350); });
  setYear(state.year); updateTiles();
  loading.classList.add('done');
  requestAnimationFrame(frame);
  fetchBin('dots.bin.gz').then((b) => { dots = decodeDots(b); render(); }).catch((e) => console.warn('dots', e));
  window.__ready = true;
  window.__app = { map, state, setYear, story };
  const q = new URLSearchParams(location.search);
  if (q.has('story')) story.start();
  // warn when WebGL is software-rendered
  try {
    const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '');
    if (/swiftshader|llvmpipe|softpipe|software/i.test(r)) { const n = $('notice'); n.hidden = false; n.innerHTML = 'Your browser is drawing this map <b>without the graphics card</b>, so it will be slow. Turn on hardware acceleration in the browser settings and reload. <a href="#" style="color:inherit">×</a>'; n.querySelector('a').onclick = (ev) => { ev.preventDefault(); n.hidden = true; }; }
  } catch { /* ignore */ }
}
boot().catch((e) => { console.error(e); $('loading').textContent = 'Something went wrong loading the map.'; });
