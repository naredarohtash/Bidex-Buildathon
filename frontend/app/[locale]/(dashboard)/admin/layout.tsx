import type { ReactNode } from "react";
import { TranslationProvider } from "next-intl";
import { loadAllNamespaces } from "next-intl/server";

/**
 * Restores the admin dictionaries for this section.
 *
 * The root layout deliberately withholds them, because message sets are
 * serialised into the HTML of every response and the admin ones are a little
 * over half the total — dead weight on every trader's page load. Here they are
 * wanted, and the people paying for them are the ones using them.
 *
 * The full set is passed rather than only the admin part: a nested provider
 * replaces its parent's messages for the subtree rather than merging with them,
 * so handing it only the admin dictionaries would strip `common` and every other
 * namespace out from under these pages.
 */
export default async function AdminTranslationsLayout({
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
      {children}
    </TranslationProvider>
  );
}
