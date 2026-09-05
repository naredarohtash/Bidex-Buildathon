/**
 * The sign-in page, behind a session check.
 *
 * A signed-in user could open /login and be shown a sign-in form. Nothing
 * broke, but the page states something false about the reader — and the two
 * ways out of it, signing in again or "Back to site", both ask them to fix a
 * situation that was never theirs.
 *
 * Checked on the server, not in the client page, because a redirect fired from
 * an effect necessarily renders the form first: `user` is null until the
 * profile lands, so the guest layout paints, then vanishes. The cookie is
 * readable before anything is sent, so the answer is known before the first
 * byte and the form is never built.
 *
 * `?token=` is the exception. Email verification lands on this page, and a
 * reader can perfectly well be signed in on one device and verifying an address
 * from a link on another — bouncing them to the terminal would swallow the
 * verification they came to complete.
 */

import { getUserProfile } from "@/lib/fetchers/user";
import { redirect } from "@/i18n/routing-server";
import LoginClient from "./login-client";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  if (!query?.token) {
    const profile = await getUserProfile();
    if (profile) redirect("/terminal", locale);
  }

  return <LoginClient />;
}
