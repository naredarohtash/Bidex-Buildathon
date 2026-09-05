/**
 * The OTC marker, in one place.
 *
 * It is rendered in three spots — the header's asset rail, and the live and
 * settled position rows — and keeping three copies of the class string has now
 * gone wrong twice: once when the rows carried a full-size chip the rail had
 * already moved away from, and again when a replacement matched only one of the
 * two rows because they sit at different nesting depths and the strings differed
 * by their indentation. Three literals cannot be kept in step by discipline.
 *
 * Geometry (do not change without changing all three at once, which is now the
 * same act): 10px text scaled to 0.78 from its top-left, tucked against the
 * asset name's cap height rather than sitting level with it. At full size it
 * reads as a second word in the instrument's name; scaled and tucked, it reads
 * as an annotation on it.
 *
 * The scale was 0.68, which renders about 6.8px — fine on a Mac, but Windows
 * hints and snaps small type to the pixel grid far more aggressively, and at
 * that size the three letters were losing their counters and reading as a smudge.
 * 0.78 is roughly 7.8px: enough for the glyphs to survive that rounding, and
 * still comfortably subordinate to the 11-12px name beside it.
 */
const BASE =
  "inline-block self-start shrink-0 text-[10px] font-extrabold leading-none " +
  "uppercase tracking-tighter select-none " +
  "origin-top-left transform scale-[0.78] -mr-1.5 " +
  /* No chip behind it. The filled box was doing the work of separating the mark
     from the name, and doing it badly: a grey panel-coloured rectangle reads as
     a smudge at this scale whatever colour the letters are, and brightening the
     letters only made the box more obvious. Size and position already say this
     is an annotation — it is two thirds the height of the name and tucked to its
     cap line — so the box was saying it a second time, in the ugliest available
     way. The padding and corner radius go with it; they only ever shaped a
     background that no longer exists.

     No colour of its own either. Naming one here is choosing a brightness
     against a name whose own brightness is not fixed: in the rail the name is
     white while its tab is active and zinc-350 while it is not, so any constant
     picked to sit beside the active state outshines the inactive one — which is
     exactly what a flat zinc-200 did. It inherits instead, from the row that
     also colours the name, so the two cannot disagree in any state. Size and
     weight are what separate them, which is what should have been separating
     them all along. */
  "text-current";

/* The top tuck is not part of BASE, because it is not a property of the badge —
   it is a property of the gap between the name's line box and the name's ink.
   self-start aligns the badge to the top of the flex line, and the flex line is
   as tall as the name's line box, which is taller than the letters themselves by
   half the leading at each end. So the same offset lands differently next to
   names with different leading, and the two callers have different leading:

     header rail   11px name, leading-tight  -> 13.75px line box
     position rows 12px name, inherited      -> 18px    line box

   Measured against the name's ink top rather than its box: at mt-[1px] the rail
   is level (+0.12px) while the rows sit 1.71px high — which is the "a little up"
   this fixes. 3px brings the rows to +0.29px, the same relationship the rail has.

   If a third caller appears, measure it; do not assume one of these two fits. */

/** Beside an 11px name in a leading-tight row — the header's asset rail. */
export const OTC_BADGE_CLASS = `${BASE} mt-[1px]`;

/** Beside a 12px name in a normal-leading row — the live and settled position rows. */
export const OTC_BADGE_CLASS_ROW = `${BASE} mt-[3px]`;
