"use client";

/**
 * Six boxes rather than one field.
 *
 * A six-digit code in a plain text input is a code you cannot check at a
 * glance against the one in the mail. Backspace on an empty box steps back a
 * box, and a paste anywhere fills the whole row — the two things that make
 * every other implementation of this annoying.
 *
 * Shared, because two dialogs on this page ask for a mailed code — deleting
 * the account and turning on two-factor — and a code row that behaves one way
 * in one of them and another way in the other is a bug waiting for whichever
 * one gets edited second.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";

export function CodeInput({
  value,
  onChange,
  disabled,
  complete,
  idPrefix = "code",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** All six in — the row says so, the same way a matched word field does. */
  complete?: boolean;
  /** Ids for the boxes, so a label can point at the first one. */
  idPrefix?: string;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  /* Six slots, left-aligned, filled from the code string. A slot past the end
     of the string is empty rather than undefined, so every box renders. */
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const write = (index: number, char: string) => {
    const next = [...digits];
    next[index] = char;
    onChange(next.join("").slice(0, 6));
  };

  return (
    <div
      className="flex gap-2"
      onPaste={(e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (!pasted) return;
        e.preventDefault();
        onChange(pasted);
        refs.current[Math.min(pasted.length, 5)]?.focus();
      }}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          id={`${idPrefix}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            if (!char) return;
            write(i, char);
            refs.current[Math.min(i + 1, 5)]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (digit) {
                write(i, "");
              } else if (i > 0) {
                write(i - 1, "");
                refs.current[i - 1]?.focus();
              }
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-md border bg-background text-center",
            "font-mono text-[17px] font-semibold text-foreground",
            "outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/10",
            complete
              ? "border-verified/60 focus-visible:border-verified/70"
              : digit
                ? "border-foreground/35 focus-visible:border-foreground/50"
                : "border-border focus-visible:border-foreground/40",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
      ))}
    </div>
  );
}
