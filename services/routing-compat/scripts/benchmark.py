#!/usr/bin/env python3
"""Serial native CPU-stage comparison; run after builds/tests, on an idle machine."""
import argparse, gzip, json, pathlib, platform, statistics, subprocess, threading, time
ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "services/routing-compat/fixtures"
OUT = ROOT / "services/routing-compat/results"
parser = argparse.ArgumentParser(); parser.add_argument("--samples",type=int,default=20); parser.add_argument("--warmups",type=int,default=2); args=parser.parse_args()
OUT.mkdir(exist_ok=True)
inputs=[]
for path in sorted(FIXTURES.glob("*.reference.json.gz")):
    with gzip.open(path,"rt") as f: ref=json.load(f)
    name=path.name.removesuffix(".reference.json.gz")
    area=json.loads((FIXTURES/(name.split("-")[0]+".json")).read_text())
    inputs.append((name,json.dumps({"elements":area["elements"],"preferences":ref["preferences"],"elevations":ref["elevations"]},separators=(",",":"))))
classpath=(ROOT/"services/routecraft-api/target/benchmark-classpath.txt").read_text().strip()
commands={"java":["java","-Xms128m","-Xmx512m","-cp",str(ROOT/"services/routecraft-api/target/test-classes")+":"+str(ROOT/"services/routecraft-api/target/classes")+":"+classpath,"com.routecraft.api.routing.engine.CpuBenchmark"],"rust":[str(ROOT/"services/routecraft-engine/target/release/benchmark")]}
summary={"hardware":platform.platform(),"samplesPerFixture":args.samples,"warmupMatrixPasses":args.warmups,"fixtureCount":len(inputs),"memoryScope":"Standalone CPU driver RSS; not the combined production service memory adoption gate"}
for mode,command in commands.items():
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(OUT/(mode+"-cpu.stderr.log"),"w"),text=True)
    peak=[0];stop=threading.Event()
    def monitor():
        while not stop.wait(0.1):
            try: peak[0]=max(peak[0],int(subprocess.check_output(["ps","-o","rss=","-p",str(process.pid)],text=True).strip()))
            except (ValueError,subprocess.CalledProcessError): pass
    thread=threading.Thread(target=monitor);thread.start()
    rows=[];cold=[]
    try:
        for run in range(-args.warmups,args.samples):
            for name,payload in inputs:
                process.stdin.write(payload+"\n");process.stdin.flush();line=process.stdout.readline()
                if not line: raise RuntimeError(mode+" benchmark terminated")
                row=json.loads(line);row.update(fixture=name,engine=mode,sample=run)
                if run == -args.warmups:cold.append(row)
                if run>=0:rows.append(row)
            print(mode,"matrix pass",run,flush=True)
    finally:
        process.stdin.close();process.wait();stop.set();thread.join()
    if process.returncode: raise SystemExit(process.returncode)
    (OUT/(mode+"-cpu.json")).write_text(json.dumps(rows))
    per_fixture=[statistics.median([r["cpuStagesMs"] for r in rows if r["fixture"]==name]) for name,_ in inputs]
    all_ms=sorted(r["cpuStagesMs"] for r in rows)
    summary[mode]={"aggregateFixtureMedianMs":sum(per_fixture),"requestMedianMs":statistics.median(all_ms),"requestP95Ms":all_ms[int((len(all_ms)-1)*.95)],"cpuStageThroughputPerSec":len(all_ms)*1000/sum(all_ms),"peakDriverRssKiB":peak[0],"firstMatrixPass":cold}
summary["aggregateCpuReductionPct"]=(1-summary["rust"]["aggregateFixtureMedianMs"]/summary["java"]["aggregateFixtureMedianMs"])*100
(OUT/"cpu-summary.json").write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in commands},indent=2))
