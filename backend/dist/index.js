"use strict";
// File: index.ts (trigger restart)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables with multiple path fallbacks
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Try multiple paths for .env file - prioritize root .env file
const envPaths = [
    path_1.default.resolve(process.cwd(), ".env"),
    path_1.default.resolve(__dirname, "../.env"),
    path_1.default.resolve(__dirname, ".env"),
    path_1.default.resolve(process.cwd(), "../.env"),
];
let envLoaded = false;
for (const envPath of envPaths) {
    if (fs_1.default.existsSync(envPath)) {
        require("dotenv").config({ path: envPath });
        envLoaded = true;
        break;
    }
}
if (!envLoaded) {
    require("dotenv").config();
}
require("./module-alias-setup");
const port = process.env.NEXT_PUBLIC_BACKEND_PORT || 4000;
async function syncOtcClock() {
    try {
        const bidexUrl = (process.env.BINDEX_API_URL ||
            process.env.BIDEX_API_URL ||
            "http://localhost:8001").replace(/\/$/, "");
        const res = await fetch(`${bidexUrl}/api/chart?asset=AUD/CHF%20(OTC)&interval=1&from=${Date.now() - 60000}&to=${Date.now() + 60000}`, {
            headers: { Origin: "http://localhost" },
            signal: AbortSignal.timeout(4000),
        });
        const dateHeader = res.headers.get("Date");
        if (dateHeader) {
            const offset = new Date(dateHeader).getTime() - Date.now();
            global.otcTimeOffset = offset;
            console.log(`[OTC Time Sync] Startup clock sync successful. Calculated offset: ${offset}ms`);
        }
    }
    catch (e) {
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
    }
    catch (error) {
        console$.error("Failed to start server", error);
        logger.error("APP", "Failed to initialize app", error);
        process.exit(1);
    }
}
/* Load boot.mjs as a real ES module. Two faults lived in the one line this
   replaces, and both only appeared on a real deployment:

   1. `./owned-engine/boot.mjs` is relative to THIS file, which lives in dist/,
      so it resolved to dist/owned-engine/boot.mjs. The engine is at
      backend/owned-engine. USE_OWNED_ENGINE=1 could never have started.
   2. It went through require(), and boot.mjs is ESM with a top-level await,
      which require() cannot load — so fixing the path alone only moves the
      error along. `new Function` keeps it a genuine dynamic import.

   Kept in sync with backend/index.ts by hand: that file is NOT in tsconfig's
   include list, so it is never compiled and this file is the one that runs. */
async function loadOwnedEngineBoot() {
    const path = require("path");
    const fs = require("fs");
    const { pathToFileURL } = require("url");
    const candidates = [
        path.join(__dirname, "..", "owned-engine", "boot.mjs"), // running from dist/
        path.join(__dirname, "owned-engine", "boot.mjs"),       // running from backend/
    ];
    const entry = candidates.find((p) => fs.existsSync(p));
    if (!entry) {
        throw new Error("owned-engine boot.mjs not found. Looked in:\n  " + candidates.join("\n  "));
    }
    const importESM = new Function("url", "return import(url)");
    return importESM(pathToFileURL(entry).href);
}
async function startOwnedEngine() {
    console.log("[owned-engine] USE_OWNED_ENGINE=1 — booting the owned engine");
    try {
        const { boot } = await loadOwnedEngineBoot();
        await boot(Number(port));
        await syncOtcClock();
    }
    catch (error) {
        console.error("[owned-engine] Failed to start:", error);
        process.exit(1);
    }
}
if (process.env.USE_OWNED_ENGINE === "1") {
    startOwnedEngine();
}
else {
    startVendorEngine();
}
