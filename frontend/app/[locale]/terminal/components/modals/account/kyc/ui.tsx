"use client";

/**
 * The vocabulary the verification flow is written in.
 *
 * Rebuilt as a restraint pass. What was here read as generated, and the causes
 * were specific rather than a matter of taste:
 *
 *  - **Translucent fills.** `bg-card/40`, `bg-muted/20` — surfaces you can see
 *    through, stacked on each other. Everything is solid now.
 *  - **Large radii.** 16 and 24px on every corner. Cards and buttons are 8px,
 *    inputs 6px. Nothing here is a pill.
 *  - **Colour as decoration.** Blue-washed panels, blue-tinted help, a blue
 *    rounded square holding a blue icon — that last one being the single most
 *    recognisable generated-interface tell. All gone. The primary action keeps
 *    its blue, because a reference flow's action is blue and one filled button
 *    on a screen is not decoration; it is where you press.
 *  - **Tinted everything.** Blue-washed selection, blue-tinted help, a blue
 *    rounded square holding a blue icon. That last one is the single most
 *    recognisable generated-interface tell, and it is gone. Colour appears
 *    where it carries meaning — an error, a completed step — and nowhere else.
 *
 * What is left is border, weight and space doing the work — and colour where
 * it means something. Stripping every hue was the opposite mistake: a tick and
 * a cross in the same grey stop saying pass and fail, and a screen with no
 * accent at all gives the eye nowhere to land. One accent, used for the answer
 * you have given and the state you are in, and nothing else.
 */

import { memo } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Loader2, Lock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScatterGrid } from "../profile-kit";

export const Heading = memo(function Heading({
  title,
  sub,
}: {
  title: string;
  /** A node, not a string, so a screen can emphasise the one word in its
      sub-line that changes what somebody does — "the **front side**". */
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
        {title}
      </h2>
      {sub && <p className="mt-1.5 text-[13px] leading-[19px] text-muted-foreground">{sub}</p>}
    </div>
  );
});

/**
 * The top of the verification card.
 *
 * ── Why it is a moving, coloured drawing ───────────────────────────────────
 *
 * What was here first was `Heading`: a 20px line and a sentence, hard against
 * the left edge, immediately above a first-name field. It read as the fifth
 * section of a settings page rather than the one thing this screen asks — and
 * the ask is unusual: hand a government document to a company you have been
 * trading with for a week. A screen that asks for that and looks like a
 * shipping form has the register wrong.
 *
 * The replacement was centred and drawn but still grey and still. Grey and
 * still is what a disabled state looks like. This one scans: a line sweeps the
 * card the way a reader passes over a document, the details it finds light up
 * behind it, and the tick stamps when the sweep completes. Three colours, each
 * meaning something — blue is the machine reading, green is the outcome, the
 * card itself is neutral because it is the person's, not ours.
 *
 * The loop is deliberately slow and has a long dead pause in it. A header that
 * pulses every second is a header somebody covers with their hand while they
 * fill in a form; four seconds of stillness between four seconds of movement
 * reads as alive rather than as urgent.
 *
 * ── Why the header is centred and the fields are not ───────────────────────
 *
 * They do different jobs. A header is read once, in one glance, and centring
 * it around its own drawing is what makes it read as a title rather than as
 * the first row of the form. The fields are worked through one after another,
 * and a left edge is what the eye returns to between them.
 *
 * It has to be framer-motion, not CSS: `styles/theme.css` sets `transition` on
 * `*` for background, border and colour only, and that shorthand resets
 * `transition-property`, so every CSS transform in this app is dead on
 * arrival.
 */
export const VerifyHeader = memo(function VerifyHeader({
  title,
  sub,
}: {
  title: string;
  sub?: string;
}) {
  return (
    /* Centred, like the gate's. These two headers are one click apart and
       both are read in a glance rather than worked down — the left edge that
       matters is the form's, and the form starts below this band. */
    <div className="relative isolate overflow-hidden border-b border-border bg-muted px-5 pb-3.5 pt-4 text-center md:px-6">
      <BandWash id="kyc-verify-grid" />
      <IdentityIllustration height={124} />
      <h2 className="mt-2 text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-foreground">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] leading-[17px] text-muted-foreground">
          {sub}
        </p>
      )}
      <div className="mt-2.5">
        <VerifyAssurances items={VERIFY_ASSURANCES} />
      </div>
    </div>
  );
});

/**
 * The wash under a verification header.
 *
 * Shared by this header and the gate's, so the locked page and the page that
 * unlocks it are the same surface rather than two near-misses.
 *
 * The pattern is `ScatterGrid` — the same component drawn behind the portrait
 * on Personal, not a second grid that looks like it. These two headers sit one
 * click apart in the same panel, and two hand-rolled grids at slightly
 * different cell sizes is exactly the kind of near-miss somebody notices
 * without being able to say what is wrong. It draws in `currentColor`, so the
 * `text-border` it carries is the theme's own hairline in all three.
 *
 * Under it, a `--foreground` wash at five percent: a shadow on a light ground
 * and a highlight on a dark one, which is what lifts the band off the card in
 * both directions from one declaration. An earlier version painted a fixed
 * deep-navy gradient here — the same three hex values in every theme — which
 * on a white card read as a black brick dropped onto the page.
 */
const BandWash = memo(function BandWash({ id }: { id: string }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{
          background: "linear-gradient(158deg, hsl(var(--foreground) / 0.05), transparent 62%)",
        }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <ScatterGrid id={id} />
      </span>
    </>
  );
});

export { BandWash };

/**
 * The one colour the drawing is made of.
 *
 * Fixed rather than `--primary`, which is not the same kind of value in all
 * three themes: it is a blue in light and navy but a near-white in dark, so a
 * monochrome illustration built on it would lose its hue in exactly one theme.
 * This blue sits far enough from both the pale band in light and the charcoal
 * one in dark to read at every alpha used below.
 */
const ACCENT = "#3b82f6";

/**
 * The green the tick is stamped in.
 *
 * Fixed, for the same reason `ACCENT` is. A hairline-and-tint version of this
 * badge was tried — `--verified`, the ink the panel writes "Verified" in — and
 * it was rejected as too faint for the one moment the drawing is making a
 * point. A seal is allowed to be a seal: solid disc, white tick, and it is on
 * screen for about a third of the loop.
 */
const VERIFIED = "#22b573";

/**
 * One turn of the drawing's story, in seconds: sweep down, sweep back, stamp,
 * hold, clear. Every animated part of the illustration is written against this
 * single duration with its own `times`, so they share one timeline instead of
 * three loops that drift apart.
 */
const LOOP = 6.4;

/**
 * Which moment of the card's life is being drawn.
 *
 * One drawing, four moments — so the screen that asks for your document and
 * the three screens that report on it are visibly the same object rather than
 * four separate pictures that happen to be about identity.
 */
export type IdentityState = "scanning" | "approved" | "review" | "rejected";

export const IdentityIllustration = memo(function IdentityIllustration({
  height = 124,
  state = "scanning",
}: {
  /** Drawn height. The card keeps its own proportions inside it. */
  height?: number;
  state?: IdentityState;
}) {
  /* Approved and refused are settled: they draw themselves once, on arrival,
     and then hold. Only the two unsettled states keep moving, and they should
     — a scanner that stops is a review that stopped. */
  const oneShot = state === "approved" || state === "rejected";

  return (
    <svg
      viewBox="0 0 260 168"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden
      /* No ground of its own — it draws straight onto whatever band or card it
         is placed on, so a header is one continuous surface rather than a
         picture block sitting above a coloured strip. */
      className="block w-full"
      style={{ height }}
    >
      <defs>
        {/* The scanner's light: a band, not a rule, so it reads as a beam
            passing over the card rather than a line sliding down it. */}
        <linearGradient id="kyc-scan-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="50%" stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        {/* Clipped to the card, so the beam never leaves the thing it reads. */}
        <clipPath id="kyc-scan-card">
          <rect x="18" y="12" width="224" height="141" rx="12" />
        </clipPath>
      </defs>

      {/* Refused pulls the document back so the mark over it is what the eye
          lands on. Everywhere else the card is the subject. */}
      <g opacity={state === "rejected" ? 0.5 : 1}>
        {/* The card, at the proportions a card actually has: 224 × 141 is
            1.588:1, which is ISO/IEC 7810 ID-1 — the 85.6 × 54mm every
            national ID, driving licence and bank card in the world is cut to. */}
        <rect x="18" y="12" width="224" height="141" rx="12" fill={ACCENT} fillOpacity="0.16" />

        {/* The band across the top that every ID has. */}
        <rect x="36" y="28" width="188" height="9" rx="4.5" fill={ACCENT} fillOpacity="0.70" />

        {/* The portrait, in its own well. */}
        <rect x="36" y="48" width="74" height="78" rx="5" fill={ACCENT} fillOpacity="0.13" />
        <circle cx="73" cy="76" r="12" fill={ACCENT} fillOpacity="0.80" />
        <path d="M55 106c0-9.6 8-15.4 18-15.4s18 5.8 18 15.4z" fill={ACCENT} fillOpacity="0.80" />

        {/* The frame the camera puts around a face. Around the portrait rather
            than around the whole drawing: it is the photograph being checked. */}
        <g stroke={ACCENT} strokeOpacity="0.85" strokeWidth="2.8" strokeLinecap="round" fill="none">
          <path d="M46 66v-6a4 4 0 014-4h6" />
          <path d="M90 56h6a4 4 0 014 4v6" />
          <path d="M100 108v6a4 4 0 01-4 4h-6" />
          <path d="M56 118h-6a4 4 0 01-4-4v-6" />
        </g>

        {/* What is written on it. Four lines of falling certainty, the way a
            document's fields actually run. */}
        <g fill={ACCENT}>
          <rect x="124" y="52" width="100" height="9" rx="4.5" fillOpacity="0.44" />
          <rect x="124" y="70" width="78" height="9" rx="4.5" fillOpacity="0.32" />
          <rect x="124" y="88" width="100" height="9" rx="4.5" fillOpacity="0.32" />
          <rect x="124" y="106" width="64" height="9" rx="4.5" fillOpacity="0.44" />
        </g>
      </g>

      {/* ── the scanner ───────────────────────────────────────────────────
          It travels the card and comes back. Up *and* down on one pass rather
          than sweeping one way and jumping back to the top — a reset is a cut,
          and a scanner that cuts reads as a dropped frame. `easeInOut` so it
          slows at each end instead of bouncing off it.

          While verification is being asked for it makes one pass and fades,
          because the seal is about to arrive and two things moving at once is
          neither. While a person is actually reading the documents it never
          stops, because they have not.

          It has to be framer-motion, not CSS: `styles/theme.css` sets
          `transition` on `*` for background, border and colour only, and that
          shorthand resets `transition-property`, so every CSS transform in
          this app is dead on arrival. */}
      {!oneShot && (
        <g clipPath="url(#kyc-scan-card)">
          {state === "review" ? (
            <motion.g
              animate={{ y: [16, 149, 16] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect x="18" y="-14" width="224" height="28" fill="url(#kyc-scan-glow)" />
              <rect x="18" y="-1.4" width="224" height="2.8" fill={ACCENT} fillOpacity="0.75" />
            </motion.g>
          ) : (
            <motion.g
              animate={{ y: [16, 16, 149, 16, 16, 16], opacity: [0, 1, 1, 1, 0, 0] }}
              transition={{
                duration: LOOP,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.04, 0.30, 0.44, 0.50, 1],
              }}
            >
              <rect x="18" y="-14" width="224" height="28" fill="url(#kyc-scan-glow)" />
              <rect x="18" y="-1.4" width="224" height="2.8" fill={ACCENT} fillOpacity="0.75" />
            </motion.g>
          )}
        </g>
      )}

      {/* ── the seal ──────────────────────────────────────────────────────
          On the header it lands once the sweep is done, holds while it is
          read, and clears before the next pass, so the loop is a sentence —
          read the card, approve it — rather than three effects at once. On the
          approved screen it simply arrives and stays: that news has already
          happened, and a pulse that never stops is a page asking for attention
          it does not need.

          The ring is `--muted` on the header, which is exactly the band it
          sits on; on the result card it is `--card`. Either way the disc is
          cut cleanly out of what is behind it rather than needing a colour
          picked per theme. */}
      {(state === "scanning" || state === "approved") && (
        <>
          <motion.circle
            cx="222" cy="136" r="19" fill="none" stroke={VERIFIED} strokeWidth="2.2"
            style={{ transformOrigin: "222px 136px" }}
            {...(state === "approved"
              ? {
                  initial: { scale: 0.8, opacity: 0.6 },
                  animate: { scale: 2, opacity: 0 },
                  transition: { duration: 0.9, ease: "easeOut", delay: 0.4 },
                }
              : {
                  animate: { opacity: [0, 0, 0.5, 0, 0], scale: [1, 1, 1, 1.5, 1.5] },
                  transition: {
                    duration: LOOP,
                    repeat: Infinity,
                    ease: "easeOut",
                    times: [0, 0.5, 0.56, 0.70, 1],
                  },
                })}
          />
          <motion.g
            style={{ transformOrigin: "222px 136px" }}
            {...(state === "approved"
              ? {
                  initial: { scale: 0.4, opacity: 0 },
                  animate: { scale: 1, opacity: 1 },
                  transition: { type: "spring" as const, stiffness: 420, damping: 20, delay: 0.26 },
                }
              : {
                  animate: {
                    opacity: [0, 0, 1, 1, 1, 0, 0],
                    scale: [0.4, 0.4, 1.1, 1, 1, 0.92, 0.92],
                  },
                  transition: {
                    duration: LOOP,
                    repeat: Infinity,
                    ease: "easeOut",
                    times: [0, 0.46, 0.55, 0.60, 0.88, 0.96, 1],
                  },
                })}
          >
            <circle
              cx="222" cy="136" r="19"
              fill={VERIFIED}
              stroke={state === "approved" ? "hsl(var(--card))" : "hsl(var(--muted))"}
              strokeWidth="4.5"
            />
            <path
              d="M213.9 136.4l5.3 5.3 10-10.6"
              stroke="#ffffff" strokeWidth="3.8"
              strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
          </motion.g>
        </>
      )}

      {/* ── refused ───────────────────────────────────────────────────────
          A stroke being made across the document, which is what striking
          something through is. Drawn once on arrival, like the seal. */}
      {state === "rejected" && (
        <motion.path
          d="M34 142L226 24"
          stroke="hsl(var(--danger))" strokeWidth="4"
          strokeLinecap="round" fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1], delay: 0.12 }}
        />
      )}
    </svg>
  );
});

/**
 * Where you are in verification, and the way back to anywhere you have been.
 *
 * ── Why it is bars and not numbered circles ───────────────────────────────
 *
 * Numbering three steps tells somebody something they can already see: there
 * are three labels in a row. What the number cannot say is how far through one
 * you are, and that is the only part that changes while you work. So the
 * numbers are gone and each step is a bar that fills.
 *
 * **The bar fills inside a step, not only between them.** A stepper that moves
 * once per completed step is dead for the whole time you are doing the step —
 * and "one of two sides uploaded" is exactly the state somebody wants
 * confirmed. Putting the front in moves the second bar to halfway.
 *
 * **The leading edge is alive while the step is not finished.** One soft dot
 * riding the end of the fill, breathing on a two-second loop. It stops the
 * moment the bar is full, so nothing pulses at a step that is done.
 *
 * **A finished step is a way back.** These used to be three labels, and the
 * only way to change a document you had already picked was the Back link at
 * the bottom of the page, twice. Anything completed is a button now. Nothing
 * ahead of you ever is — a stepper you can skip forward on is a form that lets
 * you submit an empty step.
 *
 * Springs, not durations, on the fill: a step can complete while the previous
 * animation is still running (drop both files at once and both bars move), and
 * a spring picks up from wherever it currently is instead of restarting.
 *
 * Motion is framer-motion throughout, and has to be: `styles/theme.css` sets
 * `transition` on `*` for background, border and colour only, and that
 * shorthand resets `transition-property`, so every CSS transform and width
 * transition in this app is dead on arrival.
 */
export const FlowSteps = memo(function FlowSteps({
  steps,
  at,
  progress = 0,
  onJump,
}: {
  steps: string[];
  /** Index of the step being worked on. */
  at: number;
  /** 0–1 through the current step, shown on that step's own bar. */
  progress?: number;
  /** Called for a completed step. Omit to make the whole thing inert. */
  onJump?: (index: number) => void;
}) {
  return (
    <ol className="flex items-start gap-2.5">
      {steps.map((label, i) => {
        const done = i < at;
        const here = i === at;
        const canJump = done && !!onJump;
        const fill = done ? 1 : here ? Math.max(0, Math.min(1, progress)) : 0;

        const body = (
          <>
            <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-border">
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-verified"
                initial={false}
                animate={{ scaleX: fill }}
                transition={{ type: "spring", stiffness: 220, damping: 30 }}
              />
              {/* The leading edge, only while there is still something to do
                  on this step. `left` follows the fill; the dot itself
                  breathes in place. */}
              {here && fill < 1 && (
                <motion.span
                  aria-hidden
                  className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-verified"
                  initial={false}
                  animate={{ left: `calc(${fill * 100}% - 3px)` }}
                  transition={{ type: "spring", stiffness: 220, damping: 30 }}
                >
                  <motion.span
                    className="absolute inset-0 rounded-full bg-verified"
                    animate={{ scale: [1, 2.6, 2.6], opacity: [0.5, 0, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut", times: [0, 0.6, 1] }}
                  />
                </motion.span>
              )}
            </span>

            <span className="mt-2 flex items-center gap-1.5">
              {done && (
                <motion.span
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 480, damping: 22 }}
                  className="grid shrink-0 place-items-center"
                >
                  <Check className="h-3 w-3 text-verified" strokeWidth={3.5} />
                </motion.span>
              )}
              <span
                className={cn(
                  "truncate text-[12px] font-medium",
                  done || here ? "text-foreground" : "text-muted-foreground",
                  canJump && "group-hover:underline group-hover:underline-offset-2"
                )}
              >
                {label}
              </span>
            </span>
          </>
        );

        return (
          <li key={label} aria-current={here ? "step" : undefined} className="min-w-0 flex-1">
            {canJump ? (
              <button
                type="button"
                onClick={() => onJump(i)}
                title={`Back to ${label.toLowerCase()}`}
                className="group block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {body}
              </button>
            ) : (
              <span className="block w-full">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
});

/**
 * The three things people stop on before starting this: how long, who sees it,
 * and whether a machine or a person decides. Each is a fact the flow already
 * keeps somewhere else, said here so nobody has to go looking — and kept as
 * one constant, because the gate on Personal makes the same three promises and
 * two lists would eventually promise different things.
 */
export const VERIFY_ASSURANCES = [
  { icon: Clock, label: "2 minutes" },
  { icon: Lock, label: "Encrypted" },
  { icon: UserCheck, label: "Reviewed by a person" },
];

/**
 * The three promises, on one line under the header.
 *
 * Each answers a question people actually stop on — how long, who sees it, can
 * I still trade meanwhile — and each is a fact this flow already keeps
 * elsewhere. Cut to two or three words apiece: at the length they were
 * ("Encrypted, kept only as long as the law requires") they wrapped to two
 * lines and became a second paragraph under the paragraph, which is the
 * opposite of reassurance you can take in at a glance.
 */
export const VerifyAssurances = memo(function VerifyAssurances({
  items,
  align = "center",
}: {
  items: { icon: React.ElementType; label: string }[];
  /** Centred under a dialog's centred copy, left under a form's header. */
  align?: "center" | "start";
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        align === "start" ? "justify-start" : "justify-center"
      )}
    >
      {items.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card/50 px-1.5 py-0.5 text-[10.5px] font-medium leading-[14px] text-muted-foreground"
        >
          <Icon className="h-3 w-3 shrink-0" strokeWidth={1.8} />
          {label}
        </li>
      ))}
    </ul>
  );
});

export const Label = memo(function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] font-medium text-foreground">{children}</p>;
});

/**
 * Help and errors.
 *
 * A rule down the left rather than a tinted panel. The neutral case carries no
 * colour at all — it is a sentence, not a status — and the error case carries
 * exactly one.
 */
export const Note = memo(function Note({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "bad";
}) {
  return (
    <div
      className={cn(
        "border-l-2 py-1 pl-3 text-[13px] leading-[19px]",
        tone === "bad" ? "border-danger text-danger" : "border-border text-muted-foreground"
      )}
    >
      {children}
    </div>
  );
});

/**
 * One choice, full width.
 *
 * Selection is a border and a filled mark, not a wash of colour across the row.
 * The document's own drawing sits on the right, which is what tells a passport
 * from a licence before either word is read.
 */
export const ChoiceRow = memo(function ChoiceRow({
  selected,
  title,
  detail,
  mark,
  onSelect,
}: {
  selected: boolean;
  title: string;
  detail?: string;
  mark?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        selected ? "border-verified/60 bg-verified/[0.06]" : "border-border hover:border-foreground/25"
      )}
    >
      <span
        className={cn(
          "grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border",
          selected ? "border-verified bg-verified text-white" : "border-muted-foreground/50"
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-foreground">{title}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{detail}</span>
        )}
      </span>

      {mark && <span className="shrink-0 text-muted-foreground">{mark}</span>}
    </button>
  );
});

/**
 * The action.
 *
 * The brand blue, and the only filled element on the screen.
 *
 * It was `bg-blue-600` — a raw Tailwind blue that happened to be near the
 * brand's and drifted from it in every theme — and its disabled state emptied
 * the fill and drew a border instead, which turns the one action on the screen
 * into a ghost outline that reads as decoration. A control that is not ready
 * yet is the same control: it keeps its colour at a third of it, the way every
 * dialog in this product does. See DIALOG-DESIGN.md.
 */
export const PrimaryAction = memo(function PrimaryAction({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold",
        "bg-brand text-brand-foreground hover:opacity-90 active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        "disabled:cursor-not-allowed disabled:bg-brand/35 disabled:text-brand-foreground/70",
        "disabled:hover:opacity-100 disabled:active:scale-100"
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-[14px] text-foreground " +
  "placeholder:text-muted-foreground outline-none " +
  "focus-visible:border-foreground/40 focus-visible:ring-1 focus-visible:ring-foreground/15";

/**
 * The mark beside a document type.
 *
 * Four line drawings chosen from the document's own id: a card with a portrait,
 * a passport spread, a licence, and a plain numbered card for the tax and
 * registry documents that carry no photo. One weight, no fill, no colour.
 */
export const DocumentMark = memo(function DocumentMark({ id }: { id: string }) {
  const kind = markFor(id);
  const common = { width: 28, height: 28, viewBox: "0 0 30 30", fill: "none" as const };
  const stroke = "currentColor";

  if (kind === "passport") {
    return (
      <svg {...common} aria-hidden>
        <rect x="6" y="3" width="18" height="24" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        <circle cx="15" cy="12" r="4" stroke={stroke} strokeWidth="1.4" />
        <path d="M11 12h8M15 8c1.6 2.4 1.6 5.6 0 8M15 8c-1.6 2.4-1.6 5.6 0 8" stroke={stroke} strokeWidth="1.1" />
        <path d="M11 21h8" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "licence") {
    return (
      <svg {...common} aria-hidden>
        <rect x="2.5" y="6" width="25" height="18" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        <path d="M7 19.5c.7-1.9 2-2.9 3.5-2.9s2.8 1 3.5 2.9" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="10.5" cy="13" r="2.4" stroke={stroke} strokeWidth="1.2" />
        <path d="M18 12h6M18 15.5h6M18 19h4" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "number") {
    return (
      <svg {...common} aria-hidden>
        <rect x="2.5" y="6" width="25" height="18" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        <path d="M7 12h16M7 16h16M7 20h9" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <rect x="2.5" y="6" width="25" height="18" rx="1.5" stroke={stroke} strokeWidth="1.4" />
      <circle cx="10" cy="13.5" r="2.8" stroke={stroke} strokeWidth="1.2" />
      <path d="M6.2 19.8c.8-2 2.1-3 3.8-3s3 1 3.8 3" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M18.5 12.5h6M18.5 16.5h6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
});

function markFor(id: string): "passport" | "licence" | "number" | "id" {
  const k = id.toLowerCase();
  if (k.includes("passport")) return "passport";
  if (k.includes("licence") || k.includes("license") || k.includes("sim") || k.includes("cnh")) return "licence";
  if (k.includes("pan") || k.includes("curp") || k.includes("bvn") || k.includes("cpf") || k.includes("tazkira"))
    return "number";
  return "id";
}
