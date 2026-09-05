"use client";

/**
 * What opens when you click your profile picture.
 *
 * Clicking it used to go straight to the operating system's file dialog, which
 * made "change my photo" and "have a photo" the same question — somebody who
 * did not want to upload a picture of themselves had no way to be anything but
 * their initials. There are two answers now, and this asks which.
 *
 * The chrome is the cropper's, deliberately down to the pixel: same scrim, same
 * `max-w` card on `bg-card`, same header block, same footer bar, same two
 * buttons. These two dialogs open from the same control one after the other —
 * pick "upload", frame the photo — and two dialogs in one flow that disagree
 * about their own edges read as two different products.
 *
 * Choosing an avatar is not an upload. The files are already served from
 * `public/`, so the whole change is writing that path into the same column an
 * upload writes to — see `chooseAvatar` in use-avatar-upload.
 */

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarPaths, isGeneratedAvatar } from "@/components/ui/animal-avatar";

export const AvatarPicker = memo(function AvatarPicker({
  open,
  current,
  busy,
  onClose,
  onUpload,
  onChoose,
}: {
  open: boolean;
  /** The stored `user.avatar`, so the grid can show which one is in use. */
  current?: string | null;
  busy?: boolean;
  onClose: () => void;
  /** Hand off to the file dialog, and then to the cropper. */
  onUpload: () => void;
  onChoose: (url: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* The selection is local until Save, so the grid can be browsed without
     writing to the account on every click — thirty taps would otherwise be
     thirty PUTs and thirty toasts. */
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (open) setPicked(isGeneratedAvatar(current) ? current! : null);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busy) onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onClose]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const paths = avatarPaths();
  const changed = !!picked && picked !== current;

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile picture"
        className="relative flex max-h-[min(640px,calc(100vh-2rem))] w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold leading-tight text-foreground">
              Profile picture
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Upload a photo, or choose one of the avatars.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Upload first, because it is the one that produces a picture of you —
            the avatars are the fallback, however many of them there are. */}
        <div className="shrink-0 px-5 pt-4">
          <button
            type="button"
            onClick={onUpload}
            disabled={busy}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3",
              "text-left transition-colors hover:bg-muted disabled:opacity-60"
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <ImagePlus className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight text-foreground">
                Upload a photo
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-tight text-muted-foreground">
                PNG, JPG or WebP — you frame it on the next step
              </span>
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            or pick an avatar
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* The only part that scrolls. The header, the upload row and the
            buttons stay put, so the dialog never grows past the window. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="grid grid-cols-6 gap-2.5">
            {paths.map((path) => {
              const active = picked === path;
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => setPicked(path)}
                  disabled={busy}
                  aria-pressed={active}
                  aria-label="Use this avatar"
                  className={cn(
                    "relative aspect-square rounded-full outline-none transition-transform",
                    "hover:scale-[1.06] focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    "disabled:pointer-events-none disabled:opacity-60",
                    active
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                      : "ring-1 ring-border"
                  )}
                >
                  <img
                    src={path}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full select-none rounded-full object-cover"
                  />
                  {active && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={cn(
              "inline-flex h-9 items-center rounded-lg border border-border bg-background px-3.5",
              "text-[13px] font-medium text-foreground hover:bg-muted active:scale-[0.97] disabled:opacity-60"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => picked && onChoose(picked)}
            disabled={busy || !changed}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4",
              "text-[13px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Use avatar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default AvatarPicker;
