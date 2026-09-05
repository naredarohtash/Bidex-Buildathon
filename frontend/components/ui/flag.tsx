"use client";

/**
 * A country's flag, as the flat asset this product ships.
 *
 * Not the emoji. `🇮🇳` is a pair of regional-indicator codepoints and every
 * platform draws it differently — macOS and iOS give it a *waving* flag with a
 * shadow, which next to a row of flat 15×11 rectangles in the sessions list and
 * the country picker is visibly a different object. It also renders as two
 * letters in a box on most of Windows.
 *
 * The images are the ones the country picker already uses, so there is one flag
 * in the product rather than one per rendering engine.
 */

import { cn } from "@/lib/utils";

export function Flag({
  code,
  title,
  className,
  width = 16,
}: {
  /** ISO-3166 alpha-2. Anything else — "GLO" for UTC, an empty profile —
      renders nothing rather than a broken image. */
  code?: string | null;
  title?: string | null;
  className?: string;
  width?: number;
}) {
  const iso = String(code || "").toLowerCase();
  if (iso.length !== 2 || !/^[a-z]{2}$/.test(iso)) return null;

  return (
    <img
      src={`/img/flag/${iso}.webp`}
      alt={title || iso.toUpperCase()}
      title={title || undefined}
      loading="lazy"
      /* A missing asset hides itself. A country we have no flag for is not a
         reason to draw a broken-image glyph in the middle of a sentence. */
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      style={{ width, height: Math.round((width * 3) / 4) }}
      className={cn("inline-block shrink-0 rounded-[2px] object-cover", className)}
    />
  );
}

export default Flag;
