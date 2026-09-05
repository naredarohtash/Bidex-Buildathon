"use client";

/**
 * The vertical step rail.
 *
 * Replaces a one-screen-at-a-time wizard. That form showed only the current
 * question, so a trader could not see how many steps were left, could not check
 * what they had already picked without going back, and lost that context
 * entirely once they moved on — which matters most on the step where they are
 * about to send real money and want to confirm the network they chose two
 * screens ago.
 *
 * Everything is visible at once instead: finished steps collapse to a one-line
 * summary that can be clicked to reopen, the current step is expanded, and
 * steps not yet reachable are dimmed. The connecting line fills in behind
 * progress, so how far along you are is legible without reading anything.
 */

import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RailStep {
  id: string;
  title: string;
  /** Shown collapsed, once the step is done — what was chosen. */
  summary?: string | null;
  /**
   * The mark for what was chosen — the coin, the chain badge, the UPI logo.
   *
   * Carried beside the summary on finished steps so the choices stay legible at
   * a glance while paying. "USDT · Tron" in grey text is something you have to
   * stop and read; the Tether mark with a Tron badge on it is recognised
   * without reading, which is what someone checks against just before sending
   * money they cannot get back.
   */
  icon?: ReactNode;
  /** Rendered only while this step is the active one. */
  content: ReactNode;
}

export function StepRail({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: RailStep[];
  activeIndex: number;
  /** Reopen a completed step. Omitted for steps that cannot be revisited. */
  onSelect?: (index: number) => void;
}) {
  /* An explicit way back.
     Completed steps were clickable, but a title that happens to be a button is
     not an affordance anyone finds — it was reported as "there is no back
     button", which is the correct reading of a screen that shows none. */
  const back =
    activeIndex > 0 && onSelect ? (
      <button
        type="button"
        onClick={() => onSelect(activeIndex - 1)}
        className="-ml-1 mb-3 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>
    ) : null;
  return (
    <>
      {back}
      <ol className="relative">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        const reachable = done && Boolean(onSelect);
        const last = i === steps.length - 1;

        return (
          <li key={step.id} className="relative flex gap-3.5 pb-1">
            {/* Marker and the line beneath it. The line is drawn by the step
                above so it terminates cleanly at the last marker rather than
                trailing into empty space. */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-background text-primary ring-4 ring-primary/10",
                  !done && !active && "border-border bg-background text-muted-foreground/60"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {!last && (
                <span
                  className={cn(
                    "w-px flex-1 transition-colors",
                    done ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-6")}>
              <div className="flex min-h-7 items-center">
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(i)}
                    className="group flex min-w-0 items-center gap-2 text-left"
                  >
                    <span className="shrink-0 text-[13px] font-semibold text-foreground group-hover:underline">
                      {step.title}
                    </span>
                    {step.icon}
                    {step.summary && (
                      <span className="truncate text-[12px] text-muted-foreground">
                        {step.summary}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 text-[13px] font-semibold",
                        active ? "text-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      {step.title}
                    </span>
                    {!active && step.icon}
                    {step.summary && !active && (
                      <span className="truncate text-[12px] text-muted-foreground">
                        {step.summary}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {active && <div className="mt-3">{step.content}</div>}
            </div>
          </li>
        );
      })}
      </ol>
    </>
  );
}

export default StepRail;
