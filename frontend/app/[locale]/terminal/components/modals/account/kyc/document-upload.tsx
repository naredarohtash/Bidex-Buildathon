"use client";

/**
 * Both sides of the document, on one screen.
 *
 * They used to arrive one at a time: front, advance, back, advance, selfie.
 * That is three screens for what is one errand — you have the card in your
 * hand, you photograph it, you are done — and the stepper that made the
 * sequence legible was itself an admission that the sequence needed
 * explaining. Two boxes side by side need no explaining at all: what is left
 * to do is whichever box is still empty.
 *
 * ── No camera here ────────────────────────────────────────────────────────
 *
 * A document is nearly always already a file. It was photographed earlier, or
 * downloaded from the issuer, or scanned — and on a laptop, holding a card up
 * to a webcam above the screen is the single worst way to photograph it: the
 * card is lit from behind by the display, the sensor is the cheapest one in
 * the machine, and the person cannot see what they are framing because their
 * own hand is in the way. Choosing a file, or carrying on with the phone in
 * their pocket, produces a readable document; the webcam produces the photo a
 * reviewer sends back.
 *
 * The selfie is the opposite case and keeps its camera — see the step after
 * this one, where the whole point is that the photo is taken now.
 *
 * ── The box is the button ─────────────────────────────────────────────────
 *
 * The first version of this was a dashed frame containing a grey rectangle
 * containing a small icon, with a filled blue Upload button under it. Three
 * nested containers to say "put a file here", a dead grey panel that read as a
 * broken image, and — with two boxes on screen — two blue buttons shouting
 * over the one blue button that actually advances the step.
 *
 * Now the whole empty box is the target: click it anywhere, or drop a file on
 * it. That is what people already try, it is what every other uploader they
 * use behaves like, and it leaves exactly one filled button on the screen —
 * the one that takes them onward.
 */

import { memo, useCallback, useRef, useState } from "react";
import { Check, RefreshCw, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/** Images only. A PDF cannot be previewed in an `<img>`, and a box that
    accepts a file it then cannot show is a box that looks broken. */
const ACCEPT = "image/jpeg,image/png,image/webp";

export const DocumentDrop = memo(function DocumentDrop({
  title,
  value,
  busy = false,
  onPick,
  onClear,
}: {
  /** Names the side *and* the document — "Front side of Aadhaar Card", not
      "Front side". The heading above already says which document this is, but
      the box is what somebody looks at while hunting through their files, and
      a caption carrying the document's name is the one that survives being
      read on its own. */
  title: string;
  /** A preview URL once something has been chosen. */
  value: string | null;
  busy?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const open = useCallback(() => fileRef.current?.click(), []);

  const drop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer.files?.[0];
      /* Only what this box can actually show. A dropped PDF or folder would
         otherwise be accepted and then render as a broken preview. */
      if (file && ACCEPT.includes(file.type)) onPick(file);
    },
    [onPick]
  );

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        /* Cleared so choosing the same file twice still fires a change —
           otherwise Replace does nothing when you pick what you already had. */
        e.target.value = "";
      }}
    />
  );

  /* One skeleton for both states — a card-shaped preview, the caption, the
     controls — so a filled box and an empty one are exactly the same height
     and the pair never goes out of step when only one of them has a file. */
  const preview = (
    /* An ID card, at the size of one — 1.586:1, and no wider than 300px, which
       is about the size the box is on a phone. It used to take whatever width
       it was given: one column of a 920px panel made it 265px tall, and the
       full row made it 560px. A grey rectangle that says "no file yet" does not
       get more useful as it gets bigger, and the ratio is what makes it read as
       the card you are about to photograph, so the ratio is what is kept. */
    <div className="relative mx-auto grid aspect-[1.586/1] w-full max-w-[300px] shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/40">
      {busy ? (
        <div className="flex flex-col items-center gap-2">
          <span className="h-1 w-24 overflow-hidden rounded-full bg-muted-foreground/20">
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
          </span>
          <span className="text-[11px] text-muted-foreground">Uploading…</span>
        </div>
      ) : value ? (
        <>
          <img src={value} alt={title} className="h-full w-full object-contain" />
          <span
            className={cn(
              "absolute left-2 top-2 inline-flex items-center gap-1 rounded-md",
              "bg-verified px-1.5 py-0.5 text-[10.5px] font-semibold leading-[14px] text-white"
            )}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
            Added
          </span>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 px-3 text-center">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full",
              over ? "bg-blue-500/15 text-blue-500" : "bg-muted text-muted-foreground"
            )}
          >
            <Upload className="h-4.5 w-4.5" strokeWidth={1.9} />
          </span>
          <span className="text-[11.5px] leading-[16px] text-muted-foreground">
            Click to choose, or drop a file here
          </span>
        </div>
      )}
    </div>
  );

  const caption = (
    <>
      {/* No second line under this. It used to explain which side was which —
          "the side with your photograph on it" — which is a sentence about a
          card the person is holding and can see. The rules that do carry
          information are above, said once for both boxes. */}
      <p className="mt-2.5 text-[13px] font-semibold leading-[18px] text-foreground">{title}</p>
      <p className="mt-0.5 text-[10.5px] leading-[14px] text-muted-foreground/70">
        JPG, PNG or WEBP
      </p>
    </>
  );

  /* ── nothing chosen: the whole box is the target ────────────────────── */
  if (!value && !busy) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        aria-label={`Upload ${title}`}
        className={cn(
          "flex cursor-pointer flex-col rounded-xl border border-dashed p-3 text-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          over ? "border-blue-500 bg-blue-500/[0.07]" : "border-border bg-background/40 hover:border-foreground/30 hover:bg-muted/20"
        )}
      >
        <div className={inner}>
          {preview}
          {caption}
          <div className="mt-auto flex gap-2 pt-2.5">
            <span className={cn(action, "pointer-events-none flex-1")}>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </span>
          </div>
        </div>
        {input}
      </div>
    );
  }

  /* ── chosen, or landing ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3 text-center">
      <div className={inner}>
        {preview}
        {caption}
        <div className="mt-auto flex gap-2 pt-2.5">
          <button type="button" onClick={open} disabled={busy} className={cn(action, "flex-1")}>
            <RefreshCw className="h-3.5 w-3.5" />
            Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            aria-label={`Remove ${title}`}
            className={cn(action, "w-10 shrink-0 px-0")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {input}
    </div>
  );
});

/* The box takes whatever width it is given — one column of a pair, or the whole
   row when the document has only a front — but what is inside it stops here, a
   little wider than the preview so the caption and the button belong to it
   rather than run off either side of it. */
const inner = "mx-auto flex w-full max-w-[340px] flex-1 flex-col";

/* Both controls are quiet. The only filled button on this screen is the one
   that advances the step. */
const action = cn(
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium",
  "border border-border bg-background text-foreground hover:bg-muted",
  "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  "disabled:opacity-50 disabled:active:scale-100"
);

export default DocumentDrop;
