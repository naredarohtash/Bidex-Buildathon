/**
 * Compatibility layer — lets the owned engine run the REAL compiled business
 * handlers (backend/dist/src/api/**) by resolving the `@b/*` and `@db/*` module
 * aliases those handlers import, exactly as the production app does.
 *
 * This is what makes the ownership approach incremental and safe: our own
 * pipeline (routing, auth, permissions, rate limits — the security gate) runs in
 * FRONT of your existing, unchanged business logic. The gate is owned; the
 * feature code is reused as-is, then can be cleaned up over time.
 *
 * Call setupCompat() AFTER setting DB env vars and BEFORE loading any handler.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // backend/owned-engine/lib
const BACKEND = path.resolve(HERE, "..", ".."); // backend/
const DEFAULT_DIST_SRC = path.join(BACKEND, "dist", "src");
const DEFAULT_DIST_MODELS = path.join(BACKEND, "dist", "models");

export function setupCompat({ distSrc = DEFAULT_DIST_SRC, distModels = DEFAULT_DIST_MODELS } = {}) {
  const require = createRequire(import.meta.url);
  const moduleAlias = require("module-alias");
  moduleAlias.addAliases({ "@b": distSrc, "@db": distModels });

  // Loading @b/db initialises the real Sequelize models against the configured
  // database (DB_* env vars). Point those at a dev/staging copy, never prod.
  const db = require("@b/db");
  const models = db.models || db.default?.models || {};

  return {
    models,
    require,
    /**
     * Load a real compiled handler by its path relative to dist/src, e.g.
     * "api/user/preferences/index.get". Returns the module: { metadata, default }.
     */
    loadHandler(relPath) {
      return require("@b/" + relPath.replace(/\.js$/, ""));
    },
  };
}
