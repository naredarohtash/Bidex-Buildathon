/**
 * One palette for the two cards that float over the chart.
 *
 * The trade confirmation and the early-exit card were each written against a
 * `darkMode` boolean, which the terminal does not actually have: there are three
 * themes, and navy is not dark. Both cards therefore painted themselves
 * `#161923` — a neutral charcoal — on top of a navy terminal whose own cards are
 * `#0e1626` inside `#223966`. Close enough to look like a mistake rather than a
 * choice, which is exactly how it read.
 *
 * The light theme had the opposite problem. The accents were emerald-400 and
 * red-400 in every theme, because they had only ever been checked against a dark
 * one. On the near-white shell those are the two words on the card that carry
 * direction and outcome, rendered in the palest tint available — legible on
 * black, washed out on white. Light gets the 600s, which is what the rest of the
 * light terminal uses for the same meanings.
 *
 * Shared rather than copied, because these two cards have to look like siblings.
 * They are the same gesture at the same anchor with the same buttons, and the
 * last time the same rule lived in two files the two copies drifted.
 */
export type TerminalTheme = "dark" | "light" | "navy";

export interface ConfirmCardPalette {
  /** Card background and border. */
  shell: string;
  /** Secondary lines — expiry, "Invest", the fee. */
  muted: string;
  /** The primary figure. */
  strong: string;
  /** The Cancel button: border, text, hover. */
  cancel: string;
  /** A blocked reason or an error. */
  notice: string;
  /** Gain, call, up. */
  up: string;
  /** Loss, put, down. */
  down: string;
}

const PALETTES: Record<TerminalTheme, ConfirmCardPalette> = {
  navy: {
    shell: "bg-[#0e1626] border-[#223966]",
    muted: "text-slate-400",
    strong: "text-white",
    cancel: "border-[#223966] text-slate-300 hover:bg-[#152238]",
    notice: "bg-amber-950/40 text-amber-300",
    up: "text-emerald-400",
    down: "text-red-400",
  },
  dark: {
    shell: "bg-[#161619] border-[#2a2c34]",
    muted: "text-zinc-400",
    strong: "text-white",
    cancel: "border-[#2a2c34] text-zinc-300 hover:bg-[#1f2027]",
    notice: "bg-amber-950/40 text-amber-300",
    up: "text-emerald-400",
    down: "text-red-400",
  },
  light: {
    shell: "bg-white border-zinc-300",
    muted: "text-zinc-500",
    strong: "text-zinc-900",
    cancel: "border-zinc-300 text-zinc-700 hover:bg-zinc-100",
    notice: "bg-amber-50 text-amber-700",
    // Darker than the dark theme's, not lighter: contrast runs the other way on
    // a white card, and these two words are the ones that must not be missed.
    up: "text-emerald-600",
    down: "text-red-600",
  },
};

export function confirmCardPalette(theme: TerminalTheme | string | undefined): ConfirmCardPalette {
  return PALETTES[(theme as TerminalTheme) in PALETTES ? (theme as TerminalTheme) : "dark"];
}
