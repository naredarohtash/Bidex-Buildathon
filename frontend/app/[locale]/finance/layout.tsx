"use client";

import type { ReactNode } from "react";
import SiteHeader from "@/components/partials/header/site-header";
import Footer from "@/components/partials/footer";

/* Only what exists. Wallets, Transfer and History were removed along with the
   pages behind them, but stayed in this nav — three tabs out of five led
   nowhere, which reads as a broken site rather than a deliberate one. */
const financeMenu = [
  {
    key: "deposit",
    title: "Deposit",
    href: "/finance/deposit",
    icon: "lucide:arrow-down-to-line",
  },
  {
    key: "withdraw",
    title: "Withdraw",
    href: "/finance/withdraw",
    icon: "lucide:arrow-up-from-line",
  },
];

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Consistent top nav */}
      <SiteHeader menu={financeMenu} />
      <div className="container mx-auto px-4 pt-24 pb-18 min-h-[calc(100vh-56px)]">
        {/* Main content below header */}
        <main>{children}</main>
      </div>
      <Footer />
    </div>
  );
}
