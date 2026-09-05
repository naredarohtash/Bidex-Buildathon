"use client";

/**
 * The account section's root screen on a phone.
 *
 * The rail was one component for both shapes: a column on desktop (navigation
 * above, sign out pinned below it) that collapsed into a horizontal scroller on
 * mobile. That is the recurring fault in this codebase — a desktop shape
 * reaching a phone unchanged — and it produced exactly what you would expect:
 * five destinations in a strip too narrow to hold them, so the last was cut off
 * the right edge with nothing to say it was there, and "Sign out" promoted into
 * a full-width row directly under it.
 *
 * So the phone gets the shape phones use for this: grouped lists of
 * destinations, each carrying its own status, that you tap to push into.
 *
 * Desktop still renders `AccountRail` and is untouched.
 */

import { memo } from "react";
import { useParams } from "next/navigation";
import { ChevronRight, Check, LogOut, Loader2, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_TABS } from "./account-rail";
import { useAccountSignOut } from "./use-account-sign-out";

export type RowStatus = { label: string; tone: "ok" | "warn" | "neutral" };

/* A colour per destination, carried on a tinted tile rather than a bare glyph.
   Five identical grey icons down the left of a list are decoration — the eye
   skips them and reads the labels one by one. Distinct tiles make the list
   scannable, and they are how every app this wants to sit beside does it.
   Tints are /12 so they stay quiet in dark and legible in light. */
const TONES: Record<string, { tile: string; icon: string }> = {
  personal: { tile: "bg-blue-500/12", icon: "text-blue-600 dark:text-blue-400" },
  security: { tile: "bg-amber-500/12", icon: "text-amber-600 dark:text-amber-400" },
  kyc: { tile: "bg-verified/12", icon: "text-verified" },
  transactions: { tile: "bg-cyan-500/12", icon: "text-cyan-600 dark:text-cyan-400" },
};

/* Named groups rather than one list under a heading that repeats the screen's
   own title ("Account" inside Account). Each header now says something the
   rows beneath it have in common. */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Profile", ids: ["personal", "kyc"] },
  { title: "Security", ids: ["security"] },
  { title: "Activity", ids: ["transactions"] },
];

/* A word in the state's own colour, not a filled tablet.

   The tinted pill was the same mistake as the rail's: the state a row reports
   is nearly always ordinary — verified, on, pending — and a saturated block
   behind it made the quietest fact on the row the loudest thing on the screen.
   Border and text, at ink saturation. */
const PILL_TONE: Record<RowStatus["tone"], string> = {
  ok: "border-verified/35 text-verified",
  warn: "border-attention/35 text-attention",
  neutral: "border-border text-muted-foreground",
};

const StatusPill = memo(function StatusPill({ status }: { status: RowStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        PILL_TONE[status.tone]
      )}
    >
      {status.tone === "ok" && <Check className="h-3 w-3" />}
      {status.label}
    </span>
  );
});

export const MobileAccountNav = memo(function MobileAccountNav({
  onOpen,
  onSignedOut,
  status = {},
  header,
  guest,
}: {
  onOpen: (tab: string) => void;
  onSignedOut?: () => void;
  /* Present only while someone is in a demo session with no account. The list
     of destinations stays visible rather than being hidden — seeing what an
     account contains is the argument for making one — but each row asks for
     one, and the foot of the screen offers it instead of a way out. */
  guest?: { remaining: string; onCreate: () => void; onSignIn: () => void };
  /* Words, not a dot. A dot says "something here", which leaves the trader to
     open the screen to find out what — and the answer is usually "nothing you
     need". "Not set up" and "Verified" answer it from the list. */
  status?: Record<string, RowStatus | undefined>;
  /** The identity block, rendered by the caller so it stays one component. */
  header?: React.ReactNode;
}) {
  const { signOut, signingOut } = useAccountSignOut(onSignedOut);
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Title only. No close button: the section chrome already puts one in
          the top-right corner, and adding a second stacked three controls into
          the same 40px of screen — measured, they overlapped. */}
      <div className="flex shrink-0 items-center border-b border-border px-4 py-3">
        <h2 className="text-[17px] font-semibold text-foreground">Account</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {header}

        {GROUPS.map((group) => {
          const tabs = group.ids
            .map((id) => ACCOUNT_TABS.find((t) => t.id === id))
            .filter(Boolean) as typeof ACCOUNT_TABS;
          if (!tabs.length) return null;

          return (
            <div key={group.title} className="px-4 pt-5">
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>

              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {tabs.map((tab, i) => {
                  const Icon = tab.icon;
                  const tone = TONES[tab.id] ?? TONES.personal;
                  const rowStatus = status[tab.id];

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onOpen(tab.id)}
                      /* 60px minimum. The strip this replaces gave each
                         destination a 32px-high target on the primary axis of a
                         touch screen. */
                      className={cn(
                        "relative flex min-h-[60px] w-full items-center gap-3 px-3.5 text-left",
                        "transition-colors active:bg-muted"
                      )}
                    >
                      {/* Inset separator, starting where the text starts. A
                          full-bleed rule cuts the card into stripes; an inset
                          one reads as rows of a single object. */}
                      {i > 0 && (
                        <span className="pointer-events-none absolute left-[58px] right-0 top-0 h-px bg-border" />
                      )}

                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-[10px]",
                          tone.tile
                        )}
                      >
                        <Icon className={cn("h-[18px] w-[18px]", tone.icon)} />
                      </span>

                      <span className="min-w-0 flex-1 py-2.5">
                        <span className="block text-[15px] font-medium leading-tight text-foreground">
                          {tab.label}
                        </span>
                        <span className="mt-1 block truncate text-[13px] leading-snug text-muted-foreground">
                          {tab.description}
                        </span>
                      </span>

                      {rowStatus && <StatusPill status={rowStatus} />}

                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {guest ? (
          <div className="px-4 pt-6">
            <div className="rounded-2xl border border-verified/30 bg-verified/[0.07] p-4">
              <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Demo session · {guest.remaining} left
              </div>
              <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground">
                Keep your progress
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Your demo trades aren't saved. Create a free account to keep a
                history, trade live, and use the rest of the app.
              </p>
              <button
                type="button"
                onClick={guest.onCreate}
                className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-verified text-[15px] font-semibold text-white active:opacity-90"
              >
                <Sparkles className="h-4 w-4" />
                Create free account
              </button>
              <button
                type="button"
                onClick={guest.onSignIn}
                className="mt-2 flex min-h-[42px] w-full items-center justify-center rounded-xl border border-border bg-card text-[14px] font-medium text-foreground active:bg-muted"
              >
                Sign in
              </button>
            </div>
          </div>
        ) : (
        <div className="px-4 pt-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 px-4 text-[15px] font-medium text-red-600 transition-colors active:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
        )}

        {/* The foot of a settings screen. It closes the empty band the list left
            above the bottom bar with the two things that belong there, and both
            links are real pages in this app rather than decoration. */}
        <div className="px-4 pb-2 pt-7 text-center">
          <p className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <a href={`/${locale}/terms`} className="underline-offset-2 active:underline">
              Terms
            </a>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <a href={`/${locale}/privacy`} className="underline-offset-2 active:underline">
              Privacy
            </a>
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Bidex v6.3.9</p>
        </div>
      </div>
    </div>
  );
});

export default MobileAccountNav;
