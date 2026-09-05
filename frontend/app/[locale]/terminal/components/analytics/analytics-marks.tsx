"use client";

/**
 * The four marks on the analytics summary band.
 *
 * The same drawn-3D set the transactions strip uses, extended — same palette,
 * same light, same `Paint` and `Contact` out of ../modals/account/
 * transaction-marks, so the two summary bands in this product are lit from one
 * direction by one lamp. Two files each declaring their own gradients is how
 * two halves of a product end up looking like two products.
 *
 * The rules that make them read as objects are that file's; they are followed
 * here rather than restated:
 *
 * 1. One light, top left. Highlights on upper surfaces, core shadow toward the
 *    bottom right.
 * 2. A top face on anything box-shaped — the cue that does most of the work.
 * 3. A rim light along the lower edge, bounce off the ground.
 * 4. Spheres and cylinders are radial, not flat.
 * 5. A contact shadow, because things that touch the ground are things.
 *
 * Amber is the accent and never the object: it colours the thing each tile is
 * reporting — the trades, the top coin, the won share, the needle — and
 * nothing else. No third hue anywhere.
 *
 * Gradient ids come from `useId` per instance, so four marks on one row cannot
 * capture each other's fills.
 */

import { memo, useId } from "react";
import {
  Contact,
  DEEP,
  NIGHT,
  Paint,
  SAND,
  SAND_DEEP,
  SAND_LIT,
  SKY,
  frame,
} from "../modals/account/transaction-marks";

/**
 * A chunky arrow with a bevel, pointing up or down.
 *
 * Drawn twice: the full shape in the deep amber, then the same shape inset and
 * lifted toward the light. That leaves a band of shadow down the right and
 * bottom edges, which is what gives a flat polygon a thickness — the same
 * construction the deposit and withdrawal arrows use.
 */
const Arrow = memo(function Arrow({
  id,
  cx,
  up,
}: {
  id: string;
  cx: number;
  up?: boolean;
}) {
  const d = up
    ? `M${cx - 3.6} 32V20.5H${cx - 8.4}L${cx} 10l8.4 10.5h-4.8V32z`
    : `M${cx - 3.6} 10v11.5H${cx - 8.4}L${cx} 32l8.4-10.5h-4.8V10z`;
  return (
    <g>
      <path d={d} fill={SAND_DEEP} stroke={SAND_DEEP} strokeWidth="3.2" strokeLinejoin="round" />
      <path
        d={d}
        fill={`url(#${id}-sand)`}
        stroke={`url(#${id}-sand)`}
        strokeWidth="2.4"
        strokeLinejoin="round"
        transform={`translate(${cx - 0.6} 20.4) scale(0.88) translate(${-cx} -21)`}
      />
    </g>
  );
});

/**
 * Total trades: two arrows passing.
 *
 * A trade is an exchange before it is a number, and two arrows crossing is the
 * only picture of that which survives at 36px. They stand on the same plinth
 * so the pair reads as one object rather than as two icons that happen to be
 * side by side.
 */
export const TradesMark = memo(function TradesMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={40} rx={15} ry={2.5} />

      <rect x="7" y="33.5" width="34" height="6.4" rx="3.2" fill={`url(#${id}-deep)`} />
      <rect x="9" y="34" width="30" height="2.2" rx="1.1" fill={`url(#${id}-top)`} opacity="0.75" />

      <Arrow id={id} cx={15} up />
      <Arrow id={id} cx={33} />
    </svg>
  );
});

/**
 * Net P&L: a stack of coins, the top one amber.
 *
 * A cylinder is an ellipse for the face, a rectangle for the wall and a second
 * ellipse hidden under it — the face catching the light is what stops a stack
 * of discs reading as three flat rings. Amber only on top: the net is the
 * figure this tile reports, and the ones under it are the account it sits on.
 */
export const PnlMark = memo(function PnlMark({ size = 38 }: { size?: number }) {
  const id = useId();
  const coin = (cy: number, face: string, wall: string, lit: boolean) => (
    <g>
      <path d={`M9 ${cy}v5.4a15 5.4 0 0 0 30 0V${cy}z`} fill={wall} />
      <ellipse cx="24" cy={cy} rx="15" ry="5.4" fill={face} />
      {lit && (
        <ellipse
          cx="19"
          cy={cy - 1.2}
          rx="6.4"
          ry="2.2"
          fill={`url(#${id}-spec)`}
          opacity="0.7"
          transform={`rotate(-12 19 ${cy - 1.2})`}
        />
      )}
    </g>
  );
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={41} rx={15} ry={2.6} />

      {coin(33, `url(#${id}-top)`, `url(#${id}-deep)`, false)}
      {coin(25.5, `url(#${id}-top)`, `url(#${id}-body)`, false)}
      {coin(18, `url(#${id}-sand)`, SAND_DEEP, true)}
      {/* The rim of the top coin, where the ground throws light back up. */}
      <ellipse
        cx="24"
        cy="18"
        rx="14.2"
        ry="4.9"
        fill="none"
        stroke={SAND_LIT}
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />
    </svg>
  );
});

/**
 * Win rate: a ring with the won share filled.
 *
 * The one mark in the set that is a chart rather than an object, because the
 * figure it carries is a share of a whole and a share of a whole has exactly
 * one honest picture. It is still built like the others: a body ramp for the
 * ring, amber for the part being reported, a highlight along the top-left
 * where the light is, and a shadow on the ground.
 */
export const WinRateMark = memo(function WinRateMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={41.5} rx={13} ry={2.3} />

      {/* The ring's own shadow, cast down and right onto nothing in
          particular — enough to lift it off the card. */}
      <circle cx="25" cy="24.6" r="13" fill="none" stroke={NIGHT} strokeOpacity="0.32" strokeWidth="9" filter={`url(#${id}-soft)`} />
      <circle cx="24" cy="23.5" r="13" fill="none" stroke={`url(#${id}-body)`} strokeWidth="9" />
      {/* The won share: from twelve o'clock, clockwise. */}
      <path
        d="M24 10.5A13 13 0 1 1 19.6 35.7"
        fill="none"
        stroke={`url(#${id}-sand)`}
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* Light along the top-left shoulder of the ring, on both materials. */}
      <path
        d="M13.4 16A13 13 0 0 1 24 10.5"
        fill="none"
        stroke={SAND_LIT}
        strokeOpacity="0.45"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M31.6 12.4A13 13 0 0 1 36.6 19"
        fill="none"
        stroke={SKY}
        strokeOpacity="0.5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
});

/**
 * Profit factor: a dial with its needle past the mark.
 *
 * A factor is a reading against a threshold — 1.00 is break-even and the whole
 * question is which side of it you are on — so the picture is a gauge, with
 * the amber sweep running from the left up to where the needle stands.
 */
export const FactorMark = memo(function FactorMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={39.5} rx={14} ry={2.4} />

      <rect x="9" y="32.5" width="30" height="6.2" rx="3.1" fill={`url(#${id}-deep)`} />
      <rect x="11" y="33" width="26" height="2.2" rx="1.1" fill={`url(#${id}-top)`} opacity="0.75" />

      {/* The face: a thick half-ring, dark side first so the amber sweep sits
          on top of it rather than beside it. */}
      <path d="M9 31A15 15 0 0 1 39 31" fill="none" stroke={`url(#${id}-body)`} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M9 31A15 15 0 0 1 27.6 16.4" fill="none" stroke={`url(#${id}-sand)`} strokeWidth="7.5" strokeLinecap="round" />
      {/* Bounce along the inside of the arc. */}
      <path d="M12.8 24.6A15 15 0 0 1 22 17.2" fill="none" stroke={SAND_LIT} strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />

      {/* The needle, bevelled the way the arrows are: a dark base and a lit
          face inset from it. */}
      <path d="M24 31L21.8 28.4 30 17.4l2.6 2z" fill={SAND_DEEP} />
      <path d="M24 30.2l-1.4-1.7 7.6-9.8 1.5 1.2z" fill={SAND_LIT} opacity="0.9" />

      <circle cx="24" cy="31" r="4.2" fill={`url(#${id}-deep)`} />
      <circle cx="22.9" cy="29.9" r="1.4" fill={SKY} opacity="0.55" />
      <circle cx="24" cy="31" r="4.2" fill="none" stroke={DEEP} strokeOpacity="0.6" strokeWidth="0.8" />
      <ellipse cx="21" cy="27" rx="3.4" ry="2" fill={`url(#${id}-spec)`} opacity="0.5" transform="rotate(-24 21 27)" />
      <rect x="9" y="30" width="30" height="2" rx="1" fill={SAND} opacity="0" />
    </svg>
  );
});
