"use client";

/**
 * The drawing on the support desk: above the new-ticket flow, and filling the
 * pane before a ticket is picked.
 *
 * The wizard opened on a bare heading and a grid of six boxes at the top of an
 * otherwise empty screen — correct, and cold. Verification has an illustrated
 * band over its first step for a reason: the moment somebody is about to hand
 * you a problem is the moment to look like a desk with a person behind it,
 * not a form.
 *
 * Built the way `IdentityIllustration` is, and deliberately so — the two are
 * one panel apart and should read as the same hand: one fixed accent, surfaces
 * tinted in it rather than drawn in grey, bars at falling opacity for text,
 * and one timeline that every moving part is written against.
 *
 * The scene is the whole life of a ticket in one frame — it is raised, it is
 * answered, somebody is still typing, and it ends up resolved. The first pass
 * drew only the first two, in `--foreground` washes, which came out as three
 * grey boxes: correct furniture, no story and no colour.
 */

import { memo } from "react";
import { motion } from "framer-motion";
import { CheckCheck, CircleDot, Search } from "lucide-react";

/**
 * The one colour the drawing is made of.
 *
 * Fixed rather than `--primary`, which is not the same kind of value in all
 * three themes: a blue in light and navy, a near-white in dark, so a
 * monochrome drawing built on it would lose its hue in exactly one theme. The
 * same value `IdentityIllustration` uses, so the two bands are the same blue.
 */
const ACCENT = "#3b82f6";

/**
 * One turn of the story, in seconds: the ticket is raised, somebody is
 * writing, it is being looked at, and it is closed. Longer than it was, because
 * three stamps have to each be readable rather than glimpsed.
 *
 * Every moving part is written against this single duration with its own
 * `times`, the way the verification drawing does it, so they share one
 * timeline instead of three loops that drift apart.
 */
const LOOP = 8.4;

/**
 * One status pill, stamped onto the ticket's footer row.
 *
 * Both stamps share this so the pair cannot drift apart: the same height, the
 * same disc, the same corner — the only differences are the word, the ground,
 * the glyph and where in the loop it lands. They are drawn at the same origin
 * and swap by crossfade, because a ticket has one status, and two boxes
 * sliding past each other would say it has two.
 */
const Stamp = memo(function Stamp({
  label,
  width,
  icon: Icon,
  tone,
  times,
  opacity,
  shift,
}: {
  label: string;
  width: number;
  icon: typeof CheckCheck;
  /** A `text-*` class: the pill's ground is `currentColor`, the disc's ink too. */
  tone: string;
  times: number[];
  opacity: number[];
  shift: number[];
}) {
  return (
    <g transform="translate(28 116)" className={tone}>
      <motion.g
        initial={false}
        animate={{ opacity, y: shift }}
        transition={{ duration: LOOP, repeat: Infinity, ease: "easeOut", times }}
      >
        {/* A shadow, because this sits on the card rather than in it — a
            stamp with no lift is a sticker. */}
        <rect y="1.5" width={width} height="19" rx="5.5" fill="#000" fillOpacity="0.14" />
        <rect width={width} height="19" rx="5.5" fill="currentColor" />
        <circle cx="11" cy="9.5" r="6" fill="#fff" />
        <Icon
          x={6.6}
          y={5.1}
          width={8.8}
          height={8.8}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
          fill="none"
        />
        <text x="21.5" y="13.2" fontSize="8.6" fontWeight="700" letterSpacing="-0.1" fill="#fff">
          {label}
        </text>
      </motion.g>
    </g>
  );
});

export const SupportIllustration = memo(function SupportIllustration({
  height = 112,
}: {
  /**
   * A pixel height, or `"auto"` to size from the container's width instead.
   *
   * The band at the top of the wizard is a fixed strip, so it wants a height.
   * The empty pane is not: it is as wide as whatever is left over after the
   * list and the details column, which on a phone is most of the screen and
   * on a desktop is most of a much bigger one. Given a fixed height there,
   * `preserveAspectRatio` fits the drawing to whichever axis runs out first
   * and leaves the slack as blank space inside the box — so the drawing gets
   * *smaller* as the pane narrows while the hole it sits in stays the same
   * size. `"auto"` lets the viewBox set the height from the width, and the
   * caller caps it with a `max-width`.
   */
  height?: number | string;
}) {
  return (
    <svg
      /* Cropped to the drawing, with only the few units the moving parts
         travel through left as margin. The first version was laid out in a
         round 240x150 and used two thirds of it, which is invisible while the
         illustration is a 120px strip and turns into a hole between the
         picture and the words the moment it is scaled up to fill a pane. */
      viewBox="0 0 268 168"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden
      style={{ height, width: "100%" }}
    >
      <defs>
        {/* The light behind the desk. Barely there — it exists so the card has
            something to sit on in a flat pane, not so anybody sees a glow. */}
        <radialGradient id="sup-halo" cx="0.42" cy="0.46" r="0.62">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>

        {/* The ticket's face: a tint that deepens downward, so the card reads
            as a lit surface rather than a flat swatch. */}
        <linearGradient id="sup-face" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.20" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.10" />
        </linearGradient>

        {/* The notch every ticket is torn along.
        
            Cut out of the card with a mask rather than covered by two circles
            painted in a background colour — the drawing sits on the thread's
            canvas in one place and on the wizard's band in another, and a
            circle painted `--muted` is only ever right on one of them. A mask
            takes the fill away and lets whatever is actually behind show
            through, which is right on both. */}
        <mask id="sup-notch">
          <rect x="16" y="26" width="152" height="116" rx="13" fill="#fff" />
          <circle cx="16" cy="84" r="8" fill="#000" />
          <circle cx="168" cy="84" r="8" fill="#000" />
        </mask>
      </defs>

      <rect x="0" y="0" width="268" height="168" fill="url(#sup-halo)" />

      {/* ── The ticket ───────────────────────────────────────────────────
          Painted twice: an opaque card first, the accent wash over it.
      
          Every surface in this drawing was a tint — 10 to 20 percent of one
          blue — which is fine on a plain ground and wrong on a patterned one.
          The moment the band behind it got a grid you could see, the grid came
          straight through the ticket: the object stopped being an object and
          became a window onto the wallpaper. The wash still does all the
          colouring; it simply has something behind it now. */}
      <g mask="url(#sup-notch)">
        <rect x="16" y="26" width="152" height="116" rx="13" className="fill-card" />
        <rect x="16" y="26" width="152" height="116" rx="13" fill="url(#sup-face)" />
        <rect
          x="16.9"
          y="26.9"
          width="150.2"
          height="114.2"
          rx="12.1"
          stroke={ACCENT}
          strokeOpacity="0.34"
          strokeWidth="1.8"
        />
      </g>

      {/* The head of it: a category dot, the subject, and a reference. The
          shape of a ticket at the size where only the shape survives. */}
      <circle cx="34" cy="47" r="5" fill={ACCENT} fillOpacity="0.85" />
      <rect x="45" y="42.5" width="66" height="9" rx="4.5" fill={ACCENT} fillOpacity="0.55" />
      <rect x="122" y="42.5" width="28" height="9" rx="4.5" fill={ACCENT} fillOpacity="0.22" />

      <path d="M28 64h128" stroke={ACCENT} strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" />

      {/* What was written on it. Falling opacity down the paragraph, the way
          the ID card's fields run. */}
      <g fill={ACCENT}>
        <rect x="28" y="76" width="112" height="8" rx="4" fillOpacity="0.30" />
        <rect x="28" y="90" width="86" height="8" rx="4" fillOpacity="0.22" />
        <rect x="28" y="104" width="98" height="8" rx="4" fillOpacity="0.22" />
      </g>

      {/* The two files that came with it. Chips rather than more bars, because
          an attachment is the one thing on a ticket that is not prose. */}
      <g>
        <rect x="122" y="120" width="34" height="13" rx="6.5" fill={ACCENT} fillOpacity="0.16" />
        <circle cx="130" cy="126.5" r="2.6" fill={ACCENT} fillOpacity="0.5" />
        <rect x="136" y="123.5" width="14" height="6" rx="3" fill={ACCENT} fillOpacity="0.32" />
      </g>

      {/* ── The answer, and the person who wrote it ─────────────────────
          Clear of the ticket's right notch on purpose. An earlier version
          overlapped the two by forty units, which put the bubble's tail
          straight through the tear line and read as a mistake rather than as
          depth. */}
      <g>
        {/* Drawn at the size it is, never scaled to it. The first version
            reused a 170-wide bubble under `scale(0.62 1)`, which squashed the
            corner radii into ovals and — because a transform scales geometry,
            not the box it was laid out in — pushed the right edge fifteen
            units past the viewBox, cutting the bubble in half. */}
        {/* The same two coats the ticket gets, for the same reason. */}
        <path
          d="M12 0h50a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H26l-12 10V62h-2A12 12 0 0 1 0 50V12A12 12 0 0 1 12 0Z"
          transform="translate(186 22)"
          className="fill-card"
        />
        <path
          d="M12 0h50a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H26l-12 10V62h-2A12 12 0 0 1 0 50V12A12 12 0 0 1 12 0Z"
          transform="translate(186 22)"
          fill={ACCENT}
          fillOpacity="0.16"
          stroke={ACCENT}
          strokeOpacity="0.46"
          strokeWidth="1.8"
        />
        <g fill={ACCENT}>
          <rect x="202" y="40" width="44" height="8" rx="4" fillOpacity="0.55" />
          <rect x="202" y="54" width="30" height="8" rx="4" fillOpacity="0.34" />
        </g>

        {/* The agent. The same head-and-shoulders the ID card's portrait is
            drawn with, at a twelfth of the size — this desk has a person on
            it, and that is the entire claim the empty screen is making. */}
        <g transform="translate(188 20)">
          <circle cx="0" cy="0" r="11" fill={ACCENT} fillOpacity="0.9" />
          <circle cx="0" cy="-2.6" r="3.6" fill="#fff" fillOpacity="0.95" />
          <path d="M-6 6.4c0-3.5 2.7-5.6 6-5.6s6 2.1 6 5.6z" fill="#fff" fillOpacity="0.95" />
        </g>
      </g>

      {/* ── The one that is still being written ──────────────────────────
          Neutral, not accent: everything else here is the platform speaking,
          and this is the only part that is still in progress. It arrives
          first in the loop — somebody types, then the answer is there. */}
      <g transform="translate(180 96)" className="text-foreground">
        <motion.g
          initial={false}
          animate={{ opacity: [0, 1, 1, 0.9, 0], y: [7, 0, 0, 0, -4] }}
          transition={{
            duration: LOOP,
            repeat: Infinity,
            ease: "easeOut",
            times: [0, 0.1, 0.4, 0.56, 0.66],
          }}
        >
          <path
            d="M10 0h50a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H24l-11 9v-9h-3a10 10 0 0 1-10-10V10A10 10 0 0 1 10 0Z"
            className="fill-card"
            stroke="currentColor"
            strokeOpacity="0.26"
            strokeWidth="1.7"
          />
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx={21 + i * 14}
              cy="20"
              r="3.4"
              fill="currentColor"
              fillOpacity="0.4"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
            />
          ))}
        </motion.g>
      </g>

      {/* ── How it ends ─────────────────────────────────────────────────
          The drawing showed a ticket being answered and stopped there, which
          is half of what this desk does. The other half — and the half worth
          promising on an empty screen — is that the thing gets looked at, and
          then gets closed.

          Two of the product's own pills, not drawings of them: the same
          `--attention-solid` and `--verified-solid` grounds the real ones use,
          the same white disc, and the actual lucide glyphs, dropped in as
          nested `<svg>`s so they are the icons rather than hand-traced ticks.

          They sit on the ticket's own footer row, inside the card. Hanging the
          stamp over the border was meant to read as a stamp and read as a
          clipping bug, which is what an overlap always reads as when the thing
          overlapped is a rounded corner. */}
      {/* Three, not two. A ticket is raised, looked at, and closed, and the
          drawing was starting at the second of those — so the one state
          everybody arriving on this screen is actually about to be in was the
          one state it never showed. Each holds long enough to be read at the
          size the wizard's band draws them. */}
      <Stamp
        label="Open"
        width={52}
        icon={CircleDot}
        tone="text-sky-600 dark:text-[hsl(202_42%_38%)]"
        times={[0, 0.05, 0.28, 0.34, 1]}
        opacity={[0, 1, 1, 0, 0]}
        shift={[6, 0, 0, -4, -4]}
      />
      <Stamp
        label="Investigating"
        width={88}
        icon={Search}
        tone="text-attention-solid"
        times={[0, 0.32, 0.4, 0.6, 0.66]}
        opacity={[0, 0, 1, 1, 0]}
        shift={[6, 6, 0, 0, -4]}
      />
      <Stamp
        label="Resolved"
        width={66}
        icon={CheckCheck}
        tone="text-verified-solid"
        times={[0, 0.64, 0.72, 0.95, 1]}
        opacity={[0, 0, 1, 1, 0]}
        shift={[6, 6, 0, 0, -4]}
      />
    </svg>
  );
});

export default SupportIllustration;
