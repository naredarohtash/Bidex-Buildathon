"use client";

/**
 * One photo: what a good one looks like, a frame to line it up in, and a check
 * that it came out sharp.
 *
 * The first version of this was a button and a video element. It worked and it
 * rejected people, because everything that decides whether a photo is usable
 * happens before the shutter: whether they know the corners have to be in
 * frame, whether they can see where to hold the card, and whether they can tell
 * their photo is blurry. So:
 *
 *  - three drawings of the same document photographed right and wrong, because
 *    people match what they are about to take against a picture, not a rule;
 *  - a viewfinder with the surround dimmed, so the frame is where the document
 *    goes rather than a decoration over the whole image;
 *  - a sharpness check on the captured frame. Variance of the Laplacian is the
 *    standard measure and it is about fifteen lines of canvas work — no library,
 *    no service, and it catches the single most common reason a reviewer sends
 *    an application back.
 *
 * The blur check warns, it does not block. It is a heuristic, a dim room can
 * fail a perfectly readable photo, and refusing to accept a document someone
 * can plainly read is worse than passing a soft one to a human who will say so.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanFace,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GuideStrip } from "./capture-guides";

export type CaptureMode = "environment" | "user";
export type Frame = "card" | "face" | "none";

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/**
 * Variance of the Laplacian on a downscaled greyscale copy.
 *
 * A sharp photo has strong second derivatives at every edge; a blurred one has
 * almost none, so the variance collapses. Measured on a 320px copy because the
 * number only has to separate "sharp" from "soft" and doing it on a 12MP frame
 * costs a visible pause.
 */
function sharpness(source: HTMLCanvasElement | HTMLVideoElement): number {
  const w = 320;
  const h = Math.round(
    (w * ((source as any).videoHeight || (source as HTMLCanvasElement).height)) /
      ((source as any).videoWidth || (source as HTMLCanvasElement).width || 1)
  );
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Infinity;
  ctx.drawImage(source as any, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return Infinity;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const BLUR_FLOOR = 45;

export const PhotoCapture = memo(function PhotoCapture({
  label,
  requirements,
  guides,
  mode = "environment",
  frame = "card",
  value,
  onChange,
  onUsePhone,
  busy = false,
  compact = false,
  onConfirm,
  confirmLabel = "Use this photo",
  cameraLabel = "Use camera",
  uploadLabel = "Choose file",
  emptyLabel = "No photo yet",
}: {
  label: string;
  requirements: string[];
  guides: React.ComponentProps<typeof GuideStrip>["kinds"];
  mode?: CaptureMode;
  frame?: Frame;
  value: string | null;
  onChange: (file: File | null) => void;
  onUsePhone?: () => void;
  busy?: boolean;
  /** After the first photo the guidance folds away: nobody reads the same
      three rules three times. */
  compact?: boolean;
  /** Shown beside Retake once a photo is in. */
  onConfirm?: () => void;
  confirmLabel?: string;
  cameraLabel?: string;
  uploadLabel?: string;
  /** What the empty box says it is waiting for. */
  emptyLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soft, setSoft] = useState(false);
  const [showGuide, setShowGuide] = useState(!compact);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  /* Cameras run until told not to. A light still on after the step is finished
     is something people notice, and distrust. */
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setSoft(false);
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { exact: mode }, width: { ideal: 1920 } },
          audio: false,
        })
        .catch(() =>
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: mode }, width: { ideal: 1920 } },
            audio: false,
          })
        );
      streamRef.current = stream;
      setLive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e: any) {
      const name = e?.name || "";
      setError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser, choose a photo, or carry on with your phone."
          : name === "NotFoundError"
            ? "No camera on this device. Choose a photo, or carry on with your phone."
            : "The camera could not be opened. Choose a photo instead."
      );
    }
  }, [mode]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    setSoft(sharpness(canvas) < BLUR_FLOOR);
    stop();
    onChange(dataUrlToFile(canvas.toDataURL("image/jpeg", 0.92), `${slug(label)}.jpg`));
  }, [label, onChange, stop]);

  const pickFile = useCallback(
    (file: File) => {
      setSoft(false);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        setSoft(sharpness(c) < BLUR_FLOOR);
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
      onChange(file);
    },
    [onChange]
  );

  return (
    /* Padding restored. Stripping it put the label on top of the border and
       pushed the third guide image past the right edge — the screenshot showed
       both. */
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[13px] font-medium text-foreground">{label}</p>

      {/* Nothing to fold away when the caller supplies neither drawings nor
          rules — the selfie step shows its own pose guide above this box, and
          a "What makes a good photo?" link onto an empty strip is a dead
          control. */}
      {!value && !live && (guides.length > 0 || requirements.length > 0) && (
        <>
          {compact && !showGuide ? (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="mt-1 text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              What makes a good photo?
            </button>
          ) : (
            <>
              <div className="mt-2.5">
                <GuideStrip kinds={guides} />
              </div>
              <ul className="mt-2.5 space-y-1">
                {requirements.map((r) => (
                  <li key={r} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {r}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* One box, one height, in every state, and the controls live in it.
      
          It was 104px empty, 260px live and 180px with a photo in — the panel
          jumped twice on the way through a single capture and the buttons
          moved out from under the cursor. Card proportions were tried next and
          were worse: at the full width of the panel, 1.586:1 is over 500px
          tall, which is a page of empty box to say "no photo yet". A fixed
          212px holds every state without dominating the screen. */}
      <div
        className={cn(
          "relative mt-2.5 h-[212px] overflow-hidden rounded-lg bg-background",
          value || live ? "border border-border" : "border border-dashed border-border"
        )}
      >
        {busy ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : value ? (
          <>
            <img src={value} alt={label} className="h-full w-full bg-black/40 object-contain" />
            <Controls>
              <OverlayButton
                onClick={() => {
                  setSoft(false);
                  onChange(null);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Retake
              </OverlayButton>
              {onConfirm && (
                <OverlayButton primary onClick={onConfirm}>
                  <Check className="h-4 w-4" />
                  {confirmLabel}
                </OverlayButton>
              )}
            </Controls>
          </>
        ) : live ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full bg-black object-cover"
              style={mode === "user" ? { transform: "scaleX(-1)" } : undefined}
            />
            <Viewfinder frame={frame} />
            <Controls>
              <OverlayButton primary onClick={shoot}>
                <Camera className="h-4 w-4" />
                Take photo
              </OverlayButton>
              <OverlayButton onClick={stop}>
                <X className="h-4 w-4" />
                Cancel
              </OverlayButton>
            </Controls>
          </>
        ) : (
          /* Nothing chosen. The two ways to add one sit in the box rather than
             under it: they are what this box is for, and a pair of buttons
             below an empty rectangle reads as a caption to it. */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
              {mode === "user" ? (
                <ScanFace className="h-5 w-5" strokeWidth={1.7} />
              ) : (
                <ImagePlus className="h-5 w-5" strokeWidth={1.7} />
              )}
            </span>
            <span className="text-[13px] font-medium text-foreground">
              {error ? "Choose a photo instead" : emptyLabel}
            </span>
            {error && (
              <span className="max-w-[34ch] text-[11px] leading-snug text-destructive">{error}</span>
            )}

            <div className="mt-1 flex w-full max-w-[320px] gap-2">
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className={cn(btn("primary"), "h-9 flex-1 justify-center")}
              >
                <Camera className="h-4 w-4" /> {cameraLabel}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className={cn(btn("ghost"), "h-9 flex-1 justify-center")}
              >
                <Upload className="h-4 w-4" /> {uploadLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      {value && soft && (
        <p className="mt-2 border-l-2 border-amber-500 py-1 pl-3 text-[12px] text-amber-600 dark:text-amber-400">
          This looks soft. If the text is hard to read, take it again in better light — a reviewer has
          to read it too.
        </p>
      )}

      {onUsePhone && !value && !live && (
        /* Its own row, full width, below the two that need this device. It is
           the answer for a laptop with no camera and for anyone who would
           rather use the better one in their pocket — a link buried beside two
           buttons is neither. */
        <button
          type="button"
          onClick={onUsePhone}
          className={cn(
            "mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border",
            "text-[13px] font-medium text-foreground hover:bg-muted/50"
          )}
        >
          <Smartphone className="h-4 w-4" />
          Continue on phone
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
});

/**
 * The bar of controls that sits on the picture rather than under it.
 *
 * A gradient rather than a solid strip: the buttons need a dark ground to read
 * against and the photograph underneath should not be cut in half by a band.
 */
function Controls({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 px-3 pb-3 pt-8"
      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}
    >
      {children}
    </div>
  );
}

function OverlayButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium",
        "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        primary
          ? "bg-blue-600 text-white hover:bg-blue-500"
          : "border border-white/25 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
      )}
    >
      {children}
    </button>
  );
}

/**
 * The frame you line the subject up in.
 *
 * **A document** gets card proportions — 1.586:1, the ISO/IEC 7810 ID-1 size
 * every national ID, licence and bank card on earth is cut to. It was a wide
 * rectangle before, which is not the shape of anything anybody was being asked
 * to photograph, so people filled it and cropped their own card.
 *
 * **A face** gets a circle inside a ring of radial ticks, which is what every
 * liveness capture looks like and what the instruction refers to: turn your
 * head and the ring is the thing you are turning inside.
 *
 * Both are dimmed with one large box-shadow rather than an SVG mask, so the
 * shape follows the element's real aspect ratio instead of being stretched by
 * preserveAspectRatio.
 */
function Viewfinder({ frame }: { frame: Frame }) {
  /* No overlay at all. The oval that used to sit here told somebody to centre
     their face in it — which is the wrong instruction for this photo, where
     the card has to be in shot beside the head and an oval sized for a face
     crops it out. The pose is shown above the viewfinder instead, drawn, and
     the frame is left clear so people can see what they are actually
     composing. */
  if (frame === "none") return null;
  if (frame === "face") return <FaceFinder />;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className="relative aspect-[1.586/1] w-[78%]"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.58)" }}
      >
        {[
          "left-0 top-0 border-l-2 border-t-2 rounded-tl-sm",
          "right-0 top-0 border-r-2 border-t-2 rounded-tr-sm",
          "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-sm",
          "right-0 bottom-0 border-r-2 border-b-2 rounded-br-sm",
        ].map((c) => (
          <span key={c} className={cn("absolute h-6 w-6 border-white/90", c)} />
        ))}
      </div>
      <p className="absolute inset-x-0 bottom-2.5 text-center text-[11px] font-medium text-white/90">
        Fill the frame — all four corners inside
      </p>
    </div>
  );
}

/**
 * A plain oval, and nothing more.
 *
 * This was a ring of 72 ticks with the first quarter green, under an
 * instruction to turn your head — which reads as a liveness capture tracking
 * the movement. Nothing was tracking anything. The ring was decoration shaped
 * like a measurement, and a progress indicator that cannot progress is worse
 * than no indicator: it tells somebody to keep turning until a thing that will
 * never happen happens.
 *
 * Real liveness needs face tracking — landmark detection frame by frame, a
 * challenge the person cannot pre-record, and a check that the face in the
 * frame is the face on the card. That is a library and a real piece of work,
 * not a circle. Until it exists this asks for one photo and says so.
 */
function FaceFinder() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className="relative aspect-[3/4] h-[84%] rounded-[50%] border-2 border-white/85"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }}
      />
      <p className="absolute inset-x-0 bottom-2.5 text-center text-[11px] font-medium text-white/90">
        Centre your face in the oval
      </p>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, "");
}

function btn(kind: "primary" | "ghost" | "quiet") {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium",
    "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:opacity-50 disabled:active:scale-100",
    kind === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-500"
      : kind === "ghost"
        ? "border border-border bg-background text-foreground hover:bg-muted"
        : /* The quiet kind still has to be readable — see the note in
             two-factor-setup. */
          "text-foreground/75 hover:text-foreground"
  );
}

export default PhotoCapture;
