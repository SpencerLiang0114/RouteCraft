"""Current-Rust differential and performance runner, invoked through benchmark.py."""
import argparse
import gzip
import hashlib
import json
import os
import pathlib
import platform
import statistics
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "services/routing-compat/fixtures"
STAGES = ("prepareMs", "finalizeMs", "generateMs", "cpuStagesMs")
ROUTES = ("loop", "out_and_back", "point_to_point")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recorded():
    result = []
    for path in sorted(FIXTURES.glob("*.reference.json.gz")):
        with gzip.open(path, "rt") as stream:
            reference = json.load(stream)
        name = path.name.removesuffix(".reference.json.gz")
        area = json.loads((FIXTURES / (name.split("-")[0] + ".json")).read_text())
        result.append((name, {"elements": area["elements"],
                             "preferences": reference["preferences"],
                             "elevations": reference["elevations"]}))
    return result


def stress_cases():
    """Deterministic grid inputs at the trim limits, plus sparse/disconnected cases."""
    import random
    result = []
    for activity, limit in (("running", 10000), ("cycling", 14000)):
        rng = random.Random(20260915)
        width = 90
        nodes = [{"id": str(i), "point": {"lat": 40 + (i // width) * .0003,
                                         "lng": -74 + (i % width) * .0004}}
                 for i in range(width * width)]
        edges = []
        for i in range(len(nodes)):
            for j in (i + 1, i + width):
                if j >= len(nodes) or (j == i + 1 and j // width != i // width):
                    continue
                if len(edges) == limit:
                    break
                edges.append({"id": f"edge-{len(edges)}", "from": str(i), "to": str(j),
                              "distanceM": 34., "geometry": [nodes[i]["point"], nodes[j]["point"]],
                              "surfaceType": "paved", "roadType": "residential",
                              "elevationGainM": 0., "slope": 0., "parkScore": rng.random(),
                              "shadeScore": .5, "safetyScore": .7, "sceneryScore": .5,
                              "bikeScore": .6, "walkScore": .7, "accessAllowed": True})
        for route in ROUTES:
            for sparse in (False, True):
                selected = edges if not sparse else [e for i, e in enumerate(edges) if i % 7 == 0]
                prefs = {"activity": activity, "routeType": route, "targetDistanceKm": 12.,
                         "startPoint": nodes[width * 20 + 20]["point"],
                         "endPoint": nodes[width * 60 + 60]["point"],
                         "parkPreference": 1., "shadePreference": 1., "safetyPreference": 1.,
                         "elevationPreference": 1., "explorationPreference": 1.}
                elevations = {f"{n['point']['lat']:.6f},{n['point']['lng']:.6f}": float(i % 31)
                              for i, n in enumerate(nodes) if i % 13 == 0}
                result.append((f"stress-{activity}-{route}-{'sparse' if sparse else 'dense'}",
                               {"elements": [], "draft": {"nodes": nodes, "edges": selected},
                                "preferences": prefs, "elevations": elevations}))
    return result


def compare(actual, expected, at="result"):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), at
        for key in expected:
            compare(actual[key], expected[key], at + "." + key)
    elif isinstance(expected, list):
        assert len(actual) == len(expected), at
        for i, (a, b) in enumerate(zip(actual, expected)):
            compare(a, b, f"{at}[{i}]")
    elif isinstance(expected, (int, float)):
        internal = any(k in at for k in (".geometry", ".waypoints", ".metrics")) and not at.endswith(".totalScore")
        if internal:
            assert abs(actual - expected) <= max(1e-6, abs(expected) * 1e-6), (at, actual, expected)
        else:
            assert actual == expected, (at, actual, expected)
    else:
        assert actual == expected, (at, actual, expected)


def run(binary, inputs, warmups, samples, include_results=False):
    rows = []
    with subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as process:
        try:
            payloads = [(name, json.dumps({**value, "includeResults": include_results}, separators=(",", ":")))
                        for name, value in inputs]
            for sample in range(-warmups, samples):
                for name, payload in payloads:
                    process.stdin.write(payload + "\n")
                    process.stdin.flush()
                    line = process.stdout.readline()
                    if not line:
                        raise RuntimeError(f"{binary} terminated at {name}")
                    row = json.loads(line)
                    row.update(fixture=name, sample=sample)
                    if sample >= 0:
                        rows.append(row)
                print(binary.name, "matrix pass", sample, "complete", flush=True)
        finally:
            process.stdin.close()
        if process.wait():
            raise RuntimeError(f"{binary} failed")
    return rows


def stats(rows):
    result = {}
    for route in (*ROUTES, "all"):
        subset = [r for r in rows if route == "all" or route in r["fixture"]]
        names = {r["fixture"] for r in subset}
        values = sorted(r["cpuStagesMs"] for r in subset)
        result[route] = {"stages": {stage: sum(statistics.median(r[stage] for r in subset if r["fixture"] == name)
                                               for name in names) for stage in STAGES},
                         "p95Ms": values[int((len(values) - 1) * .95)]}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=pathlib.Path, required=True)
    parser.add_argument("--candidate", type=pathlib.Path, required=True)
    parser.add_argument("--baseline-commit", required=True)
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--warmups", type=int, default=2)
    corpus = parser.add_mutually_exclusive_group()
    corpus.add_argument("--stress", action="store_true")
    corpus.add_argument("--stress-only", action="store_true")
    parser.add_argument("--profile", action="store_true", help="Diagnostic run only; no performance acceptance")
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.samples < 1 or args.warmups < 0:
        parser.error("samples must be positive and warmups nonnegative")
    args.output.mkdir(parents=True, exist_ok=True)
    inputs = stress_cases() if args.stress_only else recorded() + (stress_cases() if args.stress else [])
    binaries = {"baseline": args.baseline.resolve(), "candidate": args.candidate.resolve()}
    summary = {"baselineCommit": subprocess.check_output(["git", "rev-parse", args.baseline_commit], cwd=ROOT, text=True).strip(),
               "candidateCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
               "candidateDiffSha256": hashlib.sha256(subprocess.check_output(["git", "diff", "HEAD"], cwd=ROOT)).hexdigest(),
               "binaries": {k: {"path": str(v), "sha256": digest(v)} for k, v in binaries.items()},
               "fixtures": {p.name: digest(p) for p in sorted(FIXTURES.iterdir()) if p.is_file()},
               "inputSha256": hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest(),
               "platform": platform.platform(), "rustc": subprocess.check_output(["rustc", "-Vv"], text=True),
               "sourceHashes": {str(p.relative_to(ROOT)): digest(p) for pattern in
                   ("services/routecraft-engine/src/**/*.rs", "services/routecraft-engine/Cargo.*", "services/routing-compat/scripts/*.py")
                   for p in ROOT.glob(pattern)},
               "baselineBuild": json.loads((args.baseline.parent / "metadata.json").read_text())
                   if (args.baseline.parent / "metadata.json").exists() else None,
               "build": "--locked --release --bins", "rustflags": os.environ.get("RUSTFLAGS", ""),
               "samples": args.samples, "warmups": args.warmups, "profiling": args.profile}
    # Compare full results outside acceptance timings, including empty/error outcomes.
    references = run(binaries["baseline"], inputs, 0, 1, True)
    actuals = run(binaries["candidate"], inputs, 0, 1, True)
    for baseline, candidate in zip(references, actuals):
        assert baseline["error"] == candidate["error"], baseline["fixture"]
        compare(candidate["result"], baseline["result"], baseline["fixture"] + ".result")
    summary["equivalentCases"] = len(inputs)
    for mode, binary in binaries.items():
        rows = run(binary, inputs, args.warmups, args.samples)
        if not args.profile and any("profile" in r for r in rows):
            raise RuntimeError("profiling binary cannot be used for acceptance timings")
        (args.output / (mode + ".json")).write_text(json.dumps(rows))
        summary[mode] = stats(rows)
    summary["aggregateReductionPct"] = 100 * (1 - summary["candidate"]["all"]["stages"]["cpuStagesMs"] / summary["baseline"]["all"]["stages"]["cpuStagesMs"])
    summary["routeP95ChangePct"] = {r: 100 * (summary["candidate"][r]["p95Ms"] / summary["baseline"][r]["p95Ms"] - 1) for r in ROUTES}
    summary["gates"] = {"timingEligible": not args.profile and args.samples >= 20,
                        "cpuReductionAtLeast15Pct": summary["aggregateReductionPct"] >= 15,
                        "routeP95RegressionAtMost5Pct": all(v <= 5 for v in summary["routeP95ChangePct"].values())}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in ("equivalentCases", "aggregateReductionPct", "routeP95ChangePct")}, indent=2))


if __name__ == "__main__":
    main()
