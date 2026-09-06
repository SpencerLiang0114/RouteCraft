# Routing migration measurements — 2026-09-06

All measured adoption gates passed. Rust is the default after compatibility verification; Java remains selectable and is the automatic availability-failure rollback engine.

## Environment and method

Apple M5 Pro, 48 GiB RAM, macOS 26.6.2 ARM64. Java 21 and optimized release Rust run natively on the same workstation, sequentially, with no overlapping builds or test suites. PostGIS runs in the existing Docker image (`postgis/postgis:16-3.4-alpine`, linux/amd64). Results are local workstation measurements, not production load-test results. The Java reference starts at commit `e7f63fe5f5a4e60c31a4c2ec501560c19d91abe4`; source changes in this migration were uncommitted at measurement time. [Fixture checksums](fixtures-manifest.json) identify all 57 data files.

The 54 recorded cases span three OSM areas, activities, route modes and two target/preference configurations. The CPU driver uses two warmup matrix passes and 20 measured samples per fixture (1,080 per engine). The stage measure is elapsed time inside CPU-only graph preparation, elevation/anchor finalization and routing/selection; it excludes JSON transport, external providers and persistence. It is not an OS process CPU accounting counter. Java heap flags are `-Xms128m -Xmx512m`.

## CPU stages

| Measure | Java | Rust |
| --- | ---: | ---: |
| Sum of per-fixture medians, ms | 12763.26 | 3590.78 |
| Pooled request median, ms | 219.22 | 59.72 |
| Pooled request p95, ms | 789.55 | 274.34 |
| CPU-stage throughput, requests/s | 4.22 | 15.00 |

Stage detail (sum of each stage's per-fixture medians; sums need not exactly equal the median of the combined stages):

| CPU stage | Java, ms | Rust, ms |
| --- | ---: | ---: |
| OSM/green scoring and trimming | 8,913.60 | 1,701.53 |
| Elevation, anchors and graph finalization | 345.68 | 281.88 |
| Candidate generation and selection | 3,498.40 | 1,606.06 |

Graph preparation accounts for most of the observed CPU reduction. Both the R-tree implementation and the port contribute; this run does not isolate the index's effect from the language/runtime change.

Aggregate CPU-stage median reduction: **71.87%**; the ≥25% gate passes.

The first process request (`hilly-cycling-loop-0`) measured 251.02 ms for Java and 58.09 ms for Rust. This excludes process startup and JSON decode. It is one cold routing observation per engine, not a statistical cold p95. The full first encounter matrix is retained separately in `results/cpu-summary.json`; later rows in that pass already share a warming process.

## End-to-end and combined memory

The final integration run measured 1,080 warm HTTP requests per engine, plus 162 warmup requests per engine. All 2,484 requests passed compatibility and persistence assertions. Rust mode recorded zero Java fallbacks.

| Warm end-to-end measure | Java | Rust | Change |
| --- | ---: | ---: | ---: |
| Loop p95, ms | 813.02 | 340.25 | -58.15% |
| Out-and-back p95, ms | 307.65 | 99.99 | -67.50% |
| Point-to-point p95, ms | 349.69 | 117.04 | -66.53% |
| Pooled median, ms | 223.69 | 81.36 | — |
| Pooled p95, ms | 755.33 | 322.17 | — |
| Serial HTTP throughput, requests/s | 4.29 | 10.80 | — |
| Combined peak RSS, MiB | 794.31 | 845.42 | +6.43% |

Every route type improves on the ≤5% p95 regression gate. Combined peak memory increases **6.43%**, within the ≤10% gate. Memory is the narrowest margin: graph CPU savings do not eliminate Spring's heap or the additional Rust process. Retained-graph accounting and measured RSS serve different purposes.

The process-cold first public request (`urban-running-loop-0`) took **504.47 ms in Java** and **321.62 ms with Rust**. These single observations exclude JVM/service startup, use recorded external data, and are not cold p95 estimates. Java's first request hit the persisted OSM cache; Rust's was a miss serviced by the fixed OSM provider. Thus these are process-cold observations, not a controlled cache-cold comparison. Later fixture first encounters have a warmed process.

The harness uses real Spring HTTP, private engine HTTP, cache access, final profile computation, response encoding and PostGIS writes. Only external OSM and elevation values are fixed. Each fixture has three warmup requests followed by 20 measured requests. The measured HTTP latency excludes test assertions and the before/after database count checks.

Combined memory is the sampled simultaneous RSS of the Spring test JVM and Rust service (Rust mode), or the Spring test JVM alone (Java mode), every 100 ms during the matrix. It excludes the Maven coordinator and PostGIS and includes the same JUnit/Mockito/fixture overhead in both JVMs. This overhead can dilute relative service-memory differences; a production rollout should reproduce the gate with deployment-sized heaps and representative concurrent traffic. The 512 MiB retained-graph limit is not a total RSS limit.

## Verification evidence

- Original baseline: 19 Java tests passed on a fresh clean run.
- Current Java suites: 27 tests executed successfully; the conditional integration test is skipped in ordinary runs and exercised separately.
- Rust: seven focused unit tests plus the 54-case differential integration test; exact IDs/paths/text and published rounding, internal numeric tolerance `1e-6`, indexed vs exhaustive green scoring.
- Real Spring HTTP → Docker Rust → PostGIS: all 54 cases passed, with exactly one batch per successful request.
- Actual frontend TypeScript API-client → Docker Spring/Rust → PostGIS smoke: three routes, one batch, valid SRID 4326 nonempty geometry.
- Real Docker restart invalidated a prepared handle (`410 expired_handle`). Engine shutdown triggered one Java fallback and one persisted batch, confirmed by the Spring fallback log.
- Java fallback tests cover OSM/elevation input reuse, cleanup, cancellation, no duplicate writes and no synthetic routes after failed rollback. Rust tests cover expiry, capacity, overload, malformed input, sparse graphs and cooperative cancellation/deadlines.
- Formatting, Clippy and Docker builds passed. CI configuration was added; it has not been run on a remote CI runner in this task.

## Reproduction and scope

The retained [machine-readable summary](measurements-2026-09-06.json) includes the statistics, method and gate decisions. Use the commands in [README.md](README.md#performance-and-adoption). Raw samples and logs are in ignored `results/`, including `java-cpu.json`, `rust-cpu.json`, `cpu-summary.json`, per-engine HTTP samples and stage logs. Repeated requests grow only the dedicated `routecraft_migration_test` database. One initial integration run used the development database; its 54 fixture batches were verified by timestamp, preferences and candidate IDs, then removed by their exact UUIDs, preserving older batches. Six matching newly created fixture cache entries were also removed. Temporary test services and the task-created integration database were cleaned up after the final smoke.

These results do not measure live provider variability, multi-user saturation, multiple Rust replicas, or browser rendering. Handles intentionally require a single Rust instance. Java remains available for rollback. Fixtures need no equal-cost path exceptions, but a finite recorded corpus cannot establish equivalence for every map or hash-collision pattern.
