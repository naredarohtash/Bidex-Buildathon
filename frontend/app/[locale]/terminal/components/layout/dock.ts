/**
 * The docked column beside the icon rail.
 *
 * The ranking and the settings both live here — full height, a flex sibling of
 * the chart, so opening one moves the chart across rather than covering it.
 * Only one is ever open at a time.
 */

/**
 * The ranking's width. It is a list of names and figures — 320px is as much as
 * that needs, and more would only stretch the gap between a name and its score.
 */
export const DOCK_WIDTH = 320;

/**
 * The width a monitor is worth.
 *
 * 320px of 11px type is right on a 14" laptop and small enough to squint at on
 * a 27" one, so the board's type steps up above 1536px — see the `2xl:` sizes
 * through `leaderboard.tsx`. Bigger type in the same column would only spend
 * the extra width on truncating names, so the column steps up with it.
 *
 * 1536px is Tailwind's own `2xl`, and it is the breakpoint because of where the
 * machines fall either side of it: a 14" MacBook Pro is 1512 logical pixels and
 * a 13" is 1440, so both stay on the small scale; an external 1080p or 1440p
 * display is 1920 or 2560 and takes the large one. The classes and this
 * constant have to agree on that number, so anything reading it should use
 * `LARGE_SCREEN` rather than write the query out again.
 */
export const DOCK_WIDTH_WIDE = 380;

/** @see DOCK_WIDTH_WIDE — this is Tailwind's `2xl`, spelled as a query. */
export const LARGE_SCREEN = "(min-width: 1536px)";

/**
 * The settings' width.
 *
 * Briefly 384, on the theory that a row of four preset chips needed the room.
 * It did not: what looked cramped was the boxes — controls with too little
 * padding, sitting on the same flat black as the column behind them — and
 * widening the column just made the same thin controls longer. Fixing the
 * controls fixed it, so this is back to matching the ranking.
 *
 * Kept as its own constant rather than folded back into `DOCK_WIDTH`, because
 * the two panels only happen to agree; they are not the same measurement.
 */
export const SETTINGS_DOCK_WIDTH = 320;

/**
 * The sheet the settings sit on.
 *
 * `bg-background`, the same as the ranking column beside it and the order panel
 * across the chart. It was briefly raised (`muted/60`) to give the controls
 * something to be recessed into, which worked on its own terms and made the
 * settings the one panel in the terminal that was a different colour from every
 * other panel — visible the moment both were open.
 *
 * The contrast the raise was buying is made *inside* the panel instead: a card
 * steps up from this, and a control steps back down to it. See the surface
 * block in `settings-controls.tsx`.
 */
export const SETTINGS_PANEL_SURFACE = "bg-background";

/* Support was a third occupant of this dock, at 360px. It is a full-screen
   workspace now — a ticket thread cannot be had in a column that narrow. See
   ../support/support-overlay for what was wrong with it. */
export type DockPanel = "ranking" | "settings";

/**
 * The width the dock takes for whichever panel is in it.
 *
 * Only the ranking widens on a large display: it is the panel whose type grew,
 * and the settings are laid out to their own contents rather than to a list
 * that wants the room.
 */
export function dockWidthFor(panel: DockPanel | null, wide = false): number {
  if (panel === "settings") return SETTINGS_DOCK_WIDTH;
  return wide ? DOCK_WIDTH_WIDE : DOCK_WIDTH;
}

/**
 * Written inline, never as `transition-[width] duration-300`, because **no
 * Tailwind transition utility works in this app**: `styles/theme.css` carries
 *
 *     * { transition: background-color .3s ease, border-color .3s ease, color .2s ease; }
 *
 * and globals.css `@import`s it outside any layer, so it beats every utility in
 * Tailwind's `@layer utilities` — the shorthand resets `transition-property` to
 * those three and nothing else animates. An inline style is the one thing that
 * outranks it. The colour transitions are repeated here so a docked column
 * still cross-fades with the rest of the terminal when the theme changes.
 *
 * The header band above the dock and the asset tabs' left inset use the same
 * string: they only move as one if they agree on the distance and the curve.
 */
export const DOCK_TRANSITION =
  "width 300ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, border-color 0.3s ease, color 0.2s ease";
