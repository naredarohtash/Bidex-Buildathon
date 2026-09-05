"use client";

/**
 * What someone sees once the decision is made.
 *
 * Three outcomes, one shape: a drawing, a sentence, the specifics, and the one
 * thing to do next.
 *
 * ── The drawings ───────────────────────────────────────────────────────────
 *
 * All three are `IdentityIllustration` — the same ID card the verification
 * form opens with — at a different moment in its life. That is the whole
 * point: the screen that asks for your document and the three screens that
 * report on it are one object, not four pictures that happen to be about
 * identity.
 *
 * They used to be their own drawing, and twice over. First a stack of
 * translucent rectangles with a flat #10b981 or #ef4444 disc dropped on the
 * corner — two hex colours past the theme, and the house style of every
 * generated empty-state on the internet. Then a line-art card with two faint
 * rings, which matched the form's mark at the time and stopped matching it the
 * moment that mark was replaced. A second implementation of a shared drawing
 * will always drift from the first; there is only one now, and it takes a
 * `state`.
 *
 * Approved stamps the seal on and keeps it. Review runs the scanner and never
 * stops, because a person has not. Refused dims the card and strikes it
 * through. See `kyc/ui` for how each is drawn.
 */

import { memo } from "react";
import { IdentityIllustration } from "./ui";
import { AlertCircle, ArrowRight, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Approved: the card is stamped, and the stamp stays. */
export const ApprovedArt = memo(function ApprovedArt() {
  return <IdentityIllustration height={128} state="approved" />;
});

/** In review: the scanner is still running, because a person still is. */
export const ReviewArt = memo(function ReviewArt() {
  return <IdentityIllustration height={128} state="review" />;
});

/** Refused: the card is struck through. */
export const RejectedArt = memo(function RejectedArt() {
  return <IdentityIllustration height={128} state="rejected" />;
});

/** One thing the reviewer wants changed. */
export const ReasonCard = memo(function ReasonCard({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3.5 text-left">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
        {title}
      </p>
      <p className="mt-1.5 pl-6 text-[13px] leading-[19px] text-muted-foreground">{detail}</p>
    </div>
  );
});

export const HelpCard = memo(function HelpCard({ email }: { email: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-left">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <LifeBuoy className="h-4 w-4 shrink-0" />
        Need help?
      </p>
      <p className="mt-1.5 pl-6 text-[13px] leading-[19px] text-muted-foreground">
        Write to{" "}
        <a href={`mailto:${email}`} className="text-foreground underline underline-offset-2">
          {email}
        </a>{" "}
        and quote your account ID. A person will answer.
      </p>
    </div>
  );
});

export const ResultAction = memo(function ResultAction({
  children,
  onClick,
  variant = "primary",
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "quiet";
  /** Leads the label, where the primary's arrow follows it — an arrow says
      "onwards", a mark in front of the words says what the button does. */
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        /* `whitespace-nowrap`: two of these side by side on a 370px card broke
           "Resubmit documents" over two lines and left the arrow orbiting the
           second one. A label that wraps inside a button is a label that
           needed a wider button or a shorter word — never both halves of a
           sentence stacked on top of each other. */
        "flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[14px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        variant === "primary"
          ? "bg-brand text-brand-foreground hover:opacity-90 active:scale-[0.99]"
          : "border border-border bg-muted text-foreground hover:opacity-90"
      )}
    >
      {icon}
      {children}
      {variant === "primary" && <ArrowRight className="h-4 w-4" />}
    </button>
  );
});

/**
 * A reviewer's note into cards.
 *
 * They write one line, or several separated by newlines or semicolons, and each
 * is a separate thing to fix. Where the note names a known problem the card
 * gets a proper heading; otherwise the note is its own heading, because the
 * reviewer's words beat a category we guessed at.
 */
export function parseReasons(note?: string | null): { title: string; detail: string }[] {
  const raw = String(note || "").trim();
  if (!raw) {
    return [
      {
        title: "We could not confirm your identity",
        detail:
          "The reviewer did not leave a note. Send clear photos of both sides of your document and a photo of yourself, and we will look again.",
      },
    ];
  }

  const known: [RegExp, string][] = [
    [/blur|quality|unclear|dark|glare|readab/i, "Document quality"],
    [/match|mismatch|differ|name|address|number/i, "Details do not match"],
    [/expir/i, "Document expired"],
    [/back|both side|second side/i, "Missing side"],
    [/selfie|face|photo of you/i, "Photo of you"],
  ];

  return raw
    .split(/\n+|;\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const hit = known.find(([re]) => re.test(line));
      return hit ? { title: hit[1], detail: line } : { title: "What to change", detail: line };
    });
}
