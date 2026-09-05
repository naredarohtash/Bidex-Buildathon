"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const binance_verify_1 = require("../../../finance/binance-verify");
const wallet_methods_1 = require("../../../finance/wallet-methods");
const crypto_1 = __importDefault(require("crypto"));
exports.metadata = {
    summary: "Deposits received but not claimed by any user",
    operationId: "listUnclaimedDeposits",
    tags: ["Admin", "Finance"],
    description: "Transfers the exchange has received that no submitted deposit accounts for. Read-only.",
    requiresAuth: true,
    permission: "view.deposit",
    parameters: [
        {
            name: "days",
            in: "query",
            required: false,
            description: "How far back to look. Defaults to 30, maximum 90.",
            schema: { type: "integer", default: 30 },
        },
    ],
    responses: {
        200: { description: "Unclaimed transfers" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
    },
};
async function recentDeposits(coin, startTime) {
    const key = process.env.BINANCE_API_KEY;
    const secret = process.env.BINANCE_API_SECRET;
    if (!key || !secret)
        return [];
    try {
        const query = new URLSearchParams({
            coin,
            startTime: String(startTime),
            limit: "1000",
            timestamp: String(Date.now()),
            recvWindow: "20000",
        }).toString();
        const signature = crypto_1.default.createHmac("sha256", secret).update(query).digest("hex");
        const res = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${query}&signature=${signature}`, { headers: { "X-MBX-APIKEY": key }, signal: AbortSignal.timeout(15000) });
        if (!res.ok)
            return [];
        const body = await res.json();
        return Array.isArray(body) ? body : [];
    }
    catch (_a) {
        return [];
    }
}
exports.default = async (data) => {
    var _a, _b;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    if (!(0, binance_verify_1.binanceConfigured)()) {
        return { configured: false, items: [], message: "Exchange keys are not configured." };
    }
    const requested = Number((_b = data.query) === null || _b === void 0 ? void 0 : _b.days);
    const days = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 30, 90);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const coins = [...new Set(wallet_methods_1.DEPOSIT_METHODS.map((m) => m.asset))];
    const batches = await Promise.all(coins.map((coin) => recentDeposits(coin, since)));
    const received = batches.flat();
    const hashes = received.map((r) => String(r.txId || "")).filter(Boolean);
    const claimedRows = hashes.length
        ? await db_1.models.transaction.findAll({
            where: { type: "DEPOSIT", referenceId: hashes },
            attributes: ["referenceId"],
        })
        : [];
    const claimed = new Set(claimedRows.map((r) => String(r.referenceId).toLowerCase()));
    const items = received
        .filter((r) => r.txId && !claimed.has(String(r.txId).toLowerCase()))
        .filter((r) => r.status === 1 || r.status === 6)
        .map((r) => ({
        txId: String(r.txId),
        asset: String(r.coin).toUpperCase(),
        network: String(r.network || "").toUpperCase(),
        amount: Number(r.amount) || 0,
        address: String(r.address || ""),
        receivedAt: Number(r.insertTime) || 0,
        ageHours: Math.floor((Date.now() - (Number(r.insertTime) || Date.now())) / 3600000),
    }))
        .sort((a, b) => b.receivedAt - a.receivedAt);
    return {
        configured: true,
        days,
        items,
        total: items.reduce((n, i) => n + i.amount, 0),
        note: "These transfers reached the exchange with no matching deposit request. Confirm who sent each one before crediting.",
    };
};
