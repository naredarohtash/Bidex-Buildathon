"use client";

/**
 * The shell both auth pages sit in.
 *
 * Two columns: the product on the left, the form on the right.
 *
 * The left column is deliberately NOT a marketing panel. It is the terminal's
 * own surface — the same near-black navy the chart paints on, the same blue,
 * the same rise/fall greens and reds — carrying live market data rather than an
 * illustration of it. Someone signing in is one click from that screen, so the
 * page should already look like it.
 *
 * The left column stays dark in every theme for that reason: it depicts a
 * surface, not the interface. The right column is the interface and follows the
 * theme the way the rest of the app does, so light, dark and navy all render
 * correctly instead of the page assuming a white card the way the old one did.
 */

import * as React from "react";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Link } from "@/i18n/routing";
import Logo from "@/components/elements/logo";
import { AuthMarketRail } from "@/components/auth/auth-market-rail";
import { AuthModeTabs } from "@/components/auth/auth-fields";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { cn } from "@/lib/utils";

/* The terminal's navy, one step darker than the chart's own #0b111e so the
   rail's hairlines have something to sit on. */
const PANEL_BG = "#070c15";

interface AuthShellProps {
  /** Left column heading. Short — it competes with the form for attention and should lose. */
  headline: React.ReactNode;
  subline: React.ReactNode;
  /** A banner above the form: why the person was sent here, what just happened. */
  notice?: React.ReactNode;
  /**
   * Renders the sign-in / create-account switch above the form. Omitted by the
   * screens that are not one of the two — password reset, email verification,
   * the state after a successful sign-up.
   */
  mode?: "sign-in" | "sign-up";
  children: React.ReactNode;
}

export function AuthShell({
  headline,
  subline,
  notice,
  mode,
  children,
}: AuthShellProps) {
  const reduceMotion = useReducedMotion();
  const keyboardInset = useKeyboardInset();

  /* A floor under the measurement, not a replacement for it.

     visualViewport has now been wrong twice on a real iPhone while agreeing
     with a simulation, so the layout no longer depends on getting a number out
     of it at all: while a field is focused on a touch device, the column simply
     carries enough slack that any field can be scrolled to the top of the
     screen. No keyboard is taller than the screen, so this cannot be too
     little, and it disappears on blur, so it is never seen. */
  const [typing, setTyping] = React.useState(false);
  const touch =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(pointer: coarse)")?.matches;

  const slack = Math.max(
    keyboardInset ? keyboardInset + 32 : 0,
    typing && touch ? Math.round((typeof window !== "undefined" ? window.innerHeight : 0) * 0.62) : 0
  );
  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:grid lg:grid-cols-[1.02fr_1fr] xl:grid-cols-[1.1fr_1fr]">
      <BrandPanel headline={headline} subline={subline} />
      <MobileBrandBar />

      {/* dvh, not vh. On iOS `100vh` is the viewport *without* the keyboard, so
          with a keyboard open the column stayed taller than the visible area,
          the page had nothing left to scroll, and the lower fields sat behind
          the keys. `dvh` shrinks with it. The extra bottom padding on small
          screens is the room the last field needs to be scrolled clear. */}
      <main
        className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-dvh"
        /* Published as a variable rather than applied here, because the element
           that needs it is the submit button several levels down, and threading
           a number through three components to reach it would be worse. */
        style={{ ["--kb-inset" as string]: `${keyboardInset}px` }}
        onFocusCapture={(e) => {
          if ((e.target as HTMLElement)?.tagName === "INPUT") setTyping(true);
        }}
        onBlurCapture={(e) => {
          if ((e.target as HTMLElement)?.tagName === "INPUT") setTyping(false);
        }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-5 sm:px-8 lg:h-[72px] lg:px-10">
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft
              size={14}
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            />
            Back to site
          </Link>
          <ThemePicker />
        </div>

        <div
          className="flex flex-1 items-start justify-center px-5 pb-24 pt-4 sm:px-8 sm:pt-8 lg:items-center lg:px-10 lg:pb-10 lg:pt-0"
          /* The keyboard's own height, as scrollable room. Zero on every device
             that is not showing one, so desktop never sees this. */
          style={slack ? { paddingBottom: slack } : undefined}
        >
          <div className="w-full max-w-[404px]">
            {/* Sign-in and sign-up are separate routes, so switching remounts
                this column. The entrance is what turns that remount from a
                flash into a transition — and it is skipped outright for anyone
                who has asked their system for less motion. */}
            <motion.div
              key={mode ?? "static"}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              {notice && <div className="mb-6">{notice}</div>}
              {mode && <AuthModeTabs active={mode} />}
              {children}
            </motion.div>

            {/* No market board on a phone.

                It was moved here when the brand panel went desktop-only, on the
                reasoning that the live prices are what stop this page reading as
                a template. That reasoning is about the desktop panel, where the
                board sits *beside* the form in space that would otherwise be
                empty. On a phone it sits *under* the form, in the one column the
                form is using, and a person on a 390px screen filling in five
                fields is not shopping for markets — they are trying to finish.
                It also made the page longer, which is the last thing a form with
                a keyboard over it needs. */}
          </div>
        </div>

        <footer className="shrink-0 px-5 pb-6 text-center sm:px-8 lg:px-10">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
            <Link
              href="/terms"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Terms of Service
            </Link>
            <span className="mx-2 text-muted-foreground/40">·</span>
            <Link
              href="/privacy"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Privacy Policy
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

function BrandPanel({
  headline,
  subline,
}: {
  headline: React.ReactNode;
  subline: React.ReactNode;
}) {
  return (
    <aside
      className="relative hidden overflow-hidden border-r border-white/[0.07] lg:flex lg:flex-col"
      style={{ backgroundColor: PANEL_BG }}
    >
      <PanelBackdrop />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
        {/* One column width for the whole panel. The headline, the board and
            the demo card are one stack, not three elements that each found
            their own edge. */}
        <div className="w-full max-w-[460px]">
          <Link href="/" aria-label="Bidex home" className="block w-fit">
            {/* Dark artwork always: this panel is dark in every theme. */}
            <Logo type="text" appearance="dark" />
          </Link>
        </div>

        <div className="w-full max-w-[460px] py-10">
          <h1 className="text-[34px] font-semibold leading-[1.14] tracking-[-0.022em] text-white xl:text-[38px]">
            {headline}
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-[#8b93a5]">
            {subline}
          </p>

          <AuthMarketRail className="mt-9" />
        </div>

        <div className="w-full max-w-[460px]">
          <DemoCallout />
        </div>
      </div>
    </aside>
  );
}

/**
 * Three layers, all quiet: a blue light low on the left where the eye enters,
 * a colder one top-right to keep the panel from reading as a single flat wash,
 * and the grid the terminal draws behind its own chart.
 */
function PanelBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 6% 92%, rgba(0,82,255,0.20) 0%, rgba(0,82,255,0.05) 38%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 55% at 100% 0%, rgba(96,165,250,0.10) 0%, transparent 62%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(120% 100% at 20% 50%, #000 25%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(120% 100% at 20% 50%, #000 25%, transparent 78%)",
        }}
      />
    </div>
  );
}

/**
 * The demo is real — an unauthenticated visitor gets the actual terminal — so
 * this is a genuine third way in.
 *
 * It is not a card, and that is the point. A rounded box with a tinted icon
 * tile, a bold title, a muted subtitle and a chevron is the single most
 * reproduced component on the web; two of them on one page is how a screen
 * starts looking assembled rather than designed. Nothing in the terminal is
 * built that way either — it separates things with hairlines, labels them with
 * spaced uppercase, and never draws a decorative icon.
 *
 * So this borrows the board above it: a rule, an action, and a line of terms in
 * the same micro-label the board's header uses. The affordance is the arrow and
 * the colour shift, which is all a secondary path on a brand panel needs.
 */
function DemoCallout() {
  return (
    <Link
      href="/terminal"
      className="group block border-t border-white/[0.09] pt-4"
    >
      <span className="flex items-center justify-between gap-4">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors duration-200 group-hover:text-[#5b9dff]">
          Open the terminal on demo funds
        </span>
        <ArrowRight
          size={16}
          className="shrink-0 text-[#5b6478] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#5b9dff]"
        />
      </span>
      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6478] transition-colors duration-200 group-hover:text-[#787b86]">
        30 minutes · live prices · no sign-up
      </span>
    </Link>
  );
}

/** Phones and tablets get the brand and the demo, not the whole panel. */
function MobileBrandBar() {
  return (
    <div
      className="relative flex h-14 items-center justify-between overflow-hidden border-b border-white/[0.07] px-5 sm:px-8 lg:hidden"
      style={{ backgroundColor: PANEL_BG }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(90% 180% at 0% 100%, rgba(0,82,255,0.22) 0%, transparent 62%)",
        }}
      />
      <Link href="/" aria-label="Bidex home" className="relative z-10">
        <Logo type="text" appearance="dark" className="h-8" />
      </Link>
      <Link
        href="/terminal"
        className="relative z-10 inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-white/90 transition-colors hover:border-[#0052ff]/50 hover:bg-[#0052ff]/15"
      >
        Try the demo
        <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}

/**
 * The platform ships three themes and the auth page is where most people first
 * see it, so the choice is offered here rather than only behind a sign-in.
 * Swatches rather than icons: each one is the theme's actual background, which
 * says what it does without needing a legend.
 */
const THEMES = [
  { id: "light", label: "Light", swatch: "#ffffff", ring: "#d4d4d8" },
  { id: "dark", label: "Dark", swatch: "#09090b", ring: "#3f3f46" },
  { id: "navy", label: "Navy", swatch: "#0b111e", ring: "#1e3a6b" },
] as const;

function ThemePicker() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const active = mounted ? theme === "system" ? resolvedTheme : theme : undefined;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
    >
      {THEMES.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t.label}
            title={t.label}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors",
              selected ? "bg-foreground/[0.09]" : "hover:bg-foreground/[0.05]"
            )}
          >
            <span
              className="h-3 w-3 rounded-full border transition-shadow"
              style={{
                backgroundColor: t.swatch,
                borderColor: t.ring,
                boxShadow: selected ? `0 0 0 2px ${t.ring}` : undefined,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default AuthShell;
