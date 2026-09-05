"use client";

/**
 * Page frame for a finance flow.
 *
 * The counterpart to FinanceModal: same flow inside, given a page instead of a
 * window. Both exist so the flows themselves stay unaware of where they are
 * being rendered — that is the property that lets one implementation serve the
 * terminal and the dashboard without a `variant` prop threaded through it.
 *
 * The card holding the flow is the same border/background as in the modal, so
 * the two do not read as different products.
 */

import type { ReactNode } from "react";

export function FinancePageShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </header>

      {/* The history sits beside the flow on a wide screen and below it on a
          narrow one — never squeezed alongside, which is what made the modal's
          version unreadable on a laptop. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
        {aside}
      </div>
    </div>
  );
}

export default FinancePageShell;
