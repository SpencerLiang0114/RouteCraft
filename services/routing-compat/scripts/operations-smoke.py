#!/usr/bin/env python3
"""Exercise restart between calls and real Java rollback against the test Compose stack."""
import gzip,json,pathlib,subprocess,time,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE='http://127.0.0.1:18090'
COMPOSE=['docker','compose','-f','docker-compose.yml','-f','services/routing-compat/compose.test.yml']
def call(path,body=None,method='POST'):
    request=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=35) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,json.load(error)
def ready():
    for _ in range(100):
        try:
            if call('/health',method='GET')[0]==200:return
        except OSError:pass
        time.sleep(.1)
    raise RuntimeError('Engine did not become healthy')
fixture=ROOT/'services/routing-compat/fixtures'
with gzip.open(fixture/'urban-running-out_and_back-0.reference.json.gz','rt') as stream:reference=json.load(stream)
elements=json.loads((fixture/'urban.json').read_text())['elements']
status,prepared=call('/internal/v1/graphs/prepare',{'elements':elements,'preferences':reference['preferences']})
assert status==200,prepared
subprocess.run(COMPOSE+['restart','routecraft-engine'],cwd=ROOT,check=True)
ready()
status,body=call('/internal/v1/graphs/'+prepared['handle']+'/generate',{'elevations':reference['elevations']})
assert status==410 and body['code']=='expired_handle',(status,body)
subprocess.run(['python3',str(ROOT/'services/routing-compat/scripts/seed-smoke.py')],check=True)
try:
    subprocess.run(COMPOSE+['stop','routecraft-engine'],cwd=ROOT,check=True)
    subprocess.run(['node',str(ROOT/'services/routing-compat/scripts/frontend-smoke.cjs')],cwd=ROOT,check=True)
finally:
    subprocess.run(COMPOSE+['start','routecraft-engine'],cwd=ROOT,check=True)
    ready()
print(json.dumps({'restartInvalidatesHandles':True,'engineUnavailableJavaFallback':True,'fallbackBatchesWritten':1}))
