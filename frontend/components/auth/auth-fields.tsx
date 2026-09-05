"use client";

/**
 * The field vocabulary for the auth pages.
 *
 * One place, so sign-in and sign-up cannot drift into two different-looking
 * forms — which is what happened before: login used flat 42px zinc boxes and
 * register used 44px rounded-xl boxes with icons inside them, on pages that sit
 * one click apart.
 *
 * The shape follows the terminal's own inputs: an 11px label, a bordered field
 * that lifts its border and takes a ring on focus, and figures in the tabular
 * face. Colour comes from the theme tokens, so these render correctly in all
 * three themes rather than assuming a white card.
 */

import * as React from "react";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export const BRAND = "#0052ff";
export const BRAND_HOVER = "#0041cc";

/* Solid surface, real edge. It was `bg-muted/40` on `border-input`, which in
   light and dark is within a few values of the page behind it — the fields read
   as slightly different black rather than as inputs. `--field` is defined per
   theme for exactly this. */
const fieldShell =
  "group relative flex h-11 scroll-mt-20 scroll-mb-24 items-center gap-2 rounded-lg border border-field-border bg-field px-3.5 " +
  "transition-[border-color,background-color,box-shadow] duration-150 " +
  "hover:border-foreground/30 " +
  "focus-within:border-[#0052ff] focus-within:ring-[3px] focus-within:ring-[#0052ff]/20";

/* 16px on phones, 14px from `sm` up.

   Not a taste call: iOS Safari zooms the whole page in when a focused input's
   font-size is under 16px, and it does not zoom back out. Every field on this
   page was 14px, so tapping Email on an iPhone threw the layout sideways and
   left the person pinching to find the password box. */
const fieldInput =
  /* scroll-mt on the input itself, not only on the shell around it: the focus
     handler calls scrollIntoView on this element, so a margin set on the
     wrapper is never consulted and the field lands flush against the top edge
     with its own label scrolled off above it. */
  "h-full w-full min-w-0 scroll-mt-20 bg-transparent text-[16px] sm:text-[14px] font-medium text-foreground outline-none " +
  "placeholder:font-normal placeholder:text-muted-foreground/55 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "autofill:bg-transparent";

/**
 * Keeps the focused field above the on-screen keyboard.
 *
 * Two things were wrong on a phone. The column was sized in `vh`, which on iOS
 * is the viewport *without* the keyboard — so when the keyboard opened, the
 * layout did not shrink, the browser saw no reason to scroll, and the fields
 * below the fold simply sat underneath it. That is fixed with `dvh` in the
 * shell.
 *
 * The rest is this: even with a scrollable page, Safari's own "reveal the
 * focused element" lands it just above the keyboard, flush against it, with the
 * label and any validation message hidden. Scrolling it to the middle of what
 * is left leaves room for both.
 *
 * The delay is not a guess at rendering — it is the keyboard's entry animation.
 * Scrolling before it finishes measures a viewport that is about to change.
 * Coarse pointers only, so a mouse never sees the page move under it.
 */
function useKeyboardSafeFocus() {
  return React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(pointer: coarse)")?.matches) return;

    const el = event.currentTarget;
    window.setTimeout(() => {
      /* The field can be gone by now — a form that navigates on submit, or a
         view that swapped underneath. */
      if (!el.isConnected) return;
      /* Top of the screen, not the middle. "center" centres within the *layout*
         viewport, and iOS does not shrink that for a keyboard — so the centre of
         it can be behind the keys. The top never is, whatever height the
         keyboard turns out to be. scroll-mt on the field keeps it off the very
         edge. */
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 320);
  }, []);
}

export function AuthLabel({
  htmlFor,
  children,
  action,
}: {
  htmlFor: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-[12.5px] font-medium text-muted-foreground transition-colors duration-200 group-focus-within:text-foreground"
      >
        {children}
      </label>
      {action}
    </div>
  );
}

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** Rendered to the right of the label — "Forgot password?", a counter, etc. */
  labelAction?: React.ReactNode;
  /** Shown under the field and announced. */
  error?: string | null;
  containerClassName?: string;
}

export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField(
    { id, label, labelAction, error, containerClassName, className, ...props },
    ref
  ) {
    const keepAboveKeyboard = useKeyboardSafeFocus();

    return (
      <div className={cn("group", containerClassName)}>
        <AuthLabel htmlFor={id} action={labelAction}>
          {label}
        </AuthLabel>
        <div
          className={cn(
            fieldShell,
            error &&
              "border-[#f23645]/60 focus-within:border-[#f23645] focus-within:ring-[#f23645]/15"
          )}
        >
          <input
            {...props}
            id={id}
            ref={ref}
            onFocus={(e) => {
              keepAboveKeyboard(e);
              props.onFocus?.(e);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(fieldInput, className)}
          />
        </div>
        <FieldError id={`${id}-error`} message={error} />
      </div>
    );
  }
);

interface AuthPasswordFieldProps extends AuthFieldProps {
  /** Off for the sign-in field: a caps-lock warning next to a password you already know is noise. */
  warnCapsLock?: boolean;
}

export const AuthPasswordField = React.forwardRef<
  HTMLInputElement,
  AuthPasswordFieldProps
>(function AuthPasswordField(
  {
    id,
    label,
    labelAction,
    error,
    containerClassName,
    className,
    warnCapsLock = true,
    ...props
  },
  ref
) {
  const [visible, setVisible] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);
  const keepAboveKeyboard = useKeyboardSafeFocus();

  /* Caps lock is the single most common reason a correct password is rejected,
     and it is invisible behind the dots. The browser only reports it during a
     key event, so it is read on every key and cleared on blur. */
  const readCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!warnCapsLock) return;
    try {
      setCapsLock(e.getModifierState("CapsLock"));
    } catch {
      /* getModifierState is absent on some synthetic events — no warning, no crash. */
    }
  };

  return (
    <div className={cn("group", containerClassName)}>
      <AuthLabel htmlFor={id} action={labelAction}>
        {label}
      </AuthLabel>
      <div
        className={cn(
          fieldShell,
          "pr-1.5",
          error &&
            "border-[#f23645]/60 focus-within:border-[#f23645] focus-within:ring-[#f23645]/15"
        )}
      >
        <input
          {...props}
          id={id}
          ref={ref}
          type={visible ? "text" : "password"}
          onKeyDown={(e) => {
            readCapsLock(e);
            props.onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            readCapsLock(e);
            props.onKeyUp?.(e);
          }}
          onFocus={(e) => {
            keepAboveKeyboard(e);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            props.onBlur?.(e);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(fieldInput, className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground sm:h-8 sm:w-8"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <Collapsible show={capsLock && !error}>
        <p className="mt-1.5 text-[12px] font-medium text-[#f5a524]">
          Caps Lock is on
        </p>
      </Collapsible>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
});

/**
 * Errors and hints open and close rather than appearing.
 *
 * A message that pops into existence shoves everything below it down by its own
 * height in a single frame, and the eye reads that as the form breaking rather
 * than the form answering. Height and opacity together, over a third of a
 * second, and the layout arrives with the words.
 *
 * The element stays mounted and screen-reader-visible when empty so the live
 * region is not created at the same moment it is announced — which is how a
 * message gets read twice, or not at all.
 */
function Collapsible({
  children,
  show,
  className,
}: {
  children: React.ReactNode;
  show: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldError({ id, message }: { id: string; message?: string | null }) {
  return (
    <>
      <Collapsible show={!!message}>
        <p className="mt-1.5 text-[12px] font-medium text-[#f23645]">
          {message}
        </p>
      </Collapsible>
      <span id={id} role="alert" aria-live="polite" className="sr-only">
        {message ?? ""}
      </span>
    </>
  );
}

export function AuthSubmitButton({
  loading,
  loadingLabel,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      type="submit"
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-white",
        "bg-[#0052ff] transition-[background-color,transform,opacity] duration-150",
        "hover:bg-[#0041cc] active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0052ff]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_8px_22px_-10px_rgba(0,82,255,0.85)]",
        props.className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {loading ? loadingLabel ?? "Please wait" : children}
    </button>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-3 text-[11.5px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Secondary action — Google, wallet. Same metrics as the primary, quiet surface. */
export function AuthSecondaryButton({
  icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-field-border bg-field",
        "text-[13.5px] font-semibold text-foreground transition-colors duration-150",
        "hover:border-foreground/30 hover:bg-foreground/[0.05]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0052ff]/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Google's mark, in Google's four colours.
 *
 * The single-path version this used before is one shape filled #4285F4, so the
 * G came out solid blue. Google's brand guidelines require the four-colour mark
 * on a light surface and forbid recolouring it, and a wholly blue G next to the
 * words "Continue with Google" reads as a knock-off of the button it is
 * imitating — which is the last impression a sign-in page should give.
 */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-[17px] w-[17px] shrink-0", className)}
      viewBox="0 0 48 48"
      aria-hidden
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * The header for a page that is reporting an outcome rather than asking for
 * input — email verified, link expired, account created. Same left-aligned
 * rhythm as the forms, so switching between them does not move the eye.
 */
export function AuthStatusBlock({
  icon,
  tint,
  title,
  body,
}: {
  icon: React.ReactNode;
  /** Hex — the tinted square behind the icon is built from it. */
  tint: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl border"
        style={{ borderColor: `${tint}33`, backgroundColor: `${tint}12` }}
      >
        {icon}
      </span>
      <h2 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

/**
 * The password policy, in one place.
 *
 * These five are the backend's registration requirements. Sign-up and password
 * reset both have to agree with them and with each other — reset used to test
 * four looser buckets and an 8-character floor, so a password it happily
 * accepted could still come back rejected from the server.
 *
 * The same list drives the checklist, the meter and the submit validation, so a
 * form cannot read all-green and still be refused by its own gate.
 */
export const PASSWORD_RULES = [
  { label: "8+ characters", hint: "8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase", hint: "an uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase", hint: "a lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", hint: "a number", test: (p: string) => /\d/.test(p) },
  { label: "Symbol", hint: "a symbol", test: (p: string) => /\W/.test(p) },
] as const;

export function passwordRulesMet(password: string): boolean[] {
  return PASSWORD_RULES.map((rule) => rule.test(password));
}

/**
 * One bar, one word, one instruction.
 *
 * It was five segments over five ticked-off chips, which at 390px wrapped onto
 * a second row: eleven separate things reporting on one field, most of them
 * already satisfied and none of them the thing to do next. What someone needs
 * while typing a password is how close they are and what is still missing — so
 * the bar answers the first and a single sentence answers the second, naming
 * only the requirements not yet met.
 *
 * The word carries a fixed width so the bar does not resize as Weak becomes
 * Strong, and the fill animates rather than stepping.
 */
function joinPhrases(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function AuthPasswordStrength({ password }: { password: string }) {
  const reduce = useReducedMotion();
  const met = passwordRulesMet(password);
  const count = met.filter(Boolean).length;
  const complete = count === PASSWORD_RULES.length;

  const tone = complete ? "#089981" : count >= 3 ? "#f5a524" : "#f23645";
  const word = complete ? "Strong" : count >= 3 ? "Fair" : "Weak";
  const missing = PASSWORD_RULES.filter((_, i) => !met[i]).map((r) => r.hint);

  return (
    <Collapsible show={!!password}>
      <div className="mt-3">
        <div className="flex items-center gap-3">
          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/[0.12]">
            <motion.span
              className="block h-full rounded-full"
              initial={false}
              animate={{
                width: `${(count / PASSWORD_RULES.length) * 100}%`,
                backgroundColor: tone,
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
              }
            />
          </span>
          <span
            className="w-11 shrink-0 text-right text-[11.5px] font-semibold transition-colors duration-300"
            style={{ color: tone }}
          >
            {word}
          </span>
        </div>

        <Collapsible show={!complete}>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Add {joinPhrases(missing)}.
          </p>
        </Collapsible>

        <p className="sr-only" aria-live="polite">
          {complete
            ? "Password meets every requirement."
            : `Password meets ${count} of ${PASSWORD_RULES.length} requirements.`}
        </p>
      </div>
    </Collapsible>
  );
}

/** The form-level failure banner, on the same open/close as the field hints. */
export function AuthFormError({ message }: { message?: string | null }) {
  return (
    <Collapsible show={!!message}>
      <p className="rounded-lg border border-[#f23645]/25 bg-[#f23645]/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-[#f23645]">
        {message}
      </p>
      <span role="alert" aria-live="assertive" className="sr-only">
        {message ?? ""}
      </span>
    </Collapsible>
  );
}

/**
 * Which of the two things you are doing.
 *
 * Sign-in and sign-up were two pages that differed by a heading and a link
 * buried under it, and the link on each page named the *other* one — so the
 * largest text saying "Create your account" sat above the words "Sign in", and
 * telling which page you were on meant reading both and working it out.
 *
 * A two-up switch says it without being read: one segment is filled in the
 * brand blue, the other is not. It also turns switching into a single tap. The
 * terminal already uses this control in the order panel for the amount and
 * expiry modes, so it is this product's own idiom rather than a borrowed one.
 */
export function AuthModeTabs({ active }: { active: "sign-in" | "sign-up" }) {
  const tabs = [
    { id: "sign-in", label: "Sign in", href: "/login" },
    { id: "sign-up", label: "Create account", href: "/register" },
  ] as const;

  return (
    <div className="mb-7 grid grid-cols-2 gap-1 rounded-xl border border-field-border bg-field p-1">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg text-[13.5px] font-semibold",
              "transition-[background-color,color,box-shadow] duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff]/40",
              on
                ? "bg-[#0052ff] text-white shadow-[0_2px_8px_-2px_rgba(0,82,255,0.6)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
