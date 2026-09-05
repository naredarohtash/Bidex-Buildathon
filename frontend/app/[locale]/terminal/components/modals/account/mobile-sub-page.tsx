"use client";

/**
 * One destination, filling the screen, with the way back at the top left.
 *
 * The title bar is `sticky` rather than a flex sibling on purpose: the panels
 * differ in how they scroll — Personal owns its own scroller so it can anchor a
 * save bar, the rest are plain content — and a sticky bar works over both
 * without the caller having to know which it is dealing with.
 */

import { memo } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const MobileSubPage = memo(function MobileSubPage({
  title,
  onBack,
  children,
  /** True when the child manages its own scrolling (and its own save bar). */
  childScrolls = false,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  childScrolls?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to account"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground active:bg-muted"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h2 className="truncate text-[17px] font-semibold text-foreground">{title}</h2>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1",
          /* Two scrollers nested inside each other is what pushed Personal's
             anchored save bar down over the content it was meant to sit below —
             "Identity" was being cut in half by it. When the child scrolls,
             this must not. */
          childScrolls ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
        )}
      >
        {children}
      </div>
    </div>
  );
});

export default MobileSubPage;
