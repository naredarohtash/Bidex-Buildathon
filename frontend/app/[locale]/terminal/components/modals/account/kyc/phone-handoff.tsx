"use client";

/**
 * Hand the camera steps to a phone.
 *
 * Three ways in, because the reason somebody needs this varies: a QR code for
 * the phone already in their hand, an emailed link for the phone that is not,
 * and the raw address for anyone whose camera app will not scan.
 *
 * The desktop polls while this is open. When a photo lands on the phone it
 * appears here within a few seconds and the step it belongs to ticks over —
 * so the person can watch their own progress cross between two devices, which
 * is the only reassurance available that the two halves are talking.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, Loader2, Mail, X } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type Slot = "front" | "back" | "selfie";

export const PhoneHandoff = memo(function PhoneHandoff({
  needs,
  documentLabel,
  onPhotos,
  onClose,
}: {
  needs: Slot[];
  documentLabel: string;
  /** Called whenever the phone has sent something new. */
  onPhotos: (photos: Partial<Record<Slot, string>>) => void;
  onClose: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<Slot[]>([]);
  const tokenRef = useRef<string | null>(null);

  /* One handoff per opening. Re-issuing on every render would invalidate the
     code the person is in the middle of scanning. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await $fetch({
        url: "/api/user/kyc/handoff",
        method: "POST",
        body: { needs, documentLabel },
        silent: true,
        silentSuccess: true,
      });
      if (cancelled) return;
      if (err || !data?.url) {
        setError("Could not start the phone step. Take the photos here instead.");
        return;
      }
      tokenRef.current = data.token;
      setLink(data.url);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Every three seconds while this is open. Slower and a photo taken on the
     phone sits there long enough for somebody to wonder whether it worked. */
  useEffect(() => {
    if (!link) return;
    const id = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const { data } = await $fetch({
        url: `/api/user/kyc/handoff?token=${encodeURIComponent(token)}`,
        silent: true,
        silentSuccess: true,
      });
      const photos = data?.photos || {};
      const arrived = Object.keys(photos) as Slot[];
      if (arrived.length) {
        setDone(arrived);
        onPhotos(photos);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [link, onPhotos]);

  const emailLink = useCallback(async () => {
    await $fetch({
      url: "/api/user/kyc/handoff",
      method: "POST",
      body: { needs, documentLabel, email: true },
      silent: true,
      silentSuccess: true,
    });
    setEmailed(true);
  }, [documentLabel, needs]);

  const copy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard refused. The address is on screen to be typed. */
    }
  }, [link]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Continue on your phone</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Scan this with your phone's camera. Take the photos there and they arrive here.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-[13px] text-destructive">{error}</p>
      ) : !link ? (
        <div className="grid h-40 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex justify-center">
            {/* On white, always. A QR code inverted for a dark theme is one a
                good many phone cameras refuse to read. */}
            <div className="rounded-md bg-white p-3">
              <QRCode value={link} size={148} />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            {needs.map((n) => (
              <span
                key={n}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
                  done.includes(n)
                    ? "border-verified/50 bg-verified/[0.07] text-verified"
                    : "border-border text-muted-foreground"
                )}
              >
                {done.includes(n) && <Check className="h-3 w-3" strokeWidth={3} />}
                {n === "front" ? "Front" : n === "back" ? "Back" : "Selfie"}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={emailLink}
              disabled={emailed}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
            >
              <Mail className="h-4 w-4" />
              {emailed ? "Link sent" : "Email me the link"}
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-muted/50"
            >
              {copied ? <Check className="h-4 w-4 text-verified" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            The link works for fifteen minutes and only for these photos.
          </p>
        </>
      )}
    </div>
  );
});

export default PhoneHandoff;
