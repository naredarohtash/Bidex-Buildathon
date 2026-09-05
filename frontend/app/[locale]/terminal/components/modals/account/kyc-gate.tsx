"use client";

/**
 * The lock on Personal, until identity is verified.
 *
 * The page underneath stays exactly where it is — blurred, dimmed and inert —
 * with one card over it saying what has to happen first and one button that
 * goes and does it. Showing the page rather than replacing it is the whole
 * point: it tells somebody their details are there and waiting, not missing,
 * and it makes the lock read as a state of this page rather than as a
 * different page that loaded instead.
 *
 * ── Decisions worth keeping ────────────────────────────────────────────────
 *
 * **The blur is on the content, not on the scrim** — the opposite of what this
 * file did first, and of what EditDialog in profile-kit does over this same
 * page. `backdrop-filter` looked like the cheaper way round (one composited
 * pass over a subtree that never moves), and it renders wrong here: Chromium
 * left the bottom 25-40px of the panel completely unblurred, a crisp band of
 * rows sitting under a blurred page, because the content it is asked to sample
 * is clipped by an ancestor at exactly that edge. Oversizing the sampling
 * layer past the clip made the band bigger rather than smaller. `filter:
 * blur()` on the subtree itself has no sampling geometry to get wrong, and the
 * cost argument does not really apply to this case: the tree it blurs is inert
 * and static, so it rasterises once and is composited from then on.
 *
 * Verify this one by eye at the bottom edge of the panel, not by reading it —
 * the failure is invisible except in the last few rows on screen.
 *
 * **The page behind is `inert`, not merely covered.** A scrim stops the mouse
 * and nothing else: Tab still walks into the Edit buttons behind it, and a
 * screen reader still reads out a form that cannot be used. `inert` takes the
 * whole subtree out of focus order and out of the accessibility tree at once,
 * which is exactly what "this is not the thing being used" means.
 *
 * **There is no way to dismiss it.** Not an oversight — a dialog you can wave
 * away is a dialog that gets waved away, and the fields behind it are the ones
 * verification is about to fill in and lock. The way out is the rail (or, on a
 * phone, Back), both of which stay live because this sits inside the content
 * pane and not over the whole panel.
 *
 * **It says which state you are in, not just "verify".** Somebody whose
 * documents are already with a reviewer is not being asked for anything, and
 * telling them to "complete your KYC" when there is nothing to complete is how
 * the same application arrives three times. Three readings, three buttons, one
 * destination.
 *
 * Motion is framer-motion throughout, and has to be: `styles/theme.css` sets
 * `transition` on `*` for background, border and colour only, and that
 * shorthand resets `transition-property`, so every CSS transform in this app
 * is dead on arrival.
 */

import { memo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { BandWash, IdentityIllustration, PrimaryAction, VERIFY_ASSURANCES, VerifyAssurances } from "./kyc/ui";
import type { KycStage } from "./kyc-state";

/**
 * What the card says, per state.
 *
 * `chip` is the same word every time, because it describes this page and this
 * page is shut in all three cases. What changes is its colour: the attention
 * hue when the next move is the account holder's, plain grey when it is ours
 * — the same distinction the rail badge draws, so the row and the card cannot
 * disagree about whose turn it is. Wording it per state ("With us", "Needs
 * you") put the state in two places at once and left a padlock captioned with
 * something that is not about the lock. `assurances` appears only where it is an answer:
 * "2 minutes" reassures somebody about to start and means nothing at all to
 * somebody who finished yesterday and is waiting.
 */
const COPY: Record<
  Exclude<KycStage, "approved">,
  {
    chip: string;
    chipTone: "warn" | "muted";
    title: string;
    body: string;
    action: string;
    foot: string;
    assurances: boolean;
  }
> = {
  "not-started": {
    chip: "Locked",
    chipTone: "warn",
    title: "Verify your identity first",
    body: "This page unlocks once we know who you are. It takes about two minutes, and you only do it once.",
    action: "Verify my identity",
    foot: "You can keep trading and depositing meanwhile.",
    assurances: true,
  },
  "action-needed": {
    chip: "Locked",
    chipTone: "warn",
    title: "Something needs fixing",
    body: "We could not approve your application as it stands. The KYC page shows what to change, and this page unlocks once it is sorted.",
    action: "See what to fix",
    foot: "You can keep trading and depositing meanwhile.",
    assurances: false,
  },
  "in-review": {
    chip: "Locked",
    chipTone: "muted",
    title: "We are checking your documents",
    body: "Nothing to do right now. Most checks are done in 10–15 minutes, and can take up to 24–48 hours. This page unlocks as soon as yours is approved.",
    action: "See verification status",
    foot: "We will email you as soon as there is a decision.",
    assurances: false,
  },
};

/**
 * The gate. Renders its children untouched once the account is verified, so a
 * verified account pays nothing for this file existing.
 */
export const KycGate = memo(function KycGate({
  stage,
  onGoToKyc,
  children,
}: {
  stage: KycStage;
  onGoToKyc: () => void;
  children: React.ReactNode;
}) {
  if (stage === "approved") return <>{children}</>;

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {/* Still rendered, so the lock reads as this page held back rather than
          as somewhere else entirely — and out of reach in every sense: no
          pointer, no caret, no tab stop, no screen reader.

          It clips its own overflow rather than leaning on the wrapper's: the
          blur filter makes this a containing block, and a tall profile spilling
          out of a filtered box is the one thing that would reach past the
          lock. */}
      <div inert className="pointer-events-none h-full select-none overflow-hidden blur-[7px]">
        {children}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="absolute inset-0 z-10"
      >
        {/* The dim, on its own layer rather than on the scroller, so a card
            taller than the panel scrolls over a wash that stays put. It is a
            flat fill and nothing more — the blur belongs to the content above,
            for the reason at the top of this file. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background/55"
        />

        {/* Scrolls, in case a short viewport meets a tall card — a locked page
            whose only button is below the fold is a locked page. */}
        <div className="relative h-full overflow-y-auto">
          <div className="grid min-h-full place-items-center px-5 py-8 md:px-8">
            <GateCard stage={stage} onGoToKyc={onGoToKyc} />
          </div>
        </div>
      </motion.div>
    </div>
  );
});

const GateCard = memo(function GateCard({
  stage,
  onGoToKyc,
}: {
  stage: KycStage;
  onGoToKyc: () => void;
}) {
  const copy = COPY[stage as Exclude<KycStage, "approved">];
  const [pressReady, setPressReady] = useState(false);

  return (
    <motion.section
      role="dialog"
      aria-modal="false"
      aria-labelledby="kyc-gate-title"
      /* It arrives, rather than being there. This card usually appears the
         instant Personal is opened, and something that is simply present at
         frame one reads as a page that failed to load the rest — the same
         reason the result screens in kyc-panel animate in.

         That entrance is the only motion on the card now. It used to lean
         toward the cursor on a spring and carry a light that tracked the
         pointer across it; both were removed on the report that the whole
         card moves and glares when you pass over it. Nothing here is a
         control, so nothing here should answer a hover — the button does,
         and it is the only thing on the card you can press. */
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "relative isolate w-full max-w-[420px] overflow-hidden rounded-xl border border-border bg-card",
        "text-center shadow-2xl"
      )}
    >
      {/* The wash the verification screen opens with, so the locked page and
          the page that unlocks it are visibly the same errand — the same
          drawing over the same gradient and the same grid, for the reasons set
          out over BandWash and IdentityIllustration in kyc/ui.

          It runs the height of the card rather than banding the top of it.
          Banding is right on the verification screen, where a header sits over
          a form and the split is the boundary between what you read and what
          you fill in. There is no form here — the card is one paragraph and one
          button — so the same `bg-muted` strip fenced off five sixths of the
          card and left the button on a separate darker plate below it. In dark
          theme those two tokens are 8% and 15.9% lightness with a further 5%
          wash on the lighter one, which is not a hint of depth; it is two
          panels. One ground, and the gradient fading out down the card, gives
          the top the same lift without a seam across the middle.

          Centred where the form's header is not: this is a dialog, read once in
          a glance, and centring the copy around its own drawing is what makes
          it read as a card rather than as the first row of a form. */}
      <BandWash id="kyc-gate-grid" />

      <div className="px-6 pt-5">
        <IdentityIllustration height={146} />

        <div className="mt-3 flex justify-center">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              "text-[11px] font-medium leading-[15px]",
              /* Outline only. The fill was `bg-card/50` against the band's
                 lighter grey; on the card's own ground it would be a patch of
                 the same colour it sits on, so the border does the work. */
              copy.chipTone === "warn"
                ? "border-attention/40 text-attention"
                : "border-border text-muted-foreground"
            )}
          >
            <Lock className="h-3 w-3 shrink-0" strokeWidth={2} />
            {copy.chip}
          </span>
        </div>

        <h2
          id="kyc-gate-title"
          className="mt-2.5 text-[20px] font-semibold leading-[26px] tracking-[-0.015em] text-foreground"
        >
          {copy.title}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[36ch] text-[12.5px] leading-[18px] text-muted-foreground">
          {copy.body}
        </p>

        {copy.assurances && (
          <div className="mt-4">
            <VerifyAssurances items={VERIFY_ASSURANCES} />
          </div>
        )}
      </div>

      {/* The one filled thing on the card, and the only way off this screen.
          It is set apart by the space above it rather than by a ground of its
          own — a filled blue button on a quiet card does not need a plate under
          it to be found. `PrimaryAction` rather than a button of its own, so
          the press that starts verification looks the same here as it does on
          the screen it leads to. */}
      <div className="px-6 pb-6 pt-6">
        <div
          onPointerEnter={() => setPressReady(true)}
          onPointerLeave={() => setPressReady(false)}
        >
          <PrimaryAction onClick={onGoToKyc}>
            {copy.action}
            {/* The arrow is what makes the button read as a door rather than a
                submit, and it steps forward under the cursor. `x` on a motion
                element, not a CSS transform: the app's global `transition`
                shorthand on `*` resets `transition-property`, so every CSS
                transform in here is dead on arrival. */}
            <motion.span
              className="inline-flex"
              animate={{ x: pressReady ? 3 : 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            >
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </motion.span>
          </PrimaryAction>
        </div>

        <p className="mt-3.5 text-center text-[12px] leading-[17px] text-muted-foreground">
          {copy.foot}
        </p>
      </div>
    </motion.section>
  );
});

export default KycGate;
