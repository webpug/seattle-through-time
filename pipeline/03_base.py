"""Ground layers (water, parks, forest, cities) as GeoJSON and dated roads as binary.
Needs raw/bldg_pts.npz from 02_buildings.py."""
import os, json, gzip, math, struct, time, sys
import numpy as np, shapely, duckdb
from scipy.spatial import cKDTree

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
os.makedirs(os.path.join(OUT, 's'), exist_ok=True)
KX = 111320 * math.cos(math.radians(47.5)); KY = 110950
BBOX = shapely.box(-122.55, 47.07, -121.05, 47.79)
con = duckdb.connect()
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:5.0f}s]', *a, flush=True)
def q(sql): return con.execute(sql).df()
def to_m(c): return np.column_stack([c[:, 0] * KX, c[:, 1] * KY])
def to_deg(c): return np.column_stack([c[:, 0] / KX, c[:, 1] / KY])

def write_geojson(name, geoms, props, tol_m, min_area=0):
    g = shapely.transform(geoms, to_m)
    g = shapely.simplify(g, tol_m, preserve_topology=True)
    feats = []
    for gg, p in zip(g, props):
        if gg is None or shapely.is_empty(gg): continue
        if min_area and shapely.area(gg) < min_area: continue
        gd = shapely.transform(gg, to_deg)
        feats.append({'type': 'Feature', 'properties': p, 'geometry': json.loads(shapely.to_geojson(shapely.set_precision(gd, 1e-6)))})
    s = json.dumps({'type': 'FeatureCollection', 'features': feats}, separators=(',', ':'))
    open(os.path.join(OUT, name), 'w').write(s)
    log(name, len(feats), 'features', round(len(s) / 1e6, 2), 'MB')

def ground():
    w = q(f"SELECT name, subtype, class, wkb FROM '{RAW}/ov_water.parquet' WHERE subtype IN ('ocean','lake','reservoir','water','river','pond','canal') AND class NOT IN ('swimming_pool','wastewater','basin','drain','ditch')")
    g = shapely.from_wkb(np.array([bytes(v) for v in w.wkb.values], dtype=object)); tid = shapely.get_type_id(g)
    poly = np.isin(tid, [3, 6])
    gp = shapely.make_valid(g[poly]); gp = shapely.intersection(gp, BBOX)
    am = shapely.area(shapely.transform(gp, to_m))
    keep = am > 4000
    # one dissolved multipolygon keeps the style simple and removes seams
    big = shapely.union_all(gp[keep])
    write_geojson('water.geojson', np.array([big]), [{}], 4)
    # named water bodies for labels
    wn = w[poly][keep]; labels = []
    for nm, gg, a in zip(wn.name.values, gp[keep], am[keep]):
        if isinstance(nm, str) and a > 150000:
            c = shapely.point_on_surface(gg); labels.append({'name': nm, 'lon': round(c.x, 5), 'lat': round(c.y, 5), 'ha': round(a / 1e4)})
    json.dump(labels, open(os.path.join(OUT, 'water-labels.json'), 'w'))
    riv = (w.subtype.values == 'river') & (tid == 1)
    write_geojson('rivers.geojson', g[riv], [{} for _ in range(int(riv.sum()))], 6)

    lu = q(f"SELECT name, subtype, class, wkb FROM '{RAW}/ov_land_use.parquet' WHERE class IN ('park','nature_reserve','cemetery','golf_course','recreation_ground','national_park','protected_area','state_park') OR subtype IN ('park','protected','golf','cemetery')")
    g = shapely.make_valid(shapely.from_wkb(np.array([bytes(v) for v in lu.wkb.values], dtype=object))); tid = shapely.get_type_id(g); m = np.isin(tid, [3, 6]) & ~np.isin(lu['class'].values, ['tee', 'bunker', 'green', 'fairway', 'water_hazard', 'rough', 'driving_range'])
    g = shapely.intersection(g[m], BBOX); lu = lu[m]
    am = shapely.area(shapely.transform(g, to_m)); k = am > 3000
    write_geojson('parks.geojson', g[k], [{} for n in lu.name.values[k]], 5)
    pl = []
    for nm, gg, a in zip(lu.name.values[k], g[k], am[k]):
        if isinstance(nm, str) and a > 20000:
            c = shapely.point_on_surface(gg); pl.append({'name': nm, 'lon': round(c.x, 5), 'lat': round(c.y, 5), 'ha': round(a / 1e4, 1)})
    json.dump(pl, open(os.path.join(OUT, 'park-labels.json'), 'w'))

    la = q(f"SELECT class, wkb FROM '{RAW}/ov_land.parquet' WHERE class IN ('wood','forest')")
    g = shapely.make_valid(shapely.from_wkb(np.array([bytes(v) for v in la.wkb.values], dtype=object))); m = np.isin(shapely.get_type_id(g), [3, 6]); g = shapely.intersection(g[m], BBOX)
    am = shapely.area(shapely.transform(g, to_m)); k = am > 15000
    u = shapely.union_all(shapely.simplify(shapely.transform(g[k], to_m), 12))
    write_geojson('forest.geojson', np.array([shapely.transform(u, to_deg)]), [{}], 12)

    d = q(f"SELECT name, subtype, wkb FROM '{RAW}/ov_division_area.parquet' WHERE region='US-WA' AND class='land' AND subtype IN ('locality','county','neighborhood','macrohood')")
    g = shapely.make_valid(shapely.from_wkb(np.array([bytes(v) for v in d.wkb.values], dtype=object)))
    loc = (d.subtype.values == 'locality')
    am = shapely.area(shapely.transform(g, to_m))
    kc = g[(d.subtype.values == 'county') & (d.name.values == 'King County')]
    kcg = kc[0] if len(kc) else BBOX
    sel = loc & (am > 2.5e6) & shapely.intersects(g, kcg)
    write_geojson('cities.geojson', g[sel], [{'name': n} for n in d.name.values[sel]], 15)
    write_geojson('county.geojson', np.array([kcg]), [{'name': 'King County'}], 30)
    hoods = []
    sea = g[loc & (d.name.values == 'Seattle')]
    for nm, st, gg, a in zip(d.name.values, d.subtype.values, g, am):
        if st in ("neighborhood", "macrohood") and isinstance(nm, str) and len(sea) and shapely.intersects(gg, sea[0]):
            c = shapely.point_on_surface(gg); hoods.append({'name': nm, 'kind': st, 'lon': round(c.x, 5), 'lat': round(c.y, 5), 'ha': round(a / 1e4)})
    json.dump(hoods, open(os.path.join(OUT, 'hoods.json'), 'w'))
    log('hoods', len(hoods), 'cities', int(sel.sum()))

FWY = {'5': 1965, '405': 1965, '90': 1976, '520': 1963, '99': 1932, '167': 1975, '18': 1964, '509': 1968, '518': 1972, '599': 1968,
       '522': 1965, '16': 1950, '705': 1988, '410': 1972, '512': 1972, '525': 1970, '526': 1969, '169': 1960, '900': 1940, '2': 1969, '3': 1965, '303': 1970, '304': 1960, '7': 1960, '104': 1960}
CLS = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'residential': 5, 'unclassified': 5, 'living_street': 5}

def pack(year, cls, lines_deg):
    coords, idx = shapely.get_coordinates(lines_deg, return_index=True)
    counts = np.bincount(idx, minlength=len(lines_deg)).astype(np.uint16)
    ox, oy = float(coords[:, 0].mean()), float(coords[:, 1].mean())
    xy = np.round((coords - [ox, oy]) / 1e-6).astype(np.int32)
    n = len(lines_deg)
    return gzip.compress(struct.pack('<II2d', n, len(coords), ox, oy) + year.astype(np.uint16).tobytes() + counts.tobytes()
                         + xy.tobytes() + cls.astype(np.uint8).tobytes(), 6)

def roads():
    b = np.load(os.path.join(RAW, 'bldg_pts.npz'))
    tree = cKDTree(np.column_stack([b['x'] * KX, b['y'] * KY])); by = b['year'].astype(np.float64)
    r = q(f"SELECT name, class, routes, flags, wkb FROM '{RAW}/ov_segments.parquet' WHERE subtype='road' AND class IN ({','.join(repr(c) for c in CLS)})")
    g = shapely.from_wkb(np.array([bytes(v) for v in r.wkb.values], dtype=object))
    ok = shapely.get_type_id(g) == 1; g = g[ok]; r = r[ok].reset_index(drop=True)
    gm = shapely.simplify(shapely.transform(g, to_m), 1.2)
    cls = np.array([CLS[c] for c in r['class'].values], dtype=np.uint8)
    dens = shapely.segmentize(gm, 35)
    pts, idx = shapely.get_coordinates(dens, return_index=True)
    dist, nb = tree.query(pts, k=6, distance_upper_bound=90, workers=-1)
    yy = np.where(np.isfinite(dist), by[np.minimum(nb, len(by) - 1)], np.nan)
    import pandas as pd
    df = pd.DataFrame({'seg': np.repeat(idx, 6), 'y': yy.ravel()}).dropna()
    yq = df.groupby('seg').y.quantile(0.12)
    cnt = df.groupby('seg').y.size()
    year = np.zeros(len(g)); year[yq.index.values] = yq.values
    year[cnt.reindex(range(len(g)), fill_value=0).values < 3] = 0
    # undated segments inherit from the nearest dated one (midpoint distance)
    mid = shapely.get_coordinates(shapely.line_interpolate_point(gm, 0.5, normalized=True))
    has = year > 0
    d2, j = cKDTree(mid[has]).query(mid[~has], k=3)
    year[~has] = np.max(year[has][j], axis=1)  # rural links: the latest of the neighbours
    # arterials existed no later than the streets around them: smooth to neighbourhood early quantile
    art = cls <= 4
    d3, j3 = cKDTree(mid[has]).query(mid[art], k=12, distance_upper_bound=600)
    yy3 = np.where(np.isfinite(d3), year[has][np.minimum(j3, has.sum() - 1)], np.nan)
    year[art] = np.fmin(year[art], np.nanquantile(yy3, 0.2, axis=1))
    # freeways by route number
    for i in np.where(cls == 0)[0]:
        y = 1968; refs = []
        if isinstance(r.routes[i], str):
            refs = [x.get('ref') for x in json.loads(r.routes[i]) if x.get('network') in ('US:I', 'US:WA', 'US:US') and x.get('ref')]
        ys = [FWY[x] for x in refs if x in FWY]
        if ys: y = max(ys) if '99' not in refs else FWY['99']
        if "99" in refs and isinstance(r["flags"][i], str) and 'is_tunnel' in r['flags'][i]: y = 2019
        nm = r.name[i] if isinstance(r.name[i], str) else ""
        if 'West Seattle Bridge' in nm: y = 1984
        if 'Alaskan Way Viaduct' in nm: y = 1953
        year[i] = y
    year = np.clip(np.round(year), 1851, 2026)
    gd = shapely.transform(gm, to_deg)
    major = cls <= 4
    open(os.path.join(OUT, 'roads-major.bin.gz'), 'wb').write(pack(year[major], cls[major], gd[major]))
    log('major roads', int(major.sum()))
    Z = 13; n = 1 << Z
    mi = np.where(~major)[0]; md = mid[mi] / [KX, KY]
    tx = np.floor((md[:, 0] + 180) / 360 * n).astype(np.int64)
    ty = np.floor((1 - np.arcsinh(np.tan(np.radians(md[:, 1]))) / math.pi) / 2 * n).astype(np.int64)
    key = tx * 100000 + ty; o = np.argsort(key, kind='stable'); tot = 0; index = []
    for grp in np.split(o, np.flatnonzero(np.diff(key[o])) + 1):
        ii = mi[grp]; z = pack(year[ii], cls[ii], gd[ii]); tot += len(z)
        open(os.path.join(OUT, 's', f'{tx[grp[0]]}_{ty[grp[0]]}.bin.gz'), 'wb').write(z); index.append([int(tx[grp[0]]), int(ty[grp[0]]), len(ii)])
    json.dump({'z': Z, 'tiles': index}, open(os.path.join(OUT, 's', 'index.json'), 'w'), separators=(',', ':'))
    log('minor road tiles', len(index), round(tot / 1e6, 1), 'MB')
    # mainline railways
    rr = q(f"SELECT name, class, wkb FROM '{RAW}/ov_segments.parquet' WHERE subtype='rail' AND class='standard_gauge'")
    rg = shapely.from_wkb(np.array([bytes(v) for v in rr.wkb.values], dtype=object)); rgm = shapely.simplify(shapely.transform(rg, to_m), 2)
    k = shapely.length(rgm) > 150
    rgm = rgm[k]
    # Dates: the two surviving 19th-century main lines by name/route, everything else from the buildings beside it,
    # and nothing on the tide flats or Harbor Island before they were filled.
    sc = json.load(open(os.path.join(OUT, 'scene.json')))['routes']
    main = {1884: shapely.LineString([(x * KX, y * KY) for x, y in sc['rail_south']]), 1893: shapely.LineString([(x * KX, y * KY) for x, y in sc['rail_north']])}
    rmid = shapely.get_coordinates(shapely.line_interpolate_point(rgm, 0.5, normalized=True))
    dr, nr = tree.query(rmid, k=8, distance_upper_bound=220, workers=-1)
    yr_ = np.where(np.isfinite(dr), by[np.minimum(nr, len(by) - 1)], np.nan)
    ry = np.nanquantile(np.where(np.isfinite(yr_).sum(axis=1, keepdims=True) >= 3, yr_, np.nan), 0.25, axis=1)
    ry = np.where(np.isfinite(ry), ry, 1912)
    ry = np.clip(ry, 1890, 1975)
    TIDE = shapely.Polygon([(x * KX, y * KY) for x, y in [(-122.3372, 47.5990), (-122.3290, 47.5985), (-122.3215, 47.5935), (-122.3200, 47.5850), (-122.3215, 47.5760), (-122.3260, 47.5690),
        (-122.3330, 47.5650), (-122.3420, 47.5640), (-122.3600, 47.5650), (-122.3640, 47.5720), (-122.3620, 47.5850), (-122.3530, 47.5905), (-122.3420, 47.5950)]])
    HARBOR = shapely.box(-122.3600 * KX, 47.5640 * KY, -122.3425 * KX, 47.5920 * KY)
    pts_mid = shapely.points(rmid)
    ry = np.where(shapely.contains(TIDE, pts_mid), np.maximum(ry, 1904), ry)
    ry = np.where(shapely.contains(HARBOR, pts_mid), np.maximum(ry, 1911), ry)
    for y0, ln in main.items():
        near = shapely.distance(pts_mid, ln) < 30
        ry = np.where(near, y0, ry)
    open(os.path.join(OUT, 'rail.bin.gz'), 'wb').write(pack(np.round(ry), np.zeros(len(rgm)), shapely.transform(rgm, to_deg)))
    k = np.ones(len(rgm), dtype=bool)
    log('rail', int(k.sum()))

if __name__ == '__main__':
    for a in (sys.argv[1:] or ['ground', 'roads']): {'ground': ground, 'roads': roads}[a]()
