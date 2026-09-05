"use client";

/**
 * The four marks on the transactions summary strip.
 *
 * Drawn, not rendered. These are a rendition of a 3D icon set in the same
 * spirit as `AuthenticatorMark` on the Security page: I do not have the source
 * files, and vectors have the better properties for what this strip needs
 * anyway. Nothing to load, no second set for the light theme, and they stay
 * sharp at any size on any display, which a 40px bitmap of a render does not.
 *
 * If the real assets turn up, they are a drop-in: export the same four names
 * from here wrapping an `<img>`, and the strip does not change.
 *
 * ── The blue is the site's blue ────────────────────────────────────────────
 *
 * `BRAND` is `#2563EB`, which is `--brand` — `221 83% 53%`, the same value in
 * light, dark and navy, and the colour of every primary button in the product.
 * The first version of these marks was drawn in a sampled sky blue that was
 * close to it and not it, which is the worst of both: near enough to look like
 * the brand colour, far enough that a mark beside a primary button reads as a
 * near-miss. Everything else on the ramp is from the same Tailwind blue scale
 * that token comes from, so the marks are lit and shaded versions of the
 * site's own colour rather than a second blue.
 *
 * ── What makes them read as objects ────────────────────────────────────────
 *
 * Five things, and together they are the whole difference between this and a
 * flat shape with a gradient on it:
 *
 * 1. **One light, top left, on every mark.** Highlights on upper surfaces,
 *    core shadow toward the bottom right. Two objects lit from two directions
 *    is what makes a hand-drawn set look like unrelated drawings.
 * 2. **A top face.** A wallet, a plinth and an hourglass cap are all boxes
 *    seen slightly from above, so each gets a distinct lighter band across its
 *    top surface. This is the cue that does most of the work.
 * 3. **A rim light along the lower edge.** Bounce off the ground, strongest
 *    under the bottom-right corner. Without it a shaded edge just looks dirty;
 *    with it the form turns.
 * 4. **Spheres are radial, not flat.** An off-centre radial plus a soft
 *    specular is a ball; a circle in a linear gradient is a sticker.
 * 5. **A contact shadow.** Things that touch the ground are things. It is a
 *    deep navy at low alpha, so it grounds the mark on the light theme and
 *    disappears politely into a near-black card on the dark one.
 *
 * Amber is the accent and never the object: it colours the arrow, the sand and
 * the weight — the fact each tile is reporting — and nothing else. No third
 * hue appears anywhere.
 *
 * Gradient and filter ids are per instance via `useId`, so two marks on one
 * screen cannot capture each other's fills — a real failure mode with `<defs>`
 * in React, and an invisible one until the second instance renders grey.
 */

import { memo, useId } from "react";

/* The site's blue, and the rest of its own scale. `BRAND` is `--brand`
   (221 83% 53%) resolved; the others are the Tailwind blues either side of it,
   which is where that token comes from. */
export const SKY = "#93C5FD";
export const LIT = "#60A5FA";
export const BLUE = "#3B82F6";
export const BRAND = "#2563EB";
export const SHADE = "#1D4ED8";
export const DEEP = "#1E3A8A";
/* Occlusion and contact shadow. Blue-black rather than black: a neutral
   shadow under a blue object is a smudge, and a true black on the dark
   theme's card is a hole in the drawing. */
export const NIGHT = "#172554";

/* The cards in the wallet. Slate rather than grey — the blue-tinted neutral
   belongs beside this ramp, and the two are far enough apart in value to read
   as two cards at 38px rather than as one slab. */
export const CARD_LIT = "#64748B";
export const CARD_DIM = "#334155";

export const SAND_LIT = "#FCD34D";
export const SAND = "#F59E0B";
export const SAND_DEEP = "#B45309";

/**
 * Every ramp, highlight and filter the marks are built from.
 *
 * Exported, along with the palette and `Contact`, because the analytics
 * dashboard draws its own four marks in this set's idiom — see
 * ../../analytics/analytics-marks. One light source, one ramp, one shadow: two
 * files each declaring their own is how two halves of a product end up lit
 * from two directions.
 *
 * One block rather than per-mark defs: they all share a light source, so they
 * should share the gradients that describe it. A mark that needs its own is a
 * mark that has drifted out of the set.
 */
export const Paint = memo(function Paint({ id }: { id: string }) {
  return (
    <defs>
      {/* The body roll: lit face, the site's blue through the middle, core
          shadow where the form turns away. Three stops, not two — a two-stop
          ramp reads as a flat panel with a gradient on it. */}
      <linearGradient id={`${id}-body`} x1="0.12" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor={LIT} />
        <stop offset="0.42" stopColor={BRAND} />
        <stop offset="1" stopColor={DEEP} />
      </linearGradient>
      {/* The surface you see because you are above the object. */}
      <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor={SKY} />
        <stop offset="1" stopColor={BLUE} />
      </linearGradient>
      {/* Anything in the body's shadow: straps, plinths, undersides. */}
      <linearGradient id={`${id}-deep`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor={SHADE} />
        <stop offset="1" stopColor={NIGHT} />
      </linearGradient>
      {/* Bounce off the ground: nothing along the top, brightest under the
          bottom-right corner, which is where a floor throws light back. */}
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0.45" stopColor={SKY} stopOpacity="0" />
        <stop offset="1" stopColor={SKY} stopOpacity="0.75" />
      </linearGradient>
      <linearGradient id={`${id}-sand`} x1="0.15" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor={SAND_LIT} />
        <stop offset="0.45" stopColor={SAND} />
        <stop offset="1" stopColor={SAND_DEEP} />
      </linearGradient>
      <linearGradient id={`${id}-card`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor={CARD_LIT} />
        <stop offset="1" stopColor={CARD_DIM} />
      </linearGradient>
      {/* The glass. Barely there, and brighter at the shoulders than at the
          waist, so it reads as something the sand is inside of. */}
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0" stopColor={SKY} stopOpacity="0.5" />
        <stop offset="0.5" stopColor={LIT} stopOpacity="0.2" />
        <stop offset="1" stopColor={SKY} stopOpacity="0.4" />
      </linearGradient>

      {/* Balls. Off-centre toward the light, with the darkest value at the far
          rim rather than evenly round the edge — that difference is the whole
          reason a sphere looks round. */}
      <radialGradient id={`${id}-ballSand`} cx="0.34" cy="0.3" r="0.82">
        <stop offset="0" stopColor="#FEF3C7" />
        <stop offset="0.35" stopColor={SAND_LIT} />
        <stop offset="0.75" stopColor={SAND} />
        <stop offset="1" stopColor={SAND_DEEP} />
      </radialGradient>
      <radialGradient id={`${id}-ballBlue`} cx="0.34" cy="0.3" r="0.82">
        <stop offset="0" stopColor={SKY} />
        <stop offset="0.45" stopColor={BLUE} />
        <stop offset="1" stopColor={DEEP} />
      </radialGradient>
      {/* The specular: a soft blob, not a dot. A hard white circle on a matte
          body is a hole punched in it. */}
      <radialGradient id={`${id}-spec`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.62" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>

      <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="1.5" />
      </filter>
    </defs>
  );
});

export const frame = {
  viewBox: "0 0 48 48",
  fill: "none" as const,
  "aria-hidden": true as const,
};

/** The ground the object stands on. Always first, always under everything. */
export const Contact = memo(function Contact({
  id,
  cx,
  cy,
  rx,
  ry = 2.6,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
}) {
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={NIGHT} opacity="0.3" filter={`url(#${id}-soft)`} />
  );
});

/**
 * The wallet both money marks are built on.
 *
 * Two cards fanned behind it, a body with its top surface catching the light
 * and the ground bouncing back off the lower edge, and the strap hooked over
 * the right side with its own shadow under it. The arrow is the caller's,
 * drawn last so it passes in front of everything.
 */
const Wallet = memo(function Wallet({ id }: { id: string }) {
  return (
    <>
      <Contact id={id} cx={21} cy={40.5} rx={16} />

      <rect x="14" y="5" width="17" height="17" rx="2.6" fill={CARD_DIM} transform="rotate(6 22.5 13.5)" />
      <rect x="8" y="7" width="17" height="16" rx="2.6" fill={`url(#${id}-card)`} transform="rotate(-8 16.5 15)" />

      <rect x="4" y="15" width="34" height="24" rx="6" fill={`url(#${id}-body)`} />
      {/* The fold, seen from above. The one shape that says "wallet" rather
          than "blue box" at this size. */}
      <path d="M4 21.5V21a6 6 0 0 1 6-6h22a6 6 0 0 1 6 6v.5z" fill={`url(#${id}-top)`} />
      {/* Bounce off the ground, around the lower edge only. */}
      <rect
        x="4.8"
        y="15.8"
        width="32.4"
        height="22.4"
        rx="5.2"
        fill="none"
        stroke={`url(#${id}-rim)`}
        strokeWidth="1.6"
      />
      {/* Held back from the full specular the spheres get. A gloss that size
          on a flat panel stops reading as light on a surface and starts
          reading as a white smear painted onto it. */}
      <ellipse cx="13" cy="25.5" rx="7" ry="3.4" fill={`url(#${id}-spec)`} opacity="0.6" />

      {/* The strap sits on top of the body, so it casts onto it. */}
      <rect
        x="26"
        y="24.8"
        width="13"
        height="10"
        rx="3.2"
        fill={NIGHT}
        opacity="0.45"
        filter={`url(#${id}-soft)`}
      />
      <rect x="27" y="24" width="12" height="9.6" rx="3.1" fill={`url(#${id}-deep)`} />
      <rect x="28.6" y="25.3" width="8.8" height="1.7" rx="0.85" fill={SKY} opacity="0.4" />
    </>
  );
});

/**
 * A chunky arrow, pointing down for money in and up for money out.
 *
 * Drawn twice: the full shape in the deep amber, then the same shape inset and
 * lifted toward the light in the bright ramp. That leaves a bevel of shadow
 * down the right and bottom edges, which is what gives a flat polygon a
 * thickness. Both are stroked in their own paint with a round join — that is
 * how a seven-point polygon ends up as cushioned as the rectangles around it
 * without hand-placing fourteen arcs.
 */
const Arrow = memo(function Arrow({ id, up }: { id: string; up?: boolean }) {
  const d = up ? "M34.5 23V14H30L38 3l8 11h-4.5v9z" : "M34.5 3v9H30l8 11 8-11h-4.5V3z";
  return (
    <g>
      <path d={d} fill={SAND_DEEP} stroke={SAND_DEEP} strokeWidth="3.4" strokeLinejoin="round" />
      <path
        d={d}
        fill={`url(#${id}-sand)`}
        stroke={`url(#${id}-sand)`}
        strokeWidth="2.6"
        strokeLinejoin="round"
        transform="translate(37.4 12.6) scale(0.88) translate(-38 -13)"
      />
    </g>
  );
});

/** Money in: the arrow drops into the wallet. */
export const DepositMark = memo(function DepositMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Wallet id={id} />
      <Arrow id={id} />
    </svg>
  );
});

/** Money out: the same wallet, the arrow leaving it. */
export const WithdrawMark = memo(function WithdrawMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Wallet id={id} />
      <Arrow id={id} up />
    </svg>
  );
});

/**
 * Net flow: a balance, tipped.
 *
 * Deliberately not a third arrow. The two tiles either side of this one are
 * arrows already, and a row of three arrows makes the reader work out which
 * direction means what; a beam off level says "more on one side than the
 * other", which is the whole content of the tile.
 *
 * It tips the way weight actually tips a beam — the amber side is the side
 * that went *down*. An earlier version had the weight riding the raised end,
 * which is a picture of the opposite of what the tile means.
 */
export const NetFlowMark = memo(function NetFlowMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={39.5} rx={13} ry={2.4} />

      {/* Plinth: a slab with its top surface catching the light. */}
      <rect x="11" y="33" width="26" height="6.2" rx="3.1" fill={`url(#${id}-deep)`} />
      <rect x="12.5" y="33.4" width="23" height="2.2" rx="1.1" fill={`url(#${id}-top)`} opacity="0.75" />

      {/* The column, in two faces. One flat triangle is a triangle; a lit face
          and a shaded face meeting on the centre line is a column. */}
      <path
        d="M24 17.5L33 34H15z"
        fill={`url(#${id}-body)`}
        stroke={`url(#${id}-body)`}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M24 17.5L33 34H24z" fill={NIGHT} opacity="0.22" />

      <g transform="rotate(-9 24 16)">
        <rect x="4" y="13.2" width="40" height="5.6" rx="2.8" fill={`url(#${id}-body)`} />
        <rect x="6.5" y="14.1" width="35" height="1.7" rx="0.85" fill={SKY} opacity="0.45" />
      </g>
      {/* The pivot, over the joint the beam and the column make. */}
      <circle cx="24" cy="16.2" r="3.4" fill={`url(#${id}-deep)`} />
      <circle cx="23.1" cy="15.3" r="1.2" fill={SKY} opacity="0.5" />

      {/* The weight, on the end that went down. */}
      <circle cx="9.6" cy="11.4" r="6.3" fill={`url(#${id}-ballSand)`} />
      <ellipse cx="7.6" cy="9" rx="2.5" ry="1.8" fill={`url(#${id}-spec)`} transform="rotate(-30 7.6 9)" />
      <circle cx="40" cy="7.2" r="4.8" fill={`url(#${id}-ballBlue)`} />
      <ellipse cx="38.5" cy="5.6" rx="1.9" ry="1.3" fill={`url(#${id}-spec)`} transform="rotate(-30 38.5 5.6)" />
    </svg>
  );
});

/**
 * Pending: an hourglass with the sand still running.
 *
 * The glass is a translucent bowtie with a highlight running its length, so
 * the sand reads as being inside something rather than floating between two
 * blue bars. The stream is drawn even at rest — an hourglass with no stream is
 * an hourglass that has finished, which is the opposite of what this tile says
 * when it is not greyed out.
 *
 * It is drawn wider than its natural proportions on purpose. At true
 * proportions it is a sliver beside two 34px wallets, and a row of four only
 * reads as a row when the four carry the same weight in it.
 */
export const PendingMark = memo(function PendingMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={43.5} rx={14} ry={2.2} />

      <path d="M14 11h20L24 24l10 13H14L24 24z" fill={`url(#${id}-glass)`} />
      {/* The highlight down the left wall, following the pinch. */}
      <path d="M17 12h2.6L22.8 24 19.6 36H17l3.2-12z" fill="#ffffff" opacity="0.28" />

      <path
        d="M17.5 15h13L24 23.5z"
        fill={`url(#${id}-sand)`}
        stroke={`url(#${id}-sand)`}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* The surface of the sand, which is flat and catches the light. */}
      <rect x="17.4" y="14.4" width="13.2" height="1.9" rx="0.95" fill={SAND_LIT} />
      <rect x="22.9" y="22" width="2.2" height="10.6" rx="1.1" fill={SAND} />
      <path d="M16.5 35.4q7.5-10.4 15 0z" fill={`url(#${id}-sand)`} />
      <path d="M19 32.6q5-4.4 10 0-5-2.4-10 0z" fill={SAND_LIT} opacity="0.65" />

      {/* Caps: the top one lit, the bottom one in the object's own shadow. */}
      <rect x="9" y="4" width="30" height="7" rx="3.5" fill={`url(#${id}-body)`} />
      <rect x="11" y="4.8" width="26" height="2.2" rx="1.1" fill={`url(#${id}-top)`} />
      {/* The bottom cap is the same body as the top, darkened — not the deep
          ramp. Drawn in `deep` outright it was nearly navy against a lit top
          cap, which reads as two different objects with a glass between them
          rather than as one hourglass standing in its own shadow. */}
      <rect x="9" y="36" width="30" height="7" rx="3.5" fill={`url(#${id}-body)`} />
      <rect x="9" y="36" width="30" height="7" rx="3.5" fill={NIGHT} opacity="0.28" />
      <rect x="11" y="36.7" width="26" height="2" rx="1" fill={`url(#${id}-top)`} opacity="0.55" />
    </svg>
  );
});
