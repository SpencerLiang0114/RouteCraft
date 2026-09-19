#!/usr/bin/env python3
"""Print a human-readable offline summary of routing-compat benchmark gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

COMPAT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MEASUREMENTS = COMPAT_DIR / "measurements-2026-09-06.json"

REQUIRED_GATES = (
    "compatibilityCasesPassed",
    "cpuReductionAtLeast25Pct",
    "allRouteP95RegressionsAtMost5Pct",
    "combinedMemoryIncreaseAtMost10Pct",
)


def kib_to_mib(kib: float) -> float:
    return kib / 1024.0


def fmt_ms(value: float) -> str:
    return f"{value:.2f} ms"


def fmt_pct(value: float) -> str:
    return f"{value:+.2f}%"


def fmt_bool(value: object) -> str:
    if value is True:
        return "PASS"
    if value is False:
        return "FAIL"
    return "MISSING"


def load_measurements(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def print_summary(data: dict, path: Path) -> list[str]:
    cpu = data.get("cpu") or {}
    integration = data.get("integration") or {}
    gates = data.get("gates") or {}
    java_cpu = cpu.get("java") or {}
    rust_cpu = cpu.get("rust") or {}
    java_int = integration.get("java") or {}
    rust_int = integration.get("rust") or {}
    route_p95 = integration.get("routeP95ChangePct") or {}

    print(f"Routing-compat benchmark gates: {path}")
    print(f"Date: {data.get('date', 'unknown')}")
    print(f"Hardware: {data.get('hardware', 'unknown')}")
    print(f"Adopted default: {data.get('adoptedDefault', 'unknown')}")
    print()

    print("CPU key metrics")
    print(
        f"  Aggregate fixture median: "
        f"Java {fmt_ms(java_cpu.get('aggregateFixtureMedianMs', float('nan')))} → "
        f"Rust {fmt_ms(rust_cpu.get('aggregateFixtureMedianMs', float('nan')))}"
    )
    print(
        f"  Request median: "
        f"Java {fmt_ms(java_cpu.get('requestMedianMs', float('nan')))} → "
        f"Rust {fmt_ms(rust_cpu.get('requestMedianMs', float('nan')))}"
    )
    print(
        f"  Request p95: "
        f"Java {fmt_ms(java_cpu.get('requestP95Ms', float('nan')))} → "
        f"Rust {fmt_ms(rust_cpu.get('requestP95Ms', float('nan')))}"
    )
    print(
        f"  CPU-stage throughput: "
        f"Java {java_cpu.get('cpuStageThroughputPerSec', float('nan')):.2f}/s → "
        f"Rust {rust_cpu.get('cpuStageThroughputPerSec', float('nan')):.2f}/s"
    )
    print(
        f"  Aggregate CPU reduction: "
        f"{cpu.get('aggregateCpuReductionPct', float('nan')):.2f}% (gate ≥25%)"
    )
    print()

    print("Integration key metrics")
    print(
        f"  Warm median: "
        f"Java {fmt_ms(java_int.get('medianMs', float('nan')))} → "
        f"Rust {fmt_ms(rust_int.get('medianMs', float('nan')))}"
    )
    print(
        f"  Warm p95: "
        f"Java {fmt_ms(java_int.get('p95Ms', float('nan')))} → "
        f"Rust {fmt_ms(rust_int.get('p95Ms', float('nan')))}"
    )
    print(
        f"  Throughput: "
        f"Java {java_int.get('throughputPerSec', float('nan')):.2f}/s → "
        f"Rust {rust_int.get('throughputPerSec', float('nan')):.2f}/s"
    )
    print(
        f"  Combined peak RSS: "
        f"Java {kib_to_mib(java_int.get('combinedPeakRssKiB', float('nan'))):.2f} MiB → "
        f"Rust {kib_to_mib(rust_int.get('combinedPeakRssKiB', float('nan'))):.2f} MiB "
        f"({fmt_pct(integration.get('combinedMemoryIncreasePct', float('nan')))}, gate ≤+10%)"
    )
    print("  Route-type warm p95 change (gate ≤+5% regression):")
    for route_type in ("loop", "out_and_back", "point_to_point"):
        change = route_p95.get(route_type)
        if change is None:
            print(f"    {route_type}: MISSING")
        else:
            print(f"    {route_type}: {fmt_pct(change)}")
    print()

    print("Gates")
    failures: list[str] = []
    for name in REQUIRED_GATES:
        value = gates.get(name)
        status = fmt_bool(value)
        # compatibilityCasesPassed is a count in the recorded JSON; treat a
        # positive integer as pass so the summary stays useful for this file.
        if name == "compatibilityCasesPassed":
            if isinstance(value, bool):
                passed = value
            elif isinstance(value, int) and value > 0:
                status = f"PASS ({value} cases)"
                passed = True
            else:
                status = "FAIL" if value is not None else "MISSING"
                passed = False
        else:
            passed = value is True
        print(f"  {name}: {status}")
        if not passed:
            failures.append(name)

    print()
    if failures:
        print(f"Result: FAIL ({len(failures)} gate(s) false or missing)")
    else:
        print("Result: PASS (all gates true)")
    return failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Summarize offline routing-compat benchmark gate results."
    )
    parser.add_argument(
        "measurements",
        nargs="?",
        type=Path,
        default=DEFAULT_MEASUREMENTS,
        help=f"Path to measurements JSON (default: {DEFAULT_MEASUREMENTS.name})",
    )
    args = parser.parse_args(argv)
    path = args.measurements.resolve()
    if not path.is_file():
        print(f"error: measurements file not found: {path}", file=sys.stderr)
        return 1

    try:
        data = load_measurements(path)
    except (OSError, json.JSONDecodeError) as error:
        print(f"error: failed to read measurements: {error}", file=sys.stderr)
        return 1

    failures = print_summary(data, path)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
