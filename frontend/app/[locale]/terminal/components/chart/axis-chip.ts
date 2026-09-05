/**
 * The two chips at the ends of the crosshair.
 *
 * One rides the price axis on the right, one the time axis along the bottom.
 * They are opposite ends of the same instrument, and they were styled by two
 * different hands: both hardcoded `#0c0d14` with `text-white`, one bordered in
 * zinc-800 and the other in `#0052ff`/45. That is a black box with white text on
 * every theme — including light, where the chart is white and the chip is the
 * darkest thing on screen — and it matches nothing else in the terminal.
 *
 * This is the terminal's own card, the same recipe the order panel wraps the
 * positions list in and the settings panel uses for its sections, at chip
 * scale. It follows the theme, and a readout pinned to the chart now looks like
 * it belongs to the same product as the panel beside it.
 *
 * Height and radius stay 19px/5px: the time chip has to fill the axis strip
 * exactly, and the price chip has to line up with it.
 */
export const AXIS_CHIP =
  "h-[19px] rounded-[5px] border text-foreground text-[10px] font-semibold tabular-nums leading-none whitespace-nowrap shadow-sm " +
  "bg-zinc-50 border-zinc-300 dark:bg-[#121214] dark:border-zinc-800 navy:bg-[#0e1626] navy:border-[#1c2a4a]";

/** The same chip when it is a button. */
export const AXIS_CHIP_INTERACTIVE =
  "hover:bg-zinc-100 dark:hover:bg-[#17171b] navy:hover:bg-[#122036] active:scale-95 cursor-pointer";
