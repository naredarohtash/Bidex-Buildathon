/**
 * Creating tables that do not exist yet.
 *
 * The owned engine loads the models but never synced them, so a model added to
 * the codebase had no table behind it until somebody noticed. That surfaced as
 * "Table 'bidex.bonus_code' doesn't exist" on a screen that had been deployed,
 * built and typechecked — nothing in the pipeline could have caught it, because
 * the code was correct and the database simply had not been told.
 *
 * Deliberately narrow: this CREATES missing tables and never touches existing
 * ones. The vendor's own sync runs `alter: true`, which on a live database will
 * happily rewrite a column type or drop what it no longer recognises, and a
 * schema migration is not something that should happen silently at boot on a
 * platform holding customer balances. A missing table is unambiguous — nothing
 * can be lost by creating it — so that is the only case handled here.
 *
 * Anything beyond adding a table (renamed columns, changed types, indexes on
 * existing tables) is a migration, and should be run deliberately.
 */

export async function ensureTables(compat) {
  const models = compat?.models;
  /* Taken from a model rather than from `compat`, which does not expose the
     Sequelize instance. Reading `compat.sequelize` gave undefined and this
     function returned quietly having done nothing — the same silent no-op it
     was written to prevent, which is why the failure below is now logged
     rather than swallowed. */
  const sequelize = Object.values(models || {}).find((m) => m?.sequelize)?.sequelize;

  if (!models || !sequelize) {
    console.error("[owned-engine] table check skipped: no Sequelize instance available");
    return { created: [], skipped: true };
  }

  let existing;
  try {
    /* One round trip for the whole list, rather than asking each model whether
       its table is there. On a schema this size that is the difference between
       one query at boot and a hundred. */
    const rows = await sequelize.getQueryInterface().showAllTables();
    existing = new Set(
      rows.map((r) => String(typeof r === "string" ? r : r?.tableName || "").toLowerCase())
    );
  } catch (err) {
    console.error(`[owned-engine] could not list tables: ${err.message}`);
    return { created: [], skipped: true };
  }

  const created = [];
  for (const model of Object.values(models)) {
    if (typeof model?.sync !== "function" || typeof model?.getTableName !== "function") continue;

    const raw = model.getTableName();
    const table = String(typeof raw === "string" ? raw : raw?.tableName || "");
    if (!table || existing.has(table.toLowerCase())) continue;

    try {
      // Default sync is CREATE TABLE IF NOT EXISTS — no alter, no drop.
      await model.sync();
      created.push(table);
    } catch (err) {
      /* One model failing must not stop the rest. A table that cannot be
         created is a real problem, but it is this feature's problem, and the
         platform should still start. */
      console.error(`[owned-engine] could not create table ${table}: ${err.message}`);
    }
  }

  if (created.length > 0) {
    console.log(`[owned-engine] created missing tables: ${created.join(", ")}`);
  }
  return { created, skipped: false };
}
