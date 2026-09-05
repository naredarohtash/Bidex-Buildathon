"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.binanceConfigured = void 0;
exports.getDepositAddress = getDepositAddress;
exports.findDepositByTxId = findDepositByTxId;
exports.priceInUsdt = priceInUsdt;
exports.__clearBinanceCaches = __clearBinanceCaches;
const crypto_1 = __importDefault(require("crypto"));
const API = "https://api.binance.com";
const TIMEOUT_MS = 15000;
const binanceConfigured = () => Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
exports.binanceConfigured = binanceConfigured;
async function signedGet(path, params = {}) {
    const key = process.env.BINANCE_API_KEY;
    const secret = process.env.BINANCE_API_SECRET;
    if (!key || !secret)
        return null;
    try {
        const query = new URLSearchParams({
            ...params,
            timestamp: String(Date.now()),
            recvWindow: "20000",
        }).toString();
        const signature = crypto_1.default.createHmac("sha256", secret).update(query).digest("hex");
        const res = await fetch(`${API}${path}?${query}&signature=${signature}`, {
            headers: { "X-MBX-APIKEY": key },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
            console.error(`[BINANCE] ${path} -> HTTP ${res.status}`);
            return null;
        }
        const body = await res.json();
        if (body && typeof body === "object" && !Array.isArray(body) && body.code && body.msg) {
            console.error(`[BINANCE] ${path} -> ${body.code} ${body.msg}`);
            return null;
        }
        return body;
    }
    catch (err) {
        console.error(`[BINANCE] ${path} failed: ${(err === null || err === void 0 ? void 0 : err.name) || err}`);
        return null;
    }
}
const addressCache = new Map();
const ADDRESS_TTL_MS = 6 * 60 * 60 * 1000;
async function getDepositAddress(asset, network) {
    const cacheKey = `${asset}:${network}`;
    const hit = addressCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ADDRESS_TTL_MS) {
        return { address: hit.address, tag: hit.tag };
    }
    const body = await signedGet("/sapi/v1/capital/deposit/address", network ? { coin: asset, network } : { coin: asset });
    if (!(body === null || body === void 0 ? void 0 : body.address))
        return null;
    addressCache.set(cacheKey, { address: body.address, tag: body.tag, at: Date.now() });
    return { address: body.address, tag: body.tag || undefined };
}
const STATUS_PENDING = 0;
const STATUS_SUCCESS = 1;
const STATUS_CREDITED_CANNOT_WITHDRAW = 6;
async function findDepositByTxId(txId, asset, network) {
    var _a, _b, _c, _d;
    const wanted = txId.trim().toLowerCase();
    if (!wanted)
        return null;
    const rows = await signedGet("/sapi/v1/capital/deposit/hisrec", {
        coin: asset,
        startTime: String(Date.now() - 90 * 24 * 60 * 60 * 1000),
        limit: "1000",
    });
    if (!Array.isArray(rows))
        return null;
    const row = rows.find((r) => String((r === null || r === void 0 ? void 0 : r.txId) || "").trim().toLowerCase() === wanted);
    if (!row)
        return null;
    if (String(row.coin).toUpperCase() !== asset.toUpperCase())
        return null;
    if (network && row.network && String(row.network).toUpperCase() !== network.toUpperCase()) {
        return null;
    }
    return {
        amount: Number(row.amount) || 0,
        asset: String(row.coin).toUpperCase(),
        network: String(row.network || network).toUpperCase(),
        address: String(row.address || ""),
        txId: String(row.txId),
        confirmations: Number((_d = (_c = (_b = (_a = row.confirmTimes) === null || _a === void 0 ? void 0 : _a.split("/")) === null || _b === void 0 ? void 0 : _b[0]) !== null && _c !== void 0 ? _c : row.confirmTimes) !== null && _d !== void 0 ? _d : 0) || 0,
        credited: row.status === STATUS_SUCCESS || row.status === STATUS_CREDITED_CANNOT_WITHDRAW,
        insertTime: Number(row.insertTime) || 0,
    };
}
const priceCache = new Map();
const PRICE_TTL_MS = 60 * 1000;
async function priceInUsdt(asset) {
    const symbol = asset.toUpperCase();
    if (symbol === "USDT")
        return 1;
    const hit = priceCache.get(symbol);
    if (hit && Date.now() - hit.at < PRICE_TTL_MS)
        return hit.price;
    try {
        const res = await fetch(`${API}/api/v3/ticker/price?symbol=${symbol}USDT`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok)
            return null;
        const body = await res.json();
        const price = Number(body === null || body === void 0 ? void 0 : body.price);
        if (!Number.isFinite(price) || price <= 0)
            return null;
        priceCache.set(symbol, { price, at: Date.now() });
        return price;
    }
    catch (_a) {
        return null;
    }
}
function __clearBinanceCaches() {
    addressCache.clear();
    priceCache.clear();
}
