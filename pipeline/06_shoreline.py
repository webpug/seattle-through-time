"""Shoreline change: patches of former water (filled since) and former land (dredged since), each with the years it changed.

Sources and how sure they are:
  * Lake Washington before the 1916 lowering: U.S. Coast & Geodetic Survey topographic sheets T-2606..T-2609 (1902),
    vectorised by NOAA NGS (Shoreline Data Rescue project WC48C01) -> raw/nsde/WC48C01. Surveyed.
  * Elliott Bay, the tide flats, Smith Cove, Lake Union: no digitised survey is published, so the old shore is traced
    along the streets that follow the old beach and bluff lines (Western Ave, Airport Way, W Marginal Way ...). Estimate.
  * Duwamish meanders: a sketch of the pre-1913 course. Approximate.
  * Green Lake: a uniform band for the 1911 lowering. Approximate.
Fill dates run outward from the old shore between the first and last year of each area's fill.

Writes public/data/shore.geojson; features carry k ('w' was water / 'l' was land), a..b (years over which it changed)
and t=1 for tide flats."""
import os, json, math, urllib.request, zipfile, io
import numpy as np, shapely
from shapely.ops import polygonize, unary_union

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
KX = 111320 * math.cos(math.radians(47.5)); KY = 110950
def M(pts): return [(x * KX, y * KY) for x, y in pts]
def P(pts): return shapely.Polygon(M(pts))
def box(x0, y0, x1, y1): return shapely.box(x0 * KX, y0 * KY, x1 * KX, y1 * KY)
def to_m(c): return np.column_stack([c[:, 0] * KX, c[:, 1] * KY])
def to_deg(c): return np.column_stack([c[:, 0] / KX, c[:, 1] / KY])
def shift(pts, dx, dy): return [(x + dx / KX, y + dy / KY) for x, y in pts]

water = shapely.make_valid(shapely.transform(shapely.from_geojson(open(os.path.join(OUT, 'water.geojson')).read()), to_m))
water = shapely.union_all(shapely.get_parts(shapely.get_parts(water)))
def body(lon, lat):
    p = shapely.Point(lon * KX, lat * KY)
    for g in shapely.get_parts(water):
        if g.contains(p): return g
    raise SystemExit(f'no water at {lon},{lat}')

feats = []
def add(geom, k, a, b, t=0):
    geom = shapely.make_valid(geom)
    for g in shapely.get_parts(geom):
        if g.geom_type != 'Polygon' or g.area < 250: continue
        g = shapely.simplify(g, 2.5)
        if g.is_empty: continue
        gd = shapely.set_precision(shapely.transform(g, to_deg), 1e-6)
        if gd.is_empty: continue
        p = {'k': k, 'a': round(a, 2), 'b': round(b, 2)}
        if t: p['t'] = 1
        feats.append({'type': 'Feature', 'properties': p, 'geometry': json.loads(shapely.to_geojson(gd))})

def staged(fill, land_side, y0, y1, dmax, n=8, t=0, gamma=1.0):
    """Fill advanced outward from the old shore: slice by distance from it and date the slices y0..y1."""
    fill = fill.buffer(-4).buffer(6)  # drop slivers, then overlap the modern shore a touch
    if fill.is_empty: return
    prev = None
    for i in range(n):
        d1 = dmax * (i + 1) / n
        ring = land_side.buffer(d1 if i < n - 1 else 1e5)
        band = fill.intersection(ring if prev is None else ring.difference(prev))
        prev = ring
        a = y0 + (y1 - y0) * (i / n) ** gamma; b = y0 + (y1 - y0) * ((i + 1) / n) ** gamma
        add(band, 'w', a, max(b, a + 0.4), t)

# ---------- Elliott Bay: the shore of the 1850s, traced clockwise from Smith Cove ----------
ELLIOTT_W = shift([(-122.3757, 47.6323), (-122.3732, 47.6303), (-122.3699, 47.6278), (-122.3675, 47.6259), (-122.3649, 47.624), (-122.3627, 47.6222), (-122.3601, 47.6201)], -45, -35)
BAY = P([
    (-122.3935, 47.6312), (-122.3919, 47.6331), (-122.3889, 47.6371), (-122.3864, 47.6406), (-122.3847, 47.6429), (-122.3835, 47.6448),  # Smith Cove, west side (Thorndyke Ave W)
    (-122.3800, 47.6453), (-122.3768, 47.6445), (-122.3764, 47.6406), (-122.3762, 47.6334),                                               # head of the cove, then 15th Ave W
    *ELLIOTT_W,                                                                                                                       # beach below Queen Anne (the railroad line)
    (-122.3590, 47.6187), (-122.3567, 47.6173), (-122.3533, 47.615), (-122.3505, 47.6134), (-122.3475, 47.6119), (-122.3452, 47.6113),    # Belltown bluff (Elliott Ave)
    (-122.3436, 47.6105), (-122.3418, 47.6093), (-122.3400, 47.6074), (-122.3378, 47.6049), (-122.3365, 47.6035), (-122.3353, 47.6022),   # Western Ave
    (-122.3347, 47.6016), (-122.3346, 47.6005), (-122.3346, 47.5992), (-122.3340, 47.5982),                                               # Maynard's point, west side
    (-122.3329, 47.5985), (-122.3323, 47.5997), (-122.3313, 47.6004), (-122.3296, 47.5999), (-122.3281, 47.5989),                         # the lagoon behind it
    (-122.3262, 47.5975), (-122.3246, 47.5957), (-122.3234, 47.5926), (-122.3215, 47.5858), (-122.3215, 47.5797), (-122.3227, 47.5728), (-122.3228, 47.5668),  # foot of Beacon Hill (Airport Way)
    (-122.3270, 47.5640), (-122.3340, 47.5625), (-122.3420, 47.5628), (-122.3485, 47.5640),                                               # delta front and river mouth
    (-122.3529, 47.5650), (-122.3541, 47.5676), (-122.3590, 47.5722),                                                                     # Pigeon Point (W Marginal Way)
    (-122.3622, 47.5702), (-122.3640, 47.5672), (-122.3670, 47.5690), (-122.3700, 47.5720),                                               # Young's Cove
    (-122.3709, 47.5742), (-122.3714, 47.5768), (-122.3725, 47.5802), (-122.3745, 47.5836), (-122.3782, 47.5871), (-122.3816, 47.5896), (-122.3833, 47.5932), (-122.3862, 47.5957),  # Harbor Ave
    (-122.3920, 47.6000), (-122.4010, 47.6200), (-122.3990, 47.6290)])                                                                    # back across open water
bay_water = shapely.union_all([g for g in shapely.get_parts(water) if g.intersects(BAY)])
fill = BAY   # patches cover today's water too (water over water), so no slivers are left between piers
land = shapely.box(-122.45 * KX, 47.54 * KY, -122.28 * KX, 47.67 * KY).difference(BAY)
HARBOR = max(shapely.get_parts(box(-122.3600, 47.5640, -122.3425, 47.5920).difference(bay_water).buffer(-15)), key=lambda g: g.area).buffer(30)  # the island itself
REGIONS = [  # name, region, first year, last year, width of the fill (m), tide flat?
    ('marina', box(-122.4020, 47.6240, -122.3893, 47.6316), 1990.0, 1991.5, 400, 0),       # Elliott Bay Marina breakwater
    ('harbor', HARBOR, 1907.0, 1909.6, 1, 1),                                              # Harbor Island, finished 1909
    ('smith', box(-122.3960, 47.6240, -122.3759, 47.6470), 1895, 1936, 380, 1),            # Smith Cove: GN docks, Piers 40/41, Interbay dump
    ('north', box(-122.3760, 47.6165, -122.3560, 47.6330), 1887, 1975, 260, 0),            # railroad 1887 ... Myrtle Edwards Park 1970s
    ('central', box(-122.3600, 47.6047, -122.3360, 47.6165), 1887, 1936, 170, 0),          # Railroad Avenue 1887 ... seawall 1934-36
    ('pioneer', box(-122.3420, 47.5975, -122.3200, 47.6047), 1856, 1904, 260, 0),          # sawdust fill, lagoon, first seawall
    ('west', box(-122.3900, 47.5600, -122.3600, 47.5990), 1904, 1966, 520, 1),             # Young's Cove steel mill 1905 ... Terminal 5
    ('flats', box(-122.3600, 47.5600, -122.3150, 47.5975), 1895, 1917, 1150, 1),           # Seattle & Lake Washington Waterway Co. 1895 ... 1917
]
left = fill
for name, reg, y0, y1, dmax, t in REGIONS:
    part = left.intersection(reg); left = left.difference(reg)
    if name == 'harbor': add(part.buffer(-4).buffer(6), 'w', y0, y1, t)
    else: staged(part, land, y0, y1, dmax, t=t, gamma=0.8 if name == 'north' else 1.0)
    print(name, round(part.difference(bay_water).area / 1e4), 'ha filled')
# the flats themselves, bare at low tide: a tint over the whole area (modern channels included) until the fill was done
SEAWARD = P([(-122.3346, 47.5980), (-122.3420, 47.5932), (-122.3520, 47.5916), (-122.3600, 47.5882), (-122.3690, 47.5835), (-122.3900, 47.5835), (-122.3900, 47.5500), (-122.3000, 47.5500), (-122.3000, 47.5980)])
flats = BAY.intersection(SEAWARD)
add(flats, 'f', 1895, 1917)
add(BAY.intersection(REGIONS[2][1]).intersection(box(-122.3960, 47.6300, -122.3759, 47.6470)), 'f', 1895, 1930)

# ---------- Duwamish: meanders until the waterway was dug, 1913-1920 ----------
OLD_RIVER = shapely.LineString(M([(-122.3440, 47.5640), (-122.3450, 47.5590), (-122.3492, 47.5565), (-122.3480, 47.5515), (-122.3420, 47.5480), (-122.3340, 47.5470),
    (-122.3260, 47.5490), (-122.3195, 47.5470), (-122.3170, 47.5430), (-122.3205, 47.5385), (-122.3270, 47.5350), (-122.3300, 47.5310), (-122.3250, 47.5275),
    (-122.3170, 47.5265), (-122.3120, 47.5225), (-122.3150, 47.5180), (-122.3100, 47.5140), (-122.3050, 47.5110), (-122.3055, 47.5060), (-122.3040, 47.5020)]))
def chaikin(pts, n=3):
    for _ in range(n):
        q = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]): q += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        pts = q + [pts[-1]]
    return pts
old = shapely.simplify(shapely.LineString(chaikin(list(OLD_RIVER.coords))).buffer(55), 2)  # about 110 m wide
VALLEY = box(-122.3600, 47.5005, -122.2900, 47.5626)
valley_water = water.intersection(VALLEY)
add(old.difference(valley_water).buffer(2), 'w', 1913.5, 1920, 0)
add(valley_water.difference(old).buffer(3), 'l', 1913.5, 1920, 0)

# ---------- Ship Canal cuts ----------
add(water.intersection(box(-122.3105, 47.6452, -122.2995, 47.6488)).buffer(3), 'l', 1916.3, 1916.7)   # Montlake Cut, opened to the lake August 1916
add(water.intersection(box(-122.3660, 47.6466, -122.3502, 47.6562)).buffer(3), 'l', 1912.0, 1916.5)   # Fremont Cut (the outlet creek is not drawn)

# ---------- Lake Union: shoreline fill ----------
lu = body(-122.3350, 47.6390)
lu_land = box(-122.3560, 47.6200, -122.3150, 47.6580).difference(lu)
south = box(-122.3440, 47.6215, -122.3285, 47.6292)
staged(lu.buffer(175).intersection(south), lu_land.difference(lu.buffer(175)), 1885, 1915, 175, n=5)
ring = box(-122.3530, 47.6292, -122.3190, 47.6535).difference(box(-122.3500, 47.6440, -122.3300, 47.6535))  # leave the north shore (natural point at Gas Works)
staged(lu.buffer(70).intersection(ring), lu_land.difference(lu.buffer(70)), 1895, 1935, 70, n=4)

# ---------- Green Lake: lowered about 7 ft in 1911 ----------
gl = body(-122.3380, 47.6800)
add(gl.buffer(75).difference(gl).buffer(2), 'w', 1911.0, 1911.8)

# ---------- Lake Washington: lowered about 9 ft in 1916 (1902 survey) ----------
def lake_1902():
    import shapefile
    d = os.path.join(RAW, 'nsde', 'WC48C01')
    if not os.path.exists(os.path.join(d, 'historicl1.shp')):
        os.makedirs(d, exist_ok=True)
        req = urllib.request.Request('https://nsde.ngs.noaa.gov/downloads/WC48C01.zip', headers={'User-Agent': 'Mozilla/5.0'})
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(req, timeout=120).read())).extractall(d)
    lines = []
    for sr in shapefile.Reader(os.path.join(d, 'historicl1.shp')).shapeRecords():
        if sr.record['CLASS'] == 'CARTOGRAPHIC LIMIT': continue
        pts = np.array(sr.shape.points); parts = list(sr.shape.parts) + [len(pts)]
        for a, b in zip(parts[:-1], parts[1:]):
            if b - a >= 2: lines.append(shapely.LineString(pts[a:b] * [KX, KY]))
    # close small gaps between sheet edges and line ends
    ends = np.array([c for l in lines for c in (l.coords[0], l.coords[-1])])
    from scipy.spatial import cKDTree
    tr = cKDTree(ends); bridges = []
    for i, e in enumerate(ends):
        dd, jj = tr.query(e, k=3, distance_upper_bound=120)
        for d_, j in zip(dd, jj):
            if np.isfinite(d_) and j != i and j // 2 != i // 2 and d_ > 0.01: bridges.append(shapely.LineString([e, ends[j]])); break
    lw = body(-122.2500, 47.6200)
    faces = list(polygonize(unary_union(lines + bridges + [lw.boundary])))
    near = lw.buffer(1500)
    out = []
    for f in faces:
        rp = f.representative_point()
        if lw.contains(rp) or f.area > 4e6 or not near.contains(rp): continue
        if f.difference(water).area < 0.5 * f.area: continue  # other modern water (canal, slips)
        if not f.buffer(3).intersects(lw): continue
        out.append(f.difference(water))
    return unary_union(out).buffer(-5).buffer(7)
try:
    old_lake = lake_1902()
    print('Lake Washington 1902 margin', round(old_lake.area / 1e4), 'ha')
    add(old_lake, 'w', 1916.55, 1916.85)
except Exception as e:  # pragma: no cover
    print('!! 1902 lake survey unavailable:', e)

s = json.dumps({'type': 'FeatureCollection', 'features': feats}, separators=(',', ':'))
open(os.path.join(OUT, 'shore.geojson'), 'w').write(s)
print('shore.geojson', len(feats), 'features', round(len(s) / 1e3), 'kB')
