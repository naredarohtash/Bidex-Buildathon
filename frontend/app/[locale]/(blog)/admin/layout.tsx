import type { ReactNode } from "react";
import { TranslationProvider } from "next-intl";
import { loadAllNamespaces } from "next-intl/server";
import AdminShell from "./admin-shell";

/**
 * Restores the admin dictionaries for the blog admin section.
 *
 * The root layout withholds them — they are serialised into every response and
 * are dead weight on pages that never show an admin screen. The chrome that used
 * to live in this file is a client component and so cannot load messages itself;
 * it now sits in admin-shell.tsx and is wrapped here.
 *
 * The full set is passed rather than only the admin part: a nested provider
 * replaces its parent's messages for the subtree rather than merging with them.
 */
export default async function BlogAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await loadAllNamespaces(locale);

  return (
    <TranslationProvider locale={locale} messages={messages}>
      <AdminShell>{children}</AdminShell>
    </TranslationProvider>
  );
}
