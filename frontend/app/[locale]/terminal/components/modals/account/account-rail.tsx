"use client";

/**
 * Account navigation, as a rail down the left on wide screens.
 *
 * The panel is full-screen, so the four destinations can stay visible instead
 * of being a row of tabs above the content. Below `lg` it becomes a horizontal
 * scroller, because a 200px column on a phone is most of the screen. One
 * component either way: the sidebar this replaces kept a second copy of itself
 * inside a mobile drawer, and the two drifted.
 *
 * ── What this rebuild changed, and why ──────────────────────────────────
 *
 * **The selection slides.** It used to be a tinted background that appeared on
 * one row and vanished from another, so moving between tabs read as two
 * separate events rather than one movement. A single `layoutId` element now
 * travels between rows, which is the one animation this rail actually needs.
 * It has to be framer-motion rather than CSS: `styles/theme.css` sets
 * `transition` on `*` for background, border and colour only, and that
 * shorthand resets `transition-property`, so every transform in the app is
 * dead on arrival. Colour fades still work — those three properties are
 * exactly what the rule keeps — which is why hover states here are plain
 * classes and only the moving parts use motion.
 *
 * **The colour left.** Every row carried a bordered tile holding a tinted
 * icon, the active one went blue, "needs attention" was an amber dot and
 * "done" a green tile — four hues in a 248px column, none of them earning
 * their place. Icons sit on the row now and take the row's colour.
 *
 * **A state is a word, not a mark.** The tick and the dot could only say
 * "done" and "not done", and identity verification has four answers that
 * matter differently: approved, waiting on a reviewer, rejected, and never
 * started. A tick cannot tell somebody their documents were refused. So the
 * row says it — "Verified", "In review", "Action needed".
 *
 * It sits beside the label rather than on the right edge, for a reason that
 * only showed up once it was built: pinned right, it took width from the
 * description, which then wrapped to two lines and made that one row taller
 * than the other three. A badge against the word it qualifies is both the
 * right reading order and the one that leaves every row the same height. It is
 * sized to sit inside the label's own line box, so adding it costs no height
 * at all.
 *
 * **The icons draw the thing, not the category.** A key is the password it
 * changes, not "security" in the abstract; a face being scanned is what KYC
 * asks you to do; two arrows crossing vertically are money in and out, where a
 * receipt would be the paper afterwards.
 *
 * Personal was a contact card — a person drawn inside a bordered rectangle.
 * The reasoning was sound (this tab holds contact details) but at 18px the card
 * is four strokes of frame around a figure two pixels tall, and it came out as
 * a smudge with something in it rather than as a person. It is a plain person
 * now: the row already says "Your name, contact and address" underneath, so the
 * glyph does not have to carry the qualifier, and it is legible at the size it
 * is actually drawn.
 *
 * Who you are sits at the top. That was a full-width header above the whole
 * panel once — avatar, name, email, account id, balance, tier, a progress ring
 * and a next-step chip, about 90px tall on every tab. What survives is the part
 * that answers "whose account am I in?", which is worth having on screen no
 * matter which tab is open: photo, name, and the account number — the number
 * rather than the email, because the email is already under the portrait on
 * Profile and the number is what support asks for.
 */

import { memo } from "react";
import { motion } from "framer-motion";
import {
  UserRound,
  KeyRound,
  ScanFace,
  ArrowDownUp,
  ShieldCheck,
  BadgeCheck,
  LogOut,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PUNCHED_ATTENTION,
  PUNCHED_GLYPH,
  PUNCHED_VERIFIED,
} from "@/app/[locale]/(dashboard)/user/profile/components/kit/settings-kit";
import { useAccountSignOut } from "./use-account-sign-out";
import { CopyValue, EditableAvatar } from "./profile-kit";

/**
 * What a row says about itself, on its right-hand edge.
 *
 * `tone` is applied to the text and nothing else. A filled chip here would put
 * back the tinted blocks this rail was rebuilt to remove, and at 10px a word in
 * emerald is already unmistakably different from a word in grey.
 */
export interface RailStatus {
  label: string;
  tone: "ok" | "warn" | "muted";
  /** The glyph that carries the state at a glance. */
  icon: React.ElementType;
}

export interface AccountTab {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

export const ACCOUNT_TABS: AccountTab[] = [
  { id: "personal", label: "Personal", icon: UserRound, description: "Your name, contact and address" },
  { id: "security", label: "Security", icon: KeyRound, description: "Password and sign-in" },
  { id: "kyc", label: "KYC", icon: ScanFace, description: "Prove who you are" },
  { id: "transactions", label: "Transactions", icon: ArrowDownUp, description: "Deposits and withdrawals" },
];

/* Phone verification used to be a fifth entry. It verifies the number that is
   a field on Personal, so it is a section there instead — one destination for
   "my contact details" rather than the same subject split across two.

   Notifications went the same way, for a blunter reason: what it offered was
   email preferences, which is a settings screen and not part of "my account".
   It kept a rail slot on every visit for something almost nobody opens. */

/** One easing and one duration for everything that moves in here. */
const GLIDE = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.7 };

export const AccountRail = memo(function AccountRail({
  active,
  onChange,
  status = {},
  onSignedOut,
  user,
  uploading = false,
  onPickPhoto,
  onChooseAvatar,
}: {
  active: string;
  onChange: (tab: string) => void;
  /** What each tab reports, keyed by tab id. Omit a tab to leave it silent. */
  status?: Record<string, RailStatus | undefined>;
  /** Called after a successful sign out, so the host can close the panel. */
  onSignedOut?: () => void;
  /** Drives the identity block above the navigation. */
  user?: any;
  uploading?: boolean;
  onPickPhoto?: (file: File) => void;
  onChooseAvatar?: (url: string) => void | Promise<unknown>;
}) {
  const { signOut, signingOut } = useAccountSignOut(onSignedOut);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-b border-border bg-muted/20",
        "lg:w-[248px] lg:border-b-0 lg:border-r"
      )}
    >
      {/* Only on the column. As a horizontal scroller there is no room above
          the tabs, and the phone renders its own identity card anyway. */}
      {user && (
        <div className="hidden lg:block">
          <RailIdentity
            user={user}
            uploading={uploading}
            onPickPhoto={onPickPhoto}
            onChooseAvatar={onChooseAvatar}
          />
        </div>
      )}

      {/* The destinations get their own surface.

          Identity, navigation and sign-out were three different kinds of thing
          on one uninterrupted wash, separated by hairlines alone — and a 1px
          rule between two identical greys is not a separation, it is a scratch.
          The middle band is tinted so the column reads as "who you are", then
          "where you can go", then "leave", before any of it is read.

          `foreground` at 4% rather than a named surface, because the tint has
          to work in three themes: `muted` and `card` sit 4% apart in light and
          under 2% apart in dark, so a fixed pair that separates cleanly on one
          is invisible on another. Mixed from the foreground it is always a step
          away from whatever is behind it, in whichever direction that theme
          needs. It is the same idiom the active row and the hover wash already
          use, so the column gains a band and no new colour.

          No border of its own: the identity block above already draws a
          `border-b` and the sign-out footer below a `border-t`, so adding
          `border-y` here would have stacked two hairlines into one 2px rule at
          each seam — the sort of thing that reads as a rendering fault rather
          than as a decision. */}
      <div className="flex min-h-0 flex-col bg-foreground/[0.04] lg:flex-1">
        {/* `--foreground` at 70%, not `--muted-foreground`. That token is mixed
            against the page, and this band is the page with 4% of the ink laid
            over it — so a caption that measures as quiet on white arrives here
            as the faintest thing in the column, at 11px and in capitals. */}
        <p className="hidden px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/70 lg:block">
          Account
        </p>

        {/* Arrow keys walk the rail, which is what a column of destinations is
            expected to do and what a screen reader announces it as. Both axes are
            accepted because the same markup is a column on a laptop and a row on
            a phone, and guessing wrong there would leave one of the two dead. */}
        <nav
          aria-label="Account settings"
          onKeyDown={(e) => {
            const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
            const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
            if (!forward && !back) return;
            const index = ACCOUNT_TABS.findIndex((t) => t.id === active);
            if (index === -1) return;
            e.preventDefault();
            const next =
              (index + (forward ? 1 : -1) + ACCOUNT_TABS.length) % ACCOUNT_TABS.length;
            onChange(ACCOUNT_TABS[next].id);
            // Move focus with the selection, or the next arrow press starts over
            // from wherever focus was left behind.
            const buttons = e.currentTarget.querySelectorAll("button");
            (buttons[next] as HTMLButtonElement | undefined)?.focus();
          }}
          className={cn(
            "flex gap-1 overflow-x-auto p-2",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            /* Rows were 2px apart, which at this row height read as one block
               cut into four rather than four places to go. 6px is enough for the
               eye to separate them and still little enough that they stay a
               group. */
            "lg:flex-1 lg:flex-col lg:gap-1.5 lg:overflow-x-visible lg:overflow-y-auto lg:px-2.5 lg:py-1.5"
          )}
        >
          {ACCOUNT_TABS.map((tab) => (
            <RailRow
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              status={status[tab.id]}
              onSelect={() => onChange(tab.id)}
            />
          ))}
        </nav>
      </div>

      {/* Sign out reads as an action, not a fifth destination — but a quiet
          one. It was a red-bordered block with a red tile holding a red icon,
          which made leaving the loudest thing in a column full of places to go.

          Quiet is not the same as hidden, though, and it had drifted into
          hidden: naked text on the same wash as the four rows above it, told
          apart from them only by a hairline. It keeps its muted colour and
          gains a shape — a bordered button on the untinted surface below the
          navigation band, which is the ordinary way a page says "this is a
          control, and it is not one of those". The red still waits for the
          pointer, because leaving is a thing you should have to aim at.

          Quiet is the shape and the absence of colour, though — not the label.
          `--muted-foreground` is mixed for prose that supports something else,
          and the one word in this footer is not supporting anything: it is the
          control. `--foreground` at 75% is still plainly below the four
          destinations above it and is a word you can read. */}
      <div className="border-t border-border p-2 lg:p-2.5">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className={cn(
            "group flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-center",
            "border border-border bg-card",
            "text-[14px] font-medium text-foreground/75",
            "hover:border-danger/35 hover:bg-danger/10 hover:text-danger",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
            "disabled:opacity-60"
          )}
        >
          {signingOut ? (
            <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
          ) : (
            <LogOut className="h-[18px] w-[18px] shrink-0" />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
});

/**
 * One destination.
 *
 * The selected row's background is a shared `layoutId` element, so selecting a
 * different one moves this rectangle rather than cross-fading two. Everything
 * else — the icon, the label, the status mark — is plain, and the row reads as
 * text on a surface rather than as a widget.
 */
/* Colour only — no border, no fill.
 
   This was a bordered chip and it read as a box on a rail that had just had
   every box taken out of it: at 9.5px a bordered pill is mostly border, and it
   competed with the row it was meant to annotate. A glyph and a word in the
   state's own colour say the same thing in less than half the ink.

   The hues are `--verified` and `--attention` rather than emerald and amber —
   the settings-page pair, mixed like ink rather than like a highlighter. The
   trading palette's green is 71% saturated because a winning position has to
   be seen from across a desk; the word "Verified" beside a rail label does
   not, and at that saturation it was the loudest thing in the column. */
/* The filled badge is defined once, in the settings kit, because this mark
   also appears after an email address, on the Account card and on the security
   page — one fact, drawn one way. `muted` keeps its outline: it is the state
   reporting that nothing has happened yet, and a filled badge announcing a
   non-event is the wrong emphasis. Its hourglass is also the one glyph here
   drawn as four open paths rather than a body and a marking, so there is no
   shape in it to fill. */
const STATUS_TONE: Record<RailStatus["tone"], { word: string; mark: string }> = {
  ok: { word: "text-verified", mark: PUNCHED_VERIFIED },
  warn: { word: "text-attention", mark: PUNCHED_ATTENTION },
  muted: { word: "text-muted-foreground", mark: "" },
};

/**
 * The state, as a glyph and a word.
 *
 * A shield reads as "the state of your protection" before anything is read,
 * and each state gets its own: a shield with a tick for verified, a clock for
 * a review that has not finished, a shield with a warning for an application
 * that came back. That is the distinction the tick-and-dot could not draw —
 * "we are still looking" and "we said no" are not the same news.
 *
 * The word stays. On a rail somebody visits twice a year, a glyph alone is a
 * puzzle, and "Verified" costs four characters at 9.5px.
 */
const StatusIcon = memo(function StatusIcon({ status }: { status: RailStatus }) {
  const Icon = status.icon;
  const tone = STATUS_TONE[status.tone];
  return (
    <span
      className={cn(
        "hidden shrink-0 items-center gap-1 lg:inline-flex",
        tone.word
      )}
      title={status.label}
    >
      {/* It was a 12px outline, so the shield was a green hairline around the
          rail's own grey — an outline at that size is mostly the surface it is
          drawn on, and the mark read as an empty shape rather than as a badge
          saying a thing has been done. See `PUNCHED_MARK` in the settings kit
          for how it is filled without gaining a rim.

          14px rather than 12, and the word goes with it: 12px semibold, up from
          11px medium. Both still sit inside the label's own 19px line box, so a
          row carrying a state is still exactly as tall as the three that do
          not. */}
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone.mark)} strokeWidth={2.75} />
      {/* Sentence case, not caps. Uppercasing four letters at this size turns a
          word you read into a label you decode, and next to a shield it was
          shouting a state that is usually good news.

          12px on a whole pixel, not 11.5 on a half one. Every size in this file
          used to carry a .5 — 9.5, 10.5, 11.5, 13.5 — which a 2x Retina panel
          resolves onto real device pixels and a 1x Windows panel does not: the
          stem lands between two pixels and is drawn as two grey ones. That is
          the whole of the "faded on Windows" report. */}
      <span className="text-[12px] font-semibold leading-[16px]">{status.label}</span>
    </span>
  );
});

const RailRow = memo(function RailRow({
  tab,
  active,
  status,
  onSelect,
}: {
  tab: AccountTab;
  active: boolean;
  status?: RailStatus;
  onSelect: () => void;
}) {
  const Icon = tab.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left",
        "lg:w-full lg:whitespace-normal",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        /* Every label is ink, selected or not.

           Three of the four destinations used to be `--muted-foreground` and
           only the open one was `--foreground`, which is the difference
           between "here" and "elsewhere" being drawn as the difference between
           readable and not: a column where three rows out of four look
           disabled and the whole rail reads as faded out. Colour is the wrong
           carrier for that state anyway — the rail already has three better
           ones in the moving panel, the edge mark and the weight below.

           What stays muted is the description under each label, which is the
           only thing on the row that is genuinely secondary. That is also what
           gives the row a hierarchy it did not have: title and subtitle were
           previously the same grey, so neither was a title. */
        "text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="account-rail-active"
          transition={GLIDE}
          /* 9% rather than 6%. It sits on a band that is already 4% of the
             same ink, so six was a two-point step — and with the labels no
             longer carrying the selection, the panel has to be visible on its
             own. */
          className="absolute inset-0 rounded-lg bg-foreground/[0.09] ring-1 ring-inset ring-border"
        >
          {/* An edge mark inside the moving element, so it travels with it
              rather than being a second thing that has to keep up. It reads as
              "you are here" at a glance from the far side of the column, which
              a wash alone does not — and it is the foreground colour rather
              than an accent hue, so it costs the rail no new colour. Only on
              the column: as a horizontal scroller a left edge means nothing. */}
          <span className="absolute inset-y-1.5 left-0 hidden w-[2.5px] rounded-full bg-foreground/70 lg:block" />
        </motion.span>
      )}

      {/* A hover wash for the rows that are not selected. Separate from the
          moving element so it cannot be dragged along with it. */}
      {!active && (
        <span className="absolute inset-0 rounded-lg bg-transparent group-hover:bg-foreground/[0.03]" />
      )}

      <Icon
        className={cn(
          "relative h-[18px] w-[18px] shrink-0",
          /* One step under the label rather than the same grey as the
             description: an 18px glyph at 1.75 weight is thinner than 14px
             text and goes faint sooner. */
          active ? "text-foreground" : "text-foreground/70 group-hover:text-foreground"
        )}
        strokeWidth={active ? 2 : 1.75}
      />

      <span className="relative min-w-0 flex-1">
        {/* The label's line box is pinned at 19px and everything beside it is
            smaller, so a row carrying a state is exactly as tall as the three
            that do not. Left to the font the badge came out a fraction taller
            than the text next to it, rounded up, and made KYC one pixel taller
            than its neighbours — small enough to look like nothing and to read
            as a column that does not line up. */}
        <span
          className={cn(
            "flex items-center gap-1.5 text-[14px] leading-[19px]",
            /* The weight is what says "open" now that the colour does not.
               Semibold against medium is a step you see down a column of four
               without it being a second colour. */
            active ? "font-semibold" : "font-medium"
          )}
        >
          <span className="truncate">{tab.label}</span>
          {status && (
            <StatusIcon status={status} />
          )}
        </span>
        {/* Only worth the room once the rail is a column. */}
        <span className="mt-0.5 hidden text-[12px] leading-[16px] text-muted-foreground lg:block">
          {tab.description}
        </span>
      </span>
    </button>
  );
});

/**
 * Photo, name, account number.
 *
 * The photo is the upload control as well as the picture — the same component
 * the portrait uses, so a photo picked here goes through the same cropper and
 * there is one definition of what changing your photo does.
 *
 * No tier badge. It is on the portrait beside the name, where it qualifies the
 * person rather than sitting as a third line of navigation chrome, and one
 * badge that agrees with itself beats two that can drift.
 */
const RailIdentity = memo(function RailIdentity({
  user,
  uploading,
  onPickPhoto,
  onChooseAvatar,
}: {
  user: any;
  uploading?: boolean;
  onPickPhoto?: (file: File) => void;
  onChooseAvatar?: (url: string) => void | Promise<unknown>;
}) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Your account";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-4">
      <EditableAvatar
        src={user?.avatar}
        initials={initials}
        uploading={uploading}
        onPick={(f) => onPickPhoto?.(f)}
        onChooseAvatar={onChooseAvatar}
        size={42}
      />

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1 text-[14px] font-semibold leading-tight text-foreground">
          <span className="truncate" title={name}>
            {name}
          </span>
          {/* The blue badge, and it is the only one left in the product.

              It sits against a *name*, which is the one place the shape reads
              correctly: this account, as a whole, is verified. Everywhere the
              mark answers "is this particular thing checked?" — the KYC row
              below, the email address on the security card — it is the green
              shield, because that is a state rather than an identity.

              Both halves, the same test the Account card reports, so the rail
              cannot say verified while the card says partly. */}
          {!!user?.emailVerified && (user?.kycLevel || 0) > 0 && (
            <BadgeCheck
              /* Filled, with the tick cut out of it, and the cut drawn heavier
                 than lucide's default: at 16px a hairline tick inside a filled
                 disc closes up and the badge turns into a blue blob.

                 The blue is stated on both the fill and the stroke so the
                 badge's own outline vanishes into it, and the cut is white —
                 it was `--card`, which is near-black on the dark themes and
                 made the tick a hole rather than a tick. Same treatment as
                 every other verification mark in the product; only the colour
                 differs, for the reason above. */
              className={cn("h-4 w-4 shrink-0 fill-blue-500 stroke-blue-500", PUNCHED_GLYPH)}
              strokeWidth={2.5}
              aria-label="Verified account"
            />
          )}
        </p>

        {/* The number, and only enough label to say what it is. "ID" was set in
            the same weight as the digits and read as part of them; dropped to a
            fainter, smaller mark it becomes a caption, and the number is the
            thing the eye lands on — which is right, because the number is what
            gets read out to support. */}
        {user?.accountId ? (
          <span className="mt-[3px] flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              ID
            </span>
            <CopyValue value={String(user.accountId)} label="Copy account ID" />
          </span>
        ) : (
          /* An account created before numbers existed and not yet backfilled.
             Its email is still true, so that is what it shows. */
          <p className="mt-1 truncate text-[12px] text-muted-foreground" title={user?.email}>
            {user?.email}
          </p>
        )}
      </div>
    </div>
  );
});

export default AccountRail;
