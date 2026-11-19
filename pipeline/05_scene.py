"""Scene data for the animated layer.

Writes public/data/scene.json:
  lost    - an ILLUSTRATIVE reconstruction of buildings that no longer stand (the pre-fire town,
            the villages around it). Lots are laid out along today's streets, appear as the census
            population grows, and disappear when the building that stands there now was built
            (or in the 1889 fire). These are not surveyed footprints.
  routes  - rail and freeway routes snapped to the OSM network, and hand-drawn water / air routes
            (water routes are checked against the water polygons)."""
import os, json, math, heapq, sys
import numpy as np, shapely, duckdb
from shapely import STRtree

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
LAT0 = 47.5; KX = 111320 * math.cos(math.radians(LAT0)); KY = 110950
con = duckdb.connect()
rng = np.random.default_rng(1889)
def to_m(c): return np.column_stack([c[:, 0] * KX, c[:, 1] * KY])
def geoms(df): return shapely.from_wkb(np.array([bytes(v) for v in df.wkb.values], dtype=object))
def M(lon, lat): return np.array([lon * KX, lat * KY])

# ---------------------------------------------------------------- water
wj = json.load(open(os.path.join(OUT, 'water.geojson')))
water = shapely.make_valid(shapely.from_geojson([json.dumps(f['geometry']) for f in wj['features']]))
water_m = shapely.transform(water, to_m)
wtree = STRtree(water_m)
def in_water(pts_m):
    q, _ = wtree.query(pts_m, predicate='intersects')
    o = np.zeros(len(pts_m), dtype=bool); o[q] = True
    return o

# ---------------------------------------------------------------- network routes
def graph(df):
    g = {}
    for ln in geoms(df):
        if ln is None: continue
        parts = shapely.get_parts(ln) if shapely.get_type_id(ln) == 5 else [ln]
        for p in parts:
            c = shapely.get_coordinates(p)
            k = [(round(x, 6), round(y, 6)) for x, y in c]
            for a, b in zip(k[:-1], k[1:]):
                if a == b: continue
                w = math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)
                g.setdefault(a, []).append((b, w)); g.setdefault(b, []).append((a, w))
    return g
def nearest(g, p):
    ks = np.array(list(g.keys())); d = np.hypot((ks[:, 0] - p[0]) * KX, (ks[:, 1] - p[1]) * KY)
    i = int(np.argmin(d)); return tuple(ks[i]), float(d[i])
def route(g, pts, name):
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        (s, ds), (t, dt) = nearest(g, a), nearest(g, b)
        dist = {s: 0.0}; prev = {}; pq = [(0.0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == t: break
            if d > dist.get(u, 1e18): continue
            for v, w in g[u]:
                nd = d + w
                if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
        if t not in dist:
            print('  !! no route', name, a, b, 'snap', round(ds), round(dt)); return None
        path = [t]
        while path[-1] != s: path.append(prev[path[-1]])
        path.reverse(); out += path if not out else path[1:]
    ln = shapely.simplify(shapely.LineString([(x * KX, y * KY) for x, y in out]), 4)
    c = shapely.get_coordinates(ln)
    print(f'  route {name}: {round(ln.length / 1000, 1)} km, {len(c)} pts')
    return [[round(x / KX, 6), round(y / KY, 6)] for x, y in c]

routes = {}
rail = con.execute(f"SELECT wkb FROM '{RAW}/ov_segments.parquet' WHERE subtype='rail' AND class IN ('standard_gauge','unknown')").df()
rg = graph(rail)
routes['rail_south'] = route(rg, [(-122.3297, 47.5975), (-122.2355, 47.3840), (-122.2300, 47.3072)], 'rail_south')
routes['rail_north'] = route(rg, [(-122.3297, 47.5990), (-122.3760, 47.6480), (-122.4040, 47.6900), (-122.3890, 47.7650)], 'rail_north')
mw = con.execute(f"SELECT wkb FROM '{RAW}/ov_segments.parquet' WHERE subtype='road' AND class IN ('motorway','trunk')").df()
mg = graph(mw)
routes['i5'] = route(mg, [(-122.3290, 47.7730), (-122.3220, 47.6120), (-122.2700, 47.4700), (-122.2950, 47.3100)], 'i5')
routes['i90'] = route(mg, [(-122.3050, 47.5905), (-122.2500, 47.5900), (-122.1900, 47.5800), (-122.0600, 47.5420)], 'i90')
routes['sr520'] = route(mg, [(-122.3200, 47.6440), (-122.2600, 47.6440), (-122.1400, 47.6500)], 'sr520')
routes['i405'] = route(mg, [(-122.1880, 47.7600), (-122.1880, 47.6100), (-122.2000, 47.4800)], 'i405')
routes['sr99'] = route(mg, [(-122.3440, 47.6900), (-122.3473, 47.6466), (-122.3440, 47.6250)], 'sr99')

# hand-drawn water routes (lon, lat). Checked against the water polygons below.
WATER_ROUTES = {
    'alki': [(-122.4190, 47.5830), (-122.4050, 47.5990), (-122.3700, 47.6060), (-122.3410, 47.6027)],
    'bainbridge': [(-122.3410, 47.6027), (-122.3600, 47.6050), (-122.4200, 47.6120), (-122.4700, 47.6190), (-122.4900, 47.6212)],
    'bremerton': [(-122.3410, 47.6020), (-122.3650, 47.6020), (-122.4300, 47.5930), (-122.4900, 47.5750), (-122.5400, 47.5700)],
    'sound_south': [(-122.3420, 47.6040), (-122.3800, 47.6100), (-122.4350, 47.6000), (-122.4350, 47.5500), (-122.4150, 47.5000), (-122.4050, 47.4500),
                    (-122.3600, 47.4100), (-122.3550, 47.3700), (-122.4000, 47.3400), (-122.4400, 47.3250)],
    'sound_north': [(-122.3440, 47.6060), (-122.3800, 47.6130), (-122.4400, 47.6250), (-122.4600, 47.6700), (-122.4300, 47.7400), (-122.4200, 47.7850)],
    'duwamish': [(-122.4400, 47.6200), (-122.3800, 47.6080), (-122.3520, 47.5960), (-122.3440, 47.5900), (-122.3432, 47.5800)],
    'cruise': [(-122.4600, 47.6500), (-122.4200, 47.6150), (-122.3900, 47.6180), (-122.3810, 47.6270)],
    'vashon': [(-122.3975, 47.5232), (-122.4300, 47.5170), (-122.4630, 47.5110)],
    'lakewa_bellevue': [(-122.2850, 47.6005), (-122.2550, 47.6030), (-122.2250, 47.6040), (-122.2165, 47.6066)],
    'lakewa_kirkland': [(-122.2760, 47.6360), (-122.2500, 47.6500), (-122.2150, 47.6740)],
    'canoe_bay': [(-122.3610, 47.5800), (-122.3600, 47.5900), (-122.3480, 47.5990), (-122.3400, 47.6040)],
    'canoe_shilshole': [(-122.4130, 47.6760), (-122.4400, 47.6600), (-122.4250, 47.6300), (-122.3700, 47.6120)],
    'canoe_lake': [(-122.2760, 47.6470), (-122.2650, 47.6350), (-122.2600, 47.6100), (-122.2700, 47.5900)],
    'lakeunion': [(-122.3345, 47.6440), (-122.3350, 47.6380), (-122.3370, 47.6290)],
}
bad = 0
for k, r in WATER_ROUTES.items():
    ln = shapely.LineString([M(*p) for p in r])
    s = np.arange(0, ln.length, 60.0)
    pts = shapely.line_interpolate_point(ln, s)
    dry = ~in_water(pts)
    if dry.any():
        bad += 1
        c = shapely.get_coordinates(pts[dry])
        print(f'  !! water route {k}: {int(dry.sum())}/{len(s)} samples on land, e.g.', [(round(x / KX, 4), round(y / KY, 4)) for x, y in c[:: max(1, len(c) // 4)][:5]])
    routes[k] = [list(p) for p in r]
print('water routes with dry samples:', bad)

# ---------------------------------------------------------------- lost buildings
# (lon, lat, radius m, commercial core radius m, [(year, count), ...])
SEA = [(1852.2, 3), (1853.3, 12), (1855, 30), (1860, 45), (1865, 70), (1870, 200), (1875, 320), (1880, 650), (1885, 1900), (1889.4, 4600), (1891, 5400), (1895, 6600), (1900, 7600)]
def village(y0, n, y1=1903): return [(y0, 2), ((y0 + y1) / 2, n * 0.35), (y1, n)]
CENTRES = [
    ('Seattle', -122.3340, 47.6017, 2700, 520, SEA),
    ('Alki', -122.4100, 47.5790, 260, 0, [(1851.87, 2), (1852.2, 8), (1870, 9), (1900, 30)]),
    ('Ballard', -122.3835, 47.6680, 800, 150, village(1887, 520)),
    ('Fremont', -122.3500, 47.6510, 450, 90, village(1888, 190)),
    ('Brooklyn', -122.3130, 47.6610, 420, 70, village(1890, 150)),
    ('Georgetown', -122.3210, 47.5475, 450, 90, village(1880, 180)),
    ('Columbia', -122.2870, 47.5600, 330, 70, village(1891, 100)),
    ('West Seattle', -122.3870, 47.5620, 420, 70, village(1888, 130)),
    ('Renton', -122.2060, 47.4800, 520, 110, village(1875, 220)),
    ('Newcastle', -122.1650, 47.5300, 320, 0, village(1869, 70)),
    ('Kent', -122.2350, 47.3810, 450, 100, village(1884, 180)),
    ('Auburn', -122.2290, 47.3075, 450, 100, village(1886, 170)),
    ('Kirkland', -122.2090, 47.6770, 420, 80, village(1888, 140)),
    ('Issaquah', -122.0330, 47.5300, 360, 80, village(1887, 120)),
    ('Redmond', -122.1215, 47.6740, 300, 60, village(1883, 70)),
    ('Bothell', -122.2050, 47.7600, 300, 60, village(1887, 80)),
    ('Snoqualmie', -121.8250, 47.5290, 280, 60, village(1889, 70)),
    ('Black Diamond', -122.0030, 47.3090, 320, 50, village(1884, 90)),
    ('Enumclaw', -121.9920, 47.2040, 360, 80, village(1885, 110)),
]
FIRE = shapely.Polygon([M(*p) for p in [(-122.3415, 47.6068), (-122.3385, 47.6078), (-122.3350, 47.6050), (-122.3305, 47.6025), (-122.3290, 47.6017),
                                         (-122.3290, 47.5983), (-122.3345, 47.5983), (-122.3368, 47.6015), (-122.3392, 47.6045)]])
FIRE_ORIGIN = M(-122.3372, 47.6045); FIRE_T = 1889.43
TIDE = shapely.Polygon([M(*p) for p in [(-122.3372, 47.5990), (-122.3290, 47.5985), (-122.3215, 47.5935), (-122.3200, 47.5850), (-122.3215, 47.5760), (-122.3260, 47.5690),
                                         (-122.3330, 47.5650), (-122.3420, 47.5640), (-122.3600, 47.5650), (-122.3640, 47.5720), (-122.3620, 47.5850), (-122.3530, 47.5905), (-122.3420, 47.5950)]])
DENNY = M(-122.3420, 47.6140)

roads = con.execute(f"SELECT class, wkb FROM '{RAW}/ov_segments.parquet' WHERE subtype='road' AND class IN ('residential','tertiary','secondary','primary','unclassified','trunk','living_street','motorway','service')").df()
rgeo = shapely.transform(geoms(roads), to_m); rcls = roads['class'].values
okr = ~shapely.is_missing(rgeo); rgeo = rgeo[okr]; rcls = rcls[okr]
rtree = STRtree(rgeo)
HALF = {'primary': 9.5, 'secondary': 9.5, 'trunk': 10, 'tertiary': 8, 'residential': 6.5, 'unclassified': 6.5, 'living_street': 5}

b = np.load(os.path.join(RAW, 'bldg_pts.npz'), allow_pickle=True)
bx, by, byear, barea = b['x'] * KX, b['y'] * KY, b['year'], b['area']
btree = STRtree(shapely.points(bx, by)); brad = np.sqrt(barea / math.pi) * 1.1

def count_at(curve, n):
    """year at which the curve reaches n buildings (log interpolation)."""
    ys = np.array([c[0] for c in curve]); ns = np.log(np.array([max(c[1], 1) for c in curve], dtype=float))
    return np.interp(np.log(np.maximum(n, 1)), ns, ys)

cols = {k: [] for k in 'x y w d a h s e t'.split()}
for name, lon, lat, R, core, curve in CENTRES:
    c0 = M(lon, lat)
    idx = rtree.query(shapely.Point(c0).buffer(R))
    idx = idx[np.isin(rcls[idx], list(HALF))]
    cx, cy, ww, dd, ang, typ, dist = [], [], [], [], [], [], []
    for i in idx:
        ln = rgeo[i]; L = ln.length
        if L < 14: continue
        hw = HALF[rcls[i]]
        for side in (-1, 1):
            s = 5 + rng.uniform(0, 4)
            while s < L - 6:
                p = ln.interpolate(s); dc = math.hypot(p.x - c0[0], p.y - c0[1])
                comm = dc < core
                w = rng.uniform(7, 11) if comm else rng.uniform(6.5, 9.5)
                d = rng.uniform(14, 22) if comm else rng.uniform(7.5, 11.5)
                gap = rng.uniform(0.3, 1.2) if comm else rng.uniform(4, 11) * (1 + dc / R)
                keep = rng.uniform() < (0.95 if comm else max(0.12, 0.85 - 0.75 * dc / R))
                if keep and dc < R:
                    q1 = ln.interpolate(s - 1.5); q2 = ln.interpolate(s + 1.5)
                    tx, ty = q2.x - q1.x, q2.y - q1.y; tl = math.hypot(tx, ty) or 1; tx /= tl; ty /= tl
                    off = hw + d / 2 + (0.5 if comm else rng.uniform(2, 5))
                    cx.append(p.x - ty * side * off); cy.append(p.y + tx * side * off); ww.append(w); dd.append(d)
                    ang.append(math.atan2(ty, tx)); typ.append(2 if comm else 1); dist.append(dc)
                s += w + gap
    if not cx: print(name, 'no lots'); continue
    cx, cy, ww, dd, ang, typ, dist = map(np.array, (cx, cy, ww, dd, ang, typ, dist))
    ca, sa = np.cos(ang), np.sin(ang)
    def rect(scale=1.0):
        hx, hy = ww / 2 * scale, dd / 2 * scale
        corners = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
        pts = np.stack([np.column_stack([cx + ox * ca - oy * sa, cy + ox * sa + oy * ca]) for ox, oy in corners], axis=1)
        return shapely.polygons(pts)
    poly = rect()
    ok = np.ones(len(cx), dtype=bool)
    # not on a street, not in the water, not on the tide flats
    q, _ = rtree.query(poly, predicate='dwithin', distance=3.5); ok[q] = False
    q, _ = wtree.query(poly, predicate='intersects'); ok[q] = False
    ok &= ~shapely.intersects(poly, TIDE)
    # earliest lots are the ones nearest the centre (with some noise)
    rank = dist * rng.uniform(0.75, 1.35, len(dist))
    order = np.argsort(rank)
    a_, b_ = STRtree(poly).query(poly, predicate='intersects')
    nb = {}
    for i, j in zip(a_, b_):
        if i != j: nb.setdefault(int(i), []).append(int(j))
    kept = np.zeros(len(cx), dtype=bool); sel = []
    cap = int(curve[-1][1])
    for i in order:
        if not ok[i] or any(kept[j] for j in nb.get(int(i), ())): continue
        kept[i] = True; sel.append(i)
        if len(sel) >= cap: break
    sel = np.array(sel)
    start = count_at(curve, np.arange(1, len(sel) + 1)) + rng.uniform(0, 0.12, len(sel))
    # replaced by the building that stands there today
    pts = shapely.points(cx[sel], cy[sel])
    qi, bi = btree.query(pts, predicate='dwithin', distance=95)
    dd_ = np.hypot(cx[sel][qi] - bx[bi], cy[sel][qi] - by[bi])
    hit = dd_ < brad[bi] + 6
    repl = np.full(len(sel), 9999.0)
    np.minimum.at(repl, qi[hit], byear[bi[hit]].astype(float))
    end = np.where(repl < 9999, repl, np.clip(start + rng.uniform(25, 72, len(sel)), 1901, 1968))
    t = typ[sel].copy(); h = np.where(t == 2, rng.uniform(6, 9.5, len(sel)), rng.uniform(4.2, 7, len(sel)))
    early = start < 1863; t[early & (t == 1)] = 0; h[t == 0] = rng.uniform(3, 3.8, int((t == 0).sum()))
    w_ = ww[sel].copy(); d_ = dd[sel].copy()
    w_[t == 0] *= 0.75; d_[t == 0] *= 0.7
    # Denny Hill: sluiced away in the regrades
    dh = np.hypot(cx[sel] - DENNY[0], cy[sel] - DENNY[1]) < 400
    west = cx[sel] < -122.3415 * KX
    end = np.where(dh & west, np.minimum(end, 1906 + rng.uniform(0, 5, len(sel))), end)
    end = np.where(dh & ~west, np.minimum(end, 1928.8 + rng.uniform(0, 1.6, len(sel))), end)
    # the Great Fire
    burn = shapely.intersects(pts, FIRE) & (start < FIRE_T)
    fd = np.hypot(cx[sel] - FIRE_ORIGIN[0], cy[sel] - FIRE_ORIGIN[1])
    end_fire = FIRE_T + 0.02 + fd / 900 * 0.3
    live = (end > start + 2) | burn
    n_reb = 0
    for k in np.where(live)[0]:
        i = sel[k]
        e = end_fire[k] if burn[k] else end[k]
        for key, v in zip('x y w d a h s e t'.split(), (cx[i] / KX, cy[i] / KY, w_[k], d_[k], math.degrees(ang[i]), h[k], start[k], e, int(t[k]))): cols[key].append(v)
        if burn[k] and end[k] > 1893:
            # rebuilt in brick, a storey or three higher
            n_reb += 1
            for key, v in zip('x y w d a h s e t'.split(), (cx[i] / KX, cy[i] / KY, ww[i] + 0.9, max(dd[i], 17), math.degrees(ang[i]), rng.uniform(11, 19),
                                                           1889.75 + rng.uniform(0, 1.6) + fd[k] / 3000, end[k], 3)): cols[key].append(v)
    print(f'{name}: {len(cx)} candidates, {len(sel)} placed, {int(live.sum())} kept, {int(burn.sum())} burn, {n_reb} rebuilt in brick')

# Hooverville, 1931-41: shacks on the old Skinner & Eddy shipyard
hc = M(-122.3395, 47.5885)
for _ in range(480):
    x = hc[0] + rng.uniform(-150, 150); y = hc[1] + rng.uniform(-230, 230)
    if in_water(np.array([shapely.Point(x, y)]))[0]: continue
    for key, v in zip('x y w d a h s e t'.split(), (x / KX, y / KY, rng.uniform(2.6, 4.5), rng.uniform(3, 5.5), rng.uniform(0, 180), rng.uniform(2, 2.8),
                                                   1931.75 + rng.uniform(0, 3.5), 1941.3 + rng.uniform(0, 0.15), 4)): cols[key].append(v)

R = {'x': 6, 'y': 6, 'w': 1, 'd': 1, 'a': 1, 'h': 1, 's': 2, 'e': 2, 't': 0}
lost = {k: [round(float(v), R[k]) if R[k] else int(v) for v in vs] for k, vs in cols.items()}
s = json.dumps({'lost': lost, 'routes': routes}, separators=(',', ':'))
open(os.path.join(OUT, 'scene.json'), 'w').write(s)
print('lost buildings', len(lost['x']), 'scene.json', round(len(s) / 1e6, 2), 'MB')
