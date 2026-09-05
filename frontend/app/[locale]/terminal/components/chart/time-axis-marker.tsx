"use client";

/**
 * Time readout for the crosshair, on the time axis.
 *
 * The axis is labelled every few minutes, so on a one-minute chart there is no
 * way to read an exact time off it. The price side never has this problem — the
 * striker carries a chip saying exactly what price its line sits on. This is the
 * same instrument, turned on its side.
 *
 * It tracks the crosshair continuously. An earlier version snapped to the
 * nearest candle, on the reasoning that "which candle is this" was the question
 * being asked. Snapping to discrete positions is steppy by construction, and
 * stepping cannot be made smooth by animating it — the animation only converts a
 * jump into a lag. Following the pointer is smooth because there is nothing left
 * to interpolate.
 *
 * Position comes from the engine's own crosshairPosition where available, so the
 * chip cannot drift from the line it belongs to; local pointer tracking is the
 * fallback.
 *
 * Geometry is measured from the canvas rather than read from the store: the
 * engine publishes state.dimensions once in its initial state and never writes
 * to it again — there is no setDimensions anywhere in the bundle — so those
 * values are permanently zero. The price-alert overlay measures the DOM for the
 * same reason.
 */

import { useEffect, useRef, useState } from "react";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { cn } from "@/lib/utils";
import { AXIS_CHIP } from "./axis-chip";

/* Mirrors of the engine's layout constants, which are baked into minified code
   with no export. TIME_AXIS_HEIGHT is the strip along the bottom of the canvas;
   the 6px is the margin it keeps between the plot and the price axis
   (chartAreaWidth = canvasWidth - 6). Change them in the engine, change them
   here. */
const TIME_AXIS_HEIGHT = 19;
const PLOT_RIGHT_MARGIN = 6;

export default function TimeAxisMarker() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [canvasBox, setCanvasBox] = useState<{
    left: number;
    width: number;
    height: number;
    /** Distance from the overlay's bottom edge to the canvas's. */
    bottomGap: number;
  } | null>(null);

  const viewport = useChartStore((s: any) => s.state?.viewport) as
    | { startTime: number; endTime: number }
    | undefined;
  const crosshair = useChartStore((s: any) => s.crosshairPosition) as
    | { x: number; y: number }
    | null;

  useEffect(() => {
    const readCanvas = () => {
      const el = rootRef.current;
      const parent = el?.parentElement;
      if (!el || !parent) return null;
      const canvas = parent.querySelector("canvas");
      if (!canvas) return null;
      return {
        rect: el.getBoundingClientRect(),
        c: canvas.getBoundingClientRect(),
      };
    };

    const measure = () => {
      const r = readCanvas();
      if (!r) return;
      setCanvasBox({
        left: r.c.left - r.rect.left,
        width: r.c.width,
        height: r.c.height,
        bottomGap: r.rect.bottom - r.c.bottom,
      });
    };

    const onMove = (e: MouseEvent) => {
      const r = readCanvas();
      if (!r) return;
      setPointer({ x: e.clientX - r.c.left, y: e.clientY - r.c.top });
    };

    const onLeave = () => setPointer(null);

    /* Measure again on the frame after the one that asked for it.
    
       Every trigger here reports that *something* changed, not that the chart
       has finished responding to it: the engine resizes its own canvas from its
       own observer, so a measurement taken in the same tick reads the box as it
       was. Browser zoom is the case that exposed this — there is no settle event
       for it the way fullscreen has one — and a canvas measured mid-resize puts
       the chip in the middle of the chart. */
    const settle = () => {
      measure();
      requestAnimationFrame(() => requestAnimationFrame(measure));
    };

    settle();
    // The chart is a flex child inside panels that settle after mount.
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 1000);
    window.addEventListener("resize", settle);
    /* Browser zoom resizes the visual viewport without necessarily resizing
       anything this component observes. */
    window.visualViewport?.addEventListener("resize", settle);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    /* Watch the element, not the window.

       The chip is placed at canvasBox.top + canvasBox.height - TIME_AXIS_HEIGHT,
       so a stale height doesn't misplace it slightly — it lifts it off the axis
       and drops it into the middle of the chart. That is what entering
       fullscreen did: the window resize fires, but the canvas has not been
       re-laid-out yet when it does, so the measurement taken in response was of
       the old, smaller box and nothing ever corrected it.

       A ResizeObserver reports the element's size after layout, whatever caused
       the change — fullscreen, the side panels collapsing, a window drag — which
       makes the window listener and the two startup timers a backstop rather
       than the mechanism. fullscreenchange is kept as well because the observer
       reports the box while the transition is still animating in some browsers,
       and this re-reads it once the change has settled. */
    const el = rootRef.current?.parentElement;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(settle) : null;
    if (ro && el) {
      ro.observe(el);
      const canvas = el.querySelector("canvas");
      if (canvas) ro.observe(canvas);
    }
    const onFullscreen = () => {
      measure();
      // after the transition, not during it
      setTimeout(measure, 150);
    };
    document.addEventListener("fullscreenchange", onFullscreen);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", settle);
      window.visualViewport?.removeEventListener("resize", settle);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("fullscreenchange", onFullscreen);
      ro?.disconnect();
    };
  }, []);

  // The engine's own crosshair wins, so the chip cannot drift from the line.
  const at = crosshair ?? pointer;

  let chip: { x: number; label: string } | null = null;

  if (at && canvasBox && viewport) {
    const span = viewport.endTime - viewport.startTime;
    const plotW = canvasBox.width - PLOT_RIGHT_MARGIN;
    const plotH = canvasBox.height - TIME_AXIS_HEIGHT;

    if (
      span > 0 &&
      plotW > 0 &&
      at.x >= 0 &&
      at.x <= plotW &&
      at.y >= 0 &&
      at.y <= plotH
    ) {
      const t = viewport.startTime + (at.x / plotW) * span;
      chip = {
        x: at.x,
        /* Seconds included. The readout is continuous now, and a value that only
           changed once a minute would sit frozen while the line kept moving. */
        label: new Date(t).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      };
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      aria-hidden="true"
    >
      {chip && canvasBox && (
        /* No transition, and no entrance animation.

           The chip is pinned to the pointer, so its motion is already
           continuous; a transition on top would make it trail the line it is
           attached to, which is the opposite of smooth. The earlier version had
           both — a slide easing between snapped positions and a zoom that
           replayed on every candle crossed — and between them produced a chip
           that lagged horizontally and pulsed vertically. */
        <div
          className="absolute"
          /* Anchored to the bottom, not to `top + height`.
          
             That sum is the whole reason this keeps breaking: it re-derives a
             position the browser already knows, from two numbers measured at
             some earlier moment, so any staleness in the height moves the chip
             by the full amount of it — off the axis and into the middle of the
             chart. `bottom` is resolved against the live box on every paint, and
             the gap it is offset by is the one measurement that does not change
             when the chart is resized or zoomed. The chip is exactly one axis
             strip tall, so sitting on that edge fills the strip. */
          style={{
            left: canvasBox.left,
            bottom: canvasBox.bottomGap,
            transform: `translate3d(${chip.x}px, 0, 0)`,
            willChange: "transform",
          }}
        >
          {/* Fills the axis strip exactly, so it reads as part of the axis
              rather than a label dropped on top of it. */}
          <div className={cn("-translate-x-1/2 flex items-center px-2 tracking-tight", AXIS_CHIP)}>
            {chip.label}
          </div>
        </div>
      )}
    </div>
  );
}
