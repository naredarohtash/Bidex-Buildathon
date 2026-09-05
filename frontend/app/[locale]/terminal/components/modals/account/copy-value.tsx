"use client";

/**
 * A value you can actually copy.
 *
 * The previous control called `navigator.clipboard.writeText(...)` without
 * awaiting it and announced success regardless. That call rejects — silently,
 * because nothing looked at the promise — whenever the document is not focused,
 * when permission is refused, and in any embedded or non-secure context. The
 * toast still said "Copied", so a failure and a success were indistinguishable,
 * which is why the account ID could not be copied and nothing appeared wrong.
 *
 * Here the promise is awaited, a hidden-textarea fallback runs when it fails,
 * and the button reports what actually happened.
 */

import { memo, useCallback, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path below */
  }

  // Works where the async API is unavailable or blocked.
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-1000px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export const CopyValue = memo(function CopyValue({
  label,
  value,
  className,
  mono = true,
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  mono?: boolean;
  /**
   * One short line under the field saying what the value is *for*.
   *
   * A transaction detail can carry three long identifiers at once — a gateway
   * reference, a chain hash and the platform's own row id — and a caption alone
   * cannot tell them apart for someone who does not already know the
   * difference. Optional, because most places using this control show a single
   * value whose label is self-evident.
   */
  hint?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    const ok = await writeToClipboard(value);
    setState(ok ? "done" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }, [value]);

  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        onClick={copy}
        title={value}
        aria-label={`Copy ${label}`}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5",
          "text-left transition-colors hover:bg-muted focus-visible:outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-ring/25"
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs text-foreground/80",
            mono && "font-mono"
          )}
        >
          {value}
        </span>
        {state === "done" ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-verified">
            <Check className="h-3.5 w-3.5" /> Copied
          </span>
        ) : state === "failed" ? (
          // Selecting it by hand is the only thing left, so say so.
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-attention">
            <X className="h-3.5 w-3.5" /> Select manually
          </span>
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        )}
      </button>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      )}
    </div>
  );
});

export default CopyValue;
