# Seattle Through Time

Watch Seattle and King County grow, building by building, from the Denny Party's landing in 1851 to today.
A Seattle counterpart to Theo Jaffee's [Bay Area Through Time](https://bay.theojaffee.net/), written from scratch.

- Drag the timeline or press play; **Story** runs a guided tour of about thirty stops.
- 760,652 buildings, each drawn in the year the King County Assessor says it was built.
- Streets, freeways, railways, Link light rail, streetcars and the Monorail appear as they open.
- Place names change with the years (Duwamps → Seattle, Slaughter → Auburn, Gilman → Issaquah).
- Keyboard: space = play/pause, ←/→ = one year (or previous/next stop in the story), Esc = close.
- The URL hash holds the view: `#year=1962.5&c=-122.345,47.615&z=14.6&p=60&b=-30`.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (relative paths, host anywhere)
```

The processed data is committed in `public/data/` (about 36 MB), so the pipeline is only needed to refresh it.

## Data pipeline

```sh
uv venv .venv && VIRTUAL_ENV=.venv uv pip install duckdb shapely numpy scipy pandas requests
.venv/bin/python pipeline/01_download.py assessor   # King County Assessor extracts
.venv/bin/python pipeline/01_download.py parcels    # 637k parcel polygons (ArcGIS REST)
.venv/bin/python pipeline/01_download.py overture   # Overture buildings, roads, water, land use
.venv/bin/python pipeline/02_buildings.py           # footprints x year built -> public/data/b/
.venv/bin/python pipeline/03_base.py                # water, parks, forest, cities, dated roads
.venv/bin/python pipeline/04_transit.py             # transit lines + low-zoom building dots
```

`04_transit.py` reads two Overpass API responses (`raw/transit_osm.json`, `raw/transit_nodes.json`); the queries are in `pipeline/overpass.txt`.

## Sources and caveats

| Layer | Source |
| --- | --- |
| Building footprints, heights | [Overture Maps](https://overturemaps.org) release 2026-10-21.0 (OpenStreetMap, Microsoft, Esri) |
| Year built | [King County Department of Assessments](https://info.kingcounty.gov/assessor/DataDownload/default.aspx) residential, commercial, apartment and condo extracts, joined through King County GIS parcel polygons |
| Streets, railways, water, parks | OpenStreetMap via Overture |
| Transit routes | OpenStreetMap; opening dates from Sound Transit and the City of Seattle |
| Terrain shading | Mapzen terrain tiles on AWS Open Data (loaded at run time) |
| Population | U.S. Census; 2026 from the Washington Office of Financial Management |

- **Only surviving buildings are shown.** Anything demolished is absent, so earlier years look emptier than they were, most of all downtown.
- The assessor records everything built in or before 1900 as "1900". Those ~3,300 buildings are spread over 1888–1900 by distance from the nineteenth-century town centres. That is an estimate.
- About 4.5% of buildings have no assessor record and take the year of the nearest dated building.
- Street years are inferred from the buildings alongside them; freeways use their opening years.
- The pre-1900 tide-flat outline south of King Street is hand-drawn and approximate.
- History text in `src/content.js` is hand-written; each entry links to a source.

Data © OpenStreetMap contributors (ODbL), Overture Maps Foundation (CDLA-Permissive 2.0 / ODbL), King County.
