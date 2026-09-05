#!/usr/bin/env node
/**
 * Parity runner — compares the current engine against the owned engine on a
 * STAGING environment. This is the tool to run once a staging copy of the site
 * (with a copy of the database + Redis) exists.
 *
 * By default it only replays SAFE requests: GET routes that need no login and
 * take no :params — read-only, side-effect-free. Mutating routes (POST/PUT/
 * DELETE) and authenticated routes come later, with fixtures and a throwaway DB.
 *
 * Usage:
 *   node backend/owned-engine/parity-run.mjs --old http://staging:4000 --new http://localhost:5000
 *   # add --all to include authenticated/param routes (needs a token + fixtures)
 *
 * It refuses to run against the production host.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runParity } from "./lib/parity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const oldBase = arg("--old");
const newBase = arg("--new");
const includeAll = process.argv.includes("--all");

if (!oldBase || !newBase) {
  console.error("Usage: parity-run.mjs --old <url> --new <url> [--all]");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));

// Safe default set: GET, no login required, no path params.
const specs = manifest.routes
  .filter((r) => r.method === "GET")
  .filter((r) => includeAll || (r.requiresAuth === false && !r.path.includes(":")))
  .map((r) => ({ method: "GET", path: r.path }));

console.log(`\nParity: ${oldBase}  vs  ${newBase}`);
console.log(`Replaying ${specs.length} route(s)${includeAll ? " (ALL)" : " (safe read-only set)"}...\n`);

let report;
try {
  report = await runParity({ oldBase, newBase, specs });
} catch (err) {
  console.error(`\n✋ ${err.message}\n`);
  process.exit(1);
}

for (const r of report.results) {
  if (r.match) {
    console.log(`  ✓ ${r.spec.method} ${r.spec.path}`);
  } else {
    console.log(`  ✗ ${r.spec.method} ${r.spec.path}`);
    if (!r.statusMatch) console.log(`      status: old=${r.statusDiff.old} new=${r.statusDiff.new}`);
    for (const d of r.bodyDiffs.slice(0, 8)) {
      console.log(`      ${d.path}: old=${JSON.stringify(d.old)} new=${JSON.stringify(d.new)}`);
    }
    if (r.bodyDiffs.length > 8) console.log(`      ...and ${r.bodyDiffs.length - 8} more`);
  }
}

console.log(`\n  ${report.matched}/${report.total} matched, ${report.mismatched} mismatched\n`);
process.exit(report.mismatched === 0 ? 0 : 1);
