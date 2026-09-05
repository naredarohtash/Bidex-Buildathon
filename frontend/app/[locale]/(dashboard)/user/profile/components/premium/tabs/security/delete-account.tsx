"use client";

/**
 * Deleting the account.
 *
 * The only control on this page that cannot be undone, and the only one built
 * to be hard to do by accident.
 *
 * ── Where the warning lives ────────────────────────────────────────────────
 *
 * It used to live on the page: a red-bordered panel listing four consequences
 * and a paragraph about withdrawing your balance, sitting open above the
 * button, on a card nobody visits on purpose. That is the wrong place for it
 * twice over. It shouted at every single person who scrolled to the bottom of
 * their security settings — none of whom had asked to delete anything — and by
 * the time somebody actually pressed the button they had scrolled past that
 * panel so often it had stopped being words. A warning that is always on
 * screen is wallpaper.
 *
 * So the card is now the one sentence and the one button, and everything that
 * has to be read is read at the moment of the decision, in a dialog that has
 * to be dealt with. Same words, read once, when they mean something.
 *
 * ── The three gates ────────────────────────────────────────────────────────
 *
 * 1. **Open the dialog and read what goes.** Stops the accidental press.
 * 2. **Type DELETE.** Stops the deliberate press made in ten seconds — you
 *    cannot type the word without having read the sentence above the box.
 * 3. **Enter the code we email.** This is the one that is actually security.
 *    It proves the person pressing the button still controls the address on
 *    the account, which the password this used to ask for does not: a password
 *    can be reused, breached or shoulder-surfed, and a stolen session needs no
 *    password at all.
 *
 * The server enforces all three — see api/user/account/deletion/confirm.post —
 * so none of this is decoration. The session is ended afterwards, because
 * staying signed into a deleted account is a state nothing else on the site is
 * built to render.
 */

import { memo, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserStore } from "@/store/user";
import { CodeInput } from "./code-input";
import {
  Modal,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  Labelled,
  Notice,
  Ack,
  Rule,
} from "@/components/ui/dialog-kit";

const CONFIRM_WORD = "DELETE";

/* The four losses used to be a bulleted list on step two, above the fields.
   They are one sentence in the warning panel now — named, not summarised,
   because "all your data" is a phrase people skim and "your balance, your
   trade history and your verified identity" is not. A list of four sitting
   between the panel that says the same thing and the boxes that ask you to
   agree to it was the third telling of one fact.

   What survives as its own line is the one that is still actionable:
   everything else happens to you, this is a thing to go and do before you
   come back. */
const WITHDRAW_FIRST =
  "Have money in the account? Withdraw it first. Nothing is paid out after this.";

type Stage = "closed" | "warning" | "confirm";

export const DeleteAccount = memo(function DeleteAccount() {
  const [stage, setStage] = useState<Stage>("closed");

  return (
    <>
      {/* One row, and quiet.

          Two versions were wrong in opposite directions. A plain bordered card
          gave the control that ends an account exactly the presence of the one
          that refreshes a device list. Then a `--danger` gradient washing
          across the row with a bordered glyph on it, which read as a warning
          panel from a template — the colour was doing the work the words
          should, and doing it loudly.

          What is left is a card like the others with a danger-tinted hairline,
          a small plain glyph, and one red control. The button is the only
          saturated thing in the row, which is correct: it is the only part
          that does anything.

          Still one row. The button used to sit on its own strip below the
          sentence, which made a card holding one sentence and one button
          130px tall; a footer strip earns its keep when there are fields
          above it to separate from, and there are none. */}
      {/* A card like the others, and nothing more.

          The danger-tinted hairline around it made the whole row glow faintly
          red, which is a wash over a sentence that is already unambiguous. The
          border is the theme's now; the bin and the button carry the meaning.
          Those two are also the same bin and the same solid red as the dialog
          they open, so pressing the button leads somewhere that looks like
          where you pressed. */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:px-5">
          <span className="shrink-0">
            <BinMark size={36} surface="hsl(var(--card))" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-[20px] text-foreground">
              Delete account
            </h3>
            <p className="mt-0.5 text-[12.5px] leading-[17px] text-muted-foreground">
              This cannot be undone, and we cannot bring your account back.
            </p>
          </div>

          {/* Solid, like the one in the dialog. An outlined red button beside a
              solid "Refresh" further up the page made the dangerous control
              the quieter of the two, and a hollow red pill on a dark card is
              the shape a disabled button has. */}
          <button
            type="button"
            onClick={() => setStage("warning")}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-4",
              "bg-danger-solid text-[13px] font-semibold text-white",
              "hover:opacity-90 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            )}
          >
            Delete my account
          </button>
        </div>
      </section>

      <DeleteDialog stage={stage} onStage={setStage} />
    </>
  );
});

/* ── the dialog ───────────────────────────────────────────────────────────── */

function DeleteDialog({
  stage,
  onStage,
}: {
  stage: Stage;
  onStage: (stage: Stage) => void;
}) {
  const { toast } = useToast();
  const logout = useUserStore((state) => state.logout);

  const [word, setWord] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "code" | "delete">(null);

  const open = stage !== "closed";

  const close = useCallback(() => {
    onStage("closed");
    setWord("");
    setCode("");
    setError(null);
    setBusy(null);
  }, [onStage]);

  /* The resend countdown, ticking down once a code has gone out. Cleared on
     unmount so a closed dialog is not still counting. */
  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  const sendCode = useCallback(async () => {
    setBusy("code");
    setError(null);
    const { data, error: failure } = await $fetch({
      url: "/api/user/account/deletion/code",
      method: "POST",
      silent: true,
      silentSuccess: true,
    });
    setBusy(null);
    if (failure) {
      setError(
        typeof failure === "string" ? failure : "The code could not be sent. Try again."
      );
      return;
    }
    setSentTo((data as any)?.email || null);
    setRetryIn(Number((data as any)?.retryIn || 60));
  }, []);

  /* Moving to the confirm step asks for the code, rather than making that a
     button somebody has to find first. By the time the four lines above it
     have been read the mail is usually already in the inbox. */
  const beginConfirm = useCallback(() => {
    onStage("confirm");
    sendCode();
  }, [onStage, sendCode]);

  const armed = word.trim().toUpperCase() === CONFIRM_WORD && code.length === 6;

  const remove = useCallback(async () => {
    if (!armed || busy) return;
    setBusy("delete");
    setError(null);

    const { error: failure } = await $fetch({
      url: "/api/user/account/deletion/confirm",
      method: "POST",
      body: { confirm: word.trim().toUpperCase(), code },
      silent: true,
      silentSuccess: true,
    });

    if (failure) {
      setBusy(null);
      // The route's messages are specific — "That code is not right. 3 tries
      // left." — and specific is the difference between trying again and
      // giving up, so they are shown as written.
      setError(
        typeof failure === "string" ? failure : "Your account could not be deleted."
      );
      return;
    }

    toast({
      title: "Account deleted",
      description: "You are being signed out. We are sorry to see you go.",
    });
    /* Not conditional on logout succeeding: the account is already gone, and
       leaving the browser holding its session is worse than a failed call. */
    await logout().catch(() => undefined);
    window.location.href = "/";
  }, [armed, busy, code, logout, toast, word]);

  return (
    <Modal
      open={open}
      onClose={close}
      closable={busy !== "delete"}
      label="Delete your account"
      className={stage === "warning" ? "max-w-[400px]" : "max-w-[468px]"}
    >
      {stage === "warning" ? (
        <WarningStep onContinue={beginConfirm} onKeep={close} />
      ) : (
        <ConfirmStep
          word={word}
          onWord={setWord}
          code={code}
          onCode={setCode}
          sentTo={sentTo}
          retryIn={retryIn}
          sending={busy === "code"}
          deleting={busy === "delete"}
          armed={armed}
          error={error}
          onResend={sendCode}
          onDelete={remove}
          onKeep={close}
        />
      )}
    </Modal>
  );
}

/**
 * The two answers, as a pair of pills.
 *
 * They were two full-width rectangles stacked on each other, 44px each, and
 * that shape was wrong in three ways at once. A control that spans the whole
 * dialog reads as a section rather than a button; two of them stacked read as
 * a list of sections; and at full width the destructive one is a red band
 * across the card, which is the loudest possible way to offer the answer we
 * least want chosen by accident.
 *
 * Side by side, sized to their own words, and rounded to a pill. The quiet
 * answer sits on the left where the eye lands first and the pointer rests; the
 * irreversible one is on the right, filled, and no wider than the four words
 * it carries.
 */
function ChoicePair({
  danger,
  onDanger,
  keepLabel = "Keep my account",
  onKeep,
  disabled,
  busy,
}: {
  danger: string;
  onDanger: () => void;
  keepLabel?: string;
  onKeep: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      {/* Both carry colour, and the safe one carries the stronger of the two.
          Keeping the account is the outcome we would pick for somebody who
          opened this dialog by accident, so it is the filled blue button — the
          same primary this interface uses everywhere for "yes, go on". The
          irreversible one is red, and outlined until it is armed.
      
          Leaving the safe answer as a grey outline made the red one the only
          coloured thing on the card, and the eye goes to the colour. */}
      <button
        type="button"
        onClick={onKeep}
        disabled={busy}
        className={cn(
          "inline-flex h-10 items-center justify-center rounded-md px-4",
          "bg-blue-600 text-[13px] font-semibold text-white",
          "hover:bg-blue-500 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
          "disabled:opacity-50"
        )}
      >
        {keepLabel}
      </button>

      <button
        type="button"
        onClick={onDanger}
        disabled={disabled || busy}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4",
          "text-[13px] font-semibold active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
          disabled
            ? /* Still red, only quieter. Going grey when disabled made the
                 control change identity as well as state, so it read as a
                 different button rather than as the same one not yet ready. */
              "cursor-not-allowed border-danger/25 text-danger/45"
            : "border-danger-solid bg-danger-solid text-white hover:opacity-90"
        )}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {danger}
      </button>
    </div>
  );
}

/**
 * The bin, and the only mark this flow uses.
 *
 * It has been three drawings and is now one. An account card struck through,
 * then a solid red bin, then a cable pulled apart on the last step — each one
 * accurate, none of them recognisable at a glance, and two different pictures
 * across two steps of a single errand made it read as two errands.
 *
 * This is a drawn bin with the lid off and leaning against it, an account page
 * and an envelope dropped in. The thing being thrown away is in the picture,
 * not just the container it goes in, which is the whole difference between an
 * icon that means "delete" and one that means "delete *this*". The same
 * drawing appears in all three places — the row on the page, the question, and
 * the last check — so they are one errand seen three times.
 *
 * ── Line art, and why it survives both themes ──────────────────────────────
 *
 * Every closed shape is filled with `surface`: the colour of the card the mark
 * is sitting on, never white. That is what lets the papers hide the far rim
 * and the bin hide the papers' bottom edge — the drawing is layered by
 * occlusion, the way a pen drawing is — and it is why one drawing works on a
 * light card and on a dark dialog. Only the red lines are ink; everything else
 * is the surface showing through. Pass the surface it is actually on: a white
 * bin on a dark popover is a sticker stuck to the page.
 *
 * ── The drop ───────────────────────────────────────────────────────────────
 *
 * On step one the papers fall in and the lid settles where it leans, once, on
 * arrival. Once, not looped — a bin fidgeting at somebody who is trying to
 * make a decision is a page that will not let them think. Everywhere else it
 * is still: the row on the page and the last check are the way to the question
 * and the check after it, not the question itself.
 *
 * The papers are drawn before the rim and the body, so they fall *behind* the
 * front of the bin and land inside it rather than on top of it. The lid's
 * `transformOrigin` is in viewBox units and sits where it touches the ground,
 * so it rocks on that edge instead of about its middle.
 */
function BinMark({
  size = 64,
  animated = false,
  surface = "hsl(var(--popover))",
}: {
  size?: number;
  animated?: boolean;
  /** The ground the mark sits on. Every fill in the drawing is painted with it. */
  surface?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className="mx-auto">
      <g
        style={{ fill: surface }}
        stroke="#e0453a"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The far rim: the edge you see across the mouth, behind whatever is
            in the bin. Faint, because it is the far side of the same line. */}
        <path d="M22.5 23.5A13.5 4 0 0149.5 23.5" fill="none" strokeOpacity={0.35} />

        {/* What is being thrown away — the account page, and the address it
            was reachable at. Drawn before the bin, so on step one they fall
            behind the front of it and land inside rather than on top. */}
        <motion.g
          initial={animated ? { y: -9, opacity: 0 } : false}
          animate={animated ? { y: 0, opacity: 1 } : undefined}
          transition={
            animated ? { duration: 0.45, delay: 0.12, ease: [0.32, 0.72, 0, 1] } : undefined
          }
        >
          {/* The page, leaning out of the mouth, its top edge curling the way
              a sheet does when it has been pushed into something. */}
          <g transform="rotate(-8 41 16)">
            <path d="M32 28V7.4c3-1.3 6-1.6 9-1 3.1.7 6.2.4 9.2-1V28z" />
            {/* Whose page it is: a portrait and three ruled lines, set at the
                angle of the sheet rather than at the angle of the screen. */}
            <g fill="none" stroke="#ee8880" strokeWidth={1.5}>
              <circle cx="37.2" cy="13.2" r="2.3" />
              <path d="M34 18.8c.5-2.2 1.6-3.3 3.2-3.3s2.7 1.1 3.2 3.3" />
              <path d="M42.4 11.6h6.2M42.4 15.2h6.2M42.4 18.8h4.2" />
            </g>
          </g>

          {/* The envelope, tipped in after it, flap up. */}
          <g transform="rotate(-8 28 25)">
            <path d="M22.4 23.2l5.9-4.8 5.9 4.8v7.6H22.4z" />
            <path d="M22.4 23.2l5.9 4.4 5.9-4.4" fill="none" strokeWidth={1.5} />
          </g>
        </motion.g>

        {/* The body: tapered, on a rounded base. Drawn over the papers, which
            is what puts them inside it. */}
        <path d="M24.5 28L26.8 54.2a9.2 3.1 0 0018.4 0L47.5 28z" />

        {/* The collar. It is the piece that makes a drawn cylinder read as a
            bin rather than as a cup. */}
        <path d="M22.5 23.5a13.5 4 0 0027 0l-.4 4.2a13.1 4 0 01-26.2 0z" />

        {/* Three ribs, splayed with the taper and stopping short of the base.
            Vertical ribs on a tapering body is what makes a drawn bin look
            like a rectangle with lines on it; more than three at this size is
            a striped cup. */}
        <g fill="none" stroke="#ee8880" strokeWidth={1.35} strokeOpacity={0.85}>
          <path d="M30.6 33.2L31.3 52.8M36 33.5V53.2M41.4 33.2L40.7 52.8" />
        </g>

        {/* The lid, off and leaning against the bin — a bin that has just been
            used, not a closed container. It stands in front, so it takes the
            body's left edge with it, and its top clears the collar: a lid that
            touches the rim reads as a handle, and the whole drawing turns into
            a mug. */}
        <motion.g
          style={{ transformOrigin: "13.9px 54.4px" }}
          initial={animated ? { rotate: -7 } : false}
          animate={animated ? { rotate: [-7, 2, -1, 0] } : { rotate: 0 }}
          transition={
            animated
              ? { duration: 1.1, times: [0, 0.34, 0.7, 1], ease: [0.32, 0.72, 0, 1], delay: 0.36 }
              : undefined
          }
        >
          <g transform="rotate(26 17.5 44)">
            <ellipse cx="17.5" cy="44" rx="5.6" ry="11.2" />
            {/* The lid's depth: a second line sharing the poles, so the gap
                between them is thickest at the near edge and closes to nothing
                at the far one — which is what a disc leaning towards you
                looks like. */}
            <path d="M17.5 32.8a4.4 11.2 0 000 22.4" fill="none" strokeWidth={1.5} />
            <rect x="14.7" y="41.4" width="5.6" height="4.2" rx="2.1" fill="none" strokeWidth={1.5} />
          </g>
        </motion.g>
      </g>
    </svg>
  );
}

/** Step one: the question, centred, with nothing else on it. */
function WarningStep({ onContinue, onKeep }: { onContinue: () => void; onKeep: () => void }) {
  return (
    <div className="p-6 text-center">
      <BinMark animated size={72} />

      <h2 className="mt-5 text-[21px] font-semibold leading-[27px] tracking-[-0.01em] text-foreground">
        Permanently delete your account?
      </h2>

      <p className="mx-auto mt-2.5 max-w-[34ch] text-[13px] leading-[20px] text-muted-foreground">
        You will lose your balance, your trade history and your verified identity. There is
        no undo, and we cannot bring the account back.
      </p>

      <ChoicePair danger="Delete my account" onDanger={onContinue} onKeep={onKeep} />
    </div>
  );
}

/**
 * Step two: the account named, the consequence stated, and four gates.
 *
 * ── Why it looks nothing like step one ─────────────────────────────────────
 *
 * Step one is a poster: one drawing, one question, two buttons, centred,
 * nothing to do but decide. This is a form. Centring a form — a drawing over
 * a heading over a list over two fields — makes every block start in a
 * different place and gives the eye no left edge to run down, which is why
 * this step read as "more of the same dialog" rather than as the part where
 * you do something.
 *
 * So it is left-aligned and ruled into sections, each one a single job:
 * what this is, what it costs, what you are agreeing to, and what you have to
 * prove. The rules run edge to edge because they separate sections of a
 * dialog, not rows of a list — a rule with margins is a divider inside a
 * block; a rule to the edges is the end of one block and the start of another.
 *
 * ── The four gates ─────────────────────────────────────────────────────────
 *
 * Two ticks, a typed word and a mailed code. The ticks are not security and
 * are not pretending to be — they are two sentences that cannot be skimmed,
 * because the only way past them is to have read far enough to know what you
 * are ticking. The word stops the ten-second decision. The code is the one
 * that is actually security: it proves the person pressing the button still
 * controls the address on the account.
 *
 * The button is dead until all four are satisfied, and it says so by being
 * dead — no toast, no shake, nothing to dismiss.
 */
function ConfirmStep({
  word,
  onWord,
  code,
  onCode,
  sentTo,
  retryIn,
  sending,
  deleting,
  armed,
  error,
  onResend,
  onDelete,
  onKeep,
}: {
  word: string;
  onWord: (v: string) => void;
  code: string;
  onCode: (v: string) => void;
  sentTo: string | null;
  retryIn: number;
  sending: boolean;
  deleting: boolean;
  armed: boolean;
  error: string | null;
  onResend: () => void;
  onDelete: () => void;
  onKeep: () => void;
}) {
  const wordOk = word.trim().toUpperCase() === CONFIRM_WORD;
  const codeOk = code.length === 6;

  /* Local, and deliberately not lifted. Backing out to step one and coming
     back should ask again — an acknowledgement that survives leaving the
     screen it was made on is not an acknowledgement. */
  const [ackData, setAckData] = useState(false);
  const [ackUndone, setAckUndone] = useState(false);

  const ready = armed && ackData && ackUndone;

  return (
    <div>
      {/* ── What this is ───────────────────────────────────────────────── */}
      <DialogHeader
        onClose={onKeep}
        closeDisabled={deleting}
        mark={
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-danger/10">
            <BinMark size={26} />
          </span>
        }
        title="Delete account"
        subtitle="Permanently delete your Bidex account"
      >
        {/* The consequence, once, in the one place on the dialog that is
            allowed a ground of its own. Amber rather than red: red here would
            be the third red thing on a screen whose button is already red, and
            a panel that shouts as loudly as the control it is warning about
            stops being a warning and becomes decoration. */}
        <Notice tone="warn">
          This action <span className="font-bold text-foreground">CANNOT</span> be undone. This will
          permanently delete your Bidex{" "}
          <span className="font-bold text-foreground">account</span> — your balance, your trade
          history and your verified identity — and this email will never sign in again. Are you sure
          you want to proceed?
        </Notice>

        {/* Said apart from the panel, because it is the only line here that is
            still actionable: everything above happens to you, this is a thing
            to go and do before you come back. */}
        <p className="mt-3 text-[12px] leading-[17px] text-muted-foreground">{WITHDRAW_FIRST}</p>
      </DialogHeader>

      {/* ── What you are agreeing to ───────────────────────────────────── */}
      <div className="space-y-3.5 px-5 py-5 sm:px-6">
        <Ack checked={ackData} onChange={setAckData}>
          All data associated with my account will be permanently deleted
        </Ack>
        <Ack checked={ackUndone} onChange={setAckUndone}>
          I agree to this action, knowing it cannot be undone
        </Ack>
      </div>

      <Rule />

      {/* ── What you have to prove ─────────────────────────────────────── */}
      <DialogBody>
        <Labelled
          label={
            <>
              Please type <span className="font-semibold text-foreground">{CONFIRM_WORD}</span> to
              confirm
            </>
          }
          htmlFor="delete-word"
          required
          helper="In capitals, exactly as written."
        >
        {/* It turns when it matches. A gate that says nothing until the button
            changes state leaves somebody staring at a dead control wondering
            which of the fields they got wrong; a border that goes green the
            moment the word is right answers that before it is asked. */}
        <div className="relative">
          <input
            id="delete-word"
            value={word}
            onChange={(e) => onWord(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className={cn(
              "h-12 w-full rounded-lg border bg-background px-4 pr-11 text-[14px] font-medium",
              "tracking-[0.12em] text-foreground placeholder:text-muted-foreground/70",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/10",
              wordOk
                ? "border-verified/60 focus-visible:border-verified/70"
                : "border-border focus-visible:border-foreground/40"
            )}
          />
          {wordOk && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-verified"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </motion.span>
          )}
        </div>
        </Labelled>

        {/* The code. Six boxes rather than a field, and the address it went to
            named in the label — "check your email" is not an instruction if
            you have three of them. */}
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <label htmlFor="delete-code-0" className="text-[12.5px] font-medium text-muted-foreground">
              Enter the code we emailed to{" "}
              <span className="font-semibold text-foreground">{sentTo || "your email address"}</span>
              <span className="text-danger">*</span>
            </label>
            {sending && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending…
              </span>
            )}
          </div>

          <div className="mt-1.5">
            <CodeInput
              value={code}
              onChange={onCode}
              disabled={deleting}
              complete={codeOk}
              idPrefix="delete-code"
            />
          </div>

          <button
            type="button"
            onClick={onResend}
            disabled={sending || retryIn > 0}
            className={cn(
              "mt-2.5 text-[12px] font-medium underline underline-offset-2",
              /* A control's label, not a caption. `--muted-foreground` is for
                 prose that supports something else; this is the one thing to
                 press when the code did not arrive. */
              "text-foreground/75 hover:text-foreground hover:no-underline",
              "disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            )}
          >
            {retryIn > 0 ? `Send another code in ${retryIn}s` : "Send another code"}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-danger/40 px-3 py-2 text-[12px] font-medium leading-[17px] text-danger">
            {error}
          </p>
        )}

      </DialogBody>

      {/* ── The two ways out ────────────────────────────────────────────
          Apart, at opposite ends, rather than side by side: the mouse that
          slips off one of them lands on nothing instead of on the other.
          Cancel keeps the quiet ground; the red is the only saturated thing on
          the dialog, and it is the only control that does anything. */}
      <DialogFooter
        ruled
        cancel={
          <DialogButton tone="quiet" onClick={onKeep} disabled={deleting}>
            Cancel
          </DialogButton>
        }
        action={
          <DialogButton
            tone="destructive"
            onClick={onDelete}
            disabled={!ready}
            busy={deleting}
            icon={
              /* The x in a filled disc, the way the button on a confirmation
                 carries it: the disc is the button's white, the cross is cut
                 out of it in the button's own red. */
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
                <circle cx="10" cy="10" r="9" fill="currentColor" />
                <path
                  d="M7.3 7.3l5.4 5.4M12.7 7.3l-5.4 5.4"
                  stroke="hsl(var(--danger-solid))"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            }
          >
            {deleting ? "Deleting…" : "Delete account"}
          </DialogButton>
        }
      />
    </div>
  );
}

export default DeleteAccount;
