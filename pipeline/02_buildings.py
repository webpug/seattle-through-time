"""Join Overture footprints to King County Assessor year-built via parcel polygons.
Writes public/data/b/{x}_{y}.bin.gz (z13 tiles), public/data/b/index.json,
public/data/growth.bin.gz (first-building-year raster) and raw/bldg_pts.npz."""
import os, json, glob, gzip, math, struct, time
import numpy as np, pandas as pd, shapely, duckdb
from shapely import STRtree

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
os.makedirs(os.path.join(OUT, 'b'), exist_ok=True)
Z = 13
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.0f}s]', *a, flush=True)

# ---------- 1. assessor year built ----------
def rd(name, cols):
    df = pd.read_csv(os.path.join(RAW, 'assessor', name), usecols=cols, dtype=str, encoding='latin-1')
    return df.apply(lambda s: s.str.strip())
frames = []
r = rd('EXTR_ResBldg.csv', ['Major', 'Minor', 'YrBuilt', 'Stories']); r['st'] = r.Stories; frames.append(r)
c = rd('EXTR_CommBldg.csv', ['Major', 'Minor', 'YrBuilt', 'NbrStories']); c['st'] = c.NbrStories; frames.append(c)
a = rd('EXTR_AptComplex.csv', ['Major', 'Minor', 'YrBuilt', 'NbrStories']); a['st'] = a.NbrStories; frames.append(a)
k = rd('EXTR_CondoComplex.csv', ['Major', 'YrBuilt', 'NbrStories']); k['Minor'] = '0000'; k['st'] = k.NbrStories; frames.append(k)
al = pd.concat([f[['Major', 'Minor', 'YrBuilt', 'st']] for f in frames])
al['pin'] = al.Major.str.zfill(6) + al.Minor.str.zfill(4)
al['yr'] = pd.to_numeric(al.YrBuilt, errors='coerce'); al['st'] = pd.to_numeric(al.st, errors='coerce')
al = al[(al.yr >= 1850) & (al.yr <= 2026)]
g = al.groupby('pin').agg(yr=('yr', 'min'), st=('st', 'max'))
pin_year = g.yr.to_dict(); pin_st = g.st.to_dict()
log('assessor pins with year', len(pin_year))

# ---------- 2. parcels ----------
polys, pins = [], []
for f in sorted(glob.glob(os.path.join(RAW, 'parcels', '*.geojson'))):
    for ft in json.load(open(f))['features']:
        gm = ft.get('geometry')
        if not gm: continue
        polys.append(json.dumps(gm)); pins.append(ft['properties'].get('PIN') or '')
pg = shapely.from_geojson(polys, on_invalid='ignore')
ok = ~shapely.is_missing(pg)
pg = pg[ok]; pins = np.array(pins, dtype=object)[ok]
pg = shapely.make_valid(pg)
log('parcels', len(pg))
p_year = np.array([pin_year.get(p, 0) for p in pins], dtype=np.int32)
p_st = np.array([pin_st.get(p, 0) or 0 for p in pins], dtype=np.float32)
ptree = STRtree(pg)

# ---------- 3. buildings ----------
con = duckdb.connect()
df = con.execute(f"SELECT wkb, height, num_floors, name FROM '{RAW}/ov_buildings.parquet'").df()
geom = shapely.from_wkb(np.array([bytes(v) for v in df.wkb.values], dtype=object))
cen = shapely.centroid(geom)
bi, pi = ptree.query(cen, predicate='within')
first = np.full(len(geom), -1, dtype=np.int64)
# keep the first parcel hit per building
_, ui = np.unique(bi, return_index=True)
first[bi[ui]] = pi[ui]
keep = first >= 0
log('buildings', len(geom), 'in a KC parcel', int(keep.sum()))
geom = geom[keep]; cen = cen[keep]; first = first[keep]
h = df.height.values[keep].astype(np.float64); fl = df.num_floors.values[keep].astype(np.float64)
names = df.name.values[keep]
year = p_year[first].astype(np.int32); st = p_st[first]

# metres (local equirectangular)
LAT0 = 47.5; KX = 111320 * math.cos(math.radians(LAT0)); KY = 110950
cx = shapely.get_x(cen); cy = shapely.get_y(cen)
def to_m(c): return np.column_stack([c[:, 0] * KX, c[:, 1] * KY])
gm = shapely.transform(geom, to_m)
area = shapely.area(gm)
big = area >= 18
# fill unknown years from the nearest dated building
known = year > 0
log('year known', int(known.sum()), 'unknown', int((~known).sum()))
pts_m = shapely.points(cx * KX, cy * KY)
kt = STRtree(pts_m[known]); kyears = year[known]
qi, ti = kt.query_nearest(pts_m[~known], max_distance=400, all_matches=False)
est = np.zeros(len(year), dtype=bool)
unk_idx = np.where(~known)[0]
year[unk_idx[qi]] = kyears[ti]; est[unk_idx[qi]] = True
# The assessor stamps 1900 on anything built in or before 1900. Spread those back over
# 1888-1900 by distance from the nearest 19th-century town centre (an estimate, flagged).
OLD = [(-122.3340,47.6015),(-122.3835,47.6680),(-122.3500,47.6510),(-122.3210,47.5475),(-122.2870,47.5600),(-122.2060,47.4800),
       (-122.2350,47.3810),(-122.2290,47.3075),(-122.2090,47.6770),(-122.0330,47.5300),(-122.3870,47.5620),(-122.3130,47.6610),(-121.8250,47.5290)]
is1900 = year == 1900
dkm = np.min([np.hypot((cx - ox) * KX, (cy - oy) * KY) for ox, oy in OLD], axis=0) / 1000
jit = ((np.abs(cx * 1e6).astype(np.int64) * 7919 + np.abs(cy * 1e6).astype(np.int64) * 104729) % 5)
spread = np.clip(np.round(1888 + np.minimum(dkm, 4) * 2.5 + jit), 1888, 1900).astype(np.int32)
year = np.where(is1900, spread, year); est |= is1900
log('1900-stamped', int(is1900.sum()))
sel = big & (year > 0)
log('kept', int(sel.sum()))

# heights
hh = np.where(np.isfinite(h) & (h > 1.5), h, np.nan)
hh = np.where(np.isnan(hh) & np.isfinite(fl) & (fl > 0), fl * 3.3 + 1, hh)
hh = np.where(np.isnan(hh) & (st > 0), st * 3.2 + 1.5, hh)
hh = np.where(np.isnan(hh), np.where(area > 1500, 8, np.where(area < 60, 3, 5.5)), hh)
hh = np.clip(hh, 2.5, 300)

gm = gm[sel]; year = year[sel]; hh = hh[sel]; cx = cx[sel]; cy = cy[sel]; est = est[sel]; names = names[sel]; area = area[sel]
# largest polygon part, outer ring, simplified
parts = shapely.get_num_geometries(gm)
multi = parts > 1
if multi.any():
    for i in np.where(multi)[0]:
        ps = shapely.get_parts(gm[i]); ps = ps[shapely.get_type_id(ps) == 3]
        gm[i] = ps[np.argmax(shapely.area(ps))] if len(ps) else None
ok = (shapely.get_type_id(gm) == 3)
gm = shapely.simplify(gm, 0.35, preserve_topology=True)
ring = shapely.get_exterior_ring(gm)
ring = np.where(shapely.is_ccw(ring), shapely.reverse(ring), ring)  # clockwise
log('rings ready')

n = 1 << Z
tx = np.floor((cx + 180) / 360 * n).astype(np.int64)
ty = np.floor((1 - np.arcsinh(np.tan(np.radians(cy))) / math.pi) / 2 * n).astype(np.int64)
def tile_bounds(x, y):
    w = x / n * 360 - 180; e = (x + 1) / n * 360 - 180
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return w, lat(y + 1), e, lat(y)
order = np.lexsort((ty, tx)); index = []
bounds = np.flatnonzero(np.diff(tx[order] * 100000 + ty[order])) + 1
tot_bytes = 0
for grp in np.split(order, bounds):
    grp = grp[ok[grp]]
    if not len(grp): continue
    x, y = int(tx[grp[0]]), int(ty[grp[0]])
    w, s, e, nn = tile_bounds(x, y)
    ox, oy = (w + e) / 2, (s + nn) / 2
    qx = (e - w) / 40000; qy = (nn - s) / 40000  # int16 with margin for overhang
    coords, cnt = shapely.get_coordinates(ring[grp], return_index=True)
    counts = np.bincount(cnt, minlength=len(grp)).astype(np.uint16)
    lon = coords[:, 0] / KX; lat = coords[:, 1] / KY
    xy = np.empty((len(coords), 2), dtype=np.int16)
    xy[:, 0] = np.clip(np.round((lon - ox) / qx), -32767, 32767); xy[:, 1] = np.clip(np.round((lat - oy) / qy), -32767, 32767)
    buf = struct.pack('<II4d', len(grp), len(coords), ox, oy, qx, qy)
    buf += year[grp].astype(np.uint16).tobytes() + np.round(hh[grp] * 10).astype(np.uint16).tobytes() + counts.tobytes() + xy.tobytes()
    z = gzip.compress(buf, 6); tot_bytes += len(z)
    open(os.path.join(OUT, 'b', f'{x}_{y}.bin.gz'), 'wb').write(z)
    index.append([x, y, len(grp)])
json.dump({'z': Z, 'tiles': index}, open(os.path.join(OUT, 'b', 'index.json'), 'w'), separators=(',', ':'))
log('tiles', len(index), 'MB', round(tot_bytes / 1e6, 1))

# ---------- growth raster: year of 1st and 4th building per ~120 m cell ----------
X0, Y0, X1, Y1 = -122.55, 47.07, -121.05, 47.79
CW = 120 / KX; CH = 120 / KY
W = int((X1 - X0) / CW) + 1; H = int((Y1 - Y0) / CH) + 1
ci = ((Y1 - cy) / CH).astype(np.int64) * W + ((cx - X0) / CW).astype(np.int64)
o = np.lexsort((year, ci)); ci_s = ci[o]; y_s = year[o]
starts = np.flatnonzero(np.r_[True, np.diff(ci_s) != 0]); lens = np.diff(np.r_[starts, len(ci_s)])
g1 = np.zeros(W * H, dtype=np.uint16); g4 = np.zeros(W * H, dtype=np.uint16)
g1[ci_s[starts]] = y_s[starts]
m = lens >= 4; g4[ci_s[starts[m]]] = y_s[starts[m] + 3]
hdr = json.dumps({'x0': X0, 'y1': Y1, 'cw': CW, 'ch': CH, 'w': W, 'h': H}).encode()
open(os.path.join(OUT, 'growth.bin.gz'), 'wb').write(gzip.compress(struct.pack('<I', len(hdr)) + hdr + b' ' * ((-len(hdr)) % 4) + g1.tobytes() + g4.tobytes(), 9))
np.savez(os.path.join(RAW, 'bldg_pts.npz'), x=cx, y=cy, year=year, h=hh, est=est, area=area, names=names.astype(str))
hist = np.bincount((year // 10 * 10).astype(int))
log('decades', {int(d): int(hist[d]) for d in range(1850, 2030, 10)})
log('estimated-year share', round(float(est.mean()), 3), 'tallest', [(float(hh[i]), str(names[i])) for i in np.argsort(hh)[-8:]])
