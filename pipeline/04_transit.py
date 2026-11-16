"""Transit lines + stations (OSM route relations, hand-dated openings) and the
low-zoom building dot file."""
import os, json, gzip, math, struct
import numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..'); RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
rel = {r['id']: r for r in json.load(open(os.path.join(RAW, 'transit_osm.json')))['elements']}
nodes = json.load(open(os.path.join(RAW, 'transit_nodes.json')))['elements']

def stitch(r):
    """Chain member ways in relation order into one polyline."""
    ways = [[(p['lon'], p['lat']) for p in m['geometry']] for m in r['members'] if m['type'] == 'way' and m.get('role', '') in ('', 'forward', 'backward') and m.get('geometry')]
    out = list(ways[0])
    for w in ways[1:]:
        d = lambda a, b: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
        c = [d(out[-1], w[0]), d(out[-1], w[-1]), d(out[0], w[0]), d(out[0], w[-1])]
        k = int(np.argmin(c))
        if k == 0: out += w[1:]
        elif k == 1: out += w[::-1][1:]
        elif k == 2: out = w[::-1] + out[1:]
        else: out = w + out[1:]
    return out

def y1(lon, lat):  # 1 Line opening by position
    if lat > 47.7035: return 2024.66
    if lat > 47.6500: return 2021.75
    if lat > 47.6122: return 2016.21
    if lat > 47.4640: return 2009.54
    if lat > 47.4450: return 2009.96
    if lat > 47.4228: return 2016.73
    return 2025.93
def y2(lon, lat):  # 2 Line: only the part east of International District
    if lat > 47.6000 and lon < -122.30: return None      # shared with the 1 Line
    if lon < -122.1915: return 2026.24                    # across Lake Washington
    if lat > 47.6450 and lon > -122.1400: return 2025.36  # Downtown Redmond extension
    return 2024.32
LINES = [
  (3494092, '1 Line', 'link', '2E8B57', y1), (17499739, '2 Line', 'link', '2F7FBF', y2),
  (3237713, 'Seattle Center Monorail', 'monorail', 'C0392B', lambda x, y: 1962.23),
  (4748655, 'South Lake Union Streetcar', 'streetcar', 'D4792A', lambda x, y: 2007.95),
  (4755830, 'First Hill Streetcar', 'streetcar', 'C8862A', lambda x, y: 2016.06),
  (3494093, 'Sounder S Line', 'sounder', '6C7A89', lambda x, y: 2000.72),
  (3207386, 'Sounder N Line', 'sounder', '6C7A89', lambda x, y: 2003.97),
]
lines = []
for rid, name, kind, color, fy in LINES:
    pts = stitch(rel[rid]); seg = []; cur = None
    for p in pts:
        y = fy(*p)
        if y is None:
            if cur and len(cur['path']) > 1: seg.append(cur)
            cur = None; continue
        if cur is None or cur['start'] != y:
            prev = cur['path'][-1] if cur else None
            if cur and len(cur['path']) > 1: seg.append(cur)
            cur = {'start': y, 'end': 9999, 'path': [prev] if prev else []}
        cur['path'].append([round(p[0], 6), round(p[1], 6)])
    if cur and len(cur['path']) > 1: seg.append(cur)
    lines.append({'name': name, 'kind': kind, 'color': color, 'segments': seg})
# hand-drawn historic line: the George Benson Waterfront Streetcar (1982-2005)
lines.append({'name': 'Waterfront Streetcar', 'kind': 'streetcar', 'color': '4E7F4E', 'segments': [{'start': 1982.41, 'end': 2005.88, 'path': [
  [-122.3545, 47.6140], [-122.3498, 47.6110], [-122.3447, 47.6080], [-122.3412, 47.6052], [-122.3378, 47.6025], [-122.3361, 47.6002], [-122.3332, 47.6000], [-122.3275, 47.5992]]}]})
st = []
SK = {'1': y1}
for n in nodes:
    t = n.get('tags', {}); nm = t.get('name')
    if not nm or n['lat'] < 47.07 or n['lat'] > 47.83: continue
    lon, lat = n['lon'], n['lat']
    sounder = nm in ('Auburn', 'Kent', 'Tukwila', 'Seattle King Street', 'Edmonds')
    if sounder: y, kind = (2000.72 if nm != 'Edmonds' else 2003.97), 'sounder'
    elif nm in ('Seattle Center', 'Westlake Center'): y, kind = 1962.23, 'monorail'
    elif any(k in nm for k in ('&', 'Lake Union Park', 'Occidental', 'Westlake Hub')): y, kind = (2007.95 if lat > 47.611 else 2016.06), 'streetcar'
    elif lon > -122.30 and lat > 47.58 or nm in ('Judkins Park',): y, kind = (y2(lon, lat) or 2026.24), 'link'
    else: y, kind = y1(lon, lat), 'link'
    if nm == 'Pinehurst': y = 2026.5
    if nm == 'Tukwila' : y = 2001.2
    st.append({'name': nm, 'kind': kind, 'lon': round(lon, 6), 'lat': round(lat, 6), 'start': y})
json.dump({'lines': lines, 'stations': st}, open(os.path.join(OUT, 'transit.json'), 'w'), separators=(',', ':'))
print('lines', [(l['name'], len(l['segments']), sum(len(s['path']) for s in l['segments'])) for l in lines], 'stations', len(st))

b = np.load(os.path.join(RAW, 'bldg_pts.npz'))
X0, Y1, SX, SY = -122.55, 47.79, 1.5 / 65535, 0.72 / 65535
o = np.argsort(b['year'], kind='stable'); n = len(o)
x = np.round((b['x'][o] - X0) / SX).astype(np.uint16); y = np.round((Y1 - b['y'][o]) / SY).astype(np.uint16)
r = np.clip(np.sqrt(b['area'][o]) * 0.55, 4, 255).astype(np.uint8); hh = np.clip(b['h'][o] / 2, 1, 255).astype(np.uint8)
buf = struct.pack('<I', n) + x.tobytes() + y.tobytes() + b['year'][o].astype(np.uint16).tobytes() + r.tobytes() + hh.tobytes()
z = gzip.compress(buf, 9); open(os.path.join(OUT, 'dots.bin.gz'), 'wb').write(z); print('dots', n, round(len(z) / 1e6, 2), 'MB')
