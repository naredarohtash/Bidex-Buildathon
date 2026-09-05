"use client";

/**
 * The six category marks on the new-ticket flow.
 *
 * Drawn in the same set as the transactions summary strip and the analytics
 * band — same `Paint`, same `Contact`, same palette, same light from the top
 * left — because a person opening a ticket about a deposit has already seen a
 * deposit drawn once, in the account section, and it should be the same object.
 * Two of them *are* that drawing: `DepositMark` and `WithdrawMark` are
 * re-exported rather than redrawn.
 *
 * These sit at 38px in a card the reader is choosing between six of, which is
 * why they are drawn objects rather than the 18px lucide glyphs they replace: a
 * hairline diagram at that size in a coloured square is a decoration, and this
 * is the screen where somebody is deciding what their problem *is*.
 *
 * Amber stays the accent and never the object — the tick, the keyhole, the one
 * candle that moved, the question — exactly as in the other two sets.
 */

import { memo, useId } from "react";
import {
  Contact,
  DEEP,
  NIGHT,
  Paint,
  SAND_DEEP,
  SAND_LIT,
  SKY,
  frame,
} from "../modals/account/transaction-marks";

import { DepositMark, WithdrawMark } from "../modals/account/transaction-marks";

export { DepositMark, WithdrawMark };

/**
 * Verification: an identity card with the tick already on it.
 *
 * The card is the object and the seal is the fact, so the card is blue and the
 * seal is amber — and the seal overlaps the card's corner rather than sitting
 * beside it, because a stamp that is not touching the thing it approves is a
 * sticker next to a card.
 */
export const VerifyMark = memo(function VerifyMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={23} cy={41} rx={16} />

      <rect x="4" y="11" width="38" height="27" rx="4.5" fill={`url(#${id}-body)`} />
      {/* The surface you see because you are above it. */}
      <path d="M4 15.5V15.5A4.5 4.5 0 0 1 8.5 11h29a4.5 4.5 0 0 1 4.5 4.5v1H4z" fill={`url(#${id}-top)`} />
      <rect x="4.9" y="11.9" width="36.2" height="25.2" rx="3.7" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.5" />

      {/* The portrait, in its own well. */}
      <rect x="9" y="20" width="14" height="14" rx="3" fill={NIGHT} opacity="0.25" />
      <circle cx="16" cy="25.4" r="3.4" fill={`url(#${id}-ballBlue)`} />
      <path d="M10.6 33.2c0-3.2 2.4-5.1 5.4-5.1s5.4 1.9 5.4 5.1z" fill={`url(#${id}-ballBlue)`} />

      {/* What is written beside it. */}
      <rect x="26" y="21" width="13" height="3" rx="1.5" fill={SKY} opacity="0.55" />
      <rect x="26" y="27" width="9" height="3" rx="1.5" fill={SKY} opacity="0.35" />

      {/* The seal, over the card's corner. */}
      <circle cx="36.5" cy="33.5" r="8.4" fill={NIGHT} opacity="0.35" filter={`url(#${id}-soft)`} />
      <circle cx="36" cy="32.6" r="7.6" fill={`url(#${id}-ballSand)`} />
      <path
        d="M32.6 32.8l2.6 2.6 4.6-5.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

/**
 * Account and security: a shield with a keyhole.
 *
 * The shoulders catch the light and the lower edge picks up the bounce, which
 * is what turns a flat crest into something with a front and a back. The
 * keyhole is amber because the lock is the subject; the shield is only what it
 * is set into.
 */
export const ShieldMark = memo(function ShieldMark({ size = 38 }: { size?: number }) {
  const id = useId();
  const body = "M24 4l17 6.4v11.4c0 9.9-7.4 16.7-17 20.2-9.6-3.5-17-10.3-17-20.2V10.4z";
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={43} rx={13} ry={2.2} />

      <path d={body} fill={`url(#${id}-body)`} />
      {/* The bevel across the shoulders — the face angled toward the light. */}
      <path d="M24 4l17 6.4-17 6.2-17-6.2z" fill={`url(#${id}-top)`} />
      <path
        d="M41 21.8c0 9.9-7.4 16.7-17 20.2"
        fill="none"
        stroke={`url(#${id}-rim)`}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="15" cy="19" rx="4.4" ry="6.4" fill={`url(#${id}-spec)`} opacity="0.5" transform="rotate(-18 15 19)" />

      {/* The lock. */}
      <circle cx="24" cy="21.5" r="4.6" fill={SAND_DEEP} />
      <circle cx="24" cy="21" r="4.2" fill={`url(#${id}-sand)`} />
      <path d="M21.8 24h4.4l1.5 8.4h-7.4z" fill={SAND_DEEP} />
      <path d="M22.3 24.4h3.4l1.2 7.2h-5.8z" fill={`url(#${id}-sand)`} />
      <circle cx="22.6" cy="19.7" r="1.3" fill={SAND_LIT} opacity="0.75" />
    </svg>
  );
});

/**
 * Trading and platform: three candles, the middle one moved.
 *
 * The plinth is the same slab the net-flow mark stands its beam on, so the two
 * read as objects on the same table. Only one candle is amber — the accent
 * names the event, and three amber candles would name nothing.
 */
export const TradingMark = memo(function TradingMark({ size = 38 }: { size?: number }) {
  const id = useId();
  const candle = (x: number, top: number, height: number, wickTop: number, wickBottom: number, amber?: boolean) => (
    <g>
      <rect
        x={x + 3.4}
        y={wickTop}
        width="1.8"
        height={wickBottom - wickTop}
        rx="0.9"
        fill={amber ? SAND_DEEP : DEEP}
        opacity="0.85"
      />
      <rect x={x} y={top} width="8.6" height={height} rx="2" fill={amber ? `url(#${id}-sand)` : `url(#${id}-body)`} />
      <rect x={x + 1.2} y={top + 0.9} width="6.2" height="1.8" rx="0.9" fill={amber ? SAND_LIT : SKY} opacity="0.5" />
    </g>
  );
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={40} rx={16} />

      <rect x="6" y="33.5" width="36" height="6.2" rx="3.1" fill={`url(#${id}-deep)`} />
      <rect x="8" y="34" width="32" height="2.2" rx="1.1" fill={`url(#${id}-top)`} opacity="0.75" />

      {candle(9, 20, 13, 15, 34)}
      {candle(19.7, 11, 22, 7, 34, true)}
      {candle(30.4, 24, 9, 19, 34)}
    </svg>
  );
});

/**
 * Something else: a question, on a ball.
 *
 * The one mark with no object in it, because the category has no object in it
 * either. A sphere rather than a disc — the off-centre radial and the specular
 * are what stop it reading as a flat sticker beside five drawn things.
 */
export const HelpMark = memo(function HelpMark({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} {...frame}>
      <Paint id={id} />
      <Contact id={id} cx={24} cy={42} rx={13} ry={2.3} />

      <circle cx="24" cy="23" r="17" fill={`url(#${id}-ballBlue)`} />
      <ellipse cx="17.5" cy="15.5" rx="6" ry="4" fill={`url(#${id}-spec)`} transform="rotate(-30 17.5 15.5)" />

      {/* Drawn twice, dark under bright, for the same bevel the arrows get. */}
      <g strokeLinecap="round" fill="none">
        <path d="M18.6 18.8a5.6 5.6 0 1 1 6.1 6.6v2.4" stroke={SAND_DEEP} strokeWidth="5" />
        <path d="M18.6 18.8a5.6 5.6 0 1 1 6.1 6.6v2.4" stroke={`url(#${id}-sand)`} strokeWidth="3.4" />
      </g>
      <circle cx="24.7" cy="32.4" r="2.9" fill={SAND_DEEP} />
      <circle cx="24.7" cy="32.2" r="2.3" fill={`url(#${id}-sand)`} />
    </svg>
  );
});

/**
 * Which mark belongs to which category, keyed by the catalog's own ids.
 *
 * Kept here rather than on the category itself: `support-catalog.ts` is the
 * data — six categories, thirty-three topics and the words for them — and a
 * drawing is not data. The chips and tags elsewhere still use the catalog's
 * lucide icon, which is the right thing at 12px where a drawn object is mud.
 */
export const CATEGORY_MARK: Record<string, React.ComponentType<{ size?: number }>> = {
  deposits: DepositMark,
  withdrawals: WithdrawMark,
  verification: VerifyMark,
  account: ShieldMark,
  trading: TradingMark,
  other: HelpMark,
};
