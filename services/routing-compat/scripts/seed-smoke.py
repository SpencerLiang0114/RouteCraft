#!/usr/bin/env python3
"""Seed the existing public raw-OSM cache for an offline Overpass smoke test."""
import gzip,json,math,pathlib,urllib.request,os
root=pathlib.Path(__file__).resolve().parents[3];fixture=root/"services/routing-compat/fixtures"
with gzip.open(fixture/"urban-running-out_and_back-0.reference.json.gz","rt") as f:p=json.load(f)["preferences"]
data=json.loads((fixture/"urban.json").read_text());lat=p["startPoint"]["lat"];lng=p["startPoint"]["lng"]
# BBox.around uses 111 km/degree; key() retains the full double representation.
r=max(2.5,min(14,p["targetDistanceKm"]*.6+1));dy=r/111.0;dx=r/(111.0*math.cos(lat*math.pi/180))
bbox=",".join(str(v) for v in [lat-dy,lng-dx,lat+dy,lng+dx])
body=json.dumps({"bbox":bbox,"elements":data["elements"],"ttlSeconds":600}).encode()
url=os.environ.get("ROUTECRAFT_SMOKE_API_URL","http://localhost:18080")+"/api/osm-graph-cache"
request=urllib.request.Request(url,data=body,method="PUT",headers={"Content-Type":"application/json"})
with urllib.request.urlopen(request) as response:assert response.status==200
print("Recorded OSM cache seeded.")
