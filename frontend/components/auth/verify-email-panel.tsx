"use client";

/**
 * What a new account sees the moment it exists.
 *
 * This screen gets shown exactly once per person, at the moment they have
 * handed over an email address and are deciding whether that was a good idea.
 * It has been a 44px tinted square with two flush-left paragraphs, and then a
 * hand-drawn envelope of my own invention, and both were beneath the two
 * screens this product already has for "go and do something":
 * `IdentityIllustration` on verification, and `SupportIllustration` on the
 * support desk.
 *
 * So it is built to those rather than beside them. The band is the band the
 * new-ticket flow opens with — `BandWash` under an illustration, an eyebrow, a
 * title, a sentence and `FlowSteps` — and the drawing is made the way the
 * identity card is made: one object at its real proportions, flat accent fills
 * at layered opacities, and a single mechanism running on one timeline.
 *
 * The mechanism is the sentence this screen is trying to say. The letter comes
 * out of the envelope, the link inside it fills as it is pressed, and the seal
 * lands. Open your mail, verify, verified — drawn, rather than captioned.
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BandWash, FlowSteps } from "@/app/[locale]/terminal/components/modals/account/kyc/ui";

/**
 * The one blue the drawing is made of.
 *
 * The same value `IdentityIllustration` and `SupportIllustration` use, so the
 * three drawings in this product are the same blue. `--primary` is not a
 * candidate: it is a blue in light and navy and a near-white in dark, so a
 * monochrome drawing built on it loses its hue in exactly one theme.
 */
const ACCENT = "#3b82f6";
/** The green the seal is stamped in — the verification drawing's own. */
const VERIFIED = "#22b573";

/**
 * One turn of the story, in seconds: the letter comes out, the link is
 * pressed, the seal lands, it holds long enough to be read, it clears.
 *
 * Every moving part is written against this single duration with its own
 * `times`, the way the identity card's scanner and seal are, so they share one
 * timeline instead of three loops that drift apart.
 */
const LOOP = 6.6;

const STEPS = ["Open your mail", "Verify email", "Verified"];

/**
 * An envelope, a letter, and the link inside it.
 *
 * 224 × 98 is 2.29:1, which is DL — the envelope a letter from a bank actually
 * arrives in, and the same reason the identity card is cut to ISO/IEC 7810.
 * Proportions somebody recognises are half of what makes a flat shape read as
 * an object.
 */
const MailIllustration = React.memo(function MailIllustration({
  height = 124,
}: {
  height?: number;
}) {
  const still = useReducedMotion();
  /* Settled rather than looping when motion is unwelcome: the letter is out,
     the link is filled, the seal is on it. The end of the sentence, held. */
  const cycle = (frames: number[], times: number[]) =>
    still
      ? { animate: { opacity: 1 } }
      : {
          animate: { opacity: frames },
          transition: { duration: LOOP, repeat: Infinity, times, ease: "easeOut" as const },
        };

  return (
    <svg
      viewBox="0 0 260 168"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden
      /* No ground of its own — it draws straight onto the band, so the header
         is one continuous surface rather than a picture block on a strip. */
      className="block w-full"
      style={{ height }}
    >
      <defs>
        {/* The press travelling along the link. A band, not a rule, so it
            reads as light moving over the bar rather than a line sliding
            across it — the same construction as the scanner's beam. */}
        <linearGradient id="vmail-press" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        {/* Clipped to the link, so the light never leaves the thing it is
            pressing. */}
        <clipPath id="vmail-link">
          <rect x="82" y="86" width="84" height="14" rx="7" />
        </clipPath>
        {/* The letter is cut off at the envelope's mouth, so it slides *out*
            of it rather than floating in front of it. */}
        <clipPath id="vmail-mouth">
          <rect x="0" y="0" width="260" height="112" />
        </clipPath>
      </defs>

      {/* ── the letter ────────────────────────────────────────────────────
          Rises on the first beat and sinks on the last. Everything written on
          it is a bar at falling opacity, the way the identity card's fields
          run — the shape of a letter at the size where only the shape
          survives. */}
      <g clipPath="url(#vmail-mouth)">
        <motion.g
          initial={false}
          {...(still
            ? { animate: { y: 0 } }
            : {
                animate: { y: [34, 0, 0, 0, 34] },
                transition: {
                  duration: LOOP,
                  repeat: Infinity,
                  ease: "easeOut",
                  times: [0, 0.14, 0.9, 0.94, 1],
                },
              })}
        >
          <rect x="62" y="18" width="136" height="94" rx="9" fill={ACCENT} fillOpacity="0.16" />
          <rect x="82" y="34" width="62" height="9" rx="4.5" fill={ACCENT} fillOpacity="0.70" />
          <rect x="82" y="52" width="96" height="7" rx="3.5" fill={ACCENT} fillOpacity="0.32" />
          <rect x="82" y="66" width="74" height="7" rx="3.5" fill={ACCENT} fillOpacity="0.32" />

          {/* The link: the one thing on the letter anybody is meant to press,
              so it is the one thing drawn as a control rather than as text. */}
          <rect x="82" y="86" width="84" height="14" rx="7" fill={ACCENT} fillOpacity="0.34" />
          <motion.rect
            x="82"
            y="86"
            width="84"
            height="14"
            rx="7"
            fill={ACCENT}
            fillOpacity="0.9"
            style={{ transformOrigin: "82px 93px" }}
            initial={false}
            {...(still
              ? { animate: { scaleX: 1 } }
              : {
                  animate: { scaleX: [0, 0, 1, 1, 1, 0] },
                  transition: {
                    duration: LOOP,
                    repeat: Infinity,
                    ease: [0.33, 1, 0.68, 1],
                    times: [0, 0.2, 0.44, 0.9, 0.94, 1],
                  },
                })}
          />
          {!still && (
            <g clipPath="url(#vmail-link)">
              <motion.rect
                x="-60"
                y="86"
                width="60"
                height="14"
                fill="url(#vmail-press)"
                animate={{ x: [-60, -60, 200, 200] }}
                transition={{
                  duration: LOOP,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [0, 0.2, 0.46, 1],
                }}
              />
            </g>
          )}
        </motion.g>
      </g>

      {/* ── the envelope ──────────────────────────────────────────────────
          224 × 98 at 2.29:1 — a DL envelope. The front panel is a shade
          heavier than the body so the near face turns away from the back one;
          without that the whole thing is one flat rectangle with a V on it. */}
      <rect x="18" y="70" width="224" height="82" rx="11" fill={ACCENT} fillOpacity="0.16" />
      <path
        d="M18 81a11 11 0 0111-11h202a11 11 0 0111 11v0L130 128z"
        fill={ACCENT}
        fillOpacity="0.10"
      />
      <path
        d="M18 141V96l86 32-86 45z"
        fill={ACCENT}
        fillOpacity="0.24"
      />
      <path
        d="M242 141V96l-86 32 86 45z"
        fill={ACCENT}
        fillOpacity="0.24"
      />
      <path
        d="M18 141l112-45 112 45v0a11 11 0 01-11 11H29a11 11 0 01-11-11z"
        fill={ACCENT}
        fillOpacity="0.34"
      />

      {/* ── the seal ──────────────────────────────────────────────────────
          It lands once the link has been pressed, holds while it is read, and
          clears before the next pass, so the loop is a sentence — open it,
          press it, done — rather than three effects at once.

          The ring is stroked in `--muted`, which is exactly the band it sits
          on, so the disc is cut cleanly out of what is behind it rather than
          needing a colour picked per theme. */}
      <motion.circle
        cx="206"
        cy="118"
        r="19"
        fill="none"
        stroke={VERIFIED}
        strokeWidth="2.2"
        style={{ transformOrigin: "206px 118px" }}
        initial={false}
        {...(still
          ? { animate: { opacity: 0 } }
          : {
              animate: { opacity: [0, 0, 0.5, 0, 0], scale: [1, 1, 1, 1.5, 1.5] },
              transition: {
                duration: LOOP,
                repeat: Infinity,
                ease: "easeOut",
                times: [0, 0.46, 0.54, 0.7, 1],
              },
            })}
      />
      <motion.g
        style={{ transformOrigin: "206px 118px" }}
        initial={false}
        {...(still
          ? { animate: { opacity: 1, scale: 1 } }
          : {
              animate: {
                opacity: [0, 0, 1, 1, 1, 0, 0],
                scale: [0.4, 0.4, 1.1, 1, 1, 0.92, 0.92],
              },
              transition: {
                duration: LOOP,
                repeat: Infinity,
                ease: "easeOut",
                times: [0, 0.44, 0.53, 0.58, 0.88, 0.96, 1],
              },
            })}
      >
        <circle
          cx="206"
          cy="118"
          r="19"
          fill={VERIFIED}
          stroke="hsl(var(--muted))"
          strokeWidth="4.5"
        />
        <path
          d="M197.9 118.4l5.3 5.3 10-10.6"
          stroke="#ffffff"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.g>
    </svg>
  );
});

export function VerifyEmailPanel({
  email,
  /** False when the account is live already — no link to go and open. */
  needsVerification,
  children,
}: {
  email: string;
  needsVerification: boolean;
  /** The buttons. Supplied by the caller, because the modal and the page send
      people to different places from here. */
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      {/* The band the new-ticket flow opens with, and the header verification
          opens with. Three screens in this product ask somebody to go and do
          something; they should be the same screen with different words. */}
      <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-muted px-5 pb-5 pt-4 text-center">
        <BandWash id="verify-email-band" />

        <MailIllustration height={124} />

        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {needsVerification ? "One step left" : "Account created"}
        </p>
        <h2 className="mt-1 text-[19px] font-semibold leading-[25px] tracking-[-0.015em] text-foreground">
          {needsVerification ? "Check your email" : "You're all set"}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] leading-[18px] text-muted-foreground">
          {needsVerification ? (
            <>
              We sent a link to{" "}
              <span className="font-medium text-foreground">{email}</span>. Open
              it and your account is live — check the spam folder if it has not
              arrived.
            </>
          ) : (
            "Your account is fully activated and ready to use."
          )}
        </p>

        {/* The real step strip, not one built for this screen.
        
            `at={0}` because that is where the reader actually is: we have sent
            a link and heard nothing back, and a strip that animates itself
            forward would be claiming progress nobody has reported. The drawing
            above carries the sequence; this carries the position. */}
        <div className="mt-4 text-left">
          <FlowSteps steps={STEPS} at={needsVerification ? 0 : STEPS.length} />
        </div>
      </div>

      <div className="mt-6 space-y-3">{children}</div>
    </div>
  );
}

export default VerifyEmailPanel;
