"use client";

/**
 * What a good photo looks like, and the three ways it goes wrong.
 *
 * These were drawn — a mint-green rectangle with a silhouette and three bars
 * standing in for text. It was recognisable as *a card* and as nothing more
 * specific, and somebody checking their own photo against a thumbnail is
 * matching detail: a face, a name, a number, an edge.
 *
 * They are photographs of one card now, and one card only. It is cropped out
 * of the supplied illustration — the same ID the character on the selfie
 * screen is holding, so the document in the guidance and the document in the
 * drawing are the same object — and the three failures are that same crop put
 * through what actually causes them:
 *
 *   glare    a blown-out band across the face of it, at the angle a ceiling
 *            light falls
 *   cropped  scaled up and offset, so the right edge and the number run off
 *            the frame
 *   blurry   the whole card, square on, and none of it readable — the failure
 *            somebody only discovers after they have sent it
 *
 * All four are generated from the one source at 360×252 and saved as WebP,
 * 6-8KB each. The verdict badge stays in the DOM rather than being baked in,
 * so the tick and the cross keep the theme's own `--verified` and
 * `--danger-solid` instead of two colours frozen into a picture.
 */

import { memo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "good" | "glare" | "cropped" | "blurry";

const TILE: Record<Kind, { src: string; caption: string; ok: boolean }> = {
  good: { src: "/img/kyc/doc-good.webp", caption: "Like this", ok: true },
  glare: { src: "/img/kyc/doc-glare.webp", caption: "No glare", ok: false },
  cropped: { src: "/img/kyc/doc-cropped.webp", caption: "All corners", ok: false },
  /* Used by the phone handoff, which asks for the back of a card and warns
     about focus rather than about corners. */
  blurry: { src: "/img/kyc/doc-blurry.webp", caption: "In focus", ok: false },
};

export const GuideStrip = memo(function GuideStrip({ kinds }: { kinds: Kind[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {kinds.map((k) => {
        const t = TILE[k];
        return (
          <figure key={k} className="min-w-0">
            <div className="relative overflow-hidden rounded-md border border-border bg-muted/40">
              <img
                src={t.src}
                alt=""
                width={360}
                height={252}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full select-none"
                draggable={false}
              />
              <Badge ok={t.ok} />
            </div>
            <figcaption className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">
              {t.caption}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
});

/**
 * The pose, as an illustration rather than as paths.
 *
 * Five attempts were made at drawing this character by hand — a line-art card,
 * a flat figure with a face, a jawline version, a forward-grip version whose
 * hand came out as a mitten over the card. Hand-authored SVG is good at
 * geometry and bad at anatomy: the ID card on the account header is drawn in
 * this codebase and looks right, and every person drawn beside it did not.
 *
 * This is the supplied artwork instead, with its striped background removed by
 * a flood fill inward from the image border — so the white card, the white
 * collar and every other pale area enclosed by the figure survived, because
 * none of them touch the edge. Exported at 560px tall as WebP with alpha,
 * which is 29KB against 495KB for the same crop as a PNG.
 *
 * The second character (`id-selfie-suit.webp`) is cut out and committed
 * alongside this one. Nothing uses it yet; it is there so the illustration can
 * be swapped without going back to the source image.
 *
 * `priority` is deliberately not set. This sits on the third screen of a flow
 * nobody reaches by accident, so it should not compete with the first paint.
 */
export const SelfieHowTo = memo(function SelfieHowTo() {
  return (
    <img
      src="/img/kyc/id-selfie-casual.webp"
      alt=""
      width={565}
      height={560}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full select-none"
      draggable={false}
    />
  );
});

/** The verdict, over the corner of the picture. */
function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full text-white shadow-sm",
        ok ? "bg-verified" : "bg-danger-solid"
      )}
    >
      {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : <X className="h-3.5 w-3.5" strokeWidth={3.5} />}
    </span>
  );
}

export default GuideStrip;
