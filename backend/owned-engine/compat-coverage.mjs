#!/usr/bin/env node
/**
 * Compatibility coverage — how many of the real handlers load on the owned
 * engine right now?
 *
 * Walks the full route manifest and tries to load each real compiled handler via
 * the compat layer. "Loads" = the module resolves and exports a `metadata` +
 * default handler function — a strong signal it will run on the owned pipeline.
 * (Actually executing each needs per-route fixtures; loading is the first gate.)
 *
 * Safe/local: uses the dev DB + local Redis. Run:
 *   node backend/owned-engine/compat-coverage.mjs
 */

process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME ||= "bidex_owned_dev";

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupCompat } from "./lib/compat.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));
const compat = setupCompat();

const toRel = (source) => source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "");
const family = (path) => (path.split("/")[2] || "(root)"); // /api/<family>/...

const stats = {}; // family -> { total, ok, ws, fail }
const failReasons = {};
let total = 0, ok = 0, ws = 0, fail = 0;

for (const route of manifest.routes) {
  total++;
  const fam = family(route.path);
  stats[fam] ||= { total: 0, ok: 0, ws: 0, fail: 0 };
  stats[fam].total++;

  if (route.method === "WS") { ws++; stats[fam].ws++; continue; } // WS served later

  try {
    const mod = compat.loadHandler(toRel(route.source));
    if (typeof mod.default === "function" && mod.metadata) {
      ok++; stats[fam].ok++;
    } else {
      fail++; stats[fam].fail++;
      failReasons["missing default/metadata"] = (failReasons["missing default/metadata"] || 0) + 1;
    }
  } catch (e) {
    fail++; stats[fam].fail++;
    const key = (e.code || e.message).toString().slice(0, 60);
    failReasons[key] = (failReasons[key] || 0) + 1;
  }
}

console.log(`\nCompat coverage — real handlers loadable on the owned engine\n`);
console.log(`  total routes:   ${total}`);
console.log(`  loaded OK:      ${ok}  (${((ok / (total - ws)) * 100).toFixed(1)}% of non-WS)`);
console.log(`  websocket:      ${ws}  (served in a later step)`);
console.log(`  failed to load: ${fail}`);

console.log(`\n  By family (ok / non-ws):`);
for (const [fam, s] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total).slice(0, 20)) {
  const nonWs = s.total - s.ws;
  const bar = nonWs ? `${s.ok}/${nonWs}` : "— (ws only)";
  console.log(`    ${fam.padEnd(16)} ${bar}${s.fail ? `   (${s.fail} failed)` : ""}`);
}

if (Object.keys(failReasons).length) {
  console.log(`\n  Failure reasons:`);
  for (const [reason, n] of Object.entries(failReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n.toString().padStart(4)}  ${reason}`);
  }
}
console.log("");
process.exit(0);
