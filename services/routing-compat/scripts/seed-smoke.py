#!/usr/bin/env python3
"""Seed the existing public raw-OSM cache for an offline Overpass smoke test."""
import gzip,json,math,pathlib,urllib.request,urllib.error,os,http.cookiejar,uuid
root=pathlib.Path(__file__).resolve().parents[3];fixture=root/"services/routing-compat/fixtures"
base=os.environ.get("ROUTECRAFT_SMOKE_API_URL","http://localhost:18080")
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(path,data=None,method=None):
    body=None if data is None else json.dumps(data).encode()
    request=urllib.request.Request(
        base+path,
        data=body,
        method=method or ("POST" if body is not None else "GET"),
        headers={"Content-Type":"application/json"} if body is not None else {})
    with opener.open(request) as response:
        payload=response.read()
        return response.status, (json.loads(payload) if payload else None)

email=f"smoke-{uuid.uuid4().hex}@routecraft.test"
status,_=api("/api/auth/register",{"email":email,"password":"smoke-password-123","displayName":"Smoke"})
assert status==200,status

with gzip.open(fixture/"urban-running-out_and_back-0.reference.json.gz","rt") as f:p=json.load(f)["preferences"]
data=json.loads((fixture/"urban.json").read_text());lat=p["startPoint"]["lat"];lng=p["startPoint"]["lng"]
# BBox.around uses 111 km/degree; key() retains the full double representation.
r=max(2.5,min(14,p["targetDistanceKm"]*.6+1));dy=r/111.0;dx=r/(111.0*math.cos(lat*math.pi/180))
bbox=",".join(str(v) for v in [lat-dy,lng-dx,lat+dy,lng+dx])
body={"bbox":bbox,"elements":data["elements"],"ttlSeconds":600}
status,_=api("/api/osm-graph-cache",body,method="PUT")
assert status==200,status
print("Recorded OSM cache seeded.")
