"use client";

/**
 * The thing that marks where you are in the icon rail.
 *
 * Every destination used to paint its own `bg-blue-500/10` when it was the
 * active one, which means the mark did not move — it blinked out of one square
 * and into another. With eight destinations in a 46px column and nothing but a
 * glyph to tell them apart, that gives you no sense of having *travelled*
 * anywhere; you have to re-find the highlight each time.
 *
 * One element that slides is a different experience for the same information:
 * the eye follows it, so the new position is known before the new icon is read.
 *
 * It measures the live DOM rather than being told where to go. The rail's items
 * are wrapped in tooltips, split across two groups, and the column scrolls on
 * short windows — so their offsets are not something this component could
 * compute, and hardcoding them would be a second source of truth that goes
 * stale the moment someone adds an icon. Marking a destination is one
 * `data-rail` attribute; nothing else has to know this exists.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

type Box = { top: number; left: number; width: number; height: number };

export function RailSelector({
  containerRef,
  activeKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** The `data-rail` value of the current destination, or null for none. */
  activeKey: string | null;
}) {
  const [box, setBox] = useState<Box | null>(null);
  /* The first placement is a jump — there is nowhere to slide from. Sliding
     starts once it has a position, or every page load would play the mark
     travelling from the top of the rail. */
  const [animate, setAnimate] = useState(false);
  const placed = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const el = activeKey
        ? container.querySelector<HTMLElement>(`[data-rail="${activeKey}"]`)
        : null;
      if (!el) {
        setBox(null);
        placed.current = false;
        setAnimate(false);
        return;
      }
      const c = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      /* Scroll offsets included: an absolutely-positioned child of a scrolling
         box is placed against its padding box, while these rects are in viewport
         coordinates. Without this the mark drifts by the scroll distance on a
         short window — the one case where this column scrolls at all. */
      setBox({
        top: r.top - c.top + container.scrollTop,
        left: r.left - c.left + container.scrollLeft,
        width: r.width,
        height: r.height,
      });
      if (!placed.current) {
        placed.current = true;
        requestAnimationFrame(() => setAnimate(true));
      }
    };

    measure();

    /* The rail collapses to zero width, and its items move when it does. */
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, activeKey]);

  if (!box) return null;

  return (
    <div
      aria-hidden
      /* A raised surface, not a blue wash.
      
         The rail paints its own background per theme (`#121214` / `#0e1626` /
         `#f8f9fa`), so the mark is a card sitting one step above that, in the
         same family as every other card in the terminal — the accent stays on
         the icon, which is where "selected" is already being said. A tinted
         accent panel behind an accent glyph says it twice and matches nothing
         else in the product.
         
         `rounded-lg` rather than `xl`: at 40px square a 12px radius is most of
         the corner, which reads as a lozenge rather than a card. */
      className="pointer-events-none absolute left-0 top-0 rounded-lg border bg-white border-zinc-300 dark:bg-[#1c1c21] dark:border-[#2a2a31] navy:bg-[#16233a] navy:border-[#22355c]"
      style={{
        width: box.width,
        height: box.height,
        transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
        /* Written inline because no Tailwind transition utility works in this
           app: an unlayered `* { transition: background-color, border-color,
           color }` in styles/theme.css overrides every one of them, and the
           shorthand resets transition-property to those three. */
        transition: animate
          ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms ease, height 200ms ease"
          : "none",
      }}
    />
  );
}

export default RailSelector;
