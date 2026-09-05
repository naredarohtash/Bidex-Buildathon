"use client";

/**
 * What a person can be here about.
 *
 * The old panel offered three "popular topics" — Account Verification,
 * Deposits & Withdrawals, Platform & Trading — and each of them dropped you
 * into a free-text subject box. So the taxonomy existed on the home screen and
 * then evaporated: every ticket arrived as prose, an agent had to read it to
 * find out which queue it belonged in, and the person writing it was given no
 * clue what to say.
 *
 * This is the same three ideas taken seriously. Six categories, each with the
 * handful of things that actually go wrong under it, and each of those
 * carrying two things the free-text box could never carry:
 *
 * - **A priority the topic already knows.** "Funds debited but not credited"
 *   is not a LOW ticket and never was, but a priority dropdown defaulted to
 *   LOW and most people leave a default alone. Money that has gone missing now
 *   opens at HIGH because of what it is, not because the person thought to say
 *   so. It stays editable — someone who knows their case is not urgent should
 *   be able to say that — but the starting point is right.
 *
 * - **What to include.** The single biggest cost in a support thread is the
 *   round trip where the agent asks for the transaction reference and waits a
 *   day. `hint` is that question, asked before the ticket is sent, next to the
 *   box where the answer goes.
 *
 * `context` is the other half of that: the two money categories name which
 * side of the ledger they concern, and the flow puts the person's own recent
 * transactions of that kind in front of them to pick from. That is why the
 * field exists rather than a boolean — "deposit" and "withdrawal" filter to
 * different rows, and a withdrawal question offered a list of deposits is
 * worse than no list.
 *
 * Data only, no JSX, so the wizard, the ticket list and the detail pane can
 * all read the same definitions without importing each other. Both ids are
 * written into the ticket's `tags` (`category:` and `topic:` prefixed), which
 * is what lets a ticket opened last month still say what it was about.
 */

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeHelp,
  CandlestickChart,
  ScanFace,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type Importance = "LOW" | "MEDIUM" | "HIGH";

/** Which ledger a category's transaction step should offer, if any. */
export type TicketContext = "deposit" | "withdrawal" | "none";

export interface SupportTopic {
  id: string;
  /** Becomes the ticket subject verbatim, so it is written as a sentence. */
  label: string;
  /** Where this topic starts on the scale. Editable afterwards. */
  importance: Importance;
  /**
   * The one thing to include that we cannot already see.
   *
   * Short — a phrase, not a sentence — because it is read under an option in
   * a list of six, where anything longer stops being help and becomes the
   * thing you have to read past to compare the options.
   *
   * And genuinely *ours to not know*. The first pass asked deposit tickets for
   * "the transaction hash or reference — it is what we use to trace the
   * payment on our side", which is wrong twice over: this platform is the
   * payment processor, so the reference is ours already, and the very next
   * step of the flow has the person pick the exact payment out of their own
   * history, which carries the reference, the amount, the method and the
   * status. A hint that asks for something the form is about to collect is a
   * hint that makes the form look like it is not paying attention.
   *
   * What is left is the other side of the transaction — what their bank or
   * wallet showed, what they typed, what error they saw. None of that reaches
   * us any other way.
   *
   * Ask for the *evidence*, never for a file format. "A screenshot of the
   * charge on your bank" reads as a rule, and it rules out the PDF statement
   * the bank actually hands you, the emailed receipt, and the photo of a
   * counter slip — all of which are better proof than a screenshot. So: "any
   * proof of the payment — a receipt, statement or screenshot", and let the
   * person send whatever they have.
   */
  hint: string;
}

/**
 * The hue a category carries wherever it is named.
 *
 * Six of them, one per category, and they are the only colours in this
 * workspace that are not the theme's own tokens. That is a deliberate, bounded
 * exception: everything about *state* — a status, a priority, an error — stays
 * on `--brand`, `--verified`, `--attention` and `--danger`, so those keep their
 * meaning. This set says *subject* instead, which is a different question and
 * needs a different answer than "how urgent is it".
 *
 * The classes themselves live in ./support-kit, written out in full, because
 * Tailwind scans source text and a class assembled at runtime is a class that
 * ships unstyled.
 */
export type Accent = "emerald" | "sky" | "violet" | "amber" | "cyan" | "slate";

export interface SupportCategory {
  id: string;
  label: string;
  /** One line, under the label, in the category grid. */
  description: string;
  icon: LucideIcon;
  context: TicketContext;
  accent: Accent;
  /**
   * The team this lands on.
   *
   * Derived from the subject rather than stored, because it is not a fact about
   * the ticket — it is a fact about how support is organised, and a column
   * holding a copy of it would go stale the day the teams are renamed. Shown so
   * somebody can see their ticket did not vanish into a queue: it went to
   * Payments.
   *
   * **One word, always.** It is drawn in a half-width field beside the category
   * chip, and "Identity & compliance" wraps to two lines in 150px while
   * "Verification" beside it does not — which leaves a pair of boxes at
   * different heights, or a pair both padded to the taller one. A desk name is
   * a label, not a description, and every one of these has a single word that
   * says it: KYC, Security, Payments.
   */
  department: string;
  topics: SupportTopic[];
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    id: "deposits",
    label: "Deposits",
    description: "Money you have paid in",
    icon: ArrowDownToLine,
    context: "deposit",
    accent: "emerald",
    department: "Payments",
    topics: [
      {
        id: "not-credited",
        label: "Funds were debited but never credited to my balance",
        importance: "HIGH",
        hint: "Any proof of the payment — a receipt, statement or screenshot.",
      },
      {
        id: "still-pending",
        label: "My deposit is still pending",
        importance: "MEDIUM",
        hint: "How you paid — card, bank transfer or crypto.",
      },
      {
        id: "wrong-amount",
        label: "The amount credited does not match what I sent",
        importance: "HIGH",
        hint: "The amount you sent, and the amount that arrived.",
      },
      {
        id: "wrong-network",
        label: "I sent funds on the wrong network or to the wrong address",
        importance: "HIGH",
        hint: "The network you used, and the address you sent to.",
      },
      {
        id: "method-declined",
        label: "My payment method was declined",
        importance: "MEDIUM",
        hint: "The error message your bank or card showed.",
      },
      {
        id: "bonus-missing",
        label: "A bonus or promo code was not applied",
        importance: "LOW",
        hint: "The promo code, and where you got it.",
      },
    ],
  },
  {
    id: "withdrawals",
    label: "Withdrawals",
    description: "Money you are taking out",
    icon: ArrowUpFromLine,
    context: "withdrawal",
    accent: "sky",
    department: "Payments",
    topics: [
      {
        id: "not-received",
        label: "My withdrawal was approved but has not arrived",
        importance: "HIGH",
        hint: "The account or wallet it was meant to reach.",
      },
      {
        id: "rejected",
        label: "My withdrawal request was rejected",
        importance: "HIGH",
        hint: "The reason you were shown, if you were given one.",
      },
      {
        id: "taking-long",
        label: "My withdrawal is taking longer than expected",
        importance: "MEDIUM",
        hint: "Nothing to add — we will check where it is.",
      },
      {
        id: "wrong-details",
        label: "I submitted the wrong withdrawal details",
        importance: "HIGH",
        hint: "The details you entered, and the correct ones.",
      },
      {
        id: "limits",
        label: "A question about my withdrawal limits",
        importance: "MEDIUM",
        hint: "The amount you tried, and the limit you were shown.",
      },
      {
        id: "fees",
        label: "A question about withdrawal fees",
        importance: "LOW",
        hint: "The method you are withdrawing to.",
      },
    ],
  },
  {
    id: "verification",
    label: "Verification",
    description: "KYC and your identity documents",
    icon: ScanFace,
    context: "none",
    accent: "violet",
    department: "KYC",
    topics: [
      {
        id: "rejected",
        label: "My verification documents were rejected",
        importance: "HIGH",
        hint: "The reason given. Please do not attach documents here.",
      },
      {
        id: "stuck",
        label: "My verification has been in review too long",
        importance: "MEDIUM",
        hint: "Nothing to add — we will find your submission.",
      },
      {
        id: "wrong-name",
        label: "My name is spelled incorrectly on my account",
        importance: "MEDIUM",
        hint: "Your name exactly as it appears on your document.",
      },
      {
        id: "wrong-dob",
        label: "My date of birth was entered incorrectly",
        importance: "MEDIUM",
        hint: "Your date of birth as it appears on your document.",
      },
      {
        id: "address",
        label: "I need to change my address or country",
        importance: "MEDIUM",
        hint: "The address or country it should be.",
      },
      {
        id: "upload-fails",
        label: "My document upload keeps failing",
        importance: "MEDIUM",
        hint: "Your device and browser, and any error you saw.",
      },
    ],
  },
  {
    id: "account",
    label: "Account & security",
    description: "Sign-in, two-factor, and account safety",
    icon: ShieldAlert,
    context: "none",
    accent: "amber",
    department: "Security",
    topics: [
      {
        id: "suspicious",
        label: "I think someone else has accessed my account",
        importance: "HIGH",
        hint: "Change your password first, then tell us what you noticed.",
      },
      {
        id: "lost-2fa",
        label: "I have lost access to my two-factor device",
        importance: "HIGH",
        hint: "How you set it up — app, SMS or email.",
      },
      {
        id: "cannot-sign-in",
        label: "I cannot sign in to my account",
        importance: "HIGH",
        hint: "The message you see when you try.",
      },
      {
        id: "change-email",
        label: "I want to change my registered email address",
        importance: "MEDIUM",
        hint: "The new email address you want to use.",
      },
      {
        id: "password",
        label: "I need help resetting my password",
        importance: "MEDIUM",
        hint: "What happens when you open the reset link.",
      },
      {
        id: "close",
        label: "I would like to close my account",
        importance: "LOW",
        hint: "Withdraw any balance first — tell us if you cannot.",
      },
    ],
  },
  {
    id: "trading",
    label: "Trading & platform",
    description: "Trades, payouts, charts and bugs",
    icon: CandlestickChart,
    context: "none",
    accent: "cyan",
    department: "Trading",
    topics: [
      {
        id: "wrong-settlement",
        label: "A trade settled at a price I did not see",
        importance: "HIGH",
        hint: "The market, the direction and the time it settled.",
      },
      {
        id: "payout-missing",
        label: "I won a trade but the payout was not credited",
        importance: "HIGH",
        hint: "The market, and when the trade expired.",
      },
      {
        id: "order-failed",
        label: "My order did not go through",
        importance: "MEDIUM",
        hint: "The market and amount, and whether your balance changed.",
      },
      {
        id: "chart-wrong",
        label: "The chart or price feed looks wrong",
        importance: "MEDIUM",
        hint: "The market, and the price you expected to see.",
      },
      {
        id: "bug",
        label: "Something on the platform is not working",
        importance: "MEDIUM",
        hint: "What you did, and what happened instead.",
      },
      {
        id: "how-to",
        label: "I have a question about how something works",
        importance: "LOW",
        hint: "Ask your question in your own words.",
      },
    ],
  },
  {
    id: "other",
    label: "Something else",
    description: "Anything not covered above",
    icon: BadgeHelp,
    context: "none",
    accent: "slate",
    department: "General",
    topics: [
      {
        id: "general",
        label: "A general enquiry",
        importance: "LOW",
        hint: "Tell us what you need in your own words.",
      },
      {
        id: "partnership",
        label: "A partnership or affiliate question",
        importance: "LOW",
        hint: "The programme, and whether you have already applied.",
      },
      {
        id: "feedback",
        label: "Feedback or a suggestion",
        importance: "LOW",
        hint: "Say it plainly — we read every one.",
      },
    ],
  },
];

/* ── Reading a ticket back ──────────────────────────────────────────────────
 *
 * The wizard writes `category:<id>` and `topic:<id>` into the ticket's tags,
 * and everything that displays a ticket afterwards reads them back through
 * here. Prefixed rather than bare because `tags` is a free string array shared
 * with anything else that wants to label a ticket — an unprefixed "deposits"
 * would be indistinguishable from a word an agent typed.
 *
 * Every lookup tolerates a miss. Tickets exist that were opened before this
 * taxonomy did, and a category that is later renamed or retired must not take
 * the tickets filed under it down with it. */

/**
 * How the opening message names the payment a ticket is about.
 *
 * Written by the wizard and read back by `normaliseMessages`, which lifts the
 * line out of the body so the thread can draw it as the caption it is rather
 * than as the first four lines of what somebody said. Shared from here so the
 * writer and the reader cannot drift apart — and if they ever do, the line
 * simply stays in the message text, which is the harmless direction to fail
 * in.
 *
 * It has to be in the message at all because an agent's console renders the
 * message text and the tags and nothing else: without it they see `txn:` and
 * a UUID, and the first reply on every money ticket is "send me the
 * reference".
 */
export const TRANSACTION_NOTE = "Referenced transaction — ";

export const TAG_CATEGORY = "category:";
export const TAG_TOPIC = "topic:";
export const TAG_TRANSACTION = "txn:";

export function tagsFor(
  categoryId: string,
  topicId: string,
  transactionId?: string | null
): string[] {
  return [
    `${TAG_CATEGORY}${categoryId}`,
    `${TAG_TOPIC}${topicId}`,
    ...(transactionId ? [`${TAG_TRANSACTION}${transactionId}`] : []),
  ];
}

const valueOf = (tags: string[] | undefined | null, prefix: string) =>
  (tags || []).find((t) => typeof t === "string" && t.startsWith(prefix))?.slice(prefix.length) ||
  null;

/* Words that give a category away when nothing else does. Ordered by how
   specific they are, and checked in the order the categories are declared —
   "withdrawal" has to beat "payment", or every withdrawal ticket files itself
   under deposits. */
const KEYWORDS: Record<string, string[]> = {
  withdrawals: ["withdraw", "withdrawal", "payout", "cash out", "cashout"],
  deposits: ["deposit", "credited", "top up", "topup", "funded", "debited", "charged"],
  verification: [
    "kyc", "verif", "document", "identity", "passport", "date of birth", "dob",
    "affiliate link", "first name", "last name", "proof of address",
  ],
  account: [
    "sign in", "log in", "login", "password", "two-factor", "2fa", "two factor",
    "email address", "locked", "suspicious", "close my account",
  ],
  trading: ["trade", "trading", "payout was", "chart", "expiry", "order", "candle", "price"],
};

/**
 * What a ticket is about.
 *
 * Four attempts, in descending order of confidence, because most of the
 * tickets in any real account predate the taxonomy that would have labelled
 * them:
 *
 *  1. The `category:` tag the wizard writes. Exact, and the only one that is
 *     a *statement* rather than a guess.
 *  2. A free tag naming a category. The panel this replaced wrote bare
 *     "verification" onto its tickets, so this recovers every one of them.
 *  3. The subject matching a known topic word for word — again the old panel,
 *     which offered a fixed list of subjects.
 *  4. A keyword in the subject.
 *
 * The pane used to print "filed before categories existed" on all of those,
 * which is true and useless: the reader can see the subject, and what they
 * wanted to know is which desk it belongs to. A guess drawn from the words of
 * the ticket itself is worth more than a shrug, and 2 and 3 are not really
 * guesses at all.
 */
export function categoryOf(tags?: string[] | null, subject?: string | null): SupportCategory | null {
  const id = valueOf(tags, TAG_CATEGORY);
  if (id) {
    const exact = SUPPORT_CATEGORIES.find((c) => c.id === id);
    if (exact) return exact;
  }

  const loose = (tags || [])
    .filter((t) => typeof t === "string")
    .map((t) => t.toLowerCase().trim());
  const byTag = SUPPORT_CATEGORIES.find(
    (c) => loose.includes(c.id) || loose.includes(c.label.toLowerCase())
  );
  if (byTag) return byTag;

  const text = (subject || "").toLowerCase().trim();
  if (!text) return null;

  const byTopic = SUPPORT_CATEGORIES.find((c) =>
    c.topics.some((t) => t.label.toLowerCase() === text)
  );
  if (byTopic) return byTopic;

  for (const c of SUPPORT_CATEGORIES) {
    if ((KEYWORDS[c.id] || []).some((k) => text.includes(k))) return c;
  }
  return null;
}

export function topicOf(tags?: string[] | null): SupportTopic | null {
  const category = categoryOf(tags);
  const id = valueOf(tags, TAG_TOPIC);
  return category && id ? category.topics.find((t) => t.id === id) || null : null;
}

/** True when the category was worked out rather than recorded. */
export function categoryWasInferred(tags?: string[] | null): boolean {
  return !valueOf(tags, TAG_CATEGORY);
}

/** The transaction a ticket was filed against, as an id to look up. */
export function transactionIdOf(tags?: string[] | null): string | null {
  return valueOf(tags, TAG_TRANSACTION);
}

/** Tags a person or an agent added by hand — everything this file did not write. */
export function freeTagsOf(tags?: string[] | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags || []) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith(TAG_CATEGORY) ||
      trimmed.startsWith(TAG_TOPIC) ||
      trimmed.startsWith(TAG_TRANSACTION)
    )
      continue;
    /* Deduped without regard to case. A real ticket came through carrying
       both "verification" and "Verification" — the old panel appended the
       category and the agent typed it again — and the pane printed the same
       word twice in two colours, because the colour is a hash of the text. */
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
