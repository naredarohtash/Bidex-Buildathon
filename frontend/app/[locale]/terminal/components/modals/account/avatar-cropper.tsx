"use client";

/**
 * Choosing which part of a photo becomes the avatar.
 *
 * Before this, whatever you picked was uploaded whole and then squeezed into a
 * circle — a portrait taken in landscape lost its subject to the left edge, and
 * nobody could do anything about it. Now the file opens here first: drag to
 * move, scroll or drag the slider to zoom, and what is inside the ring is what
 * gets saved.
 *
 * The export is a real crop, not a CSS transform saved as-is. The visible
 * square is mapped back into the source image's own pixels and drawn onto a
 * 400×400 canvas, so the file that leaves is already square and already framed;
 * nothing downstream has to re-guess the framing, and an old avatar rendered by
 * something that forgets `object-cover` still looks right.
 *
 * Two invariants hold at all times, both enforced in `clamp`:
 *   - the image always covers the ring, so no crop can contain empty space;
 *   - zoom never goes below the scale at which that is true.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** The side of the exported square, in pixels. */
const OUTPUT = 400;
/** The side of the ring on screen. */
const VIEW = 264;
const MAX_ZOOM = 4;

interface Frame {
  scale: number;
  x: number;
  y: number;
}

export const AvatarCropper = memo(function AvatarCropper({
  file,
  onCancel,
  onConfirm,
  busy,
}: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
  busy?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<Frame>({ scale: 1, x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => setMounted(true), []);

  /* An object URL, revoked when the file changes or the dialog closes — a
     leaked one keeps the whole decoded bitmap alive. */
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setImage(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      // Start at the smallest scale that still covers the ring, centred — the
      // same framing `object-cover` would have given, as a starting point to
      // adjust rather than a result to accept.
      setFrame({ scale: 1, x: 0, y: 0 });
    };
    img.src = url;
  }, [url]);

  /** The scale at which the image exactly covers the ring. Zoom multiplies it. */
  const baseScale = image ? Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight) : 1;

  /**
   * Keep the ring covered.
   *
   * At any zoom the image is `w × h` on screen; the pan is limited to half the
   * overflow in each axis, so an edge can reach the ring's edge and no further.
   */
  const clamp = useCallback(
    (next: Frame): Frame => {
      if (!image) return next;
      const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
      const w = image.naturalWidth * baseScale * scale;
      const h = image.naturalHeight * baseScale * scale;
      const maxX = Math.max(0, (w - VIEW) / 2);
      const maxY = Math.max(0, (h - VIEW) / 2);
      return {
        scale,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [baseScale, image]
  );

  useEffect(() => {
    setFrame((f) => clamp(f));
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX - frame.x, y: e.clientY - frame.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setFrame((f) =>
      clamp({ ...f, x: e.clientX - dragging.current!.x, y: e.clientY - dragging.current!.y })
    );
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  /**
   * Map the ring back onto the source image and draw that region.
   *
   * The image is centred, then translated by (x, y) in screen pixels, then
   * scaled by `baseScale * scale`. So a viewport point v corresponds to the
   * source point (v − centre − offset) / total + sourceCentre, and the ring's
   * top-left gives the crop's origin.
   */
  const confirm = async () => {
    if (!image || !file) return;
    const total = baseScale * frame.scale;
    const side = VIEW / total;
    const sx = image.naturalWidth / 2 - (VIEW / 2 + frame.x) / total;
    const sy = image.naturalHeight / 2 - (VIEW / 2 + frame.y) / total;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT, OUTPUT);

    const blob: Blob | null = await new Promise((resolve) =>
      // JPEG, not PNG: a photograph as PNG is several megabytes for no gain,
      // and the crop is opaque so there is no alpha to preserve.
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (!blob) return;

    const name = file.name.replace(/\.[^.]+$/, "") || "avatar";
    onConfirm(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
  };

  if (!file || !mounted) return null;

  return createPortal(
    /* Above the edit dialog, which is at z-[10050] — this can be opened from a
       card that is itself inside one. */
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Position your photo"
        className="relative w-full max-w-[380px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold leading-tight text-foreground">
              Position your photo
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Drag to move, scroll to zoom. What is in the circle is what is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onCancel()}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center px-5 py-5">
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-full border border-border bg-muted active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => {
              setFrame((f) => clamp({ ...f, scale: f.scale * (e.deltaY < 0 ? 1.08 : 0.93) }));
            }}
          >
            {image && url ? (
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: image.naturalWidth * baseScale * frame.scale,
                  height: image.naturalHeight * baseScale * frame.scale,
                  transform: `translate(calc(-50% + ${frame.x}px), calc(-50% + ${frame.y}px))`,
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="mt-4 flex w-full items-center gap-3">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setFrame((f) => clamp({ ...f, scale: f.scale - 0.2 }))}
              className="shrink-0 rounded-md border border-border bg-background p-1 text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={frame.scale}
              aria-label="Zoom"
              onChange={(e) => setFrame((f) => clamp({ ...f, scale: Number(e.target.value) }))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setFrame((f) => clamp({ ...f, scale: f.scale + 0.2 }))}
              className="shrink-0 rounded-md border border-border bg-background p-1 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
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
            onClick={confirm}
            disabled={busy || !image}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4",
              "text-[13px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save photo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default AvatarCropper;
