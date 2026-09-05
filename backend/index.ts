// File: index.ts (trigger restart)

// Load environment variables with multiple path fallbacks
import path from "path";
import fs from "fs";

// Try multiple paths for .env file - prioritize root .env file
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, ".env"),
  path.resolve(process.cwd(), "../.env"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  require("dotenv").config();
}

import "./module-alias-setup";

const port = process.env.NEXT_PUBLIC_BACKEND_PORT || 4000;

async function syncOtcClock() {
  try {
    const bidexUrl = (
      process.env.BINDEX_API_URL ||
      process.env.BIDEX_API_URL ||
      "http://localhost:8001"
    ).replace(/\/$/, "");
    const res = await fetch(
      `${bidexUrl}/api/chart?asset=AUD/CHF%20(OTC)&interval=1&from=${Date.now() - 60000}&to=${Date.now() + 60000}`,
      {
        headers: { Origin: "http://localhost" },
        signal: AbortSignal.timeout(4000),
      }
    );
    const dateHeader = res.headers.get("Date");
    if (dateHeader) {
      const offset = new Date(dateHeader).getTime() - Date.now();
      (global as any).otcTimeOffset = offset;
      console.log(
        `[OTC Time Sync] Startup clock sync successful. Calculated offset: ${offset}ms`
      );
    }
  } catch (e: any) {
    console.warn(`[OTC Time Sync] Startup clock sync failed: ${e.message}`);
  }
}

async function startVendorEngine() {
  const { MashServer } = require("@b");
  const { console$, logger } = require("@b/utils/console");
  try {
    const app = new MashServer();
    await app.startServer(Number(port));
    await syncOtcClock();
  } catch (error) {
    console$.error("Failed to start server", error);
    logger.error("APP", "Failed to initialize app", error);
    process.exit(1);
  }
}

/* Load boot.mjs as a real ES module.
 *
 * Two things bite here, and both only show up in a real deployment:
 *
 * 1. The path is relative to the FILE, and the compiled file lives one level
 *    deeper than the source. `./owned-engine/boot.mjs` resolved to
 *    dist/owned-engine/boot.mjs in production — which does not exist, because
 *    the engine is at backend/owned-engine. Resolve against __dirname and
 *    accept either layout instead of guessing.
 *
 * 2. TypeScript rewrites a plain `import()` into `require()` under this
 *    tsconfig, and `require` cannot load boot.mjs at all — it is ESM with a
 *    top-level await. Going through `new Function` keeps it a genuine dynamic
 *    import that the compiler leaves alone.
 */
async function loadOwnedEngineBoot() {
  const path = require("path");
  const fs = require("fs");
  const { pathToFileURL } = require("url");

  const candidates = [
    path.join(__dirname, "..", "owned-engine", "boot.mjs"), // compiled: dist/index.js
    path.join(__dirname, "owned-engine", "boot.mjs"),       // source: backend/index.ts
  ];
  const entry = candidates.find((p: string) => fs.existsSync(p));
  if (!entry) {
    throw new Error(
      `owned-engine boot.mjs not found. Looked in:\n  ${candidates.join("\n  ")}`
    );
  }

  const importESM = new Function("url", "return import(url)") as (u: string) => Promise<any>;
  return importESM(pathToFileURL(entry).href);
}

async function startOwnedEngine() {
  console.log("[owned-engine] USE_OWNED_ENGINE=1 — booting the owned engine");
  try {
    const { boot } = await loadOwnedEngineBoot();
    await boot(Number(port));
    await syncOtcClock();
  } catch (error) {
    console.error("[owned-engine] Failed to start:", error);
    process.exit(1);
  }
}

if (process.env.USE_OWNED_ENGINE === "1") {
  startOwnedEngine();
} else {
  startVendorEngine();
}

