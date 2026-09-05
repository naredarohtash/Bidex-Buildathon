/**
 * The sign-up page, behind the same session check as sign-in.
 *
 * See ../login/page.tsx for why this is a server check rather than an effect:
 * an effect has to paint the form before it can know whether to leave it.
 */

import { getUserProfile } from "@/lib/fetchers/user";
import { redirect } from "@/i18n/routing-server";
import RegisterClient from "./register-client";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const profile = await getUserProfile();
  if (profile) redirect("/terminal", locale);

  return <RegisterClient />;
}
