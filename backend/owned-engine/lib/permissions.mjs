/**
 * Permissions — check a route's required permission against a user's granted
 * permissions. The granted set comes from the user's role -> permissions, which
 * the pipeline supplies via an injected resolver (backed by the readable
 * models/access/** tables in the real system, or a mock in tests).
 */

/**
 * @param {string[]} granted   permission names the user holds
 * @param {string|null} required  the route's required permission (null = none)
 * @returns {boolean}
 */
export function hasPermission(granted, required) {
  if (!required) return true; // route needs no specific permission
  if (!Array.isArray(granted)) return false;
  if (granted.includes("*")) return true; // superadmin-style wildcard, if used
  return granted.includes(required);
}
