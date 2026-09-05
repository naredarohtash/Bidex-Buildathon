"use client";

/**
 * Identity verification.
 *
 * Two screens: where you stand, and — when you choose to start — the flow that
 * changes it. One level for everybody; there are no tiers to choose between and
 * nothing to read before beginning.
 *
 * What replaced what: this used to list KYC "levels" and hand the chosen one to
 * a generic form renderer built from an admin form-builder. The builder could
 * not express the thing that actually matters — that a Pakistani sees CNIC and
 * an Indian sees Aadhaar, and that one of those needs two photos — so every
 * applicant was shown the same fixed list of documents regardless of where they
 * live. The flow is purpose-built now and writes into the same application
 * table, so the admin queue is unchanged.
 */

import { memo, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, Pencil } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VerificationFlow } from "./kyc/verification-flow";
import { ProfileDetails, missingFields } from "./kyc/profile-details";
import { PrimaryAction, VerifyHeader } from "./kyc/ui";
import {
  ApprovedArt,
  HelpCard,
  ReasonCard,
  RejectedArt,
  ResultAction,
  ReviewArt,
  parseReasons,
} from "./kyc/result-screens";
import { useUserStore } from "@/store/user";
import { VerifiedMark } from "@/app/[locale]/(dashboard)/user/profile/components/kit/settings-kit";

type Status = "APPROVED" | "PENDING" | "REJECTED" | "ADDITIONAL_INFO_REQUIRED" | null;

interface State {
  status: Status;
  submittedAt: string | null;
  reviewedAt: string | null;
  adminNotes: string | null;
  submission: {
    countryName?: string;
    documentLabel?: string;
    documentNumberMasked?: string;
  } | null;
}

export const KycPanel = memo(function KycPanel() {
  const { user } = useUserStore();
  const [state, setState] = useState<State | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flowOpen, setFlowOpen] = useState(false);
  /* Opened from the rejection screen. A review that came back is nearly always
     a review of the details, so the way to fix them has to be on the screen
     that reports it — and the fields it opens are the ones that are otherwise
     write-once. */
  const [correcting, setCorrecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await $fetch({
      url: "/api/user/kyc/verification",
      silent: true,
      silentSuccess: true,
    });
    setState((data as State) || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid min-h-[280px] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (correcting) {
    return (
      <div className="grid min-h-full place-items-center px-5 py-8 md:px-8">
        <section className="w-full max-w-[460px] overflow-hidden rounded-xl border border-border bg-card">
          <VerifyHeader
            title="Check your details"
            sub="Correct anything that does not match your document, then send the check again."
          />
          <div className="p-4 md:p-5">
            <ProfileDetails
              correctable
              confirmed={confirmed}
              onConfirm={() => setConfirmed((c) => !c)}
              onEditingChange={setDetailsEditing}
              onSaved={() => {
                setConfirmed(true);
                setCorrecting(false);
                setFlowOpen(true);
              }}
            />

            {!detailsEditing && (
              <div className="mt-5 flex gap-2">
                <ResultAction variant="quiet" onClick={() => setCorrecting(false)}>
                  Back
                </ResultAction>
                <ResultAction
                  onClick={() => {
                    setCorrecting(false);
                    setFlowOpen(true);
                  }}
                >
                  Send it again
                </ResultAction>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (flowOpen) {
    return (
      /* Centred in the frame, not pinned to the top of it. A 520px card at the
         top of a 1000px panel reads as a page that failed to load the rest;
         the same card in the middle reads as the thing you are doing. */
      <div className="grid min-h-full place-items-center px-5 py-8 md:px-8">
        <VerificationFlow
          onCancel={() => setFlowOpen(false)}
          onDone={() => {
            setFlowOpen(false);
            load();
          }}
        />
      </div>
    );
  }

  const status = state?.status ?? null;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <div className="grid min-h-full place-items-center px-5 py-8 md:px-8">
      {/* No shared width. A result and a form want opposite proportions: the
          form is fields that need room across, the result is a drawing over a
          short paragraph and reads as a portrait card — see Result. */}
      <div className="flex w-full justify-center">
        {status === "APPROVED" ? (
          <Result
            art={<ApprovedArt />}
            title="Identity verified"
            body="Your identity is confirmed and withdrawals are open. Your documents are stored only for as long as the law requires."
          >
            <div className="text-left">
              <Facts state={state} status="verified" name={fullName} />
            </div>
          </Result>
        ) : status === "PENDING" ? (
          <Result
            art={<ReviewArt />}
            title="We are reviewing your details"
            body="Most checks are done in 10–15 minutes. Some take longer — up to 24–48 hours. We will email you as soon as yours is done."
          >
            <div className="text-left">
              <Timeline submittedAt={state?.submittedAt} />
              <Facts state={state} status="pending" name={fullName} />
            </div>
          </Result>
        ) : status === "REJECTED" || status === "ADDITIONAL_INFO_REQUIRED" ? (
          <Result
            art={<RejectedArt />}
            title={status === "REJECTED" ? "Verification unsuccessful" : "We need something else"}
            body="Your verification was not accepted. Here is what to change:"
          >
            {/* The reviewer's own words, one card each. "Rejected" with no
                reason is how the same application arrives three times. */}
            <div className="mt-5 space-y-2">
              {parseReasons(state?.adminNotes).map((r) => (
                <ReasonCard key={r.title + r.detail} title={r.title} detail={r.detail} />
              ))}
              <HelpCard email={SUPPORT_EMAIL} />
            </div>
            {/* Two ways forward, because there are two reasons an application
                comes back. A blurred photograph needs the camera again; a date
                of birth a month out needs the form — and that one used to be a
                dead end, since the fields a reviewer sends you back to fix are
                exactly the ones that are write-once. They open while an
                application is in this state, here and on the server both. */}
            {/* Stacked, and the one most people want on top. Side by side on a
                370px portrait card these are two 165px buttons holding a
                three-word label each: one of them wraps, and whichever one does
                looks like the mistake on the screen. Full width each, they read
                as two offers rather than as a split decision. */}
            <div className="mt-5 grid gap-2">
              <ResultAction onClick={() => setFlowOpen(true)}>Resubmit documents</ResultAction>
              <ResultAction
                variant="quiet"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => setCorrecting(true)}
              >
                Update my profile
              </ResultAction>
            </div>
          </Result>
        ) : (
          /* The details live here rather than as step one of the flow. Someone
             whose profile is complete presses Start and lands on the first
             thing only they can answer; someone with gaps fills them before the
             flow has begun. */
          /* `overflow-hidden` and no padding of its own: the header is a
             full-bleed band that has to reach all four of the card's top
             edges, so the padding belongs to the body below it rather than to
             the card. The band's lower edge is also the rule that used to sit
             between header and form. */
          /* 460px, the width the flow itself runs at. At 560 this card was
             wider than every screen it leads to, so starting verification made
             the panel narrow — and a row of two short facts stretched that far
             has a hand's width of nothing down the middle of it. */
          <section className="w-full max-w-[460px] overflow-hidden rounded-xl border border-border bg-card">
            <VerifyHeader
              title="Verify your identity"
              sub="A one-time check, needed before your first withdrawal. Trading and deposits stay open."
            />

            <div className="p-4 md:p-5">
              <ProfileDetails
                confirmed={confirmed}
                onConfirm={() => setConfirmed((c) => !c)}
                onEditingChange={setDetailsEditing}
                onSaved={() => {
                  setConfirmed(true);
                  setFlowOpen(true);
                }}
              />

              {!detailsEditing && (
                <div className="mt-5">
                  <PrimaryAction
                    disabled={!confirmed || missingFields(user).length > 0}
                    onClick={() => setFlowOpen(true)}
                  >
                    Start verification
                  </PrimaryAction>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
});

/* Support address. One constant, so it cannot drift between the rejection
   screen and anywhere else it is offered. */
const SUPPORT_EMAIL = "support@bidex.io";

/**
 * A drawing, a sentence, the specifics, and the one thing to do next.
 *
 * Centred, because a result is read rather than worked through — the opposite
 * of the flow that produced it, which is left-aligned because every line of it
 * is a field you act on.
 */
function Result({
  art,
  title,
  body,
  children,
}: {
  art: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.section
      /* Portrait, and deliberately narrow. At the form's 560px this content —
         a drawing, three lines of prose and a three-row table — spread into a
         wide, short slab with the mark stranded in the middle of a lot of
         nothing. 370px is the middle: 400 let the prose run wide enough that
         the card stopped being a portrait, and 340 squeezed the rejection
         screen — which carries two panels and a button rather than three rows
         — into a column. Here the paragraph sits at about 45 characters and
         the card is still taller than it is wide, which is the proportion of
         something handed to you rather than a panel you work in. It is the one
         screen in this flow that is read and not used.

         The card itself arrives, and its contents follow it. Not decoration:
         this screen is usually reached by a status changing, and news that
         appears fully formed in a panel that was showing something else reads
         as a page that failed to load the rest. */
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="w-full max-w-[370px] rounded-xl border border-border bg-card px-5 py-7 text-center"
    >
      <div className="flex justify-center text-muted-foreground">{art}</div>

      <motion.h2
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.16 }}
        className="mt-4 text-[19px] font-semibold leading-[25px] tracking-[-0.015em] text-foreground"
      >
        {title}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.22 }}
        className="mt-2 text-[12.5px] leading-[18px] text-muted-foreground"
      >
        {body}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.28 }}
      >
        {children}
      </motion.div>
    </motion.section>
  );
}

/**
 * Three states, and the one you are in is the one that is lit.
 *
 * A rail joins the dots, because three dots in a column with nothing between
 * them are three bullets — the line is what makes them a sequence. It is
 * coloured by the step above it: green behind what is finished, amber down to
 * where the work is happening now, and nothing past it.
 *
 * A progress bar would imply we know how far along a human reviewer is. We do
 * not, so the middle step is a state and not a percentage.
 */
function Timeline({ submittedAt }: { submittedAt?: string | null }) {
  const steps = [
    { label: "Documents submitted", detail: submittedAt ? new Date(submittedAt).toLocaleString() : "", tone: "done" as const },
    { label: "Under review", detail: "", tone: "now" as const },
    { label: "Approval pending", detail: "", tone: "next" as const },
  ];

  return (
    <ol className="mt-5 rounded-lg border border-border bg-background px-4 py-3.5">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.label} className="relative flex gap-3 pb-3.5 last:pb-0">
            {/* The rail, drawn from this dot down to the next one. Behind the
                dot, so the dot always reads as a stop on it. */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[4.5px] top-[14px] w-[1.5px] rounded-full",
                  "bottom-[-2px]",
                  s.tone === "done" ? "bg-verified/70" : "bg-attention/50"
                )}
              />
            )}
            <span
              className={cn(
                "relative mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full",
                s.tone === "done"
                  ? "bg-verified"
                  : s.tone === "now"
                    ? "bg-attention"
                    : "bg-muted-foreground/35"
              )}
            >
              {/* The step in hand breathes. The other two are settled facts. */}
              {s.tone === "now" && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-attention"
                  animate={{ scale: [1, 2.4, 2.4], opacity: [0.55, 0, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", times: [0, 0.65, 1] }}
                />
              )}
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  "block text-[13px] font-medium leading-[18px]",
                  s.tone === "done"
                    ? "text-verified"
                    : s.tone === "now"
                      ? "text-attention"
                      : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
              {s.detail && (
                <span className="mt-0.5 block text-[11.5px] leading-[16px] text-muted-foreground">
                  {s.detail}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What was sent, under a heading that says what it is.
 *
 * It used to be three bare rows in a box — true, and captioned by nothing, so
 * the box read as a stray table under the timeline. A title makes it the
 * summary of the application, and the chip beside that title carries the state
 * the whole card is in: an amber clock while a person still has it, a green
 * tick once they are done.
 */
function Facts({
  state,
  status,
  name,
}: {
  state: State | null;
  status?: "pending" | "verified";
  /** The name on the account, which is the name a reviewer matches first. */
  name?: string;
}) {
  if (!state?.submission) return null;
  const { countryName, documentLabel, documentNumberMasked } = state.submission;
  const rows: [string, string | undefined, boolean][] = [
    /* Name first, because it is the first thing a reviewer matches. The
       country rides with the document rather than taking a row of its own:
       "Aadhaar Card, India" is one fact — which document, issued where — and
       splitting it left a whole line to hold one word. */
    ["Full name", name, false],
    ["Document", [documentLabel, countryName].filter(Boolean).join(", "), false],
    /* Mono, because it is a code and half of it is Xs: proportional type sets
       six identical letters at six different widths and the mask stops looking
       like a mask. */
    ["Number", maskWithX(documentNumberMasked), true],
  ];

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
      {/* A header on its own ground, the way every card in this product carries
          one. A hairline between two identical darks is a line you have to
          look for, and it left the panel reading as a stray table under the
          drawing rather than as the summary of what was sent. */}
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted px-3.5 py-2">
        <h3 className="text-[12.5px] font-semibold leading-tight text-foreground">
          Your submitted details
        </h3>
        {status === "verified" ? (
          /* The account's one verified mark, not a bordered word — see
             VerifiedMark. A chip is the shape a state that still needs reading
             wears, which is what "Pending" beside it still is. */
          <VerifiedMark />
        ) : status === "pending" ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5",
              "border-attention/40 text-[11px] font-medium leading-[15px] text-attention"
            )}
          >
            <Clock className="h-3 w-3 shrink-0" strokeWidth={2.4} />
            Pending
          </span>
        ) : null}
      </header>

      <dl className="px-3.5">
        {rows.map(([k, v, mono], i) =>
          v ? (
            <div
              key={k}
              className={cn(
                "grid grid-cols-[minmax(84px,38%)_1fr] items-baseline gap-2.5 py-2.5",
                i > 0 && "border-t border-border"
              )}
            >
              <dt className="text-[12.5px] leading-snug text-muted-foreground">{k}</dt>
              <dd
                className={cn(
                  "min-w-0 truncate text-[13.5px] font-medium text-foreground",
                  mono && "font-mono text-[13px] tracking-[0.04em]"
                )}
              >
                {v}
              </dd>
            </div>
          ) : null
        )}
      </dl>
    </section>
  );
}

/**
 * The server masks a document number with bullets. Bullets are a password
 * convention — they say "hidden" — where a redacted number says "these
 * characters exist and we are not showing them", which is what an X is for on
 * every real document. Only the mask characters are touched; the digits the
 * server chose to reveal are left exactly as they are.
 */
function maskWithX(masked?: string): string | undefined {
  if (!masked) return masked;
  return masked.replace(/[•*·●]/g, "X");
}

export default KycPanel;
