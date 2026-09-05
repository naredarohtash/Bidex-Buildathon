/**
 * The deposit and withdrawal catalogue — one source of truth.
 *
 * The old system had sixteen fiat gateways and a crypto path, each with its own
 * routes, its own admin screen and its own idea of what a "method" was. The
 * terminal's modals then hard-coded a list of their own that matched none of
 * them: the deposit modal offered five coins and posted to the manual fiat
 * endpoint, so nothing it advertised could actually complete. Anything that
 * describes a way money enters or leaves the platform now comes from here, and
 * both the API and the UI read it.
 *
 * Money is USDT. Every funded wallet on this platform is USDT/SPOT, so that is
 * the unit a balance is held and counted in, whatever symbol the trader has
 * chosen to see it in. A deposit in BTC or a withdrawal to a rupee bank account
 * is converted at the point it crosses the boundary; nothing else in the
 * platform needs to know another currency exists.
 */

/** What has to happen before a request is money in or out of a wallet. */
export type Settlement =
  /* Confirmed against the exchange's own record of incoming transfers. The
     trader supplies the transaction hash, we look it up, and credit when it has
     enough confirmations. No human involved. */
  | "AUTOMATIC"
  /* Someone has to look. Bank and UPI payouts land in an account nobody can
     poll, so an operator confirms the money moved and marks it paid. */
  | "MANUAL";

export interface DepositMethod {
  id: string;
  label: string;
  /** Groups the picker. Crypto settles itself; the other two need an operator. */
  kind: "CRYPTO" | "UPI" | "BANK";
  /** Coin as the exchange names it — used for both address lookup and matching. */
  asset: string;
  /** Network as the exchange names it. Empty for single-network coins. */
  network: string;
  networkLabel: string;
  /** Smallest accepted deposit, in the asset's own units. */
  min: number;
  /** Confirmations required before the balance moves. */
  confirmations: number;
  settlement: Settlement;
  /** Roughly how long a trader should expect to wait. */
  eta: string;
  /* What the trader has to give us to find their payment, and what to call it.
     A hash for a chain, a UTR for UPI, a reference for a bank transfer — the
     same field, but asking for "transaction hash" on a UPI payment would stop
     someone who has the right number in front of them. */
  referenceLabel: string;
  referenceHint: string;
  /* What the processor calls this rail. NOT the ticker: NOWPayments treats a
     coin-on-a-chain as one currency ("usdttrc20"), where this catalogue keeps
     asset and network separate because that is how a trader thinks about it.
     Sending the bare ticker opens a payment on the wrong chain or none at all. */
  processorCurrency?: string;
  /* Which env vars carry the payee details, for the methods a person pays by
     hand. Crypto has none: its address comes from the exchange. Kept as names
     rather than values so an account number is not compiled into the bundle. */
  payToEnv?: { field: string; label: string; env: string }[];
}

export interface WithdrawMethod {
  id: string;
  label: string;
  kind: "CRYPTO" | "BANK" | "UPI";
  /** What the payout is denominated in. Balances are always USDT. */
  payoutCurrency: string;
  networkLabel: string;
  min: number;
  /** Flat fee in USDT, taken on top of the amount. */
  fee: number;
  settlement: Settlement;
  eta: string;
  /** What the trader must supply for us to be able to pay them. */
  fields: WithdrawField[];
}

export interface WithdrawField {
  name: string;
  label: string;
  /** Shown under the input — plain language, no jargon. */
  hint?: string;
  type: "text" | "tel";
  required: boolean;
  /** Anchored server-side before the request is accepted. */
  pattern?: string;
  patternHint?: string;
}

/* ── Deposits ──────────────────────────────────────────────────────────────
   Crypto only, matching the five the terminal already offers. Each one is
   settled automatically: the trader pays to our address, gives us the hash, and
   the exchange's deposit record decides whether it is real. */
export const DEPOSIT_METHODS: DepositMethod[] = [
  {
    id: "USDT_TRC20",
    label: "Tether (USDT)",
    kind: "CRYPTO",
    asset: "USDT",
    network: "TRX",
    networkLabel: "Tron (TRC-20)",
    min: 15,
    confirmations: 1,
    settlement: "AUTOMATIC",
    eta: "1-3 minutes",
    processorCurrency: "usdttrc20",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },
  {
    id: "USDT_ERC20",
    label: "Tether (USDT)",
    kind: "CRYPTO",
    asset: "USDT",
    network: "ETH",
    networkLabel: "Ethereum (ERC-20)",
    min: 30,
    confirmations: 12,
    settlement: "AUTOMATIC",
    eta: "5-15 minutes",
    processorCurrency: "usdterc20",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },
  {
    id: "BTC",
    label: "Bitcoin",
    kind: "CRYPTO",
    asset: "BTC",
    network: "BTC",
    networkLabel: "Bitcoin",
    min: 0.0005,
    confirmations: 2,
    settlement: "AUTOMATIC",
    eta: "20-60 minutes",
    processorCurrency: "btc",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },
  {
    id: "ETH",
    label: "Ethereum",
    kind: "CRYPTO",
    asset: "ETH",
    network: "ETH",
    networkLabel: "Ethereum (ERC-20)",
    min: 0.01,
    confirmations: 12,
    settlement: "AUTOMATIC",
    eta: "5-15 minutes",
    processorCurrency: "eth",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },
  {
    id: "TRX",
    label: "Tron",
    kind: "CRYPTO",
    asset: "TRX",
    network: "TRX",
    networkLabel: "Tron (TRC-20)",
    min: 100,
    confirmations: 1,
    settlement: "AUTOMATIC",
    eta: "1-3 minutes",
    processorCurrency: "trx",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },
  {
    id: "LTC",
    label: "Litecoin",
    kind: "CRYPTO",
    asset: "LTC",
    network: "LTC",
    networkLabel: "Litecoin",
    min: 0.1,
    confirmations: 4,
    settlement: "AUTOMATIC",
    eta: "10-30 minutes",
    processorCurrency: "ltc",
    referenceLabel: "Transaction hash",
    referenceHint: "Your wallet shows this after sending. It is how we find your payment.",
  },

  /* Rupee on-ramps.
     No API will tell us a UPI payment or a bank transfer landed, so these are
     confirmed by an operator against the account statement — the same
     arrangement as their withdrawal counterparts, and the reason both are
     MANUAL. The trader pays to the details below and gives us the UTR or
     reference the bank printed on the payment; that is what an operator
     matches against.

     `payToEnv` names the environment variables rather than holding the values,
     so a real account number is never compiled into a bundle or committed. A
     method whose variables are unset is offered as unavailable rather than
     hidden, so nobody is left wondering where UPI went. */
  {
    id: "UPI_INR",
    label: "UPI",
    kind: "UPI",
    asset: "INR",
    network: "",
    networkLabel: "GPay · PhonePe · Paytm · any UPI app",
    min: 500,
    confirmations: 0,
    settlement: "MANUAL",
    eta: "within 24 hours",
    referenceLabel: "UPI reference (UTR)",
    referenceHint: "The 12-digit number your UPI app shows after paying.",
    payToEnv: [
      { field: "upiId", label: "UPI ID", env: "DEPOSIT_UPI_ID" },
      { field: "accountName", label: "Account name", env: "DEPOSIT_UPI_NAME" },
    ],
  },
  {
    id: "BANK_INR",
    label: "Bank Transfer",
    kind: "BANK",
    asset: "INR",
    network: "",
    networkLabel: "NEFT · IMPS · RTGS",
    min: 500,
    confirmations: 0,
    settlement: "MANUAL",
    eta: "1-3 business days",
    referenceLabel: "Bank reference number",
    referenceHint: "The UTR or reference your bank shows for the transfer.",
    payToEnv: [
      { field: "accountName", label: "Account name", env: "DEPOSIT_BANK_NAME" },
      { field: "accountNumber", label: "Account number", env: "DEPOSIT_BANK_ACCOUNT" },
      { field: "ifsc", label: "IFSC code", env: "DEPOSIT_BANK_IFSC" },
      { field: "bankName", label: "Bank", env: "DEPOSIT_BANK_BANKNAME" },
    ],
  },
];

/* ── Withdrawals ───────────────────────────────────────────────────────────
   Every one of these is released by a person, and they are all marked MANUAL to
   say so. The crypto ones claimed AUTOMATIC, which drove copy telling the
   trader their payout would be "released within 10-30 minutes" — hands-off
   language for something that in fact waited for an operator. Nothing in this
   codebase can send a payout: the exchange keys cannot withdraw, by design.

   Promising a speed that depends on someone being at a desk is the kind of
   small dishonesty that turns into a support queue. When payouts are genuinely
   automated this becomes a settlement change and the copy follows it. */
const IFSC = "^[A-Z]{4}0[A-Z0-9]{6}$";
const UPI_ID = "^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$";

export const WITHDRAW_METHODS: WithdrawMethod[] = [
  {
    id: "BANK_INR",
    label: "Indian Bank Transfer",
    kind: "BANK",
    payoutCurrency: "INR",
    networkLabel: "NEFT / IMPS",
    min: 500,
    fee: 0,
    settlement: "MANUAL",
    eta: "1-3 business days",
    fields: [
      {
        name: "accountName",
        label: "Account holder name",
        hint: "Exactly as it appears on your bank account.",
        type: "text",
        required: true,
      },
      {
        name: "accountNumber",
        label: "Account number",
        type: "text",
        required: true,
        pattern: "^[0-9]{9,18}$",
        patternHint: "9 to 18 digits, numbers only.",
      },
      {
        name: "ifsc",
        label: "IFSC code",
        hint: "11 characters, on your cheque book or bank app.",
        type: "text",
        required: true,
        pattern: IFSC,
        patternHint: "Looks like HDFC0001234.",
      },
      { name: "bankName", label: "Bank name", type: "text", required: true },
    ],
  },
  {
    id: "UPI_INR",
    label: "UPI Transfer",
    kind: "UPI",
    payoutCurrency: "INR",
    networkLabel: "UPI",
    min: 500,
    fee: 0,
    settlement: "MANUAL",
    eta: "within 24 hours",
    fields: [
      {
        name: "upiId",
        label: "UPI ID",
        hint: "The address you receive money at, like name@bank.",
        type: "text",
        required: true,
        pattern: UPI_ID,
        patternHint: "Looks like yourname@okhdfcbank.",
      },
      {
        name: "accountName",
        label: "Account holder name",
        hint: "Must match the name on your UPI account.",
        type: "text",
        required: true,
      },
    ],
  },
  {
    id: "USDT_TRC20",
    label: "Tether USDT (TRC-20)",
    kind: "CRYPTO",
    payoutCurrency: "USDT",
    networkLabel: "Tron (TRC-20)",
    min: 20,
    fee: 1,
    settlement: "MANUAL",
    eta: "within 24 hours",
    fields: [
      {
        name: "address",
        label: "USDT address (TRC-20)",
        hint: "A Tron address. Sending to the wrong network loses the funds.",
        type: "text",
        required: true,
        pattern: "^T[1-9A-HJ-NP-Za-km-z]{33}$",
        patternHint: "Starts with T and is 34 characters long.",
      },
    ],
  },
  {
    id: "USDT_ERC20",
    label: "Tether USDT (ERC-20)",
    kind: "CRYPTO",
    payoutCurrency: "USDT",
    networkLabel: "Ethereum (ERC-20)",
    min: 50,
    fee: 15,
    settlement: "MANUAL",
    eta: "within 24 hours",
    fields: [
      {
        name: "address",
        label: "USDT address (ERC-20)",
        hint: "An Ethereum address. Sending to the wrong network loses the funds.",
        type: "text",
        required: true,
        pattern: "^0x[a-fA-F0-9]{40}$",
        patternHint: "Starts with 0x and is 42 characters long.",
      },
    ],
  },
  {
    id: "BTC",
    label: "Bitcoin (BTC)",
    kind: "CRYPTO",
    payoutCurrency: "BTC",
    networkLabel: "Bitcoin",
    min: 50,
    fee: 5,
    settlement: "MANUAL",
    eta: "within 24 hours",
    fields: [
      {
        name: "address",
        label: "Bitcoin address",
        type: "text",
        required: true,
        pattern: "^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$",
        patternHint: "Starts with bc1, 1 or 3.",
      },
    ],
  },
  {
    id: "ETH",
    label: "Ethereum (ETH)",
    kind: "CRYPTO",
    payoutCurrency: "ETH",
    networkLabel: "Ethereum",
    min: 50,
    fee: 15,
    settlement: "MANUAL",
    eta: "within 24 hours",
    fields: [
      {
        name: "address",
        label: "Ethereum address",
        type: "text",
        required: true,
        pattern: "^0x[a-fA-F0-9]{40}$",
        patternHint: "Starts with 0x and is 42 characters long.",
      },
    ],
  },
];

export const findDepositMethod = (id: string): DepositMethod | undefined =>
  DEPOSIT_METHODS.find((m) => m.id === id);

export const findWithdrawMethod = (id: string): WithdrawMethod | undefined =>
  WITHDRAW_METHODS.find((m) => m.id === id);

/**
 * Check a submitted payout destination against the method's own field rules.
 *
 * The same rules the form shows, applied again here, because the form is a
 * courtesy and this is the boundary. Returns the cleaned values, or the first
 * problem in language the trader can act on.
 */
export function validateWithdrawDetails(
  method: WithdrawMethod,
  submitted: Record<string, unknown> | undefined
): { ok: true; details: Record<string, string> } | { ok: false; error: string } {
  const source = submitted && typeof submitted === "object" ? submitted : {};
  const details: Record<string, string> = {};

  for (const field of method.fields) {
    const raw = source[field.name];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      if (field.required) return { ok: false, error: `${field.label} is required.` };
      continue;
    }
    // Anchored at both ends in the catalogue, so a partial match cannot pass.
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      return {
        ok: false,
        error: field.patternHint
          ? `${field.label} is not valid. ${field.patternHint}`
          : `${field.label} is not valid.`,
      };
    }
    details[field.name] = value;
  }

  return { ok: true, details };
}
