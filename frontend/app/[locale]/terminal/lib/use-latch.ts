"use client";

import { useEffect, useState } from "react";

/**
 * False until `open` is first true, and true from then on.
 *
 * This exists to let a panel be code-split without changing how it behaves.
 * A dynamically imported component fetches its chunk the moment it is
 * rendered — even rendered closed — so `dynamic()` alone defers nothing for
 * the overlays on this screen, which are all mounted permanently and told
 * whether they are open via a prop.
 *
 * Rendering them only while open would defer the download, but it would also
 * unmount them on close, and most of these animate out through
 * AnimatePresence: unmounting removes the element before the exit animation
 * can play, so panels would vanish instead of sliding away. It would also
 * discard whatever state the panel held, so reopening a settings panel would
 * lose the tab you were on.
 *
 * Latching gives both. Nothing is fetched until the first open; from then on
 * the component stays mounted exactly as before, so animations and state
 * behave the way they always have. The cost is only ever paid by someone who
 * actually opens the thing.
 */
export function useLatch(open: boolean): boolean {
  const [latched, setLatched] = useState(open);
  useEffect(() => {
    if (open) setLatched(true);
  }, [open]);
  return latched;
}

export default useLatch;
