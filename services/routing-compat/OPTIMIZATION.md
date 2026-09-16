# Exact-route engine optimization

This pass compares the optimized Rust engine with the previous Rust engine at
`a9ead32`, not with Java. Java's 54 recorded references remain unchanged and are
still the compatibility gate. Public HTTP DTOs, internal protocol v1, scoring,
search budgets, tie ordering, route selection, and fallback behavior are unchanged.

## Changes

- Graph preparation computes each trimming key once, parses way attributes once,
  and retains the nearest five exact green-feature hits without sorting all hits.
- Graph-local numeric groups retain the original undirected endpoint-key identity,
  including parallel edges. String search options are resolved before exploration;
  directed penalties retain precedence over shared penalties, including zero.
- Searches reset touched nodes and cache each destination heuristic lazily. Queue
  ordering, arithmetic, and deadline/cancellation checks are preserved.
- Loop generation reuses numeric penalty buffers and borrows cached first legs.
  Ranking and diversity selection borrow candidates; only selected candidates are
  moved into the response. Elevation profiles used by ranking are still computed.

## Measured engine results — 2026-09-15

Measured natively on macOS 27.0 ARM64 with Rust 1.98.0, against the preserved
baseline binary, with two warmup matrix passes and 20 samples per fixture. The
candidate is the uncommitted implementation; binary/source hashes identify it.
No builds, tests, or other benchmark workloads ran alongside acceptance timing.

| Recorded 54-case matrix | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: |
| Sum of fixture median engine time | 3,551.92 ms | 1,832.62 ms | -48.40% |
| Loop engine p95 | 287.36 ms | 145.30 ms | -49.44% |
| Out-and-back engine p95 | 62.42 ms | 37.33 ms | -40.20% |
| Point-to-point engine p95 | 76.28 ms | 46.01 ms | -39.68% |

Stage median sums: preparation 1,686.74 → 704.56 ms; finalization
264.37 → 316.64 ms; generation/selection 1,602.88 → 811.09 ms. Finalization
increases because it builds numeric lookup tables; the preparation/search savings
more than offset that cost. Stage median sums need not equal combined medians.
These are elapsed times within CPU stages, not OS CPU accounting counters.

The separate 12-case fixed-seed stress matrix matched baseline outputs in every
case and reduced aggregate stage time by 36.00%. Its p95 changes were -61.35%
(loop), +1.20% (out-and-back), and -21.57% (point-to-point). Dense cases produced
routes; disconnected sparse cases preserved empty results. Both matrices meet the
15% aggregate improvement and ≤5% per-route p95 regression targets.

Early five-sample stage checks measured 26.1% aggregate improvement after graph
preparation and 46.3% after search changes. These are diagnostic checkpoints, not
independent attribution of each small edit or substitutes for the final run.

The HTTP comparison used three warmup requests and 20 measured requests per
fixture (1,080 measured requests per binary). Both runs had zero Java fallbacks.

| Full HTTP / memory | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: |
| Loop p95 | 353.89 ms | 176.06 ms | -50.25% |
| Out-and-back p95 | 100.40 ms | 69.66 ms | -30.61% |
| Point-to-point p95 | 109.86 ms | 75.03 ms | -31.70% |
| Combined peak RSS | 842.25 MiB | 847.86 MiB | +0.67% |

All acceptance gates passed. [Machine-readable evidence](optimization-2026-09-15.json)
contains source, binary and fixture hashes, raw sample checksums, and statistics.
Raw samples and logs remain in the ignored `results/optimization-*` directories.

Validation passed: 13 Rust unit tests plus the 54-case differential matrix; 29
Java tests; strict Clippy with all features; the 54-case Docker HTTP/PostGIS
matrix; frontend API-client smoke (three routes, one batch, valid geometry);
engine restart invalidation and Java fallback (one persisted batch). The newly
created test database was removed; the development database and Postgres volume
were retained. Test services were stopped.

## Reproduction

The local rollback binaries and their build metadata are retained in
`results/optimization-baseline/`. The baseline benchmark contains the new input
and comparison harness over the unoptimized engine; diagnostics are compiled out.
For reproduction on another checkout, use the baseline engine source at `a9ead32`
with the current benchmark harness, then build both versions with default features
and the same Rust toolchain. Do not regenerate Java fixtures.

From `services/routecraft-engine`, run:

```sh
rtk cargo fmt --check
rtk cargo clippy --locked --all-targets --all-features -- -D warnings
rtk cargo test --locked --release
rtk cargo build --locked --release --bins
```

From the repository root, run benchmarks serially after builds and tests finish:

```sh
rtk proxy python3 services/routing-compat/scripts/benchmark.py \
  --baseline services/routing-compat/results/optimization-baseline/benchmark \
  --candidate services/routecraft-engine/target/release/benchmark \
  --baseline-commit a9ead32 --samples 20 --warmups 2 \
  --output services/routing-compat/results/optimization-final
```

Add `--stress-only` and use a separate output directory for the 12 deterministic
grid cases. These cover 10,000/14,000-edge graphs, 12 km targets, sparse disconnected
networks, all three route types, and partial elevations. They exercise trimming,
finalization and generation; supplied drafts bypass OSM feature construction.

The runner first compares full candidate outputs and errors, outside acceptance
timings. Published numbers, IDs, order and text must match exactly; geometry and
internal metrics use the existing `1e-6` tolerance. Timed samples exclude JSON
decoding and encoding. Summaries record binary hashes, source hashes, fixture and
input hashes, toolchain, build settings, per-route p95, and per-stage medians.

With the dedicated `routecraft_migration_test` database available, use the existing
HTTP harness with the two Rust server binaries:

```sh
rtk proxy python3 services/routing-compat/scripts/integration-benchmark.py \
  --baseline services/routing-compat/results/optimization-baseline/routecraft-engine \
  --candidate services/routecraft-engine/target/release/routecraft-engine \
  --baseline-commit a9ead32 --samples 20 --warmups 3 \
  --output services/routing-compat/results/optimization-http
```

The HTTP harness uses real Spring, Rust HTTP and PostGIS with fixed external
provider responses. It rejects any Rust run that falls back to Java. Memory is
simultaneous Spring test-JVM plus Rust RSS sampled every 100 ms; it excludes
PostGIS and Maven and includes test/Mockito overhead. This is not a production
load or concurrent capacity measurement.

## Diagnostics and rollback

Build diagnostic binaries separately so profiling never contaminates acceptance
timings:

```sh
rtk cargo build --locked --release --features profiling --bin benchmark \
  --target-dir target/profiling
```

The benchmark's `profile` object reports searches, queue pops, examined adjacency
edges (`relaxed_edges`), touched nodes, exact green-feature distance evaluations,
and path reconstructions. Counters are thread-local and absent from default builds.
Use the comparison runner's `--profile --samples 1 --warmups 0` with this binary
and a separate output directory; diagnostic timings are not acceptance results.

Revert to the retained server artifact to roll back this optimization. The existing
`ROUTECRAFT_ROUTING_ENGINE=java` option remains available. No production rollout or
configuration change is part of this pass. Finite fixture and stress coverage is
not a proof of equivalence for every possible input graph.

The diagnostic build also matched all 54 baseline outputs. For
`hilly-running-loop-1`, it recorded 349 searches, 1271427 queue
pops, and 39883 exact green-feature evaluations. Diagnostic timings are excluded
from the acceptance figures above.
