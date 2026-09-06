# Rust routing migration

Spring remains the public API and the owner of validation, bounding boxes, raw OSM caches, Overpass, both elevation providers, final elevation enrichment, PostGIS writes, Strava and geocoding. The optional Rust service owns the complete CPU routing pipeline. The frontend request and response DTOs are unchanged. After the recorded acceptance gates passed, Rust became the default. Java remains selectable and is the rollback implementation.

## Engine configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `ROUTECRAFT_ROUTING_ENGINE` | `rust` | Spring selects `java` or `rust`; other values fail startup |
| `ROUTECRAFT_ENGINE_URL` | `http://routecraft-engine:8090` | Private engine base URL used by Spring |
| `ROUTECRAFT_ENGINE_BUDGET_SECONDS` | `30` | Set consistently on both services; cumulative prepare/generate computation budget excludes the elevation-provider interval |
| `ROUTECRAFT_ENGINE_LISTEN` | `0.0.0.0:8090` | Native Rust listen address |

To run the default Rust integration locally, use `docker compose up --build`. Revert by recreating the API with `ROUTECRAFT_ROUTING_ENGINE=java`. Default Compose publishes no Rust port. The integration override publishes it on loopback only and points the API at a separate test database.

The Rust process uses available CPU parallelism as its concurrency limit. It rejects excess CPU work without queuing it, keeps at most 512 MiB of conservatively estimated retained graph allocations, expires handles after 120 seconds, and sweeps expired handles every second. These defaults are in `server::Settings`. The retained budget does not cap temporary construction/search allocations or total process RSS. Request bodies are limited to 64 MiB. CPU decoding, computation and response encoding run on blocking workers, with deadline/cancellation checks through graph construction and searches. Each handle is process-local and consumed by one generate call.

## Internal protocol v1

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /internal/v1/graphs/prepare` | `{ "elements": [...], "preferences": {...} }` | `{ "handle": "UUID", "nodePoints": [...], "protocolVersion": 1 }` |
| `POST /internal/v1/graphs/{handle}/generate` | `{ "elevations": { "lat,lng": 123.0 } }` | `{ "candidates": [...], "protocolVersion": 1 }` |
| `DELETE /internal/v1/graphs/{handle}` | No body | `204`, idempotent |
| `GET /health` | No body | `{ "status": "ok", "protocolVersion": 1 }` |

Coordinate keys use Spring's six-decimal formatting. OSM IDs remain signed 64-bit integers and coordinates remain doubles. Spring sorts prepared nodes by distance before invoking its existing elevation logic, including deduplication, the 800-point cap, provider timeouts and partial results. Returned candidates are deserialized into the existing Java model before sequential final elevation enrichment and one batch write.

Errors have `{ "code": "...", "protocolVersion": 1 }`: `malformed_input` (400), `insufficient_graph_data` and `no_route` (422), `expired_handle` (410), `overload` (503), and `timeout` (504). Spring preserves the existing public domain-error behavior. Transport/protocol errors, restart, expiry, overload and timeout cause one Java attempt using the already acquired OSM and any fetched node elevations. There is no automatic Rust retry. An interrupted request does not launch rollback. Handle cleanup uses Java try-with-resources; abandoned handles also expire. Engine failure cannot directly select synthetic routes; the previous OSM-acquisition fallback remains.

## Library structure

`model` and `geo` define the existing data and numeric rules. `osm` builds/trims edges, scores green features, applies elevations and inserts anchors. `graph` stores dense indices, contiguous adjacency and spatial lookup. `search` reuses distance/predecessor arrays for A*, shortest-path trees and penalized alternatives. `loops`, `candidates` and `analysis` preserve route generation, analysis, selection, names, explanations and IDs. `server` only coordinates the private protocol and resource lifetime.

Green scoring uses an R-tree broad phase followed by the original exact distance calculation. Containment, the nearest five features, source-order ties and the 300 m contribution cutoff are retained. Differential tests run both indexed and exhaustive scoring. Geometry buffers are shared through `Arc`; reversed directional geometry is constructed once. Java heap ordering and Java's stable TimSort behavior are reproduced where they affect route IDs. The Java out-and-back ranking comparator switches criteria within 150 m and is not transitive, so replacing it with Rust's ordinary comparator sort changes behavior.

## Recorded compatibility references

The three OSM extracts are dense urban Manhattan streets, Central Park, and the hilly Ithaca network. Each JSON file contains source endpoint, query, capture time, selection information and OpenStreetMap attribution. Complete selected ways retain their original identifiers and geometry. OpenStreetMap data is © OpenStreetMap contributors, available under the [ODbL](https://www.openstreetmap.org/copyright).

The 54 references cover 3 areas × 3 activities × 3 route types × 2 preference configurations. Configuration 0 uses a 2 km distance target, minimum preference weights, afternoon and park-heavy style. Configuration 1 uses a 14-minute duration target, maximum weights, night and climbing style. Fixed elevation maps include missing values and cap coverage at 800 points. Gzip files contain preferences, elevations, Java raw/trimmed/final graphs and selected candidates. Tests run offline and do not silently refresh data.

Java fixtures are the exact regression reference. Rust compares graph attributes with absolute/relative `1e-6` tolerance, requires matching candidate fields, IDs, paths, enums and text, and checks published rounded values exactly. Unrounded metric components and geometry use the stated tolerance. The matrix currently needs no equal-cost path exception. Separate tests cover polygon containment, feature ties/cutoff/dateline cases, blocked nodes/edges, reverse penalties, disconnected/identical endpoints, deadlines, cancellation, alternative limits, sparse graphs, one-shot handles, expiry, overload and cleanup. The finite fixture corpus is evidence for these inputs, not a proof for every OSM extract or Java HashMap collision pattern.

Refresh OSM deliberately with `scripts/record-osm.py` (existing files are skipped), then regenerate Java references only when the intended baseline changes:

```bash
cd services/routecraft-api
./mvnw -Dtest=CompatibilityFixturesTest -Droutecraft.recordFixtures=true test
```

## Verification

From the respective runtime directories:

```bash
cd services/routecraft-api
./mvnw clean test
./mvnw dependency:build-classpath -Dmdep.outputFile=target/benchmark-classpath.txt
```

```bash
cd services/routecraft-engine
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --release
cargo build --locked --release --bins
```

From the repository root, use a disposable database for integration. The commands create `routecraft_migration_test`; omit `createdb` if it already exists. These tests intentionally persist batches in that database. Stop the test API and engine afterward with `docker compose stop routecraft-api routecraft-engine`; do not remove an existing Postgres volume.

```bash
docker compose -f docker-compose.yml -f services/routing-compat/compose.test.yml up -d --build --wait postgres routecraft-engine
docker compose exec -T postgres createdb -U routecraft routecraft_migration_test
```

```bash
cd services/routecraft-api
./mvnw -Dtest=MigrationIntegrationTest -Droutecraft.integration=true \
  -Droutecraft.routing.engine=rust \
  -Droutecraft.routing.engine-url=http://localhost:18090 test
```

Then from the repository root:

```bash
docker compose -f docker-compose.yml -f services/routing-compat/compose.test.yml up -d --build --wait routecraft-api
python3 services/routing-compat/scripts/seed-smoke.py
node services/routing-compat/scripts/frontend-smoke.cjs
python3 services/routing-compat/scripts/operations-smoke.py
```

The frontend smoke executes the actual TypeScript API-client module with real fetch, checks the response, one batch write and PostGIS geometry. It requires frontend dependencies installed via `pnpm install --frozen-lockfile` in `apps/web`. It is an API-client smoke, not a browser UI/visual test. OSM is seeded; final elevation providers retain their normal live/partial-result behavior. The operations smoke restarts/stops only the test engine and restores it afterward. CI runs the Java/Rust suites plus the Docker matrix and both smoke tests.

## Performance and adoption

Build first, stop unrelated CPU work, leave test PostGIS running, then run these serially from the repository root:

```bash
python3 services/routing-compat/scripts/benchmark.py --samples 20 --warmups 2
python3 services/routing-compat/scripts/integration-benchmark.py --samples 20 --warmups 3
```

CPU measurements exclude JSON exchange and external providers; their throughput is CPU-stage throughput. Java has two full matrix warmup passes, Rust is release mode, and each fixture contributes 20 measured samples. The aggregate CPU statistic is the sum of the 54 fixture medians. The first matrix pass is recorded separately and is not 54 independent cold process measurements.

The integration driver runs fresh Spring JVMs sequentially for Java and Rust, starts the native Rust HTTP service only for Rust mode, and uses real Spring HTTP, raw caches, serialization, final profile computation and PostGIS writes. External OSM/elevation values are fixed. Each fixture has three warmup requests and 20 measured requests. JVM heap flags are identical (`-Xms128m -Xmx512m`). Combined RSS is sampled every 100 ms for the Spring test JVM plus Rust; it excludes Maven and PostGIS, and includes the same test/Mockito overhead in each JVM. This is an integration estimate, not a production capacity/load test. The first public routing request in each fresh Spring process is reported separately as cold; later first encounters have a warmed JVM.

Raw samples, stage logs and machine-readable summaries go to ignored `results/`. See [BENCHMARKS.md](BENCHMARKS.md) for the recorded run, gate decisions and limitations. Rust was enabled only after the recorded gates passed. Adoption requires compatibility, ≥25% aggregate CPU reduction, every route type's warm end-to-end p95 regression ≤5%, and combined peak memory increase ≤10%. A failed or unverified gate keeps Java as default.
