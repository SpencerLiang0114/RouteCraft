#!/usr/bin/env python3
"""Explicitly refresh recorded OSM inputs. Normal tests are entirely offline."""
import datetime, json, pathlib, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1] / "fixtures"
AREAS = {"urban": (40.741, -73.989, 0.006, 0.008), "park": (40.781, -73.966, 0.008, 0.008), "hilly": (42.447, -76.493, 0.012, 0.016)}
for name, (lat, lng, dy, dx) in AREAS.items():
    if (ROOT / f"{name}.json").exists():
        continue
    bounds = f"{lat-dy},{lng-dx},{lat+dy},{lng+dx}"
    query = '[out:json][timeout:25];('
    for key, values in [("highway", "footway|path|cycleway|pedestrian|residential|living_street|track|service|unclassified|tertiary|secondary|primary"), ("leisure", "park|garden|nature_reserve|recreation_ground"), ("landuse", "forest|grass|meadow|recreation_ground|village_green|cemetery"), ("natural", "wood|scrub|grassland|heath|water")]:
        query += f'way["{key}"~"^({values})$"]({bounds});'
    query += ');out body geom;'
    for host in ["overpass.private.coffee", "overpass-api.de", "overpass.kumi.systems"]:
        try:
            req = urllib.request.Request(f"https://{host}/api/interpreter?" + urllib.parse.urlencode({"data": query}), headers={"User-Agent": "RouteCraft compatibility fixture capture"})
            with urllib.request.urlopen(req, timeout=45) as response:
                payload = json.load(response)
            assert payload.get("elements")
            for el in payload["elements"]:
                for pt in el.get("geometry", []):
                    pt["lng"] = pt.pop("lon", pt.get("lng"))
            (ROOT / f"{name}.json").write_text(json.dumps({"source": f"https://{host}/api/interpreter", "license": "OpenStreetMap contributors, ODbL 1.0", "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "query": query, "startPoint": {"lat": lat, "lng": lng}, "elements": payload["elements"]}, separators=(",", ":")) + "\n")
            print(name, len(payload["elements"]), flush=True)
            break
        except Exception as error:
            print(name, host, type(error).__name__, str(error), flush=True)
    else:
        raise SystemExit("Could not record " + name)
