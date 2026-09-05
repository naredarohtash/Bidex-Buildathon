"use client";

/**
 * The account panel — tier, identity, currency, and the two balances.
 *
 * Lifted verbatim out of the desktop header so the mobile terminal can show
 * the same panel rather than a second, thinner one. It was ~390 lines of JSX
 * nested nine levels deep inside a 2,300-line component, reachable only from
 * that one dropdown; mobile had a stripped-down substitute that showed two
 * balances and a top-up button and none of the tier, identity or currency
 * controls. Two panels for one job is how they drift apart.
 *
 * It owns everything it can derive — balances, tier, currency — and takes only
 * what belongs to whoever is hosting it: how to close, and the four things that
 * open something else (tier breakdown, deposit, withdraw, account switch).
 */

import { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  X as XIcon,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { useShallow } from "zustand/react/shallow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import LiveBalance from "./live-balance";
import { useRouter, useParams } from "next/navigation";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import { useGuestSession, formatRemaining } from "@/store/trade/use-guest-session";
import { useUserStore } from "@/store/user";
import { TIERS, TIER_ORDER, TierBars, resolveTier } from "../../lib/account-tiers";
import { cn } from "@/lib/utils";

/* The bounds the route enforces, repeated here so the field can say them before
   the request rather than after it — see util/demoBalance on the server. */
const DEMO_MIN = 100;
const DEMO_MAX = 1_000_000;
const DEMO_DEFAULT = 50000;
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "./header";

interface AccountPanelProps {
  /** Dismiss whatever is hosting the panel — a dropdown on desktop, a sheet on mobile. */
  onClose: () => void;
  onOpenAccountLevels: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onSwitchAccount: (account: "real" | "practice") => void;
  /** Mobile's floating account box has ~35px to trigger from; the panel it
      opens was sized for the desktop dropdown and read as oversized under
      it. Same content, same order — tighter padding, gaps and headline
      sizes throughout. Desktop (the default) is untouched. */
  compact?: boolean;
}

export function AccountPanel({
  onClose,
  onOpenAccountLevels,
  onDeposit,
  onWithdraw,
  onSwitchAccount,
  compact = false,
}: AccountPanelProps) {
  const [copiedTraderId, setCopiedTraderId] = useState(false);
  /* React state, not `document.getElementById(...).classList.toggle`.
  
     The currency picker was opened by reaching into the DOM for a hard-coded
     id and flipping a class on it. It worked, and it was one of those things
     that works until it does not: the id is global, so a second panel on the
     screen — the mobile header mounts one too — toggles the first one's menu,
     and React re-renders the list underneath a class it does not know about. */
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const user = useUserStore((s) => s.user);

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    if (user?.firstName) return user.firstName.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return "U";
  };

  /* No isLoadingWallet here any more — LiveBalance subscribes to the wallet's
     status itself, so subscribing again only re-rendered this panel. */
  const { realBalance, demoBalance, tradingMode } = useBinaryStore(
    useShallow((s) => ({
      realBalance: s.realBalance,
      demoBalance: s.demoBalance,
      tradingMode: s.tradingMode,
    }))
  );
  const resetDemoBalance = useBinaryStore((s) => s.resetDemoBalance);
  const setDemoBalance = useBinaryStore((s) => s.setDemoBalance);
  /* The practice balance, edited where it is shown. */
  const [editingDemo, setEditingDemo] = useState(false);
  const [demoAmount, setDemoAmount] = useState("");
  const [savingDemo, setSavingDemo] = useState(false);

  const router = useRouter();
  const routeParams = useParams();
  const locale = (routeParams?.locale as string) || "en";
  const { isGuest } = useGuestGate();
  const guestIdentity = useGuestSession((st) => st.identity);
  const guestRemaining = useGuestSession((st) => st.msRemaining);
  const goTo = (path: string) => {
    onClose();
    router.push(`/${locale}/${path}`);
  };

  /* The currency is stored, not held in React state, and three different
     places write it — so this listens for both the custom event and the
     storage event the picker below fires. */
  const [preferredCurrency, setPreferredCurrency] = useState("USDT");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
    read();
    window.addEventListener("currency-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("currency-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const activeWallet: "real" | "practice" = tradingMode === "real" ? "real" : "practice";

  /* The short number the platform issues, falling back to the internal id for
     an account that predates it — the same rule the account rail follows. */
  const accountRef = (user as any)?.accountId
    ? String((user as any).accountId)
    : user?.id || "";

  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;
  const preferredCurrencySymbol = CURRENCY_SYMBOLS[preferredCurrency] || "$";

  /* Checked as it is typed, in the currency on screen: the amount is entered in
     whatever currency the panel is displaying, and the server stores USD. */
  const demoTyped = Number(demoAmount);
  const demoError = !demoAmount.trim()
    ? "Enter an amount."
    : !Number.isFinite(demoTyped)
      ? "That is not a number."
      : demoTyped < DEMO_MIN
        ? `The lowest is ${preferredCurrencySymbol}${DEMO_MIN.toLocaleString()}.`
        : demoTyped > DEMO_MAX
          ? `The highest is ${preferredCurrencySymbol}${DEMO_MAX.toLocaleString()}.`
          : null;

  const applyDemoBalance = async () => {
    if (demoError || savingDemo) return;
    setSavingDemo(true);
    /* Back to USD, which is what the server holds and what every threshold in
       this product is denominated in. */
    const ok = await setDemoBalance(demoTyped / (preferredCurrencyRate || 1));
    setSavingDemo(false);
    if (ok) setEditingDemo(false);
  };

  const convertedRealBalance = (realBalance ?? 0) * preferredCurrencyRate;
  const convertedDemoBalance = (demoBalance ?? 10000) * preferredCurrencyRate;

  /* Thresholds live on the shared tier table in USD and are converted here, so
     "$5,000 or the equivalent" holds in every display currency. */
  const proThreshold = TIERS.advanced.minBalanceUsd * preferredCurrencyRate;
  const vipThreshold = TIERS.elite.minBalanceUsd * preferredCurrencyRate;
  const activeRealBalance = convertedRealBalance;

  const statusTierKey = resolveTier(activeRealBalance, proThreshold, vipThreshold);
  const statusTier = TIERS[statusTierKey];
  const statusIcon = (
    <TierBars level={statusTier.level} size={12} filledClass={statusTier.accent.fill} />
  );
  const iconBg = statusTier.accent.iconTile;
  const payoutColor = statusTier.accent.text;

  const isTopTier = statusTierKey === "elite";
  const nextTierKey = TIER_ORDER[TIER_ORDER.indexOf(statusTierKey) + 1];
  const nextTierName = nextTierKey ? TIERS[nextTierKey].name : "";
  const nextTierThreshold = statusTierKey === "basic" ? proThreshold : vipThreshold;
  const tierMoney = (v: number) =>
    `${preferredCurrencySymbol}${Math.round(v).toLocaleString("en-US")}`;

  /* Progress through the current tier, not from zero — the level starts at the
     threshold that granted it. */
  const progressMax = statusTierKey === "basic" ? proThreshold : vipThreshold;
  const tierFloor = statusTierKey === "basic" ? 0 : proThreshold;
  const progressPercent = isTopTier
    ? 100
    : Math.min(
        100,
        Math.max(
          0,
          ((activeRealBalance - tierFloor) / Math.max(1, progressMax - tierFloor)) * 100
        )
      );

  // Account switcher & info
  return (
      <div className={`w-full flex flex-col bg-zinc-50 dark:bg-[#181a26] ${compact ? "p-3" : "p-4"}`}>
        {/* Status Rank Block - Compact & Professional Progress Bar */}
        <div
          onClick={() => {
            onClose();
            onOpenAccountLevels();
          }}
          /* It opens the tier breakdown, so it has to look like it does.
             The only affordance was a background a shade lighter on
             hover, which on this panel is close to no affordance: the
             card read as a readout and the modal behind it went
             unfound. The border now lifts to the tier's own accent on
             hover and the whole card raises slightly, which is the
             same language the position rows use for "this opens". */
          /* Tokens, not two hand-picked palettes.
          
             This card was written as `bg-zinc-200/40 dark:bg-[#1e2230]` with a
             `#2b3045` border — a light value and a dark value, chosen by eye,
             and nothing for navy, which therefore borrowed the dark theme's
             charcoal on top of its own blue-black panel. `--card` and
             `--border` are mixed for all three, and they are what the rest of
             this product is built on, so the one card in the account dropdown
             stops being the one card with its own colours. */
          className={`bg-card border border-border rounded-lg flex flex-col shadow-sm cursor-pointer transition-all duration-150 hover:bg-muted hover:-translate-y-[1px] hover:shadow-md ${statusTier.accent.ring} hover:ring-1 ${compact ? "p-2.5 gap-2 mb-2" : "p-3 gap-2.5 mb-3"}`}
        >
          {/* The tier a trader holds, and what it is worth.

              Two failed attempts preceded this. The first was a
              segmented ladder with gradient fills and "Top level
              reached", which described a game rather than a trading
              account. The correction went so far the other way that
              nothing was left to read: a 2px rule and grey 11px type
              on a dark panel.

              Restraint is not the same as faintness. The figures a
              trader is being measured against are the point of the
              card, so they carry real weight; the labels around them
              stay quiet. The progress rule is 6px with a rounded cap,
              which is a bar rather than a hairline while still being
              one flat accent from the tier's own palette.

              "+0% payout" is gone. Basic pays the standard rate, and
              expressing that as an uplift of nothing describes the
              account by what it lacks — on the panel a trader opens
              to see what they have. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`h-8 w-8 rounded-md border shrink-0 ${iconBg} flex items-center justify-center`}>
                {statusIcon}
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                {/* The caption sits under the name, not over it. A 9px
                    all-caps label above a 14px name makes the label the first
                    thing read, and the label is the least interesting word on
                    the card — every account has a tier; which one is the
                    point. */}
                <span className="text-[14px] font-semibold text-foreground antialiased truncate">
                  {statusTier.name}
                </span>
                <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground antialiased">
                  Account tier
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 leading-tight">
              <span className={`text-[14px] font-bold tabular-nums antialiased ${payoutColor}`}>
                {statusTierKey === "basic" ? "Standard" : statusTier.payout}
              </span>
              <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground antialiased">
                {statusTierKey === "basic" ? "payout rate" : "added payout"}
              </span>
            </div>
          </div>

          {/* Nothing under the tier row at the top.
          
              It carried a caption — "Highest tier — maximum payout rate on
              every position" — which measured 296px in a dropdown with about
              264px of content width, so it wrapped and the top-tier card came
              out a line taller than every other tier's. Shortening it was the
              obvious fix and the wrong one: the row directly above already
              prints the payout and labels it, and the rest of the sentence was
              congratulation. The progress bar below is what a tier card owes
              the reader, and at the top there is no progress left to draw. */}
          {!isTopTier && (
            <>
              {/* The ladder, not a bar.
              
                  One anonymous rule told a trader how far along *something*
                  they were, and could not say how many rungs there are or
                  which one they are standing on — the two questions a tier
                  card exists to answer. Three segments, one per tier: the ones
                  behind are full in their own accent, the one you are in fills
                  with your progress through it, the ones ahead are track. The
                  shape says "three levels, you are in the second" before a
                  word is read.
              
                  This is not the rejected version. That one was gradient fills
                  and a "Top level reached" banner, which described a game;
                  these are the same flat accents the rest of the panel uses,
                  at the same 6px, cut where the tiers actually change. */}
              <div className="flex items-center gap-1">
                {TIER_ORDER.map((key) => {
                  const rung = TIERS[key];
                  const passed = rung.level < statusTier.level;
                  const current = rung.level === statusTier.level;
                  return (
                    <span
                      key={key}
                      className="h-[6px] flex-1 overflow-hidden rounded-full bg-foreground/[0.10]"
                    >
                      <span
                        className={`block h-full rounded-full transition-[width] duration-500 ${
                          passed ? rung.accent.fill : statusTier.accent.fill
                        }`}
                        style={{
                          width: passed ? "100%" : current ? `${Math.max(6, progressPercent)}%` : "0%",
                        }}
                      />
                    </span>
                  );
                })}
              </div>
              {/* What is left, and what it buys. The line read "7,600 of
                  10,000 · Pro →", which is the arithmetic rather than the
                  answer: a trader looking at a tier bar wants to know how far
                  short they are, and had to work it out from two figures. The
                  balance is on this panel twice already. */}
              <div className="flex items-baseline justify-between gap-2 antialiased">
                <span className="text-[11.5px] tabular-nums text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">
                    {tierMoney(Math.max(0, nextTierThreshold - activeRealBalance))}
                  </span>{" "}
                  to go
                </span>
                <span className="text-[11.5px] font-semibold text-foreground/80 shrink-0">
                  {nextTierName} →
                </span>
              </div>
            </>
          )}
        </div>

        {/* User Profile Info - Compact */}
        <div className={`flex flex-col ${compact ? "mb-2 gap-1.5" : "mb-3 gap-2"}`}>
          <div className="flex items-center gap-2">
            {/* The tier's own colour, worn on the portrait.
            
                The card above says which tier this account holds and the row
                below says whose account it is, and nothing joined the two. The
                ring does it in one stroke, with no words and no second badge —
                the same accent the ladder fills with.
            
                A padded disc rather than Tailwind's `ring-*`: the tier accents
                carry their ring colour at 40% for a hover state, which is the
                right weight against a card edge and nearly nothing around a
                40px portrait. `fill` is the solid the ladder uses, so the two
                marks are literally the same colour. */}
            <span
              className={`shrink-0 rounded-full p-[2px] ${statusTier.accent.fill}`}
            >
            <Avatar
              className={`block rounded-full ring-2 ring-card ${compact ? "h-8 w-8" : "h-9 w-9"}`}
            >
              {/* No src when there is no picture.

                  This passed a placeholder image whenever the user
                  had no avatar, so AvatarImage always had something
                  to load and the fallback beneath it — which draws
                  the initials — never got its turn. A stock silhouette
                  tells a trader nothing about whose account they are
                  looking at; two letters of their own name do. */}
              {user?.avatar ? (
                <AvatarImage
                  src={user.avatar}
                  alt={`Avatar of ${user.firstName || ""} ${user.lastName || ""}`.trim()}
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center">
                {user?.avatar?.includes("googleusercontent") || user?.avatar?.includes("google") ? (
                  <Icon icon="logos:google-icon" className="w-4 h-4" />
                ) : (
                  getUserInitials()
                )}
              </AvatarFallback>
            </Avatar>
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* The name leads, the email supports it — but the email is
                  what a trader actually reads back to support, so it is
                  no longer half a step from invisible. 13/12 on
                  900/700 instead of 12/10 on 800/500.
              
                  The account number rides on this line rather than under the
                  email. Three left-aligned lines of decreasing size read as one
                  block of text with the number as its afterthought; on the
                  name's own line, at the far edge, it is the second thing on the
                  card and the two identifiers — who you are, which account —
                  sit together. */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground truncate capitalize">
                {/* Guarding on `user` alone printed "undefined undefined"
                    (title-cased by `capitalize` into "Undefined Undefined")
                    whenever a session existed but its profile had not loaded —
                    the usual case being an expired session, where /api/user/profile
                    401s and leaves a hollow user object behind. The fallback has
                    to depend on there being a name, not on there being a user. */}
                  {guestIdentity?.name ||
                    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                    "Demo Trader"}
                </div>

                {accountRef && (
                  <button
                    type="button"
                    title="Copy account ID"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(accountRef).then(
                        () => {
                          setCopiedTraderId(true);
                          setTimeout(() => setCopiedTraderId(false), 1500);
                        },
                        () => {}
                      );
                    }}
                    className="group/id flex shrink-0 items-center gap-1 rounded px-1 py-[1px] text-[10px] font-semibold tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="shrink-0 opacity-70">ID</span>
                    <span className="font-mono">{accountRef}</span>
                    {copiedTraderId ? (
                      <Check size={10} className="shrink-0 text-emerald-500" />
                    ) : (
                      <Copy
                        size={10}
                        className="shrink-0 opacity-0 group-hover/id:opacity-100 transition-opacity"
                      />
                    )}
                  </button>
                )}
              </div>
              {/* A demo session has its own name and address; showing the old
                  hardcoded demo_guest@vortex.com beside it was a third identity
                  belonging to nobody. */}
              <div
                className="text-[12px] text-muted-foreground truncate mt-0.5"
                title={guestIdentity?.email || user?.email || ""}
              >
                {guestIdentity?.email || user?.email || "Not signed in"}
              </div>
            </div>
          </div>
    
          {/* The currency this account is read in.
          
              It was a bordered strip carrying a saturated blue "CHANGE" chip —
              the loudest object in the header, spent on the least consequential
              control on it, while the tier card beside it opens a whole modal
              with nothing but a hover. The row is the control now: press it
              anywhere, the list opens under it, and the only mark on it is the
              chevron every other menu in this product uses.
          
              And on tokens, like the card above. `#1e2230` and `#2b3045` are a
              dark-theme charcoal; navy was wearing them over its own
              blue-black. */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrencyOpen((open) => !open);
              }}
              aria-expanded={currencyOpen}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card transition-colors hover:bg-muted ${
                compact ? "px-2.5 py-1.5" : "px-3 py-2"
              }`}
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-[12.5px] font-semibold text-foreground uppercase tabular-nums">
                  {preferredCurrencySymbol} {preferredCurrency}
                </span>
                {/* A caption, not a pipe. The separator was a literal "|"
                    typed into the string. */}
                <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground truncate">
                  Display currency
                </span>
              </span>
              <ChevronDown
                size={13}
                className={`shrink-0 text-muted-foreground transition-transform duration-150 ${
                  currencyOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {currencyOpen && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border px-2.5 py-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Select currency
                  </span>
                </div>
                <div className="grid max-h-[238px] grid-cols-2 gap-1 overflow-y-auto p-2">
                  {[
                    { code: "USDT", sym: "₮", label: "Tether" },
                    { code: "USD",  sym: "$",  label: "US Dollar" },
                    { code: "EUR",  sym: "€",  label: "Euro" },
                    { code: "GBP",  sym: "£",  label: "British Pound" },
                    { code: "INR",  sym: "₹",  label: "Indian Rupee" },
                    { code: "BRL",  sym: "R$", label: "Brazilian Real" },
                    { code: "TRY",  sym: "₺",  label: "Turkish Lira" },
                    { code: "MYR",  sym: "RM", label: "Malaysian Ringgit" },
                    { code: "IDR",  sym: "Rp", label: "Indonesian Rupiah" },
                    { code: "THB",  sym: "฿",  label: "Thai Baht" },
                    { code: "NGN",  sym: "₦",  label: "Nigerian Naira" },
                    { code: "KES",  sym: "KSh",label: "Kenyan Shilling" },
                    { code: "ZAR",  sym: "R",  label: "South African Rand" },
                    { code: "AED",  sym: "د.إ",label: "UAE Dirham" },
                    { code: "VND",  sym: "₫",  label: "Vietnamese Dong" },
                  ].map((cur) => {
                    const isSelected = preferredCurrency === cur.code;
                    return (
                      <button
                        key={cur.code}
                        title={cur.label}
                        onClick={() => {
                          localStorage.setItem("preferred_currency", cur.code);
                          window.dispatchEvent(new Event("currency-changed"));
                          setCurrencyOpen(false);
                          window.dispatchEvent(
                            new StorageEvent("storage", {
                              key: "preferred_currency",
                              newValue: cur.code,
                            })
                          );
                        }}
                        className={`flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "border-brand/40 bg-brand/10 text-brand"
                            : "border-transparent text-foreground/80 hover:bg-muted"
                        }`}
                      >
                        <span className="w-7 shrink-0 text-[12px] font-semibold">{cur.sym}</span>
                        <span className="truncate text-[11px] font-medium">{cur.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`h-px bg-border ${compact ? "my-1.5" : "my-2"}`} />


        <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
          {/* Live Account Card - Premium Pro Style */}
          <div
            onClick={() => onSwitchAccount("real")}
            className={`flex flex-col rounded-lg cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] duration-150 ${compact ? "p-2" : "p-3"} ${
              activeWallet === "real"
                ? "bg-zinc-200/50 dark:bg-[#222533] border-y border-r border-zinc-300 dark:border-[#2b3045]/60 border-l-4 border-l-[#00a651] dark:border-l-[#00a651] shadow-md"
                : "bg-transparent border border-transparent hover:bg-zinc-200/20 dark:hover:bg-[#1b1e2a]/20"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {/* Radio box circle - Emerald for Live */}
              <div className="mt-0.5 shrink-0">
                {activeWallet === "real" ? (
                  <div className="w-4 h-4 rounded-full bg-[#00a651] flex items-center justify-center border border-[#00a651]">
                    <Check size={9} className="text-white stroke-[4]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-350 dark:border-[#36394d] bg-transparent" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Live Account
                </div>
                <div className={`font-bold text-zinc-900 dark:text-white tabular-nums leading-none ${compact ? "text-[14px] mt-1" : "text-[17px] mt-1.5"}`}>
                  {isGuest ? (
                    /* Not "Sign in to view" here. The card already ends in a
                       Sign in button, and two of them a centimetre apart is one
                       offer made twice. A locked balance is a dash. */
                    <span className="text-zinc-400 dark:text-zinc-600">—</span>
                  ) : (
                    <LiveBalance
                      amount={convertedRealBalance}
                      symbol={preferredCurrencySymbol}
                      compact={compact}
                    />
                  )}
                </div>
                <div className={`text-zinc-550 dark:text-zinc-400 ${compact ? "text-[10px] mt-0.5" : "text-[11px] mt-1"}`}>
                  Real funds for live trading
                </div>
              </div>
            </div>

            {/* Deposit is always offered, not only while the live
                account is the active one. Funding is the one action
                a trader on the demo account is most likely to be
                opening this panel for, and gating it on the live
                account already being selected meant the button was
                missing exactly when it was wanted. It stays inside
                the live card, since that is the balance it moves. */}
            {/* Both money movements, side by side.

                WithdrawModal was already imported, already had its
                open state and was already rendered at the bottom of
                this component — nothing ever set that state to true,
                so the whole flow existed with no way in. Deposit
                keeps the filled treatment as the more common action;
                withdraw is outlined rather than a second solid
                button, so the pair reads as primary and secondary
                instead of two things competing. */}
            <div className={`flex items-center gap-2 ${compact ? "mt-2" : "mt-2.5"}`}>
              {isGuest ? (
                /* Depositing and withdrawing need an account to deposit into,
                   so for a demo session the pair becomes the pair that leads
                   there. Stacked rather than side by side: at half width and
                   10px, "CREATE ACCOUNT" broke onto two lines inside its own
                   button, which is what a two-line label in a one-line button
                   always looks like. Full width also puts the weight on the
                   action that matters. */
                <div className="flex flex-col gap-1.5 w-full">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo("register");
                    }}
                    className={`w-full bg-[#00a651] hover:bg-[#008f45] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm shadow-emerald-500/10 ${compact ? "py-1.5 px-2" : "py-2 px-3"}`}
                  >
                    Create free account
                    <ArrowRight size={11} className="stroke-[3]" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo("login");
                    }}
                    className={`w-full border text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all active:scale-[0.99] flex items-center justify-center whitespace-nowrap cursor-pointer border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-400 dark:border-[#2b3045] dark:text-zinc-200 dark:hover:bg-[#222533] dark:hover:border-[#3a3f57] ${compact ? "py-1 px-2" : "py-1.5 px-3"}`}
                  >
                    Sign in
                  </button>
                </div>
              ) : (
              <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onDeposit();
                }}
                className={`flex-1 bg-[#00a651] hover:bg-[#008f45] text-white text-[10px] font-bold rounded-lg transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-500/10 ${compact ? "py-1 px-2" : "py-1.5 px-2"}`}
              >
                <Plus size={12} className="stroke-[3]" />
                <span>DEPOSIT</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onWithdraw();
                }}
                className={`flex-1 border text-[10px] font-bold rounded-lg transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 cursor-pointer border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-400 dark:border-[#2b3045] dark:text-zinc-200 dark:hover:bg-[#222533] dark:hover:border-[#3a3f57] ${compact ? "py-1 px-2" : "py-1.5 px-2"}`}
              >
                <ArrowUpFromLine size={12} className="stroke-[3]" />
                <span>WITHDRAW</span>
              </button>
              </>
              )}
            </div>
          </div>

          {/* Demo Account Card - Premium Pro Style */}
          <div
            onClick={() => onSwitchAccount("practice")}
            className={`flex flex-col rounded-lg cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] duration-150 ${compact ? "p-2" : "p-3"} ${
              activeWallet === "practice"
                ? "bg-zinc-200/50 dark:bg-[#222533] border-y border-r border-zinc-300 dark:border-[#2b3045]/60 border-l-4 border-l-amber-500 dark:border-l-amber-500 shadow-sm"
                : "bg-transparent border border-transparent hover:bg-zinc-200/20 dark:hover:bg-[#1b1e2a]/20"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {/* Radio box circle - Orange for Demo */}
              <div className="mt-0.5 shrink-0">
                {activeWallet === "practice" ? (
                  <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center border border-amber-500">
                    <Check size={9} className="text-white stroke-[4]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-350 dark:border-[#36394d] bg-transparent" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Demo Account
                </div>
                <div className={`flex items-center gap-1.5 ${compact ? "mt-0.5" : "mt-1"}`}>
                  {/* Edited where it is shown, in the row itself.
                  
                      It was a dialog, and a dialog cannot work from here: this
                      panel closes on an outside click, and a dialog portalled to
                      `body` is outside it — so the first click into the field
                      shut the panel and took the field with it. The figure
                      becomes the field instead. */}
                  {editingDemo ? (
                    <form
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        applyDemoBalance();
                      }}
                      className="flex items-center gap-1"
                    >
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">
                          {preferredCurrencySymbol}
                        </span>
                        <input
                          value={demoAmount}
                          autoFocus
                          inputMode="decimal"
                          disabled={savingDemo}
                          onChange={(e) => setDemoAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Escape") setEditingDemo(false);
                          }}
                          title={demoError || "Practice balance"}
                          className={cn(
                            "h-7 w-[104px] rounded-md border bg-white pl-5 pr-2 text-[13px] font-bold tabular-nums text-zinc-900 outline-none",
                            "dark:bg-[#1b1f2e] dark:text-white",
                            demoError
                              ? "border-red-500/60"
                              : "border-zinc-300 focus:border-blue-500 dark:border-[#36394d] dark:focus:border-blue-500"
                          )}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!!demoError || savingDemo}
                        title={demoError || "Save practice balance"}
                        className="p-1 rounded text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                      >
                        <Check size={12} className="stroke-[3]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDemo(false);
                        }}
                        title="Cancel"
                        className="p-1 rounded text-zinc-400 hover:bg-zinc-250 dark:hover:bg-[#282d3f] transition-colors"
                      >
                        <XIcon size={12} className="stroke-[3]" />
                      </button>
                    </form>
                  ) : (
                    <span className={`font-bold text-zinc-900 dark:text-white tabular-nums leading-none ${compact ? "text-[14px]" : "text-[17px]"}`}>
                      {`${preferredCurrencySymbol}${convertedDemoBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  )}
                  <div className={cn("flex items-center gap-0.5 shrink-0", editingDemo && "hidden")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetDemoBalance();
                      }}
                      className="p-0.5 rounded hover:bg-zinc-250 dark:hover:bg-[#282d3f] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      title="Reload Balance"
                    >
                      <RefreshCw size={10} className="hover:rotate-180 transition-transform duration-500" />
                    </button>
                    {/* It called `resetDemoBalance` — the same thing as the
                        button beside it — under a tooltip reading "Edit/Rename".
                        Two controls doing one job, and the one labelled edit
                        edited nothing. It sets the practice balance now. */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        /* Opens on what is on screen, in the currency on
                           screen — not the stored USD figure. */
                        setDemoAmount(
                          String(Math.round(convertedDemoBalance || DEMO_DEFAULT))
                        );
                        setEditingDemo(true);
                      }}
                      className="p-0.5 rounded hover:bg-zinc-250 dark:hover:bg-[#282d3f] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      title="Set practice balance"
                    >
                      <Pencil size={10} />
                    </button>
                  </div>
                </div>
                <div className={`text-zinc-550 dark:text-zinc-400 ${compact ? "text-[10px] mt-0.5" : "text-[11px] mt-1"}`}>
                  Practice funds for trading
                </div>
                {/* The clock lives on the thing it applies to. It was a floating
                    pill over the chart, which is both out of place on a trading
                    screen and out of keeping with everything around it. */}
                {isGuest && (
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Demo session · {formatRemaining(guestRemaining)} left
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
  );
}

export default AccountPanel;
