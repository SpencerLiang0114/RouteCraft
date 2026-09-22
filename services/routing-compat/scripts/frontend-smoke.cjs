// Runs the browser API-client modules with a real fetch implementation.
// Only the client-only bundler marker is stubbed.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const ts = require(path.join(root, "apps/web/node_modules/typescript"));
const apiBase = process.env.ROUTECRAFT_SMOKE_API_URL || "http://localhost:18080";

function compileTs(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const moduleCache = new Map();
function loadModule(relativePath) {
  const absolute = path.join(root, relativePath);
  if (moduleCache.has(absolute)) {
    return moduleCache.get(absolute);
  }
  const exportsObject = {};
  moduleCache.set(absolute, exportsObject);
  const context = vm.createContext({
    exports: exportsObject,
    module: { exports: exportsObject },
    process: { env: { NEXT_PUBLIC_ROUTECRAFT_API_URL: apiBase } },
    fetch,
    Headers,
    require(name) {
      if (name === "client-only") return {};
      if (name === "./http") return loadModule("apps/web/src/lib/api-client/http.ts");
      throw new Error("Unexpected import: " + name);
    },
  });
  vm.runInContext(compileTs(relativePath), context);
  return exportsObject;
}

const routing = loadModule("apps/web/src/lib/api-client/routing.ts");
const reference = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, "services/routing-compat/fixtures/urban-running-out_and_back-0.reference.json.gz"))));
const query = sql => execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "routecraft", "-d", process.env.ROUTECRAFT_SMOKE_DB || "routecraft_migration_test", "-Atc", sql], { cwd: root, encoding: "utf8" }).trim();
(async () => {
  const before = Number(query("select count(*) from generated_route_batches"));
  const result = await routing.generateRoutes(reference.preferences);
  if (!Array.isArray(result.routes) || !result.routes.length || result.routes.length > 3) {
    throw new Error("Unexpected frontend response");
  }
  const after = Number(query("select count(*) from generated_route_batches"));
  if (after !== before + 1) throw new Error("Expected exactly one persisted batch");
  const invalid = Number(query("select count(*) from generated_route_candidates where ST_SRID(geometry) <> 4326 or ST_IsEmpty(geometry)"));
  if (invalid !== 0) throw new Error("Invalid persisted geometry");
  console.log(JSON.stringify({ frontendRoutes: result.routes.length, batchesWritten: after - before, postgisGeometryValid: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
