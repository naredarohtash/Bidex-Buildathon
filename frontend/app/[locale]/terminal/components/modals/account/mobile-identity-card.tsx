"use client";

/**
 * Who you are, on a phone, in one card.
 *
 * `IdentityHeader` is built for a wide panel: avatar, name, email, a row of
 * status chips and a completion banner, all across the top. On a 390px screen
 * that stack cost roughly a third of the viewport before a single destination
 * was visible, and the account ID — a raw UUID nobody reads — took a full row
 * of it. (The ID is not lost: it is a copyable row inside Personal, which is
 * where support asks for it.)
 *
 * Here it is a card: the person, and the one thing they can act on next.
 */

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const MobileIdentityCard = memo(function MobileIdentityCard({
  name,
  email,
  avatar,
  completion,
  nextStepLabel,
  onNextStep,
}: {
  name: string;
  email: string;
  avatar?: string;
  /** 0–100. */
  completion: number;
  /** e.g. "two-factor" — omitted once nothing is outstanding. */
  nextStepLabel?: string;
  onNextStep?: () => void;
}) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border border-border">
            {avatar ? <AvatarImage src={avatar} alt="" /> : null}
            <AvatarFallback className="text-[15px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight text-foreground">
              {name}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{email}</p>
          </div>
        </div>

        {/* Only while there is something to finish. A progress bar at 100% is a
            row of chrome that tells you nothing. */}
        {nextStepLabel && (
          <button
            type="button"
            onClick={onNextStep}
            className="mt-4 flex w-full items-center gap-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-left transition-colors active:bg-amber-500/20"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-amber-700 dark:text-amber-300">
                Finish setting up
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-amber-700/80 dark:text-amber-300/70">
                Next: {nextStepLabel}
              </span>
              <span
                className="mt-2 block h-1 overflow-hidden rounded-full bg-amber-500/20"
                role="progressbar"
                aria-valuenow={completion}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="block h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, completion))}%` }}
                />
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          </button>
        )}
      </div>
    </div>
  );
});

export default MobileIdentityCard;
