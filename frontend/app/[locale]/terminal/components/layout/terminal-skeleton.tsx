"use client";

import Logo from "@/components/elements/logo";

/**
 * Full-shell loading state for the terminal.
 *
 * Every block here is positioned and sized from the real layout, so the
 * skeleton collapses into the live UI without anything shifting:
 *   header      h-[53px]   (desktop-layout.tsx)
 *   logo box    w-[46px]   (desktop-layout.tsx)
 *   asset tab   h-[42px] w-[131px] (header.tsx)
 *   left rail   w-[46px]   (desktop-layout.tsx)
 *   order panel w-[238px]  (desktop-layout.tsx)
 */

const Block = ({ className = "" }: { className?: string }) => (
  <div className={`rounded-md bg-foreground/[0.055] ${className}`} />
);

export default function TerminalSkeleton() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* Row 1 — logo, brand caption, asset tabs, account controls */}
      <div className="relative flex h-[53px] w-full shrink-0 items-center border-b border-border bg-card">
        <div className="flex h-[53px] w-[46px] shrink-0 items-center justify-center border-r border-border">
          <Logo type="icon" className="h-8 w-8 flex-shrink-0" />
        </div>

        <div className="flex min-w-0 flex-1 animate-pulse items-center gap-1.5 overflow-hidden px-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Block key={i} className="h-[42px] w-[131px] shrink-0 rounded-lg" />
          ))}
          <Block className="h-[42px] w-[42px] shrink-0 rounded-lg" />
        </div>

        <div className="ml-auto flex shrink-0 animate-pulse items-center gap-2 px-3">
          <Block className="hidden h-8 w-[125px] md:block" />
          <Block className="h-8 w-[84px]" />
          <Block className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Row 2 — rail, chart, order panel */}
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[46px] shrink-0 flex-col items-center justify-between border-r border-border bg-card pb-5 pt-4 md:flex">
          <div className="flex animate-pulse flex-col items-center gap-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Block key={i} className="h-5 w-5" />
            ))}
          </div>
          <div className="flex animate-pulse flex-col items-center gap-6">
            {[0, 1, 2].map((i) => (
              <Block key={i} className="h-5 w-5" />
            ))}
          </div>
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ backgroundColor: "var(--chart-bg)" }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(127,127,127,0.055) 0px, rgba(127,127,127,0.055) 1px, transparent 1px, transparent 9px)",
            }}
          />
        </div>

        <div
          className="hidden h-full w-[238px] shrink-0 flex-col gap-2 border-l border-border p-2 lg:flex"
          style={{ backgroundColor: "var(--chart-bg)" }}
        >
          <div className="animate-pulse space-y-2">
            {/* asset header */}
            <Block className="h-[53px] w-full rounded-lg" />
            {/* amount + expiry */}
            <div className="grid grid-cols-2 gap-2">
              <Block className="h-[99px] rounded-lg" />
              <Block className="h-[99px] rounded-lg" />
            </div>
            {/* invest / payout */}
            <Block className="h-[25px] w-full" />
            {/* call / put */}
            <Block className="h-[61px] w-full rounded-lg" />
            <Block className="h-[61px] w-full rounded-lg" />
          </div>
          {/* positions */}
          <div className="mt-1 flex min-h-0 flex-1 animate-pulse flex-col gap-2">
            <Block className="h-[32px] w-full rounded-lg" />
            <Block className="min-h-0 w-full flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
