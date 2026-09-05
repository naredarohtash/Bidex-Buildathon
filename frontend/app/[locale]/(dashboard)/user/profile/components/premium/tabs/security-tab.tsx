"use client";

/**
 * Security settings.
 *
 * Rebuilt because the page it replaces reported things it had never checked. It
 * listed active sessions — "Chrome browser on Windows", "New York, US",
 * "192.168.1.***" — from a hardcoded array, with a Revoke button wired to
 * nothing. There was no session endpoint on this server, so that list was not
 * stale or incomplete; it was invented, on the one page a trader visits to find
 * out whether someone else is in their account. A page that answers that
 * question wrongly is worse than one that does not answer it at all.
 *
 * The session list is back, and this time it is measured. `login_activity`
 * records a row per device — IP, browser, OS and place all read off the request
 * by the server — and it is marked active only while its session key still
 * exists in Redis. See `security/sign-in-activity.tsx`; the rule that got the
 * first version deleted still stands, so nothing on this page may show a value
 * the server did not produce.
 *
 * Two things worth knowing before editing:
 *
 * - The password form posts to /api/user/profile/password, which verifies the
 *   current password against the stored hash before writing the new one. Until
 *   that route existed this card could only email a reset link, because nothing
 *   server-side could prove the person typing was the account owner. The link
 *   is still here, one line down, for the case the form cannot serve: someone
 *   who has forgotten the password they are being asked for.
 * - The three two-factor rows look like independent switches and are not. The
 *   server stores one method per account (`twoFactor.type`), so turning one on
 *   replaces whatever was on before. The switch does not move until the setup
 *   flow has actually verified a code — a control that flips first and asks
 *   afterwards claims a protection the account does not yet have.
 *
 * Every surface uses semantic tokens, so light, dark and navy are all correct
 * without a branch.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  ShieldCheck,
  KeyRound,
  Mail,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Smartphone,
  X,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  SettingsPage,
  Card,
  Row,
  Pill,
  Action,
  Divider,
  VerifiedMark,
  inputClass,
} from "../../kit/settings-kit";
import { AuthenticatorMark, EmailCodeMark } from "./security/marks";
import { TwoFactorDialog } from "./security/two-factor-dialog";
import { ChoiceRow } from "@/components/ui/dialog-kit";
import { SignInActivity } from "./security/sign-in-activity";
import { DeleteAccount } from "./security/delete-account";

type Method = "APP" | "EMAIL";

const METHODS: {
  id: Method;
  mark: React.ElementType;
  title: string;
  description: string;
}[] = [
  {
    id: "APP",
    mark: AuthenticatorMark,
    title: "Authenticator app",
    description: "Get your code from an app like Google Authenticator, Authy or 1Password. Works without a signal.",
  },
  {
    id: "EMAIL",
    mark: EmailCodeMark,
    title: "Email code",
    description: "We email you a six-digit code each time you sign in.",
  },
];

/* Text-message codes are not offered. The server supports an SMS type, but a
   code is only as good as the gateway that sends it, and SMS is the weakest of
   the three anyway — SIM swap defeats it. An authenticator app or an email code
   is a better answer to the same question. */

/* The same four rules the server enforces, so the form can say which one is
   unmet instead of relaying "invalid password" after the round trip. */
const RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: "len", label: "8 characters or more", test: (v) => v.length >= 8 },
  { id: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "A number", test: (v) => /\d/.test(v) },
  { id: "symbol", label: "A symbol", test: (v) => /\W/.test(v) },
];

export const SecurityTab = memo(function SecurityTab({
  startTwoFactorSetup: _startTwoFactorSetup,
}: {
  /* Both callers still pass this — it used to hand the page over to the
     two-factor wizard. Two-factor is a popup now, so nothing here calls it;
     the prop stays so the profile page and the terminal overlay keep
     compiling, and so the flag they own is still theirs to set if some other
     entry point ever needs that screen. */
  startTwoFactorSetup?: () => void;
}) {
  const { user, setUser } = useUserStore();
  const { toast } = useToast();

  /* Null when the popup is shut. There is no separate "open" flag: the method
     the switch asked for *is* the open state, and two flags that must agree is
     how a dialog ends up open with nothing in it. */
  const [setupMethod, setSetupMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState<null | "2fa" | "email" | "link" | "password">(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (sentTimer.current) clearTimeout(sentTimer.current);
  }, []);

  const unmet = useMemo(() => RULES.filter((r) => !r.test(next)), [next]);
  const matches = confirm.length > 0 && next === confirm;
  const canSave =
    current.length > 0 && next.length > 0 && unmet.length === 0 && matches && busy !== "password";

  const resetForm = useCallback(() => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setFormError(null);
    setShow({ current: false, next: false, confirm: false });
  }, []);

  const changePassword = useCallback(async () => {
    if (!canSave) return;
    setBusy("password");
    setFormError(null);
    const { error } = await $fetch({
      url: "/api/user/profile/password",
      method: "PUT",
      body: { currentPassword: current, newPassword: next },
      silent: true,
      silentSuccess: true,
    });
    setBusy(null);

    if (error) {
      // The route's messages are specific — "Your current password is not
      // correct" — so they are shown as written rather than flattened.
      /* Beside a label there is room for two or three words, not a sentence.
         The server's own wording is kept for anything unexpected — it is the
         only thing that knows what went wrong — but the one message this form
         produces almost every time gets a short form that fits. */
      const message = typeof error === "string" ? error : "Could not change your password.";
      setFormError(/current password/i.test(message) ? "Incorrect password" : message);
      return;
    }
    resetForm();
    toast({
      title: "Password changed",
      description: "Your next sign-in uses the new password. You are still signed in here.",
    });
  }, [canSave, current, next, resetForm, toast]);

  const disable2FA = useCallback(async () => {
    setBusy("2fa");
    const { error } = await $fetch({
      url: "/api/user/profile/otp/status",
      method: "POST",
      body: { status: false },
      silent: true,
      silentSuccess: true,
    });
    setBusy(null);
    if (error) {
      toast({
        title: "Could not turn it off",
        description: "Two-factor is still on. Please try again.",
        variant: "destructive",
      });
      return;
    }
    setUser({ ...user, twoFactor: { ...user?.twoFactor, enabled: false } } as any);
    toast({
      title: "Two-factor turned off",
      description: "Your account now signs in with a password alone.",
    });
  }, [setUser, toast, user]);

  const resendVerification = useCallback(async () => {
    setBusy("email");
    const { error } = await $fetch({
      url: "/api/user/profile/verify-email",
      method: "POST",
      body: { email: user?.email },
      silent: true,
      silentSuccess: true,
    });
    setBusy(null);
    toast(
      error
        ? { title: "Could not send", description: "Please try again in a moment.", variant: "destructive" }
        : { title: "Verification sent", description: `Check ${user?.email}.` }
    );
  }, [toast, user?.email]);

  /* A link, and the session is left alone.
     An earlier version called logout() and pushed to /reset, so asking for a
     link cost the trader their session before they had changed anything.

     It also reported itself only as a toast, in the top corner of a panel
     whose content is in the middle of the screen — so pressing the button
     looked like pressing a dead button. The confirmation is now where the
     button was: the control is replaced by the sentence "Link sent to
     <address>", which is the one thing worth knowing next, and it steps back
     to a button after eight seconds so a second link can be asked for. */
  const emailResetLink = useCallback(async () => {
    setBusy("link");
    const { error } = await $fetch({
      url: "/api/auth/reset",
      method: "POST",
      body: { email: user?.email },
      silent: true,
      silentSuccess: true,
    });
    setBusy(null);
    if (error) {
      toast({
        title: "Could not send",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    setLinkSent(true);
    if (sentTimer.current) clearTimeout(sentTimer.current);
    sentTimer.current = setTimeout(() => setLinkSent(false), 8000);
  }, [toast, user?.email]);

  if (!user) return null;

  const twoFactorOn = !!user.twoFactor?.enabled;
  const activeMethod = (user.twoFactor?.type as Method) || null;
  const emailVerified = !!user.emailVerified;

  /* The switch opens a popup and nothing else moves. It used to set the
     store's `showTwoFactorSetup`, which made both the profile page and the
     terminal's account overlay swap their whole content for a four-step
     wizard — so turning a setting on closed the settings, and every error the
     server returned arrived as a toast on a page that no longer showed the row
     it was about. */
  const openSetup = (method: Method) => setSetupMethod(method);

  return (
    <SettingsPage title="Security" description="Keep your account safe.">
      {/* Two columns, so the whole tab is one screen.

          Stacked, the three cards ran to about 900px and the two that matter —
          the password form and the second factor — were both below the fold on
          a laptop. Password on the left, the two status cards on the right,
          balanced at roughly 400px a side.

          The two columns end level. `items-start` used to let each keep its
          own height, and the two are within about 40px of each other, so the
          bottom of the page was a pair of edges just far enough apart to look
          like a mistake rather than like a stagger. Stretching alone is not
          enough on its own — it makes the boxes the same height and leaves the
          shorter one's content floating at the top of the space — so each side
          says where its slack goes: the password card pushes its reset-link
          footing down to the bottom edge, and the two-factor card takes up
          whatever the right column has left. Whichever side is taller on the
          day, the other one absorbs the difference. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <Card
        title="Change password"
        description="Your new password works right away, and you stay signed in here."
        className="flex flex-col"
        bodyClassName="flex flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col">
        <div className="space-y-4">
          {/* The two new ones together, the one you already know underneath.
              They were current-and-new side by side with confirm on its own
              line below, which is three rows for three fields and puts the two
              that have to match in different places. Two rows now, and the
              pair being compared sit next to each other. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              label="New password"
              value={next}
              onChange={setNext}
              visible={show.next}
              onToggle={() => setShow((s) => ({ ...s, next: !s.next }))}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              strengthOf={next}
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              visible={show.confirm}
              onToggle={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
              autoComplete="new-password"
              placeholder="Type it again"
              error={confirm.length > 0 && !matches ? "Passwords do not match" : null}
            />
          </div>

          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            visible={show.current}
            onToggle={() => setShow((s) => ({ ...s, current: !s.current }))}
            autoComplete="current-password"
            placeholder="The one you sign in with"
            inlineError={formError}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Action loading={busy === "password"} disabled={!canSave} onClick={changePassword}>
              Update password
            </Action>
            <Action
              variant="secondary"
              disabled={!current && !next && !confirm}
              onClick={resetForm}
            >
              Cancel
            </Action>
          </div>

          </div>

          {/* The way out for somebody who cannot fill the form above, kept at
              the foot of the card — hairline and all, so the rule stays
              attached to the row it introduces. `mt-auto` rather than another
              16px of stack: with the column at its natural height this sits
              exactly where it did before, and when the column is taller it
              takes the difference, which is what makes the card read as having
              a footing rather than a gap in the middle of it. */}
          <div className="mt-auto pt-4">
          <Divider />

          <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-2">
            {/* Names the field it is about — "Current password", two rows up —
                rather than describing the situation the reader is in. "The
                password you are being asked for" was a clause about the form;
                this is the label they are looking at. */}
            <p className="text-[12px] leading-[17px] text-muted-foreground">
              Forgot your current password?
            </p>
            {/* framer-motion rather than a CSS transition: an unlayered `*`
                rule in styles/theme.css sets `transition` to background,
                border and colour only, and that shorthand resets
                transition-property — so every transform and opacity
                transition in the app is dead on arrival. */}
            {/* The button becomes the confirmation, in place. It used to be
                replaced by a sentence, which moves the answer away from the
                thing you pressed and leaves a gap where the control was. */}
            <motion.button
              type="button"
              onClick={linkSent ? undefined : emailResetLink}
              disabled={linkSent || busy === "link"}
              animate={{ scale: 1 }}
              whileTap={linkSent ? undefined : { scale: 0.97 }}
              /* Filled brand blue while it is a thing to press. Bordered on
                 `--background` it was an outline on a near-black card — the
                 shape a disabled control has — and the only coloured button
                 anywhere near it was the red one that deletes the account.
                 That is the wrong way round: emailing yourself a reset link is
                 the safe, ordinary thing to do here.

                 And green once it is done. Blue means *go* in this product, so
                 a blue box still reading as the thing to press after it has
                 been pressed is the wrong colour for a finished errand — green
                 is the token for a state that is already true. Tinted, not
                 filled: green never fills a button here (DIALOG-DESIGN.md), and
                 a filled green slab where a filled blue one was reads as a
                 different control arriving rather than as the one you pressed
                 answering you. Same box, same size, same place; the fill drops
                 away and the tick and the words go green with it. */
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3",
                "text-[12.5px] font-semibold",
                "focus-visible:outline-none focus-visible:ring-2",
                linkSent
                  ? cn(
                      "cursor-default border border-verified/35 bg-verified/[0.12] text-verified",
                      "focus-visible:ring-verified/40"
                    )
                  : cn(
                      "bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-60",
                      "focus-visible:ring-brand/40"
                    )
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {linkSent ? (
                  <motion.span
                    key="sent"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    className="flex items-center gap-1.5"
                  >
                    <motion.span
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 22 }}
                      className="flex"
                    >
                      {/* Inherits the button's green rather than carrying its
                          own colour — one green, not two. */}
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    </motion.span>
                    Reset link sent
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    className="flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email me a reset link
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
      <Card
        title="Account protection"
        description={protectionSummary(twoFactorOn, emailVerified)}
      >
        <Row
          title="Email address"
          description={user.email}
          status={
            emailVerified ? (
              /* The rail's mark, not a blue tick. One mark for one fact, in
                 one shape and one colour, wherever it appears — two different
                 verified badges two clicks apart is how a product stops
                 looking like one product. See VerifiedMark. */
              <VerifiedMark />
            ) : (
              <Pill tone="warn">
                <AlertTriangle className="h-3 w-3" />
                Unverified
              </Pill>
            )
          }
          action={
            emailVerified ? undefined : (
              <Action variant="secondary" loading={busy === "email"} onClick={resendVerification}>
                Resend link
              </Action>
            )
          }
        />
      </Card>

      {/* ── Two-factor ──────────────────────────────────────────────────── */}
      {/* `flex-1`, so on the days the left column is the taller one — a
          validation line under a field is enough to do it — the spare height
          lands here, in the last card, rather than leaving the right column
          stopping short of the row it is in. */}
      <Card
        className="flex-1"
        title="Two-factor authentication"
        description={
          twoFactorOn
            ? "One method is on. If you pick the other one, it replaces this one."
            : "Add a second step when you sign in. Pick one below."
        }
      >
        {/* Two rows you choose between, drawn as two rows you choose between:
            a mark in its own tile, the name, the sentence, and the switch. Flat
            rows split by a hairline made a list of facts; a bordered row with
            a tile in front of it is a thing you pick, and the one that is on
            says so by carrying the brand's colour rather than by wearing a
            badge that repeats the switch beside it. */}
        <div className="space-y-2">
          {METHODS.map(({ id, mark: Mark, title, description }) => {
            const active = twoFactorOn && activeMethod === id;
            return (
              <ChoiceRow
                key={id}
                mark={<Mark size={20} />}
                title={title}
                description={description}
                selected={active}
                control={
                  /* The shared Switch paints its off state in `--input`, which
                     on a card is within a few percent of the card, and its
                     thumb in `--background`, which is darker still — so an off
                     toggle on this page was a dark pill on a dark card with a
                     darker dot in it. Off is a visible track with a light
                     thumb; on is the accent. */
                  <Switch
                    checked={active}
                    disabled={busy === "2fa"}
                    aria-label={title}
                    onCheckedChange={(on) => (on ? openSetup(id) : disable2FA())}
                    className={cn(
                      "h-6 w-11 shrink-0 data-[state=unchecked]:bg-muted-foreground/30",
                      "data-[state=checked]:bg-verified ring-1 ring-inset ring-border"
                    )}
                    thumbClass="size-5 bg-white shadow-md data-[state=checked]:ltr:translate-x-5"
                  />
                }
              />
            );
          })}
        </div>
      </Card>
      </div>
      </div>

      {/* Full width, below the two columns. A device list is a list — squeezed
          into a 400px column it wraps onto three lines a row, and the whole
          point of it is that a wrong-looking line is spotted at a glance. */}
      <SignInActivity />

      {/* Last, and deliberately so. Nothing else on this page should be below
          the control that ends the account. */}
      <DeleteAccount />

      {/* Portalled from inside the popup, so where it is mounted in this tree
          does not matter — only that it unmounts with the page. */}
      <TwoFactorDialog
        method={setupMethod}
        onClose={() => setSetupMethod(null)}
        onDone={() => {
          setSetupMethod(null);
          toast({
            title: "Two-factor enabled",
            description: "Sign-ins now need a code as well as your password.",
          });
        }}
      />
    </SettingsPage>
  );
});

/**
 * How strong the new password is — in the field, not under it.
 *
 * Three versions were wrong before this one. Five rules with a tick or a cross
 * against each appeared on the first keystroke, so the first thing you saw was
 * four red crosses marking your homework while you wrote it. A bar and a word
 * on their own row fixed the shouting but pushed the current-password field,
 * the buttons and the reset link down the card *while you were typing into
 * it*. Reserving that row instead left dead space sitting in the card whenever
 * nobody was changing a password, which is almost always.
 *
 * A measurement of a field belongs on the field. The word sits in the label
 * row, which already exists, and the bar rides the bottom inside edge of the
 * input, absolutely positioned — so it costs no layout at all and the card is
 * exactly as tall while you type as it is at rest.
 *
 * What is still missing is on the input's `title`, so it is there for anybody
 * who stops to look and takes no room from anybody who does not.
 */
function scoreOf(value: string) {
  const met = RULES.filter((r) => r.test(value));
  const missing = RULES.filter((r) => !r.test(value));
  /* Length past the minimum counts on its own: a long passphrase of lowercase
     words beats "Aa1!aaaa", and a meter that says otherwise teaches the wrong
     lesson. */
  const score = met.length + (value.length >= 14 ? 1 : 0);
  const level = value.length === 0 ? 0 : score <= 2 ? 1 : score <= 4 ? 2 : 3;
  return {
    level,
    word: ["", "Weak", "Medium", "Strong"][level],
    text: ["", "text-danger", "text-attention", "text-verified"][level],
    bar: ["", "bg-danger", "bg-attention", "bg-verified"][level],
    hint: missing.length
      ? `Still needs ${missing.map((r) => r.label.toLowerCase()).join(", ")}.`
      : "",
  };
}

/**
 * A password input, its show/hide control, and one fixed line underneath.
 *
 * That last line is the whole design problem on this card, and four versions
 * got it wrong:
 *
 *  - Five rules with a tick or a cross each, appearing on the first keystroke —
 *    four red crosses marking your homework while you write it.
 *  - A meter on its own row, which pushed the current-password field, the
 *    buttons and the reset link down the card *while you typed into it*.
 *  - A 38px reserved row, which bought a stable height with a band of dead
 *    space sitting in the card whenever nobody is changing a password.
 *  - The verdict moved up beside the label, which is free — until "Confirm new
 *    password" and "Does not match" will not share a line, wrap, and knock the
 *    two fields out of alignment with each other.
 *
 * What works is a 14px line below the input, always present and usually empty:
 * one line's worth of height paid once, a card that never moves, and the
 * measurement directly under the field it measures. The bars and the word live
 * there on the new password, the mismatch lives there on the confirmation, and
 * neither can ever push anything.
 */
function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder,
  error,
  inlineError,
  strengthOf,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete?: string;
  /** What to type, not a row of dots.
  
      Every field here used to show "••••••••", which is a picture of a filled
      password field on an empty one: it reads as a value already entered, and
      three of them together read as a form somebody had half filled in. The
      placeholder is the one line of guidance a password field can carry
      without a rule under it. */
  placeholder?: string;
  /** Shown in the reserved line under the field. For fields in the grid. */
  error?: string | null;
  /** Shown beside the label. For full-width fields, where it always fits. */
  inlineError?: string | null;
  /** Pass the value to measure to put a strength meter on this field. */
  strengthOf?: string;
}) {
  const st = strengthOf === undefined ? null : scoreOf(strengthOf);
  const showMeter = !!st && st.level > 0;
  /* Only fields that can ever say something reserve the line to say it in.
     `error` is passed as null when it is fine and left off entirely where the
     field has no error to report, so the current-password field — which has
     neither a meter nor a mismatch — keeps its 20px instead of holding a gap
     open above the buttons. */
  const hasSlot = strengthOf !== undefined || error !== undefined;

  return (
    <div>
      {/* Long messages go beside the label, not under the field.

          A server error in a bordered box between the field and the buttons is
          another row appearing at the worst moment — you pressed Save, and the
          card grew under the cursor. Beside the label it is free, and it is
          next to the field it is about.

          Only for full-width fields. The two in the grid are half a card wide,
          and "Confirm new password" plus a message will not share that line —
          it wraps, and the two inputs stop lining up. Those use the slot
          below instead. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="block truncate text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </label>
        <AnimatePresence initial={false}>
          {inlineError && (
            <motion.span
              key={inlineError}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
              title={inlineError}
              className="min-w-0 truncate text-[11px] font-semibold leading-[15px] text-danger"
            >
              {inlineError}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          title={st?.hint || undefined}
          className={cn(inputClass, "pr-10", (error || inlineError) && "border-danger/50")}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* The fixed line. Height is set here and never by its contents. */}
      {hasSlot && (
      <div className="mt-1.5 flex h-[14px] items-center gap-2" aria-live="polite">
        {error ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className="truncate text-[11px] font-medium leading-[14px] text-danger"
          >
            {error}
          </motion.span>
        ) : showMeter ? (
          <>
            <span className="flex flex-1 gap-1">
              {[1, 2, 3].map((i) => (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                  <motion.span
                    className={cn("block h-full w-full origin-left rounded-full", st!.bar)}
                    initial={false}
                    animate={{ scaleX: st!.level >= i ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  />
                </span>
              ))}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={st!.word}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className={cn("shrink-0 text-[11px] font-semibold leading-[14px]", st!.text)}
              >
                {st!.word}
              </motion.span>
            </AnimatePresence>
          </>
        ) : null}
      </div>
      )}
    </div>
  );
}

/** One sentence describing the two facts, rather than a score invented from them. */
function protectionSummary(twoFactorOn: boolean, emailVerified: boolean) {
  if (twoFactorOn && emailVerified) return "Your email is verified and two-factor is on.";
  if (twoFactorOn) return "Two-factor is on, but your email is not verified yet.";
  if (emailVerified) return "Your email is verified, but two-factor is off.";
  return "Two-factor is off and your email is not verified yet.";
}

export default SecurityTab;
