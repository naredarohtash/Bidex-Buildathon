"use client";

/**
 * How much of the screen the on-screen keyboard is covering, in CSS pixels.
 *
 * Android shrinks the viewport when a keyboard opens, so `dvh` and ordinary
 * layout handle it. iOS Safari does not: the keyboard is drawn *over* the page,
 * `100dvh` still reports the full height, and `position: fixed` still anchors to
 * a viewport that pretends nothing happened. visualViewport is the only thing
 * that knows, and the gap between the layout viewport and the visual one is the
 * keyboard.
 *
 * Do not subtract `offsetTop`. iOS scrolls the visual viewport when the keyboard
 * opens, so that term is large and subtracting it produces roughly zero — which
 * silently disabled every keyboard fix built on this until it was found. The
 * 90px floor is there to keep a retracting address bar from reading as a
 * keyboard.
 *
 * Shared, because two very different layouts need it: the auth page, which
 * scrolls, and the auth modal, which is fixed and centred and cannot scroll out
 * from under anything.
 */

import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      const covered = window.innerHeight - vv.height;
      setInset(covered > 90 ? Math.round(covered) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
