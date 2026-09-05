"use client";

/**
 * Opening a ticket, as a guided path rather than a form.
 *
 * The thing this replaces was a subject box, a priority dropdown, a
 * `contenteditable` with a bold/italic/underline toolbar, and a comma-separated
 * tags field. Every one of those asks the person to do the triage: to know
 * which words make an agent route it correctly, to know whether their problem
 * is HIGH, to know what a tag is for. Most people answered by typing a
 * sentence and leaving everything else on its default, and the ticket arrived
 * carrying no more structure than an email.
 *
 * Here they answer four or five questions they actually know the answer to,
 * and the structure falls out of the answers:
 *
 *   1. What is this about?        → the category, and the routing
 *   2. Which of these is it?      → the subject, and a starting priority
 *   3. Which payment?             → money categories only; tags the transaction
 *   4. Tell us what happened      → the message, the files, the final priority
 *   5. Does this look right?      → one place to check before it is sent
 *
 * Step three exists because of where support time actually goes. See
 * ./transaction-picker.
 *
 * The step list is built per category rather than fixed, so a verification
 * ticket never shows a payment step greyed out — an inapplicable step still
 * costs a reader the moment it takes to work out it is inapplicable, and a
 * five-dot rail that sometimes has four dots is honest about how far along
 * they are.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  Lightbulb,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FlowSteps } from "../modals/account/kyc/ui";
import { ScatterGrid } from "../modals/account/profile-kit";
import { SupportIllustration } from "./support-illustration";
import { CATEGORY_MARK } from "./support-marks";
import {
  SUPPORT_CATEGORIES,
  TRANSACTION_NOTE,
  tagsFor,
  type Importance,
  type SupportCategory,
  type SupportTopic,
} from "./support-catalog";
import { ATTACHMENT_ACCEPT, type Ticket } from "./use-tickets";
import { useAttachments } from "./use-attachments";
import {
  ACCENT,
  AttachmentTile,
  CategoryChip,
  FIELD,
  IMPORTANCE_OPTIONS,
  ImportanceMeter,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "./support-kit";
import {
  TransactionPicker,
  formatAmount,
  methodOf,
  referenceOf,
  useTransactions,
  type TxnRow,
} from "./transaction-picker";

type StepId = "category" | "topic" | "transaction" | "details";

/* Written as instructions, not as questions about the interface.
 
   "What is this about?" and "Which of these is closest?" are the sort of thing
   a form asks when it has not decided what it wants — the reader has to work
   out that "this" is their problem and that "these" are categories. Each step
   now names the thing to do and the noun it applies to, which is also what
   makes the four titles read as one sequence rather than four questions. */
const STEP_TITLE: Record<StepId, string> = {
  category: "Choose your category",
  topic: "Choose the closest topic",
  transaction: "Choose the payment",
  details: "Describe your issue",
};

const STEP_SUB: Record<StepId, string> = {
  category: "It decides which desk sees your ticket first.",
  topic: "Picking the nearest one saves an email asking what you meant.",
  transaction: "We will take the reference, the amount and the method from it.",
  details: "The more you can tell us now, the fewer questions come back.",
};

const STEP_SHORT: Record<StepId, string> = {
  category: "Category",
  topic: "Topic",
  transaction: "Payment",
  details: "Describe",
};

/**
 * The snapshot of a payment that goes into the opening message.
 *
 * The ticket's tags carry the transaction id, which is what the detail pane
 * resolves to draw a live card — status included, as it stands now. This is
 * the other thing, and it is not a duplicate of it: an agent's console renders
 * message text and tags, so without a line like this the only thing they see
 * is `txn:` and a UUID, and the first reply on every money ticket is "could
 * you send the reference". It is also a record of what was true when the
 * ticket was opened, which is exactly what a support thread should preserve
 * while the live card moves on.
 */
function referenceLine(row: TxnRow): string {
  const parts = [
    `${row.type.replace(/_/g, " ").toLowerCase()} of ${formatAmount(row)}`,
    new Date(row.createdAt).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    methodOf(row),
    row.status,
    referenceOf(row) ? `ref ${referenceOf(row)}` : "",
    `id ${row.id}`,
  ].filter(Boolean);
  return `${TRANSACTION_NOTE}${parts.join(" · ")}`;
}

export function NewTicketFlow({
  onCancel,
  onCreate,
  creating,
}: {
  onCancel: () => void;
  onCreate: (input: {
    subject: string;
    message: string;
    importance: Importance;
    tags: string[];
    attachments: string[];
  }) => Promise<Ticket | null>;
  creating: boolean;
}) {
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [transaction, setTransaction] = useState<TxnRow | null>(null);
  const [importance, setImportance] = useState<Importance>("LOW");
  const [body, setBody] = useState("");
  const [step, setStep] = useState<StepId>("category");
  const [error, setError] = useState<string | null>(null);

  const attachments = useAttachments();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const needsTransaction = category?.context === "deposit" || category?.context === "withdrawal";
  const txns = useTransactions(category?.context ?? "none", !!needsTransaction);

  const steps = useMemo<StepId[]>(
    () =>
      /* No review step. It restated four answers the reader had just given,
         on a screen they reached by giving them — and every row on it carried
         a "Change" link back to the step it came from, which is what the
         stepper above already is. What it was really buying was a place to put
         the submit button, and the describe step is a better one: you press
         send from where you finished writing. */
      [
        "category",
        "topic",
        ...(needsTransaction ? (["transaction"] as StepId[]) : []),
        "details",
      ] as StepId[],
    [needsTransaction]
  );

  const index = Math.max(0, steps.indexOf(step));

  /* Choosing a category after having gone further mid-flow invalidates
     everything downstream of it — a deposit topic on a verification ticket is
     not a thing. Cleared here rather than trusted to the reader noticing. */
  const chooseCategory = useCallback((next: SupportCategory) => {
    setCategory(next);
    setTopic(null);
    setTransaction(null);
    setStep("topic");
  }, []);

  const chooseTopic = useCallback(
    (next: SupportTopic) => {
      setTopic(next);
      /* The topic knows how urgent it usually is — see the note over
         `importance` in ./support-catalog. Applied here rather than at submit
         so the reader sees it preselected on the details step and can disagree
         with it, which a silent default does not allow. */
      setImportance(next.importance);
      setStep(needsTransaction ? "transaction" : "details");
    },
    [needsTransaction]
  );

  const back = useCallback(() => {
    setError(null);
    const previous = steps[index - 1];
    if (previous) setStep(previous);
    else onCancel();
  }, [steps, index, onCancel]);

  const next = useCallback(() => {
    setError(null);
    const following = steps[index + 1];
    if (following) setStep(following);
  }, [steps, index]);

  /* Focus the box the step is about, so a keyboard user is not left tabbing in
     from the top of the panel on every step. */
  useEffect(() => {
    if (step === "details") bodyRef.current?.focus();
  }, [step]);

  const submit = useCallback(async () => {
    if (!category || !topic) return;
    if (body.trim().length < 12) {
      setError("Tell us a little more — a sentence or two is enough for an agent to start.");
      bodyRef.current?.focus();
      return;
    }
    const message = [transaction ? referenceLine(transaction) : "", body.trim()]
      .filter(Boolean)
      .join("\n\n");
    const created = await onCreate({
      subject: topic.label,
      message,
      importance,
      tags: tagsFor(category.id, topic.id, transaction?.id),
      attachments: attachments.urls,
    });
    if (!created) {
      setError("The ticket could not be opened. Check your connection and try again.");
      return;
    }
    attachments.clear();
  }, [category, topic, transaction, body, importance, attachments, onCreate]);

  const canContinue = (step === "transaction" && !txns.loading) || !attachments.busy;

  return (
    /* `min-w-0` for the same reason the thread carries one — see the note
       there. The payment step prints a transaction reference, which has no
       break opportunity in it. */
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* One centred column, vertically as well as horizontally.

          The flow used to start at the top-left of a full-screen pane and stop
          about a third of the way down, leaving two-thirds of a dark screen
          under six small boxes — which reads as a page that failed to load
          rather than as a form with four short questions in it. Nothing here
          needs the width of a workspace, so it takes the width it needs and
          sits in the middle of what it is given.

          `overflow-y-auto` outside and `my-auto` on the card: centred when it
          fits, scrolled from the top when it does not, which is the one
          combination that never clips the first line. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-7">
        {/* High, not centred.
        
            `my-auto` put the card in the middle of the pane, which is right
            for four small cards and wrong the moment the payment step opens
            its dropdown: that list is absolutely positioned, so it does not
            push anything, but it does hang below the card — and from the
            middle of the pane there is nothing below the card but the edge of
            a scroller. The whole page then scrolled to reach a control that
            should never have needed scrolling to.
        
            Sitting a little under the top leaves the room the tallest step
            needs, and the four steps stop changing position as you move
            through them, which centring also cost. */}
        <div className="mx-auto flex w-full max-w-[620px] flex-col">
          {/* ── The band ───────────────────────────────────────────────
              Illustrated and centred, the way verification's is. The moment
              somebody is about to hand you a problem is the moment to look
              like a desk with a person behind it — see ./support-illustration
              and the note on `VerifyHeader` it was built against. */}
          <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-muted px-5 pb-5 pt-4 text-center">
            {/* The account's own ground, on the band and nowhere else.
            
                `ScatterGrid` is the pattern under the profile hero on the
                Personal page: it covers the header block there and stops — the
                rest of that panel is plain. Spread over this whole screen it
                stopped being a header treatment and became wallpaper.
            
                Drawn in a `--foreground` alpha rather than `--border`, at
                full strength. Border is right on the profile hero, where the
                pattern is a texture under a photograph and should be felt
                rather than seen; here it is under a drawing on a lifted
                surface, and at that weight the squares vanished into the box
                and the box read as flat. Dimming it further, which is where
                this went for one round, only made the band itself disappear.
                A foreground alpha is dark on light grounds and light on dark
                ones by construction, so one value works in all three. */}
            <span
              aria-hidden
              className="absolute inset-0 -z-20"
              style={{
                background:
                  "linear-gradient(158deg, hsl(var(--foreground) / 0.12), transparent 70%)",
              }}
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <ScatterGrid id="support-new-ticket-grid" tone="text-foreground/16" />
            </span>

            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel this ticket"
              className="absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>

            {/* Sized by width, not pinned to 104px.
            
                At that height the drawing was 166px wide, which put the status
                stamps' lettering at about five pixels — the one part of it
                carrying words, drawn too small to read on a 14-inch laptop and
                no better on a large screen, because a fixed height does not
                care how much room there is. */}
            <div className="mx-auto w-full max-w-[300px]">
              <SupportIllustration height="auto" />
            </div>

            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              New ticket · step {index + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-[19px] font-semibold leading-[25px] tracking-[-0.015em] text-foreground">
              {STEP_TITLE[step]}
            </h2>
            <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-[17px] text-muted-foreground">
              {STEP_SUB[step]}
            </p>

            {/* The product's own step bar — the one verification uses — rather
                than a second stepper that merely looks like it. */}
            <div className="mt-4">
              <FlowSteps
                steps={steps.map((id) => STEP_SHORT[id])}
                at={index}
                onJump={(i) => setStep(steps[i])}
              />
            </div>
          </div>

          {/* ── The question ─────────────────────────────────────────── */}
          <div className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              >
              {step === "category" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {SUPPORT_CATEGORIES.map((c) => {
                    const Mark = CATEGORY_MARK[c.id];
                    const selected = category?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => chooseCategory(c)}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left",
                          "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          selected
                            ? "border-brand/45 bg-brand/[0.07]"
                            : "border-border bg-card hover:border-brand/30 hover:bg-brand/[0.03]"
                        )}
                      >
                        {/* A drawn object, not a glyph in a coloured square.
                        
                            This is the screen where somebody decides what their
                            problem is, and it was six 18px hairline diagrams in
                            six tinted tiles. The marks are the account
                            section's own — a deposit here is the same drawing
                            as a deposit in the transactions strip, because it
                            is the same thing. See ./support-marks.
                        
                            The category's colour has not gone anywhere: it
                            still marks the ticket in the list, the thread
                            header and the details pane, which is where it is
                            doing work rather than decorating a choice. */}
                        <span className="flex shrink-0">
                          <Mark size={38} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-foreground">
                            {c.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            {c.description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}

              {step === "topic" && category && (
                <div className="flex flex-col gap-2">
                  {/* The category you are inside, restated at the top.
                  
                      The topic list is six sentences that all begin "I" or
                      "My", and stripped of context they read as a survey. One
                      chip above them says which of the six categories these
                      six belong to, which is the thing the previous screen
                      just decided and the thing a reader glancing back up
                      wants confirmed. */}
                  <div className="mb-0.5 flex items-center gap-2">
                    <CategoryChip category={category} />
                    <span className="text-[11.5px] text-muted-foreground">
                      Goes to {category.department}
                    </span>
                  </div>

                  {category.topics.map((t) => {
                    const selected = topic?.id === t.id;
                    const accent = ACCENT[category.accent];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => chooseTopic(t)}
                        aria-pressed={selected}
                        className={cn(
                          "group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          selected
                            ? "border-brand/45 bg-brand/[0.07]"
                            : "border-border bg-card hover:border-brand/30 hover:bg-brand/[0.03]"
                        )}
                      >
                        {/* A radio, not a chevron.
                        
                            A chevron on every row says "this leads somewhere",
                            which is true of all six and therefore tells you
                            nothing — and it sat where the eye looks for the
                            state of a choice. The mark is the verification
                            kit's: an empty ring that fills when picked, so a
                            list of options in this product looks like a list
                            of options wherever it appears. */}
                        <span
                          className={cn(
                            "mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors",
                            selected
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-muted-foreground/40 group-hover:border-brand/50"
                          )}
                        >
                          {selected && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium leading-[19px] text-foreground">
                            {t.label}
                          </span>
                          {/* What an agent would otherwise ask for on day two,
                              readable before the option is chosen rather than
                              after. It was on the next screen only, where it
                              could not help anybody decide which of six rows
                              they were on. */}
                          <span className="mt-1 block text-[11.5px] leading-[16px] text-muted-foreground">
                            {t.hint}
                          </span>
                        </span>

                        {/* The priority this topic carries, shown before it is
                            chosen rather than after. It is part of what the
                            option means. */}
                        <span
                          className={cn(
                            "mt-[3px] flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-[2px]",
                            selected ? "bg-brand/10" : accent.chip
                          )}
                        >
                          <ImportanceMeter importance={t.importance} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === "transaction" && category && (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] leading-[19px] text-muted-foreground">
                    Pick it from your own history and we will have the reference, the amount and
                    the method without asking. Nothing here is shared beyond this ticket.
                  </p>
                  <TransactionPicker
                    context={category.context}
                    rows={txns.rows}
                    loading={txns.loading}
                    value={transaction}
                    onChange={setTransaction}
                  />
                  {txns.loaded && txns.rows.length === 0 && (
                    <p className="text-[12.5px] text-muted-foreground">
                      No {category.context === "withdrawal" ? "withdrawals" : "deposits"} on this
                      account yet — carry on and describe it in the next step.
                    </p>
                  )}
                </div>
              )}

              {step === "details" && topic && (
                <div className="flex flex-col gap-4">
                  {/* What an agent will ask for if it is missing. Sitting above
                      the box rather than inside it as placeholder text, because
                      placeholder text disappears the moment you start typing —
                      which is exactly when it becomes useful. */}
                  <div className="flex gap-2.5 rounded-lg border border-attention/25 bg-attention/[0.07] px-3 py-2.5">
                    <Lightbulb className="mt-[1px] h-4 w-4 shrink-0 text-attention" strokeWidth={2} />
                    <p className="text-[12.5px] leading-[18px] text-foreground/85">{topic.hint}</p>
                  </div>

                  <div>
                    <label
                      htmlFor="support-body"
                      className="mb-1.5 block text-[12px] font-semibold text-foreground"
                    >
                      What happened
                    </label>
                    <textarea
                      id="support-body"
                      ref={bodyRef}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      onPaste={(e) => {
                        if (attachments.takePastedFiles(e.clipboardData)) e.preventDefault();
                      }}
                      rows={7}
                      placeholder="In your own words. Dates, amounts and exact wording all help."
                      className={cn(FIELD, "resize-y leading-[20px]")}
                    />
                  </div>

                  <AttachmentTray
                    attachments={attachments}
                    fileRef={fileRef}
                    label="Screenshots make almost every ticket faster. Images and PDFs, up to 20 MB each."
                  />

                  <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-foreground">How urgent is this?</p>
                    <div className="grid gap-1.5 sm:grid-cols-3">
                      {IMPORTANCE_OPTIONS.map((option) => {
                        const selected = importance === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImportance(option.value)}
                            className={cn(
                              "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                              selected
                                ? "border-brand/45 bg-brand/[0.07]"
                                : "border-border bg-card hover:border-foreground/20"
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <ImportanceMeter importance={option.value} />
                              <span className="text-[13px] font-semibold text-foreground">
                                {option.label}
                              </span>
                            </span>
                            <span className="text-[11.5px] leading-[15px] text-muted-foreground">
                              {option.blurb}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              </motion.div>
            </AnimatePresence>

            {error && (
              <p role="alert" className="mt-3 text-[12.5px] font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>


      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {/* No rule, and the same measure as the column above it.
      
          The border drew a full-width line under a 620px column, so the one
          horizontal edge on the screen was the one thing that did not line up
          with anything — and the buttons sat on a 720px measure, which put
          Back and Continue a little wider apart than the content they act
          on. */}
      <div className="shrink-0 px-5 pb-4 pt-1 md:px-7">
        <div className="mx-auto flex w-full max-w-[620px] items-center justify-between gap-3">
          <button type="button" onClick={back} className={QUIET_BUTTON}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
            {index === 0 ? "Cancel" : "Back"}
          </button>

          {/* The first two steps advance by choosing, so a Continue button
              there would be a second way to do the thing the reader has just
              done — and one that does nothing until they have done it. */}
          {step === "details" ? (
            <button
              type="button"
              onClick={submit}
              disabled={creating || attachments.busy}
              className={PRIMARY_BUTTON}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2.2} />
              )}
              {creating ? "Opening…" : "Open ticket"}
            </button>
          ) : step === "category" || step === "topic" ? (
            <span className="text-[12px] text-muted-foreground">Choose one to continue</span>
          ) : (
            <button type="button" onClick={next} disabled={!canContinue} className={PRIMARY_BUTTON}>
              {attachments.busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void attachments.add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* The hand-rolled stepper and the review row that used to live here are gone.
   The stepper is `FlowSteps` from the verification kit now — one step bar in
   the product rather than two that resemble each other — and the review row
   went with the step it belonged to. */

/**
 * The tray, and the two ways into it.
 *
 * Drop and paste both work, and both say so — an affordance nobody is told
 * about is an affordance nobody uses. The button stays because a file manager
 * is still how most people attach a document.
 */
export function AttachmentTray({
  attachments,
  fileRef,
  label,
}: {
  attachments: ReturnType<typeof useAttachments>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        void attachments.add(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-lg border border-dashed px-3 py-3",
        dragging ? "border-brand/60 bg-brand/[0.06]" : "border-border bg-muted/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className={QUIET_BUTTON}>
          <Paperclip className="h-4 w-4" strokeWidth={2.2} />
          Attach files
        </button>
        {label && <span className="text-[11.5px] leading-[15px] text-muted-foreground">{label}</span>}
      </div>

      {attachments.items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {attachments.items.map((item) => (
            <AttachmentTile
              key={item.id}
              url={item.url || item.preview}
              name={item.name}
              isImage={item.isImage}
              uploading={item.uploading}
              onRemove={() => attachments.remove(item.id)}
            />
          ))}
        </div>
      )}

      {attachments.error && (
        <p role="alert" className="mt-2 text-[12px] font-medium text-danger">
          {attachments.error}
        </p>
      )}
    </div>
  );
}
