"""Mountain backdrop: a coarse elevation grid of the Olympics, the Cascades and Rainier for the 3-D ranges around the map.

Elevation from the Mapzen/AWS terrain tiles (terrarium PNGs, zoom 9). Two grids are written:
  elev   - metres above sea level (colours: forest, rock, snow)
  relief - height above the surrounding valley floors, zeroed where people built, so the ranges rise from the
           flat map without burying towns. This is what the mesh is extruded by.
Writes public/data/terrain.bin.gz. Needs raw/bldg_pts.npz from 02_buildings.py."""
import os, io, json, gzip, math, struct, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'public', 'data')
X0, X1, Y0, Y1 = -124.40, -120.20, 46.35, 48.95
DX, DY = 0.0065, 0.0045   # about 490 x 500 m
Z = 9; N = 1 << Z
def tx(lon): return (lon + 180) / 360 * N
def ty(lat): return (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * N

def tile(x, y):
    d = os.path.join(RAW, 'dem'); os.makedirs(d, exist_ok=True)
    f = os.path.join(d, f'{Z}_{x}_{y}.png')
    if not os.path.exists(f):
        req = urllib.request.Request(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png', headers={'User-Agent': 'Mozilla/5.0'})
        open(f, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    a = np.asarray(Image.open(f).convert('RGB'), dtype=np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

xa, xb = int(tx(X0)), int(tx(X1)); ya, yb = int(ty(Y1)), int(ty(Y0))
jobs = [(x, y) for y in range(ya, yb + 1) for x in range(xa, xb + 1)]
with cf.ThreadPoolExecutor(8) as ex: tiles = list(ex.map(lambda j: tile(*j), jobs))
mos = np.zeros(((yb - ya + 1) * 256, (xb - xa + 1) * 256), np.float32)
for (x, y), t in zip(jobs, tiles): mos[(y - ya) * 256:(y - ya + 1) * 256, (x - xa) * 256:(x - xa + 1) * 256] = t

W = int(round((X1 - X0) / DX)) + 1; H = int(round((Y1 - Y0) / DY)) + 1
lon = X0 + np.arange(W) * DX; lat = Y1 - np.arange(H) * DY
px = (tx(lon) - xa) * 256 - 0.5; py = (ty(lat) - ya) * 256 - 0.5
elev = ndi.map_coordinates(mos, np.meshgrid(py, px, indexing='ij'), order=1, mode='nearest')
elev = np.clip(elev, 0, 6000)

floor = ndi.gaussian_filter(ndi.minimum_filter(elev, size=15), 7)      # valley floors within about 7 km
relief = np.clip(elev - floor - 110, 0, None)                          # hills under 110 m stay part of the flat map
b = np.load(os.path.join(RAW, 'bldg_pts.npz'))
bi = np.round((Y1 - b['y']) / DY).astype(int); bj = np.round((b['x'] - X0) / DX).astype(int)
ok = (bi >= 0) & (bi < H) & (bj >= 0) & (bj < W)
dens = np.zeros((H, W), np.float32); np.add.at(dens, (bi[ok], bj[ok]), 1)
built = ndi.gaussian_filter(ndi.maximum_filter((dens >= 2).astype(np.float32), size=3), 1.3)
relief *= np.clip(1 - 1.6 * built, 0, 1) ** 2
relief = ndi.gaussian_filter(relief, 0.7)
relief[relief < 6] = 0
print('grid', W, H, 'max elev', int(elev.max()), 'max relief', int(relief.max()), 'cells with relief', int((relief > 0).sum()))

hdr = json.dumps({'x0': X0, 'y1': Y1, 'dx': DX, 'dy': DY, 'w': W, 'h': H}).encode()
hdr += b' ' * ((4 - len(hdr) % 4) % 4)
z = gzip.compress(struct.pack('<I', len(hdr)) + hdr + np.round(elev).astype('<u2').tobytes() + np.round(relief).astype('<u2').tobytes(), 9)
open(os.path.join(OUT, 'terrain.bin.gz'), 'wb').write(z)
print('terrain.bin.gz', round(len(z) / 1e3), 'kB')

# The stage: King County, where the building data ends and the clouds begin (plus the same outline pushed out 1 km).
import shapely
KX = 111320 * math.cos(math.radians(47.5)); KY = 110950
cty = shapely.from_geojson(json.dumps(json.load(open(os.path.join(OUT, 'county.geojson')))['features'][0]['geometry']))
cm = shapely.transform(cty, lambda c: np.column_stack([c[:, 0] * KX, c[:, 1] * KY]))
cm = max(shapely.get_parts(cm), key=lambda g: g.area)
ring = lambda g: [[round(x / KX, 5), round(y / KY, 5)] for x, y in shapely.simplify(shapely.Polygon(g.exterior), 120).exterior.coords]
json.dump({'inner': ring(cm), 'outer': ring(cm.buffer(1000))}, open(os.path.join(OUT, 'stage.json'), 'w'), separators=(',', ':'))
print('stage.json', len(ring(cm)), 'points')
