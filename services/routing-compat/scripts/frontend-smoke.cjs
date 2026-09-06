// Runs the actual browser API-client module with a real fetch implementation.
// Only the client-only bundler marker is stubbed; routing code is unchanged.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const ts = require(path.join(root, "apps/web/node_modules/typescript"));
const source = fs.readFileSync(path.join(root, "apps/web/src/lib/api-client/routing.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exportsObject = {};
const context = vm.createContext({ exports: exportsObject, process: { env: { NEXT_PUBLIC_ROUTECRAFT_API_URL: process.env.ROUTECRAFT_SMOKE_API_URL || "http://localhost:18080" } }, fetch, require(name) { if (name === "client-only") return {}; throw new Error("Unexpected import: " + name); } });
vm.runInContext(compiled, context);
const reference = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,"services/routing-compat/fixtures/urban-running-out_and_back-0.reference.json.gz"))));
const query = sql => execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "routecraft", "-d", process.env.ROUTECRAFT_SMOKE_DB || "routecraft_migration_test", "-Atc", sql], { cwd: root, encoding: "utf8" }).trim();
(async () => {
  const before = Number(query("select count(*) from generated_route_batches"));
  const result = await exportsObject.generateRoutes(reference.preferences);
  if (!Array.isArray(result.routes) || !result.routes.length || result.routes.length > 3) throw new Error("Unexpected frontend response");
  const after = Number(query("select count(*) from generated_route_batches"));
  if (after !== before + 1) throw new Error("Expected exactly one persisted batch");
  const invalid = Number(query("select count(*) from generated_route_candidates where ST_SRID(geometry) <> 4326 or ST_IsEmpty(geometry)"));
  if (invalid !== 0) throw new Error("Invalid persisted geometry");
  console.log(JSON.stringify({ frontendRoutes: result.routes.length, batchesWritten: after-before, postgisGeometryValid: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
