"use client";

/**
 * A panel that slides in from the right of the terminal.
 *
 * Replaces a centred pop-up. A modal in the middle of the screen covers the
 * chart, the order panel and the positions list all at once, and forces the
 * flow into a squat wide box that suits neither a list of methods nor a form.
 * Depositing is not a question to interrupt someone with — it is a task done
 * alongside the terminal, so it belongs at the edge with the workspace still
 * visible behind it.
 *
 * A tall narrow column also suits the content: methods stack, forms are single
 * column, and nothing has to be laid out sideways to fill space.
 */

import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FinanceDrawer({
  isOpen,
  onClose,
  confirmClose,
  title,
  subtitle,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Asked before closing; false means the contents want to check with the user
   * first and will close this themselves if the answer is yes.
   *
   * Needed because the drawer can be dismissed three ways — the X, Escape, and
   * a click on the backdrop — and a deposit with a live payment address behind
   * it must not be thrown away by a stray click on the chart.
   */
  confirmClose?: () => boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const requestClose = useCallback(() => {
    if (confirmClose && !confirmClose()) return;
    onClose();
  }, [confirmClose, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, requestClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title}>
      {/* Dimmed rather than blurred: the point of putting this at the edge is
          that the chart behind stays readable. */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        onClick={requestClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-background shadow-2xl",
          /* Sized to the content, not to the screen. The flow is one column of
             rows and short fields; at 560 the right third was empty. */
          "sm:w-[420px] lg:w-[460px]",
          "animate-in slide-in-from-right duration-300"
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

export default FinanceDrawer;
