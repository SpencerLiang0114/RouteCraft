#!/usr/bin/env python3
"""Full Spring HTTP + native Rust HTTP + PostGIS, fixed external-provider responses.
Requires the disposable routecraft_migration_test database on localhost:5432.
"""
import argparse,json,os,pathlib,statistics,subprocess,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[3];OUT=ROOT/"services/routing-compat/results";OUT.mkdir(exist_ok=True)
p=argparse.ArgumentParser();p.add_argument("--samples",type=int,default=20);p.add_argument("--warmups",type=int,default=3);args=p.parse_args()
summary={"samplesPerFixture":args.samples,"warmupsPerFixture":args.warmups,"memoryScope":"Spring test JVM plus Rust service RSS, sampled at 100 ms; excludes Maven coordinator and PostGIS. Includes identical test/Mockito fixture overhead in both JVMs.","coldScope":"First public routing request in each fresh Spring process; subsequent fixture first encounters are not process-cold.","providers":"Fixed OSM and node/route elevation values; real cache, HTTP, serialization, PostGIS writes"}
for mode in ["java","rust"]:
    engine=None;log=open(OUT/(mode+"-integration.log"),"w");engine_log=open(OUT/(mode+"-engine.log"),"w")
    pidfile=OUT/(mode+"-integration.pid");pidfile.unlink(missing_ok=True)
    if mode=="rust":
        engine=subprocess.Popen([str(ROOT/"services/routecraft-engine/target/release/routecraft-engine")],env={**os.environ,"ROUTECRAFT_ENGINE_LISTEN":"127.0.0.1:18091"},stdout=engine_log,stderr=engine_log)
        for _ in range(100):
            try:
                with urllib.request.urlopen("http://127.0.0.1:18091/health",timeout=1) as response:assert json.load(response)["protocolVersion"]==1
                break
            except OSError:time.sleep(.1)
        else:raise RuntimeError("engine startup failed")
    command=["./mvnw","-q","-Dtest=MigrationIntegrationTest","-Droutecraft.integration=true",f"-Droutecraft.routing.engine={mode}","-Droutecraft.routing.engine-url=http://127.0.0.1:18091",f"-Droutecraft.benchmark.samples={args.samples}",f"-Droutecraft.benchmark.warmups={args.warmups}","-DargLine=-Xms128m -Xmx512m","test"]
    process=subprocess.Popen(command,cwd=ROOT/"services/routecraft-api",stdout=log,stderr=log)
    peak=0;observations=0;started=time.monotonic()
    try:
        while process.poll() is None:
            if pidfile.exists():
                pids=[pidfile.read_text().strip()]+([str(engine.pid)] if engine else [])
                try:
                    rss=sum(int(v) for v in subprocess.check_output(["ps","-o","rss=","-p",",".join(pids)],text=True).split());peak=max(peak,rss);observations+=1
                except subprocess.CalledProcessError:pass
            time.sleep(.1)
        if process.returncode:raise RuntimeError(f"{mode} integration failed; see {log.name}")
        rows=json.loads((OUT/(mode+"-integration.json")).read_text());latencies=sorted(r["elapsedMs"] for r in rows)
        summary[mode]={"firstProcessRequest":json.loads((OUT/(mode+"-first-encounters.json")).read_text())[0],"medianMs":statistics.median(latencies),"p95Ms":latencies[int((len(latencies)-1)*.95)],"throughputPerSec":len(latencies)*1000/sum(latencies),"combinedPeakRssKiB":peak,"memorySamples":observations,"elapsedSeconds":time.monotonic()-started,"routeTypes":{}}
        for route in ["loop","out_and_back","point_to_point"]:
            values=sorted(r["elapsedMs"] for r in rows if r["routeType"]==route);summary[mode]["routeTypes"][route]={"medianMs":statistics.median(values),"p95Ms":values[int((len(values)-1)*.95)]}
        print(mode,json.dumps(summary[mode]),flush=True)
    finally:
        if engine:engine.terminate();engine.wait()
        log.close();engine_log.close()
summary["combinedMemoryIncreasePct"]=(summary["rust"]["combinedPeakRssKiB"]/summary["java"]["combinedPeakRssKiB"]-1)*100
summary["routeP95ChangePct"]={route:(summary["rust"]["routeTypes"][route]["p95Ms"]/summary["java"]["routeTypes"][route]["p95Ms"]-1)*100 for route in summary["java"]["routeTypes"]}
(OUT/"integration-summary.json").write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
