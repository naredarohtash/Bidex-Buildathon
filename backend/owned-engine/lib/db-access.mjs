/**
 * Database access — the real user & permission lookups the pipeline needs,
 * written against the actual schema (user / role / permission / role_permission,
 * from models/access/**).
 *
 * The SQL executor is injected as `query(sql, params) => rows`, so the exact
 * same adapter runs against production MySQL (via mysql2) or a throwaway SQLite
 * database in tests. Both use `?` placeholders, so the SQL is identical.
 *
 * Nothing here opens a connection by itself — a caller must hand in a `query`
 * bound to a specific database. That is deliberate: it makes it impossible for
 * this module to accidentally reach the live database on its own.
 */

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<any[]> }} deps
 */
export function createAccessAdapter({ query }) {
  return {
    /**
     * Load a user by id. Returns null for unknown users AND for accounts that
     * are not ACTIVE (BANNED / SUSPENDED / INACTIVE), so a disabled account is
     * never treated as logged in — matching the current login behaviour.
     */
    async loadUser(userId) {
      const rows = await query(
        "SELECT id, email, firstName, lastName, roleId, status FROM user WHERE id = ? LIMIT 1",
        [userId]
      );
      const user = rows[0];
      if (!user) return null;
      if (user.status && user.status !== "ACTIVE") return null;
      return user;
    },

    /**
     * Resolve the permission names granted to a user, via their role.
     * role_permission joins the user's roleId to permission rows.
     */
    async loadPermissions(user) {
      if (!user || user.roleId == null) return [];
      // Super Admin is granted all-access by role name, matching the vendor gate
      // (the app identifies super admins by role.name === "Super Admin", not by
      // explicit permission rows). "*" is treated as all-access by hasPermission.
      const roleRows = await query("SELECT name FROM role WHERE id = ? LIMIT 1", [user.roleId]);
      if (roleRows[0]?.name === "Super Admin") return ["*"];
      const rows = await query(
        `SELECT p.name AS name
           FROM role_permission rp
           JOIN permission p ON p.id = rp.permissionId
          WHERE rp.roleId = ?`,
        [user.roleId]
      );
      return rows.map((r) => r.name);
    },
  };
}

/**
 * Wrap a mysql2 pool into the `query` interface. FOR PRODUCTION USE — point it
 * at a staging or read-replica database first, never straight at live.
 *
 *   import mysql from "mysql2/promise";
 *   const pool = mysql.createPool({ ... });
 *   const query = createMysqlQuery(pool);
 */
export function createMysqlQuery(pool) {
  return async (sql, params = []) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  };
}

/** Wrap a node:sqlite DatabaseSync into the `query` interface (used in tests). */
export function createSqliteQuery(db) {
  return async (sql, params = []) => db.prepare(sql).all(...params);
}
