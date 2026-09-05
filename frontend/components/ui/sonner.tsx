"use client";

/**
 * The toast, in the language the dialogs speak.
 *
 * It was sonner's default: a `--background` card with a hairline, a shadow, the
 * library's own tick in a filled white circle, and 6px of radius. Three things
 * were wrong with that on this product. The ground was `--background`, which is
 * *darker* than a card in the dark themes, so a message that is supposed to be
 * in front of the page read as a hole punched in it. The white disc was the
 * loudest thing on the screen for the most ordinary event there is — a save
 * that worked. And nothing about it matched a dialog, which is the other
 * surface this app floats over the page.
 *
 * So it is built from the same parts as `Notice` in the dialog kit, at the same
 * sizes: `--popover` at 12px radius, a 20px round glyph in the tone's own
 * colour, 13px type. See DIALOG-DESIGN.md — the tones there are the tones here,
 * and green stays a mark rather than a fill.
 */

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { Check, Info, TriangleAlert, X } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      /* Top right. Bottom-right is where this product's own work happens — the
         order panel, the positions strip and the phone's nav bar all live down
         there, and a card landing over any of them covers a control somebody is
         mid-way through using. */
      position="top-right"
      /* The glyphs, in the theme's tokens rather than the library's greens and
         reds. A 20px disc, which is the size the dialog kit's notices use. */
      icons={{
        success: (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-verified text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ),
        error: (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-danger-solid text-white">
            <X className="h-3 w-3" strokeWidth={3} />
          </span>
        ),
        warning: (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-attention text-black">
            <TriangleAlert className="h-3 w-3" strokeWidth={2.6} />
          </span>
        ),
        info: (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
            <Info className="h-3 w-3" strokeWidth={2.8} />
          </span>
        ),
      }}
      /* Sonner lays its stack out inside a container sized by `--width`, and
         every toast is absolutely positioned against it. That number has to be
         a length: `auto` collapses the container's own box and the cards
         stretched to the height of the window with the tick floating in the
         middle of them. 340px, a little under the library's 356, and the card
         is trimmed to its text from the inside instead. */
      style={{ ["--width" as any]: "340px" }}
      toastOptions={{
        /* Inline, not classes. Sonner injects its own stylesheet at runtime,
           after the app's, and its `[data-sonner-toast]` rules carry the same
           specificity as a utility class — so `bg-popover` lost to
           `--normal-bg` every time and the card kept the library's ground.
           Inline styles are the one thing that cannot be out-ordered. */
        style: {
          background: "hsl(var(--popover))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "12px",
          padding: "12px 14px",
          /* `fit-content` against the container's 340, and pushed to the right
             edge of it, so a four-word message is a four-word card rather than
             a slab with a paragraph of empty space after it — without taking
             the container's own width away from the library. */
          width: "fit-content",
          maxWidth: "100%",
          marginLeft: "auto",
          boxShadow: "0 18px 40px -14px rgba(0, 0, 0, 0.55)",
        },
        classNames: {
          toast: "group toast items-start gap-3",
          /* 13px medium: the same weight a dialog gives a row title. The
             library's default is 14px semibold, which on a two-line toast made
             the message shout and the detail whisper. */
          title: "text-[13px] font-medium leading-[18px]",
          description: "group-[.toast]:text-muted-foreground text-[12.5px] leading-[17px]",
          icon: "mt-px",
          actionButton:
            "group-[.toast]:bg-brand group-[.toast]:text-brand-foreground font-semibold rounded-lg",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-foreground font-medium rounded-lg",
          closeButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
