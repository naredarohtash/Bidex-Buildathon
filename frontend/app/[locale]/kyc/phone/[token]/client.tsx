"use client";

/**
 * The phone half of verification.
 *
 * Someone reaches this from a QR code on their computer or a link in their
 * email, holding a token and nothing else — no session, no cookie, no account.
 * So the page asks the server only what that token is allowed to reveal: which
 * photos are still wanted and what the document is called. No name, no email,
 * no balance. A link read over a shoulder should not say whose it is.
 *
 * It uploads through the token-scoped endpoint rather than the session one, and
 * the computer picks the photos up on its next poll. Nothing here can submit
 * the application; the person finishes that on the machine they started on.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoCapture } from "@/app/[locale]/terminal/components/modals/account/kyc/photo-capture";

type Slot = "front" | "back" | "selfie";

const COPY: Record<Slot, { title: string; sub: string; requirements: string[]; guides: any[] }> = {
  front: {
    title: "Front of your document",
    sub: "The side with your photograph on it.",
    requirements: [
      "Bright and in focus — every character readable",
      "All four corners inside the frame",
      "The original card, not a photocopy or a screen",
    ],
    guides: ["good", "glare", "cropped"],
  },
  back: {
    title: "Back of your document",
    sub: "Turn the card over. This side carries the address and the barcode.",
    requirements: [
      "The side carrying the address or barcode",
      "Flat, with no fingers over the print",
      "Same card as the front",
    ],
    guides: ["good", "blurry", "cropped"],
  },
  selfie: {
    title: "A photo of you",
    sub: "Face the camera and turn your head slowly in a circle.",
    requirements: ["Face the camera in even light", "No hat, sunglasses or mask", "Just you in the frame"],
    guides: ["face-good", "face-far", "face-covered"],
  },
};

async function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Could not read that photo"));
    r.readAsDataURL(file);
  });
}

export default function PhoneHandoffClient({ token }: { token: string }) {
  const [state, setState] = useState<
    { alive: boolean; needs: Slot[]; done: Slot[]; documentLabel: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kyc/handoff/${encodeURIComponent(token)}`);
      setState(await res.json());
    } catch {
      setState({ alive: false, needs: [], done: [], documentLabel: "" });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = (state?.needs || []).filter((n) => !(state?.done || []).includes(n));
  const slot = remaining[0];

  const send = useCallback(
    async (file: File | null) => {
      if (!file || !slot) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/kyc/handoff/${encodeURIComponent(token)}/photo`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, file: await toDataUrl(file) }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.message || "That photo could not be sent");
        await load();
      } catch (e: any) {
        setError(e?.message || "That photo could not be sent");
      } finally {
        setBusy(false);
      }
    },
    [load, slot, token]
  );

  if (!state) {
    return (
      <Shell>
        <div className="grid h-40 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!state.alive) {
    return (
      <Shell>
        <h1 className="text-[20px] font-semibold text-foreground">This link has expired</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Handoff links last fifteen minutes. Go back to your computer and start the phone step
          again — a new link takes a second.
        </p>
      </Shell>
    );
  }

  if (!slot) {
    return (
      <Shell>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/12">
          <Check className="h-6 w-6 text-emerald-500" strokeWidth={3} />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold text-foreground">All photos sent</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          They are on your computer already. Go back to it to finish — you can close this page.
        </p>
      </Shell>
    );
  }

  const copy = COPY[slot];
  const total = state.needs.length;
  const index = state.needs.indexOf(slot);

  return (
    <Shell>
      <div className="flex items-center gap-1.5">
        {state.needs.map((n, i) => (
          <span
            key={n}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              state.done.includes(n) ? "bg-emerald-500" : i === index ? "bg-foreground" : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Photo {index + 1} of {total}
      </p>

      <h1 className="mt-4 text-[20px] font-semibold leading-tight text-foreground">{copy.title}</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{copy.sub}</p>

      <div className="mt-5">
        <PhotoCapture
          label={copy.title}
          requirements={copy.requirements}
          guides={copy.guides}
          mode={slot === "selfie" ? "user" : "environment"}
          frame={slot === "selfie" ? "face" : "card"}
          compact={index > 0}
          value={null}
          busy={busy}
          onChange={send}
        />
      </div>

      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="mb-6 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Identity verification
        </div>
        {children}
      </div>
    </div>
  );
}
