"use client";

/**
 * Open the support panel from anywhere.
 *
 * The panel is owned by the layouts — desktop keeps it in `showSupportPanel`,
 * mobile switches its whole view to it — and the things that need to reach it
 * are nowhere near either: a dialog inside the account overlay, three portals
 * deep. Threading a callback down through all of that would put "how support
 * opens" in every component along the way.
 *
 * An event instead, which is the pattern this terminal already uses for
 * `vortex-open-overlay`. The layouts listen; everybody else says what they
 * want.
 */

export const OPEN_SUPPORT_EVENT = "vortex-open-support";

export function openSupport() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_EVENT));
}
