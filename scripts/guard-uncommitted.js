#!/usr/bin/env node
/**
 * Bidex boot guard — refuses to start the server while work is uncommitted.
 *
 * WHY THIS EXISTS
 * ---------------
 * In this repo the working tree is restored on server restart, so git is the only
 * durable storage. The recurring way work is lost is not malice or a bad merge —
 * it is the ordinary edit -> restart-to-test loop:
 *
 *     agent edits files  ->  restarts the server to test  ->  tree is restored
 *                                                         ->  edits are gone
 *
 * Restart is treated as a test step, but here it is the destruction step. Written
 * rules only help an agent that follows rules; this makes the failure mechanically
 * impossible instead of merely discouraged — the server will not boot until the
 * work is committed.
 *
 * For the chart engine it is worse than "not saved": frontend/next.config.js runs
 * `git checkout HEAD -- chart-engine/dist/index.js` on every frontend boot when the
 * BIDEX_CHART_PATCHED sentinel is missing, which actively overwrites uncommitted
 * edits. That case is called out separately below.
 *
 * USAGE
 * -----
 *   node scripts/guard-uncommitted.js            # block (dev paths)
 *   node scripts/guard-uncommitted.js --warn     # warn only (production start)
 *
 * Production start only warns on purpose: refusing to boot prod during an outage
 * is a worse failure than a lost edit.
 *
 * ESCAPE HATCH
 * ------------
 *   BIDEX_ALLOW_DIRTY=1 pnpm dev
 *
 * Deliberate, visible, and per-invocation — so skipping the guard is a decision
 * someone made, not something that quietly stopped working.
 */

const { execSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const WARN_ONLY = process.argv.includes("--warn");
const CHART_REL = "frontend/components/(ext)/chart-engine/dist/index.js";
const CHART_SENTINEL = "BIDEX_CHART_PATCHED";

const C = process.stdout.isTTY
  ? {
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
    }
  : { red: (s) => s, yellow: (s) => s, green: (s) => s, dim: (s) => s, bold: (s) => s };

const gitRaw = (cmd) =>
  execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const git = (cmd) => gitRaw(cmd).trim();
/**
 * Porcelain lines are "XY PATH" — the status column is two characters wide and an
 * unstaged-only change leaves the first one BLANK (" M frontend/..."). Trimming the
 * whole output would strip that leading space on the first line only, shifting it by
 * one and printing "rontend/..." for the first file. Trailing whitespace only.
 */
const gitStatusLines = () => gitRaw("status --porcelain=v1").replace(/\s+$/, "");

function main() {
  // Never let the guard itself be what stops the server booting. If anything about
  // the environment is unexpected (no git, no repo, git errored), step aside.
  let status, branch;
  try {
    git("rev-parse --is-inside-work-tree");
    status = gitStatusLines();
    branch = git("rev-parse --abbrev-ref HEAD");
  } catch {
    return 0;
  }

  if (process.env.BIDEX_ALLOW_DIRTY === "1") {
    if (status) {
      console.log(
        C.yellow("\n[BOOT-GUARD] BIDEX_ALLOW_DIRTY=1 — starting with uncommitted work.")
      );
      console.log(
        C.yellow("[BOOT-GUARD] These changes will NOT survive a restart of this server:\n")
      );
      for (const f of parse(status).all) console.log("             " + f.path);
      console.log("");
    }
    return 0;
  }

  const { modified, untracked, all } = parse(status);

  // A non-main branch is its own way to lose work — the running server uses main,
  // and the chart guard restores from main's HEAD. Worth saying even when clean.
  if (branch !== "main" && branch !== "HEAD") {
    console.log(
      C.yellow(`\n[BOOT-GUARD] You are on branch '${branch}', not 'main'.`) +
        C.dim("\n             The running server uses main; work committed here may not survive.\n")
    );
  }

  if (all.length === 0) {
    console.log(C.green("[BOOT-GUARD] Working tree clean — safe to restart."));
    return 0;
  }

  // Maximum-danger case: the chart engine is edited AND has lost its sentinel, so
  // the next frontend boot will hard-restore it from HEAD and destroy the edits.
  let chartDoomed = false;
  if (all.some((f) => f.path === CHART_REL)) {
    try {
      const content = require("fs").readFileSync(path.join(REPO_ROOT, CHART_REL), "utf8");
      chartDoomed = !content.includes(CHART_SENTINEL);
    } catch {
      /* unreadable — leave the generic warning to do its job */
    }
  }

  const line = "─".repeat(74);
  console.log("");
  console.log(C.red(line));
  console.log(
    C.red(C.bold(WARN_ONLY ? "⚠️  UNCOMMITTED WORK — IT WILL NOT SURVIVE THIS RESTART" : "✋ BOOT BLOCKED — YOU HAVE UNCOMMITTED WORK"))
  );
  console.log(C.red(line));
  console.log("");
  console.log("  In this repo the working tree is restored on restart.");
  console.log("  " + C.bold("Restarting now destroys everything listed below.") + "\n");

  if (modified.length) {
    console.log(C.yellow(`  Modified, not committed (${modified.length}):`));
    for (const f of modified) console.log("    " + f.path);
    console.log("");
  }
  if (untracked.length) {
    console.log(C.yellow(`  New files, never committed (${untracked.length}) — these are lost too:`));
    for (const f of untracked) console.log("    " + f.path);
    console.log("");
  }

  if (chartDoomed) {
    console.log(C.red("  ⚠️  " + CHART_REL));
    console.log(
      C.red("      is edited AND missing its " + CHART_SENTINEL + " sentinel.")
    );
    console.log(
      C.red("      next.config.js will run `git checkout HEAD --` on it at boot and")
    );
    console.log(C.red("      OVERWRITE your edits. Restore or re-apply before starting.\n"));
  }

  console.log("  Commit it first:\n");
  console.log(C.green("    git add <your files>"));
  console.log(C.green('    git commit -m "..."'));
  console.log(C.dim("\n    (stage by name — a blind `git add -A` has committed a reverted"));
  console.log(C.dim("     chart engine here before and erased it from history)\n"));

  if (WARN_ONLY) {
    console.log(C.dim("  Continuing anyway — this is the production start path.\n"));
    console.log(C.red(line) + "\n");
    return 0;
  }

  console.log("  If you truly meant to start without committing:\n");
  console.log(C.dim("    BIDEX_ALLOW_DIRTY=1 pnpm dev\n"));
  console.log(C.red(line) + "\n");
  return 1;
}

/** Parse `git status --porcelain=v1` into modified vs never-committed files. */
function parse(status) {
  const modified = [];
  const untracked = [];
  for (const raw of status.split("\n")) {
    if (!raw.trim()) continue;
    // Anchored parse rather than slice arithmetic, so a malformed line is skipped
    // instead of silently producing a truncated path.
    const m = /^(..) (.+)$/.exec(raw);
    if (!m) continue;
    const code = m[1];
    let file = m[2];
    // Renames/copies render as "old -> new"; report the destination.
    const arrow = file.indexOf(" -> ");
    if (arrow !== -1) file = file.slice(arrow + 4);
    file = file.replace(/^"|"$/g, "");
    (code === "??" ? untracked : modified).push({ code, path: file });
  }
  return { modified, untracked, all: [...modified, ...untracked] };
}

process.exit(main());
