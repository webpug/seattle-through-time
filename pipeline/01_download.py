"""Download raw sources: KC assessor extracts, KC parcel polygons, Overture themes."""
import os, sys, json, zipfile, io, concurrent.futures as cf, time
import requests
RAW = os.path.join(os.path.dirname(__file__), '..', 'raw')
os.makedirs(RAW, exist_ok=True)
BBOX = (-122.55, 47.07, -121.05, 47.79)  # King County
REL = '2026-10-21.0'

def assessor():
    for name in ['Residential Building', 'Commercial Building', 'Apartment Complex', 'Condo Complex and Units', 'Parcel']:
        out = os.path.join(RAW, name.replace(' ', '_') + '.zip')
        if os.path.exists(out): continue
        r = requests.get('https://aqua.kingcounty.gov/extranet/assessor/' + name.replace(' ', '%20') + '.zip', timeout=600)
        r.raise_for_status(); open(out, 'wb').write(r.content); print('assessor', name, len(r.content), flush=True)

def parcels():
    base = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/PARCEL_ADDRESS_PUB_AREA_3069/FeatureServer/0/query'
    d = os.path.join(RAW, 'parcels'); os.makedirs(d, exist_ok=True)
    n = requests.get(base, params={'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'}, timeout=120).json()['count']
    def page(off):
        out = os.path.join(d, f'{off:07d}.geojson')
        if os.path.exists(out): return
        for attempt in range(6):
            try:
                r = requests.get(base, params={'where': '1=1', 'outFields': 'PIN,CTYNAME,PREUSE_DESC', 'outSR': 4326, 'f': 'geojson',
                    'resultOffset': off, 'resultRecordCount': 1000, 'orderByFields': 'OBJECTID', 'geometryPrecision': 6,
                    'maxAllowableOffset': 0.000005}, timeout=180)
                j = r.json()
                if 'features' not in j: raise RuntimeError(str(j)[:200])
                open(out + '.tmp', 'w').write(r.text); os.replace(out + '.tmp', out); return
            except Exception as e:
                time.sleep(3 + attempt * 5); err = e
        print('FAILED', off, err, flush=True)
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(page, range(0, n, 1000)))
    print('parcels done', n, len(os.listdir(d)), flush=True)

def overture():
    import duckdb
    con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    x0, y0, x1, y1 = BBOX
    w = f"bbox.xmin < {x1} AND bbox.xmax > {x0} AND bbox.ymin < {y1} AND bbox.ymax > {y0}"
    jobs = {
      'buildings': ("theme=buildings/type=building", "id, names.primary AS name, height, num_floors, class, subtype, ST_AsWKB(geometry) AS wkb"),
      'segments': ("theme=transportation/type=segment", "id, names.primary AS name, subtype, class, subclass, to_json(routes) AS routes, to_json(road_flags) AS flags, to_json(rail_flags) AS rail_flags, ST_AsWKB(geometry) AS wkb"),
      'water': ("theme=base/type=water", "id, names.primary AS name, subtype, class, ST_AsWKB(geometry) AS wkb"),
      'land_use': ("theme=base/type=land_use", "id, names.primary AS name, subtype, class, ST_AsWKB(geometry) AS wkb"),
      'land': ("theme=base/type=land", "id, names.primary AS name, subtype, class, ST_AsWKB(geometry) AS wkb"),
      'division_area': ("theme=divisions/type=division_area", "id, names.primary AS name, subtype, class, region, ST_AsWKB(geometry) AS wkb"),
    }
    for k, (path, cols) in jobs.items():
        out = os.path.join(RAW, f'ov_{k}.parquet')
        if os.path.exists(out): continue
        t = time.time()
        try:
            con.execute(f"COPY (SELECT {cols} FROM read_parquet('s3://overturemaps-us-west-2/release/{REL}/{path}/*', hive_partitioning=1) WHERE {w}) TO '{out}.tmp' (FORMAT parquet)")
            os.replace(out + '.tmp', out)
            print('overture', k, con.execute(f"SELECT count(*) FROM '{out}'").fetchone(), round(time.time() - t), 's', flush=True)
        except Exception as e:
            print('overture FAILED', k, str(e)[:400], flush=True)

if __name__ == '__main__':
    {'assessor': assessor, 'parcels': parcels, 'overture': overture}[sys.argv[1]]()
