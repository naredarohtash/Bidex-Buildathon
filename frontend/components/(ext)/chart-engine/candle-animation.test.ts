import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The forming candle must never be drawn as anything the market did not do.
 *
 * This guards a bug that shipped three times in one day. The chart does not draw
 * the candle the store holds — it animates it, so the price glides instead of
 * jumping. Every version that animated the *close on its own* drew a candle that
 * was not real:
 *
 *   1. close eased, wick accumulated from the eased close: the wick can only
 *      reach where the drawn close went, so a high set while the animator was
 *      not running is lost for good. Browsers stop giving animation frames to a
 *      hidden tab, so switching apps and coming back showed a body and wick
 *      that never happened, until a reload.
 *   2. close eased, wick taken straight from the real candle: fixes that and
 *      breaks the other way — on a new high the wick jumps to the price while
 *      the body crawls up behind it.
 *   3. nothing animated at all: correct, but loses the smooth formation.
 *
 * What ships now eases close, high and low together, each toward its own real
 * value, clamped so it can only ever approach the real candle from inside.
 *
 * Two things these tests are careful about, both learned the hard way:
 *
 *   - Price moves here are tick-sized (hundredths of a percent). The animator
 *     deliberately snaps rather than eases on a jump over 2%, so percent-scale
 *     test moves sail straight down the snap path and assert nothing about the
 *     easing at all. An earlier version of this file did exactly that and passed
 *     against a deliberately reintroduced bug.
 *   - It reads the function out of the SHIPPED bundle, not a copy. The engine is
 *     compiled with no source in this repo and is edited by hand, so a test
 *     against a copy would pass while the file that actually runs is broken.
 */

const BUNDLE = path.resolve(__dirname, "dist/index.js");

type Drawn = { high: number; low: number; close: number };
type Animator = (
  open: number,
  high: number,
  low: number,
  close: number,
  symbol: string,
  candleTime: number
) => Drawn;

let source: string;

/** A fresh animator with its own state and a clock we control. */
function build() {
  const clock = { t: 1000 };
  // The animator pumps requestAnimationFrame while still settling; leaving it
  // undefined here is exactly what its own `typeof` guard expects.
  const factory = new Function(
    "performance",
    `${source}; return bxAnimateCandle;`
  ) as (p: { now: () => number }) => Animator;
  const animate = factory({ now: () => clock.t });

  /** Advance one 60fps frame and draw. */
  const frame = (o: number, h: number, l: number, c: number, t = 60_000) => {
    clock.t += 16;
    return animate(o, h, l, c, "S", t);
  };
  /** Run the animation to rest against an unchanging real candle. */
  const settle = (o: number, h: number, l: number, c: number, t = 60_000) => {
    let d!: Drawn;
    for (let i = 0; i < 300; i++) d = frame(o, h, l, c, t);
    return d;
  };
  return { animate, clock, frame, settle };
}

beforeAll(() => {
  const bundle = fs.readFileSync(BUNDLE, "utf8");
  const start = bundle.indexOf("let bxCandleAnim=");
  const end = bundle.indexOf("let customCandleColors=");
  expect(
    start,
    "bxCandleAnim is missing from the chart engine bundle — the candle animator " +
      "was removed or renamed. See the BIDEX_CANDLE_ANIM comment in dist/index.js."
  ).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  source = bundle.slice(start, end);
});

describe("chart engine: forming candle animation", () => {
  it("draws the real candle on the very first sample", () => {
    const { animate } = build();
    expect(animate(100, 100.05, 99.95, 100.01, "S", 60_000)).toEqual({
      high: 100.05,
      low: 99.95,
      close: 100.01,
    });
  });

  it("eases toward a new price instead of jumping to it", () => {
    // Guards against the version that removed the animation entirely.
    const { animate, frame } = build();
    animate(100, 100, 100, 100, "S", 60_000);

    const first = frame(100, 100.5, 100, 100.5);
    expect(first.close).toBeGreaterThan(100);
    expect(first.close).toBeLessThan(100.5);
    expect(first.high).toBeLessThan(100.5);
  });

  /* THE regression. Between two animation frames — or across a hidden tab —
     the price can spike and come back, so the real high moves while the real
     close does not. A wick accumulated from the drawn close can never reach
     that high, and the candle is drawn without it for the rest of its life. */
  it("draws a wick the close never reached", () => {
    const { animate, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    settle(100, 100, 100, 100);

    // A spike happened between frames: the high moved, the close did not.
    const drawn = settle(100, 100.5, 100, 100);
    expect(drawn.high).toBe(100.5);
    expect(drawn.close).toBeCloseTo(100, 6);
  });

  it("keeps the real wick after the price retreats from a high", () => {
    const { animate, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    settle(100, 100.8, 100, 100.8); // ran up to the high
    const drawn = settle(100, 100.8, 100, 100.2); // then fell back

    expect(drawn.high).toBe(100.8);
    expect(drawn.close).toBeCloseTo(100.2, 6);
  });

  /* The other regression: with the wick taken straight from the real candle
     while the body still eased, a new high put the wick tip above the body top
     on every frame — the wick arriving before the body. */
  it("never grows a wick ahead of the body while making new highs", () => {
    const { animate, frame } = build();
    animate(100, 100, 100, 100, "S", 60_000);

    let worstPhantomWick = 0;
    for (let i = 1; i <= 60; i++) {
      const price = 100 + i * 0.01; // every tick is a new high: high === close
      const drawn = frame(100, price, 100, price);
      worstPhantomWick = Math.max(worstPhantomWick, drawn.high - drawn.close);
    }
    expect(worstPhantomWick).toBeLessThan(1e-9);
  });

  it("never draws beyond the real high or low", () => {
    const { animate, frame } = build();
    animate(100, 100, 100, 100, "S", 60_000);

    for (let i = 0; i < 60; i++) {
      const d = frame(100, 100.4, 99.7, 100.2);
      expect(d.high).toBeLessThanOrEqual(100.4 + 1e-9);
      expect(d.low).toBeGreaterThanOrEqual(99.7 - 1e-9);
      expect(d.close).toBeLessThanOrEqual(100.4 + 1e-9);
      expect(d.close).toBeGreaterThanOrEqual(99.7 - 1e-9);
    }
  });

  it("settles exactly on the real candle", () => {
    const { animate, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    expect(settle(100, 100.5, 99.8, 100.2)).toEqual({
      high: 100.5,
      low: 99.8,
      close: 100.2,
    });
  });

  /* A hidden tab gets no animation frames, so the animator is not called at all
     while the candle goes on forming. What it comes back to must be drawn as the
     real candle on the first frame — not eased toward from values now minutes
     old, which is what left the chart wrong until a reload. */
  it("is exact on the first frame back after frames stopped", () => {
    const { animate, clock, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    settle(100, 100.2, 100, 100.1);

    clock.t += 95_000; // away: no frames at all
    // Same bucket and a tick-sized move, so the gap is the only thing that can
    // account for a snap here.
    expect(animate(100, 100.6, 99.8, 100.3, "S", 60_000)).toEqual({
      high: 100.6,
      low: 99.8,
      close: 100.3,
    });
  });

  it("is exact on the first frame of a new bucket", () => {
    const { animate, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    settle(100, 100.2, 100, 100.1);

    expect(animate(100.1, 100.4, 100.05, 100.2, "S", 120_000)).toEqual({
      high: 100.4,
      low: 100.05,
      close: 100.2,
    });
  });

  it("is exact on the first frame after a symbol change", () => {
    const { animate, settle } = build();
    animate(100, 100, 100, 100, "S", 60_000);
    settle(100, 100.2, 100, 100.1);

    // The animator holds one piece of shared state; a new symbol must reset it
    // rather than ease from the previous instrument's prices.
    expect(animate(50, 50.3, 49.9, 50.1, "OTHER", 60_000)).toEqual({
      high: 50.3,
      low: 49.9,
      close: 50.1,
    });
  });

  it("always draws a structurally valid candle through a random walk", () => {
    const { animate, frame } = build();
    let high = 100;
    let low = 100;
    let close = 100;
    animate(100, 100, 100, 100, "S", 60_000);

    for (let i = 0; i < 600; i++) {
      close += (Math.sin(i * 0.7) + Math.cos(i * 0.31)) * 0.01;
      high = Math.max(high, close);
      low = Math.min(low, close);
      const d = frame(100, high, low, close);

      // The wick contains the body and the open.
      expect(d.high).toBeGreaterThanOrEqual(d.close - 1e-9);
      expect(d.low).toBeLessThanOrEqual(d.close + 1e-9);
      expect(d.high).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(d.low).toBeLessThanOrEqual(100 + 1e-9);
      // And never reaches past what really happened.
      expect(d.high).toBeLessThanOrEqual(high + 1e-9);
      expect(d.low).toBeGreaterThanOrEqual(low - 1e-9);
    }
  });

  it("does not shadow the engine's LayerState singleton", () => {
    // The repaint pump calls the global `dt`. A local named `dt` inside the
    // animator would silently kill it, and the chart would then only redraw
    // when the next tick happened to arrive.
    expect(source).not.toMatch(/\b(?:let|const|var)\s+dt\b/);
  });
});
