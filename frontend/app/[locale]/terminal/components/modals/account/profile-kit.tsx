"use client";

/**
 * The pieces the profile page is built from.
 *
 * Split out of personal-panel because that file is now four editable sections
 * and the shared furniture was competing with them for attention. Nothing here
 * knows what a user is; it is a card, a row, a chip and a background.
 *
 * The layout rule that matters: a row is a two-column grid, label left and
 * value left-aligned in its own column, not label-left/value-right. Right
 * alignment makes every value start at a different x, so a column of facts has
 * no edge to read down — the eye tracks back and forth per line. A second
 * column gives them one.
 */

import { memo, useRef, useState } from "react";
import { Camera, Check, Copy, Loader2, Lock, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Flag } from "@/components/ui/flag";
import {
  DialogBody,
  DialogButton,
  DialogFooter,
  DialogHeader,
  Labelled,
  Modal,
  dialogInput,
} from "@/components/ui/dialog-kit";
import { AvatarCropper } from "./avatar-cropper";
import { AvatarPicker } from "./avatar-picker";

/* ── the background ───────────────────────────────────────────────────── */

/**
 * The scattered grid behind the portrait.
 *
 * An SVG pattern rather than a CSS gradient, because the pattern is not a grid
 * — it is a grid with some cells filled, in no order. Gradients can draw the
 * lines but not the scatter, and the first attempt at this looked like an empty
 * table.
 *
 * The tile is four cells square and repeats seamlessly: a cell filled at the
 * tile's edge meets an empty one across the join, so the eye reads scatter
 * rather than a motif repeating every 224px. It draws in `currentColor`, so the
 * caller sets the colour once and light, dark and navy are all correct.
 *
 * It is masked so it dissolves into the page at the left, right and bottom
 * rather than stopping at a hard edge. A rectangle of pattern with a rule under
 * it is a banner — a box sitting on the page. Faded out on three sides it is
 * the page's own background, which is what it should be. One radial gradient
 * does all three: opaque near the top centre, transparent by the sides and the
 * bottom. The top is left solid because the panel's own edge is already there.
 */
/* The horizontal radius is deliberately tighter than the vertical one. At 125%
   the sides were still inside the opaque stop by the time they reached the
   panel edge, so the pattern faded downwards but ran off the left and right
   with a hard edge — which is the box the fade was meant to remove. */
const FADE = "radial-gradient(88% 115% at 50% 0%, #000 30%, transparent 100%)";

export const ScatterGrid = memo(function ScatterGrid({
  id,
  opacity = 1,
  tone = "text-border",
}: {
  id: string;
  /**
   * How strongly the pattern reads, on top of the mask.
   *
   * The profile hero, which this was drawn for, has nothing over it — a name,
   * an address, and a photograph, all opaque. The support screens put a
   * translucent illustration on the same ground, and at full strength the grid
   * came through the drawing: a wall behind a window rather than a surface
   * under an object. Default unchanged, so the account section is untouched.
   */
  opacity?: number;
  /**
   * What the grid is drawn in.
   *
   * `--border` is right on the profile hero, where the pattern is a texture
   * under a photograph and should be felt rather than seen. On the support
   * band it is under a drawing on a lifted surface, and at border strength the
   * squares disappeared into it — the box read as flat. A `--foreground` alpha
   * gives that band a grid you can actually see in all three themes, since it
   * is dark on light grounds and light on dark ones by construction.
   */
  tone?: string;
}) {
  const cell = 56;
  const tile = cell * 4;
  /* Chosen by hand, not generated: a random mask clumps, and the clumps are
     what make a repeat visible. These sit apart in both axes and none touches
     the tile edge on more than one side. */
  const filled = [
    [0, 1],
    [2, 0],
    [3, 2],
    [1, 3],
    [2, 3],
  ];

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", tone)}
      aria-hidden="true"
      style={{
        maskImage: FADE,
        WebkitMaskImage: FADE,
        opacity,
      }}
    >
      <defs>
        <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
          {filled.map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill="currentColor"
              opacity="0.35"
            />
          ))}
          <path
            d={[0, 1, 2, 3]
              .map((i) => `M${i * cell} 0V${tile}M0 ${i * cell}H${tile}`)
              .join("")}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.55"
            fill="none"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
});

/* ── the card ─────────────────────────────────────────────────────────── */

/**
 * A section of the profile, with its own edit control.
 *
 * Editing is per card rather than per page. A single "Edit details" button
 * swapped the whole profile for a form, which meant changing a postcode took
 * you away from everything else you were reading; per field it would mean a
 * pencil on every line and a save for each one. A card is the unit somebody
 * actually thinks in — "my address", "my name" — so it is the unit that
 * changes.
 */
export const ProfileCard = memo(function ProfileCard({
  title,
  onEdit,
  children,
  className,
  locked,
}: {
  title: string;
  /** Omit for a card with nothing editable in it. */
  onEdit?: () => void;
  children: React.ReactNode;
  className?: string;
  /** Everything in the card is shut. The Edit button is replaced rather than
      hidden: a control that disappears reads as a page that lost something,
      where a lock in the same place answers the question it raises. */
  locked?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {locked ? (
          <span
            title="Verified — contact support to change these"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2",
              "text-[12px] font-medium text-muted-foreground"
            )}
          >
            <Lock className="h-3 w-3" />
            Locked
          </span>
        ) : (
          onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2",
              "text-[12px] font-medium text-muted-foreground",
              "hover:bg-muted hover:text-foreground active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          )
        )}
      </div>

      {/* `flex-1` so a card stretched to its row's height puts the surplus
          below its rows rather than spreading it between them. */}
      <div className="flex-1 px-4 py-1">{children}</div>
    </section>
  );
});

/* ── the rows ─────────────────────────────────────────────────────────── */

const ROW = "grid grid-cols-[minmax(96px,34%)_1fr] items-center gap-3 py-2.5";
/* Dashed, not solid: these separate lines within one list rather than dividing
   the card into parts, and a solid rule at this density reads as a table. */
const RULE = "border-b border-dashed border-border last:border-0";

/** One fact. Label, then value, both left-aligned in their own column. */
export const Row = memo(function Row({
  label,
  value,
  chip,
  mono,
  control,
  flag,
}: {
  label: string;
  value?: string | null;
  chip?: { text: string; tone: Tone };
  mono?: boolean;
  /** Replaces the value entirely — an input, a select, a copy button. */
  control?: React.ReactNode;
  /** ISO-3166 alpha-2, drawn before the value. The flat asset, never the emoji
      — see `Flag`. */
  flag?: string | null;
}) {
  return (
    <div className={cn(ROW, RULE)}>
      <span className="text-[12px] leading-snug text-muted-foreground">{label}</span>
      {control ? (
        <div className="min-w-0">{control}</div>
      ) : chip ? (
        <div className="min-w-0">
          <Chip tone={chip.tone}>{chip.text}</Chip>
        </div>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          {value && <Flag code={flag} title={value} />}
          <span
            className={cn(
              "min-w-0 truncate text-[13px] leading-snug",
              mono && "font-mono text-[13px]",
              /* An empty field says so. A blank value side reads as a rendering
                 fault rather than as something not filled in yet. */
              value ? "font-medium text-foreground" : "text-muted-foreground"
            )}
            title={value || undefined}
          >
            {value || "Not set"}
          </span>
        </span>
      )}
    </div>
  );
});

/* ── chips ────────────────────────────────────────────────────────────── */

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  /* Colour is doubled by a word in every one of these, never carried alone.

     Hairline and text, no fill. A tinted block behind two words is what made
     every state on these pages read as a badge to be noticed rather than a
     fact to be read, and the tint had to be a saturated hue to survive being a
     background at all. `--verified` and `--attention` are text colours, mixed
     at printing-ink saturation, so the chip can be a border and a word. */
  ok: "border-verified/35 text-verified",
  warn: "border-attention/35 text-attention",
  danger: "border-destructive/35 text-destructive",
  info: "border-blue-500/30 text-blue-600 dark:text-blue-400",
  neutral: "border-border text-muted-foreground",
};

export const Chip = memo(function Chip({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
});

/* ── copy ─────────────────────────────────────────────────────────────── */

/**
 * A value with a copy control that reports the truth.
 *
 * `navigator.clipboard` rejects on an insecure origin and in a browser that has
 * not granted permission, so the tick only appears once the write resolved.
 */
export const CopyValue = memo(function CopyValue({
  value,
  className,
  label = "Copy",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Nothing was copied, so nothing says it was. */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} ${value}`}
      className={cn(
        "group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md",
        "text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
    >
      <span className="truncate font-mono text-[13px] font-medium text-foreground">
        {value}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-verified" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
});

/* ── form controls, sized to sit inside a Row ─────────────────────────── */

/* The dialog kit's own field, at the dialog size — 44px, so a footer button and
   an input never disagree about the height of a row. See DIALOG-DESIGN.md.
   `min-w-0` on top of it because these sit in a two-column grid, where a field
   that cannot shrink pushes its neighbour out of the card. */
export const editInputClass = cn(dialogInput, "min-w-0");

/* ── the edit dialog ──────────────────────────────────────────────────── */

/**
 * Editing happens over the page, not inside it.
 *
 * The first version turned a card's rows into inputs in place. It worked, but
 * an input is taller than the line of text it replaces — and the identity block
 * is taller still — so opening Personal details grew that card by half its
 * height and shoved Location down past the fold, while the two cards beside it
 * stayed put. The grid came apart every time somebody pressed Edit.
 *
 * A dialog costs the page nothing: the four cards stay exactly where they are,
 * dimmed and blurred behind it, and the form gets as much room as it needs.
 *
 * Built out of the shared dialog kit — the header, the rule, the body, the
 * footer and the buttons are all its. It was hand-rolled once because the
 * *old* shared Dialog pinned its overlay at z-50 and would have opened behind
 * the account overlay, which is a portal at z-[9999]. The kit's `Modal` is at
 * z-[10050], so that reason is gone, and with it a second dialog language in a
 * product that has one. See DIALOG-DESIGN.md.
 */
export const EditDialog = memo(function EditDialog({
  open,
  title,
  description,
  onClose,
  onSave,
  saving,
  children,
  wide,
  notice,
  action,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
  /** Two columns of fields rather than one. */
  wide?: boolean;
  /** What to know before reading the fields — a `Notice`, at the top of the
      body. The kit's rule 5: a consequence goes in a notice, never in a
      paragraph. */
  notice?: React.ReactNode;
  /** Replaces "Save changes" where the dialog has nothing to save — a form
      that is entirely locked ends in the way *out* of being locked. */
  action?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!saving}
      label={title}
      className={wide ? "max-w-[620px]" : "max-w-[440px]"}
    >
      <DialogHeader
        title={title}
        subtitle={description}
        onClose={onClose}
        closeDisabled={saving}
      />

      <DialogBody>
        {notice && <div className="mb-5">{notice}</div>}
        <div className={cn("grid gap-4", wide && "sm:grid-cols-2")}>{children}</div>
      </DialogBody>

      <DialogFooter
        ruled
        cancel={
          <DialogButton tone="quiet" onClick={onClose} disabled={saving}>
            Cancel
          </DialogButton>
        }
        action={
          action ?? (
            <DialogButton onClick={onSave} busy={saving}>
              Save changes
            </DialogButton>
          )
        }
      />
    </Modal>
  );
});

/** A labelled field inside the edit dialog. */
export const DialogField = memo(function DialogField({
  label,
  hint,
  children,
  className,
  locked,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** Write-once and already written. Marks the label rather than adding a line
      under the field — see the note by `LockedFootnote`. */
  locked?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Labelled
        label={
          locked ? (
            <span className="inline-flex items-center gap-1.5">
              {label}
              <Lock className="h-3 w-3 shrink-0" />
            </span>
          ) : (
            label
          )
        }
        helper={hint}
      >
        {children}
      </Labelled>
    </div>
  );
});

/**
 * What the locks on the labels mean, said once at the foot of the form.
 *
 * Three fields in Personal details are write-once, and each of them used to
 * carry "Contact support to change it." under it. The same sentence three times
 * in one dialog is not three pieces of information — it is one, printed until
 * it reads as small print, and it dragged the rows out of line with each other
 * because only some fields had a line under them. The lock on the label says
 * which fields; this says what that means.
 */
export const LockedFootnote = memo(function LockedFootnote({
  className,
}: {
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <Lock className="h-3 w-3 shrink-0" />
      Locked fields can only be changed by support.
    </p>
  );
});

/* ── the portrait's avatar ────────────────────────────────────────────── */

/**
 * The photo, which is also the control that changes it.
 *
 * It reads as a picture until you point at it, then says so.
 *
 * Clicking it opens the picker, not the operating system's file dialog. Going
 * straight to the file dialog made "change my picture" and "have a photograph"
 * the same question, and anybody who did not want to upload a picture of
 * themselves was stuck with their initials. From the picker, "Upload a photo"
 * reaches the same file input and the same cropper it always did — nothing is
 * sent until it is framed.
 *
 * The rail's avatar is this same component at a smaller size, so both go
 * through the same picker and there is one definition of what changing your
 * picture does.
 */
export const EditableAvatar = memo(function EditableAvatar({
  src,
  initials,
  uploading,
  onPick,
  onChooseAvatar,
  size = 92,
  badge = true,
}: {
  src?: string | null;
  initials: string;
  uploading?: boolean;
  onPick: (file: File) => void;
  /** Absent where an avatar cannot be chosen — the picker then offers upload
      alone rather than a grid that saves nothing. */
  onChooseAvatar?: (url: string) => void | Promise<unknown>;
  size?: number;
  /** The little camera dot. It scales with `size`, so it is worth keeping even
      on the rail's 42px avatar — without it that one has no affordance. */
  badge?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [picking, setPicking] = useState(false);

  /* Proportional, so the 42px avatar in the rail can carry the same badge the
     92px one does instead of going without and having no affordance at all —
     which is what happened when the scrim was the only hint on the small one. */
  const badgeSize = Math.round(Math.min(28, Math.max(16, size * 0.3)));
  const glyph = Math.round(badgeSize * 0.5);

  return (
    <>
      <button
        type="button"
        onClick={() => (onChooseAvatar ? setPicking(true) : fileRef.current?.click())}
        aria-label="Change profile photo"
        className="group relative shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        style={{ width: size, height: size }}
      >
        <Avatar className="h-full w-full border-4 border-card shadow-sm ring-1 ring-border">
          <AvatarImage src={src || undefined} alt="" />
          <AvatarFallback
            className="bg-muted font-medium text-muted-foreground"
            style={{ fontSize: Math.max(11, Math.round(size / 4)) }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* One camera, on the corner, and nothing over the picture.

            There were two: a full-circle scrim with a camera in the middle that
            appeared on hover, and this badge. Together they meant that pointing
            at your own photograph greyed it out and covered it with an icon —
            the one moment you are looking at it is the one moment it was hidden.
            The badge alone says the same thing and leaves the picture alone,
            which is what a photograph is for.

            It carries the spinner too, so a save has somewhere to show without
            the scrim coming back. */}
        {badge && (
          <span
            className={cn(
              "absolute bottom-0 right-0 grid place-items-center rounded-full",
              "border-2 border-card bg-muted text-muted-foreground shadow-sm",
              "transition-colors group-hover:bg-primary group-hover:text-primary-foreground",
              uploading && "bg-primary text-primary-foreground"
            )}
            style={{ width: badgeSize, height: badgeSize }}
          >
            {uploading ? (
              <Loader2 className="animate-spin" style={{ width: glyph, height: glyph }} />
            ) : (
              <Camera style={{ width: glyph, height: glyph }} />
            )}
          </span>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Straight to the cropper. Nothing is uploaded until it is framed.
          if (f) setPending(f);
          e.target.value = "";
        }}
      />

      <AvatarPicker
        open={picking}
        current={src}
        busy={uploading}
        onClose={() => setPicking(false)}
        /* The picker closes on the way to the file dialog. It has nothing to
           say while the operating system is in front of it, and leaving it up
           would put the cropper on top of a second scrim. */
        onUpload={() => {
          setPicking(false);
          fileRef.current?.click();
        }}
        onChoose={async (url) => {
          await onChooseAvatar?.(url);
          setPicking(false);
        }}
      />

      <AvatarCropper
        file={pending}
        busy={uploading}
        onCancel={() => setPending(null)}
        onConfirm={(cropped) => {
          setPending(null);
          onPick(cropped);
        }}
      />
    </>
  );
});
