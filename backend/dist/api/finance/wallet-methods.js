"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findWithdrawMethod = exports.findDepositMethod = exports.WITHDRAW_METHODS = exports.DEPOSIT_METHODS = void 0;
exports.validateWithdrawDetails = validateWithdrawDetails;
exports.DEPOSIT_METHODS = [
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
const IFSC = "^[A-Z]{4}0[A-Z0-9]{6}$";
const UPI_ID = "^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$";
exports.WITHDRAW_METHODS = [
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
const findDepositMethod = (id) => exports.DEPOSIT_METHODS.find((m) => m.id === id);
exports.findDepositMethod = findDepositMethod;
const findWithdrawMethod = (id) => exports.WITHDRAW_METHODS.find((m) => m.id === id);
exports.findWithdrawMethod = findWithdrawMethod;
function validateWithdrawDetails(method, submitted) {
    const source = submitted && typeof submitted === "object" ? submitted : {};
    const details = {};
    for (const field of method.fields) {
        const raw = source[field.name];
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) {
            if (field.required)
                return { ok: false, error: `${field.label} is required.` };
            continue;
        }
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
