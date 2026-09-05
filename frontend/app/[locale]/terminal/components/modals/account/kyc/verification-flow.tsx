"use client";

/**
 * Identity verification, in two screens.
 *
 * It was five: confirm your details, country, document, your photo, review.
 * Three of those were subtraction waiting to happen.
 *
 *  - **Review** showed you what you had typed one screen after typing it, and
 *    nothing could be corrected there anyway — you pressed Back. What was sent
 *    is on the confirmation card instead.
 *  - **Country** asked for something already known. Verification now refuses to
 *    start without a complete address, so the country is read from it and shown
 *    as a line you can change rather than a decision you must make.
 *  - **Your details** moved to the screen before this one, next to the button
 *    that starts it. Somebody whose profile is complete never sees a step.
 *
 * What is left is the two things only the applicant can supply: which document,
 * and the photos of it. The photos come one at a time and advance themselves,
 * because three capture boxes stacked on one screen is a screen you scroll past
 * your own progress to finish.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Search, Smartphone } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { kycDocumentUploader } from "@/utils/kyc-upload";
import { PhotoCapture } from "./photo-capture";
import { DocumentDrop } from "./document-upload";
import { GuideStrip, SelfieHowTo } from "./capture-guides";
import { readProfile } from "./profile-details";
import { PhoneHandoff } from "./phone-handoff";
import { ChoiceRow, DocumentMark, FlowSteps, Heading, Label, Note, PrimaryAction, inputClass } from "./ui";
import {
  checkNumber,
  normaliseNumber,
  useKycRules,
  type CountrySpec,
  type DocumentSpec,
} from "./use-kyc-rules";

type Uploaded = { url: string; preview: string } | null;
type Slot = "front" | "back" | "selfie";

/* Said once per screen rather than once per photo. The document rules cover
   both sides — they are the same card — and the selfie's are about the pose,
   which is the only thing that screen can get wrong. */
const DOCUMENT_RULES = [
  "Bright and in focus — every character readable",
  "All four corners inside the frame",
  "The original card, not a photocopy or a screen",
];

/* Always the front, even for a two-sided document. The front is the side that
   carries the photograph and the name, so it is the only side a reviewer can
   match against the face beside it — a selfie holding the back of an Aadhaar
   proves nothing about who is holding it. */
const selfieRules = (label: string) => [
  {
    id: "front",
    text: (
      <>
        Hold the <Emphasis>front side</Emphasis> of your {label} next to your face
      </>
    ),
  },
  { id: "fingers", text: "Keep your fingers off the photo and the text" },
  { id: "clear", text: "Your face and the card both clear and fully in the photo" },
];

/**
 * The one phrase on a line that decides whether the photo is usable.
 *
 * Weight and the full foreground colour, not a second hue: everything around
 * it is already `--muted-foreground`, so lifting a phrase to `--foreground` is
 * a step people see without another colour arriving to mean something. Two
 * sides of a card look alike in a wallet, and "front" is the whole
 * instruction — a selfie holding the back proves nothing about who is holding
 * it, and it is the most common reason this step comes back.
 */
function Emphasis({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export const VerificationFlow = memo(function VerificationFlow({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useUserStore();
  const { countries, loading } = useKycRules();

  const profileCountry = String(
    readProfile(user)?.location?.countryCode || readProfile(user)?.location?.country || ""
  ).toUpperCase();

  const [step, setStep] = useState<0 | 1>(0);
  const [country, setCountry] = useState<CountrySpec | null>(null);
  const [changingCountry, setChangingCountry] = useState(false);
  const [doc, setDoc] = useState<DocumentSpec | null>(null);
  const [number, setNumber] = useState("");
  const [front, setFront] = useState<Uploaded>(null);
  const [back, setBack] = useState<Uploaded>(null);
  const [selfie, setSelfie] = useState<Uploaded>(null);
  /* Both sides of the document are asked for together; the selfie is the one
     photo that has to be taken now rather than found, so it gets its own
     screen. `photoIndex` used to walk three slots one at a time. */
  const [phase, setPhase] = useState<"documents" | "selfie">("documents");
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);

  /* Read from the address they already gave. A country picker for a fact we
     hold is a question with one answer. */
  useEffect(() => {
    if (country || !countries.length) return;
    setCountry(countries.find((c) => c.code === profileCountry) || null);
  }, [countries, country, profileCountry]);

  const slots: Slot[] = useMemo(
    () => (doc?.sides === 2 ? ["front", "back", "selfie"] : ["front", "selfie"]),
    [doc]
  );
  const values: Record<Slot, Uploaded> = { front, back, selfie };
  const setters: Record<Slot, (v: Uploaded) => void> = { front: setFront, back: setBack, selfie: setSelfie };
  const needsBack = doc?.sides === 2;

  /* Where you are: `step` decides the first, and inside step 1 the photos
     phase decides between the last two. */
  const at = step === 0 ? 0 : phase === "documents" ? 1 : 2;

  const numberError = doc ? checkNumber(doc, number) : null;
  const canContinue = !!country && !!doc && !!number && !numberError;
  const documentsDone = !!front && (!needsBack || !!back);
  const allPhotos = slots.every((s) => !!values[s]);

  /* How far through the step in hand, for the rail leaving it. Picking the
     document is half of step one and typing a valid number is the other half;
     each side of the card is an equal share of step two. */
  const stepProgress =
    at === 0
      ? doc
        ? number && !numberError
          ? 1
          : 0.5
        : 0
      : at === 1
        ? ((front ? 1 : 0) + (needsBack ? (back ? 1 : 0) : 1)) / 2
        : selfie
          ? 1
          : 0;

  const upload = useCallback(
    async (which: Slot, file: File | null) => {
      if (!file) return setters[which](null);

      setUploading(which);
      setError(null);
      const preview = URL.createObjectURL(file);
      const result = await kycDocumentUploader({ file, dir: "kyc-documents" });
      setUploading(null);

      if (!result.success || !result.url) {
        URL.revokeObjectURL(preview);
        /* The uploader's own message is written for a developer — "Invalid
           response format" when the server is unreachable. Keep it for the
           console, say something actionable on screen. */
        console.error("KYC upload failed:", result.error);
        setError(
          "That photo could not be uploaded. Check your connection and try again, or use a smaller image."
        );
        return;
      }
      /* The photo stays on this step. Jumping to the next slot the instant an
         upload landed meant nobody ever saw what they had just sent, which is
         why "the photos are not saving" was the report — they were saving, and
         then disappearing. */
      setters[which]({ url: result.url, preview });
    },
    [setters]
  );

  const submit = useCallback(async () => {
    if (!country || !doc || !front || !selfie) return;
    setSubmitting(true);
    setError(null);

    const { error: err } = await $fetch({
      url: "/api/user/kyc/verification",
      method: "POST",
      body: {
        countryCode: country.code,
        documentId: doc.id,
        documentNumber: normaliseNumber(number),
        frontUrl: front.url,
        backUrl: back?.url || null,
        selfieUrl: selfie.url,
      },
      silent: true,
      silentSuccess: true,
    });
    setSubmitting(false);
    if (err) return setError(typeof err === "string" ? err : "Could not submit. Try again.");
    onDone();
  }, [back, country, doc, front, number, onDone, selfie]);

  return (
    <div className="mx-auto w-full max-w-[460px]">
      {/* Where you are, and the way back to anywhere you have been. The rail
          out of the step in hand fills as that step fills, so putting one side
          of the document in visibly moves it — see FlowSteps in kyc/ui. */}
      <FlowSteps
        /* Named for what you do on them, not for what they contain. "Photos"
           and "Your face" describe categories; "Upload ID" and "Selfie with
           ID" are the two things somebody is actually being asked for, and the
           second one carries the requirement — the ID has to be in the selfie
           — in the label itself. */
        steps={["ID details", "Upload ID", "Selfie with ID"]}
        at={at}
        progress={stepProgress}
        onJump={(i) => {
          if (i === 0) return setStep(0);
          if (i === 1) {
            setStep(1);
            setPhase("documents");
          }
        }}
      />

      <div className="mt-6">
        {step === 0 ? (
          <section>
            <Heading
              title="Your document"
              sub="Choose the ID you are going to photograph, and type the number on it."
            />

            {loading ? (
              <div className="grid h-24 place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : changingCountry || !country ? (
              <CountryPicker
                countries={countries}
                value={country}
                onChange={(c) => {
                  setCountry(c);
                  setDoc(null);
                  setNumber("");
                  setChangingCountry(false);
                }}
              />
            ) : (
              <>
                {/* The country is a fact, shown as one line. It is only a
                    decision for the few people whose ID was issued somewhere
                    other than where they live. */}
                <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5">
                  <img
                    src={`/img/flag/${country.code.toLowerCase()}.webp`}
                    alt=""
                    className="h-4 w-[22px] shrink-0 rounded-[3px] object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    Issued in <span className="font-semibold">{country.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setChangingCountry(true)}
                    className="shrink-0 text-[13px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-2">
                  {(doc ? [doc] : country.documents).map((d) => (
                    <ChoiceRow
                      key={d.id}
                      selected={doc?.id === d.id}
                      title={d.label}
                      detail={d.sides === 2 ? "Front and back" : "Front side only"}
                      mark={<DocumentMark id={d.id} />}
                      onSelect={() => {
                        setDoc(d);
                        setNumber("");
                        setBack(null);
                      }}
                    />
                  ))}
                  {doc && (
                    <button
                      type="button"
                      onClick={() => {
                        setDoc(null);
                        setNumber("");
                        setFront(null);
                        setBack(null);
                      }}
                      className="text-[13px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      Choose a different document
                    </button>
                  )}
                </div>

                {doc && (
                  <div className="mt-5">
                    <Label>{doc.label} number</Label>
                    <input
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder={doc.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={cn(inputClass, numberError && "border-destructive/60")}
                    />
                    <div className="mt-2">
                      {numberError ? <Note tone="bad">{numberError}</Note> : <Note>{doc.hint}</Note>}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ) : phase === "documents" ? (
          <section>
            <Heading
              title={`Photos of your ${doc?.label}`}
              sub={needsBack ? "Upload both sides." : "Upload the front."}
            />

            {/* Reference, said once for the pair — so it is sized as reference.
                The tiles were nearly 190px each here and were the loudest thing
                on the screen: three pictures of a card, larger than the two
                boxes somebody had come to fill. The rules run beside them now
                rather than under, which halves the block again. */}
            <div className="rounded-lg border border-border bg-card p-3.5">
              <GuideStrip kinds={["good", "glare", "cropped"]} />
              <ul className="mt-3 space-y-1.5">
                {DOCUMENT_RULES.map((r) => (
                  <li key={r} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {/* Two columns for a two-sided document, the full width for a
                one-sided one.
            
                A lone box in the first column of a two-column grid leaves the
                second one empty, and nothing is coming to fill it: the space
                beside it is not being held for anything, it just makes the only
                thing on the screen look like it lost its pair. So it takes the
                whole row. The card-shaped preview inside it does not grow with
                it — see DocumentDrop — because a 900px box would otherwise be
                560px of empty preview saying "no file yet". */}
            <div className={cn("mt-3 grid gap-3", needsBack && "sm:grid-cols-2")}>
              <DocumentDrop
                title={`Front side of ${doc?.label ?? "your document"}`}
                value={front?.preview || null}
                busy={uploading === "front"}
                onPick={(f) => upload("front", f)}
                onClear={() => upload("front", null)}
              />
              {needsBack && (
                <DocumentDrop
                  title={`Back side of ${doc?.label ?? "your document"}`}
                  value={back?.preview || null}
                  busy={uploading === "back"}
                  onPick={(f) => upload("back", f)}
                  onClear={() => upload("back", null)}
                />
              )}
            </div>

            {/* The other way to do the same thing, for anyone whose files are
                on the phone in their pocket. A quiet line, not a fourth boxed
                button: it is an alternative to the two boxes above, and giving
                it the same weight as them made the screen read as three equal
                choices when only one of them is the path most people take. */}
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                /* A control's label, not a caption — see the note in
                   two-factor-setup. */
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/75 underline underline-offset-2 hover:text-foreground hover:no-underline"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Files on your phone? Continue there instead
              </button>
            </div>
          </section>
        ) : (
          <section>
            <Heading
              title={`A photo of you, holding your ${doc?.label ?? "document"}`}
              sub={
                <>
                  Hold the <Emphasis>front side</Emphasis> next to your face and take a
                  photo.
                </>
              }
            />

            {/* The drawing and the rules, side by side.

                The document step teaches by counter-example — right, glare,
                cropped — and that works there because the three failures look
                different from across the room. Three tiles of a person holding
                a card at thumbnail size are three smudges you tell apart by
                reading the captions. One drawing, large enough that the hand,
                the card and the face are all legible, with the rules ticked
                off beside it. */}
            <div className="overflow-hidden rounded-lg border border-border bg-muted">
              <div className="flex items-center gap-4 p-4">
                <div className="w-[38%] max-w-[168px] shrink-0">
                  <SelfieHowTo />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-[19px] text-foreground">
                    How to take your ID selfie
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {selfieRules(doc?.label ?? "document").map((r) => (
                      <li key={r.id} className="flex gap-2 text-[12px] leading-[17px] text-muted-foreground">
                        <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-verified" strokeWidth={3} />
                        <span className="min-w-0">{r.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <PhotoCapture
                label="Your photo"
                requirements={[]}
                guides={[]}
                mode="user"
                frame="none"
                compact
                cameraLabel="Open front camera"
                uploadLabel="Upload a photo"
                value={selfie?.preview || null}
                busy={uploading === "selfie"}
                onChange={(f) => upload("selfie", f)}
              />
            </div>
          </section>
        )}
      </div>

      {phoneOpen && doc && (
        <div className="mt-4">
          <PhoneHandoff
            needs={slots}
            documentLabel={doc.label}
            onClose={() => setPhoneOpen(false)}
            onPhotos={(photos) => {
              /* Photos taken on the phone are already stored server-side, so
                 there is nothing to upload again — only a URL to adopt. The
                 preview is that same URL: it is the picture that was taken. */
              (Object.keys(photos) as Slot[]).forEach((k) => {
                const url = photos[k];
                if (!url || values[k]) return;
                setters[k]({ url, preview: url });
              });
            }}
          />
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Note tone="bad">{error}</Note>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {step === 0 ? (
          <PrimaryAction disabled={!canContinue} onClick={() => setStep(1)}>
            Continue
          </PrimaryAction>
        ) : phase === "documents" ? (
          /* Both sides land here, and the selfie is the next screen. It only
             unlocks once the document is complete, because a selfie holding a
             card we have not been given yet is a photo nobody can check. */
          <PrimaryAction disabled={!documentsDone} onClick={() => setPhase("selfie")}>
            Continue to your photo
          </PrimaryAction>
        ) : (
          <PrimaryAction disabled={!allPhotos} loading={submitting} onClick={submit}>
            Submit for review
          </PrimaryAction>
        )}

        <button
          type="button"
          onClick={() => {
            if (step === 0) return onCancel();
            if (phase === "selfie") return setPhase("documents");
            setStep(0);
          }}
          className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] font-medium text-foreground/75 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>
    </div>
  );
});

function CountryPicker({
  countries,
  value,
  onChange,
}: {
  countries: CountrySpec[];
  value: CountrySpec | null;
  onChange: (c: CountrySpec) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(term) || c.code.toLowerCase() === term);
  }, [countries, q]);

  return (
    <div>
      <Label>Where was it issued?</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 56 countries"
          className={cn(inputClass, "pl-10")}
        />
      </div>

      <div className="mt-2 max-h-[260px] overflow-y-auto rounded-lg border border-border">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            We do not support that country yet.
          </p>
        ) : (
          shown.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border px-3.5 py-3 text-left last:border-0",
                value?.code === c.code ? "bg-muted/60" : "hover:bg-muted/50"
              )}
            >
              <img
                src={`/img/flag/${c.code.toLowerCase()}.webp`}
                alt=""
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
                className="h-4 w-[22px] shrink-0 rounded-[3px] object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
                {c.name}
              </span>
              {value?.code === c.code && <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={3} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default VerificationFlow;
