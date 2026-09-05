#!/usr/bin/env node
/**
 * `next build`, with a heap ceiling the machine can actually honour — and an
 * explanation when it cannot.
 *
 * WHY THIS EXISTS
 *
 * The build ran as `NODE_OPTIONS=--max-old-space-size=8192 next build`. That
 * number is a promise to V8 that it may grow to 8 GB, and V8 believes it: it
 * will not collect aggressively, and it will not raise its own heap-limit error,
 * until it gets there. On a machine with less RAM than that the process never
 * gets to 8 GB — the kernel's OOM killer terminates it first.
 *
 * A SIGKILL produces no stderr. So the deploy log read:
 *
 *     Creating an optimized production build ...
 *     [ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] frontend@ build: `next build`
 *     Exit status 1
 *
 * — a failed build with no error, which is unfixable by reading it. The same
 * commit built in 11 seconds on a laptop.
 *
 * WHAT THIS DOES
 *
 * Two things, both small:
 *
 * 1. Caps the heap at a fraction of physical RAM rather than a constant. Below
 *    the machine's size, V8 collects harder and the build usually just finishes;
 *    if it genuinely needs more, V8 raises "JavaScript heap out of memory" and
 *    prints a stack, which is a bug report rather than a mystery. The fraction
 *    is well under 1 because Turbopack is Rust and allocates outside the V8
 *    heap entirely, as do the worker processes Next forks per CPU.
 *
 * 2. Reports the signal when the kernel kills it anyway, naming the cause. A
 *    deploy that fails should say why.
 *
 * It never raises the ceiling above what the build script asked for — on a big
 * machine this changes nothing at all.
 */

const os = require("os");
const { spawnSync } = require("child_process");

const REQUESTED_MB = Number(process.env.BIDEX_BUILD_HEAP_MB) || 8192;

/** Share of usable memory V8's old space may claim. The rest is Turbopack, the workers and the OS. */
const HEAP_SHARE = 0.6;
const FLOOR_MB = 1024;

/**
 * What the machine can actually give, not what it owns.
 *
 * The first version of this sized from os.totalmem(), which on a dedicated box
 * is the same thing and on a shared one is a fiction. The deploy host has 8 GB
 * and runs a second Next site, a Python API, MySQL and a mail stack — about
 * 3.5 GB was free when the build started, so a cap computed from the total
 * still promised V8 more than existed and it was OOM-killed anyway.
 *
 * MemAvailable is the kernel's own estimate of what a new process can have
 * without swapping, and free swap is the overflow the build may legitimately
 * spill into for a few minutes. Both, or nothing on a platform that reports
 * neither.
 */
function usableMemoryMB() {
  const totalMB = Math.floor(os.totalmem() / (1024 * 1024));
  try {
    const meminfo = require("fs").readFileSync("/proc/meminfo", "utf8");
    const kB = (key) => {
      const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+) kB`, "m"));
      return m ? Math.floor(Number(m[1]) / 1024) : null;
    };
    const available = kB("MemAvailable");
    const swapFree = kB("SwapFree") ?? 0;
    if (available !== null) {
      return { totalMB, usableMB: available + swapFree, available, swapFree };
    }
  } catch {
    /* not Linux, or /proc is not mounted — fall through to the total */
  }
  return { totalMB, usableMB: totalMB, available: null, swapFree: null };
}

const { totalMB, usableMB, available, swapFree } = usableMemoryMB();
const budgetMB = Math.max(
  FLOOR_MB,
  Math.min(REQUESTED_MB, Math.floor(usableMB * HEAP_SHARE))
);

if (available !== null) {
  console.log(
    `[build] memory: ${totalMB} MB total, ${available} MB available, ${swapFree} MB free swap.`
  );
  /* Thin headroom is worth saying out loud before the build rather than after
     it disappears — this box has been OOM-killed here three times. */
  if (available + swapFree < 4096) {
    console.warn(
      `[build] WARNING: only ${available + swapFree} MB of usable memory. ` +
        `This build has needed roughly 3.5 GB. Free some memory or add swap.`
    );
  }
}

if (budgetMB < REQUESTED_MB) {
  console.log(
    `[build] capping the V8 heap at ${budgetMB} MB instead of the requested ${REQUESTED_MB} MB.`
  );
}

const nodeOptions = [process.env.NODE_OPTIONS, `--max-old-space-size=${budgetMB}`]
  .filter(Boolean)
  .join(" ");

let nextBin;
try {
  // Resolved from the working directory: in this workspace `next` lives in
  // frontend/node_modules, not beside this script.
  nextBin = require.resolve("next/dist/bin/next", { paths: [process.cwd()] });
} catch {
  console.error("[build] Could not find `next`. Run this from the frontend package.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

if (result.error) {
  console.error(`[build] Could not start next build: ${result.error.message}`);
  process.exit(1);
}

/* The case this file was written for. Without this the log ends mid-sentence. */
if (result.signal) {
  console.error("");
  console.error(`[build] next build was killed by ${result.signal} — it did not fail, it was stopped.`);
  if (result.signal === "SIGKILL") {
    console.error(
      `[build] On Linux that is almost always the OOM killer. This machine reports ` +
        `${totalMB} MB of RAM and the build was given a ${budgetMB} MB heap on top of ` +
        `Turbopack's own allocations.`
    );
    console.error("[build] Confirm with:  dmesg -T | grep -i -E 'killed process|out of memory'");
    console.error("[build] Then add swap, or build on a larger machine, or lower BIDEX_BUILD_HEAP_MB.");
  }
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
