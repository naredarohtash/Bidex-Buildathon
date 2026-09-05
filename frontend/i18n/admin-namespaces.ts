/**
 * The admin dictionaries, and the two helpers that decide who receives them.
 *
 * Every page serialises its entire message set into the HTML, so whatever is
 * handed to the provider is downloaded and parsed by the browser before the
 * first paint. Loading the lot meant a trader watching a chart was paying for
 * ext_admin (171KB) and dashboard_admin (85KB) on every single request, for
 * screens they will never open.
 *
 * These two functions are deliberately kept together: the root layout strips
 * these namespaces, the admin layouts add them back, and if the two ever
 * disagreed about the list an admin screen would render raw keys. One source,
 * one regex, no drift.
 */

/** Matches `admin`, `dashboard_admin`, `blog_admin`, `ext_admin`, `ext_admin_p2p`, ... */
export const ADMIN_NAMESPACE = /^(admin|dashboard_admin|blog_admin|ext_admin(_[a-z0-9-]+)*)$/;

export type Messages = Record<string, unknown>;

/** Everything except the admin dictionaries — what the root layout provides. */
export function withoutAdminNamespaces(messages: Messages): Messages {
  const out: Messages = {};
  for (const key of Object.keys(messages)) {
    if (!ADMIN_NAMESPACE.test(key)) out[key] = messages[key];
  }
  return out;
}

/** Just the admin dictionaries — what an admin layout adds on top. */
export function onlyAdminNamespaces(messages: Messages): Messages {
  const out: Messages = {};
  for (const key of Object.keys(messages)) {
    if (ADMIN_NAMESPACE.test(key)) out[key] = messages[key];
  }
  return out;
}
