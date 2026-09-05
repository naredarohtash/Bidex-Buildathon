"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNTHETIC_POPULATION = exports.SYNTHETIC_ENV_FLAG = void 0;
exports.syntheticEnabled = syntheticEnabled;
exports.syntheticAllowed = syntheticAllowed;
exports.syntheticLeaderboard = syntheticLeaderboard;
exports.avatarSeedFor = avatarSeedFor;
exports.syntheticQualifiedCount = syntheticQualifiedCount;
const names_1 = require("./names");
exports.SYNTHETIC_ENV_FLAG = "BIDEX_SYNTHETIC_LEADERBOARD";
const SUNSET = Date.UTC(2027, 2, 1);
function mode() {
    var _a;
    const v = String((_a = process.env[exports.SYNTHETIC_ENV_FLAG]) !== null && _a !== void 0 ? _a : "").toLowerCase();
    if (v === "false" || v === "0" || v === "no" || v === "off")
        return "off";
    if (v === "always" || v === "force")
        return "always";
    return "auto";
}
function syntheticEnabled() {
    const m = mode();
    if (m === "off")
        return false;
    if (m === "always")
        return true;
    return Date.now() < SUNSET;
}
function syntheticAllowed(realQualified) {
    void realQualified;
    return syntheticEnabled();
}
exports.SYNTHETIC_POPULATION = Number(process.env.BIDEX_SYNTHETIC_LEADERBOARD_SIZE || 4200);
const ALLTIME_DAYS = 90;
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
function unit(...parts) {
    return fnv1a(parts.join(":")) / 4294967296;
}
function gauss(...parts) {
    const u1 = Math.max(unit("g1", ...parts), 1e-9);
    const u2 = unit("g2", ...parts);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function pick(list, u) {
    return list[Math.min(list.length - 1, Math.floor(u * list.length))];
}
const COUNTRY_TOTAL = names_1.COUNTRY_WEIGHTS.reduce((n, [, w]) => n + w, 0);
function countryFor(u) {
    let x = u * COUNTRY_TOTAL;
    for (const [iso, weight] of names_1.COUNTRY_WEIGHTS) {
        x -= weight;
        if (x <= 0)
            return iso;
    }
    return names_1.COUNTRY_WEIGHTS[0][0];
}
const STRIDE = 9973;
function poolKeyFor(country, i) {
    const regions = names_1.REGIONAL_POOLS[country];
    if (!regions)
        return country;
    const total = regions.reduce((n, [, w]) => n + w, 0);
    let x = unit("region", i) * total;
    for (const [key, weight] of regions) {
        x -= weight;
        if (x <= 0)
            return key;
    }
    return regions[0][0];
}
function genderFor(i) {
    return unit("gender", i) < 0.7 ? "male" : "female";
}
function feminise(surname) {
    if (/(ski|cki|dzki)$/.test(surname))
        return surname.replace(/i$/, "a");
    if (/(ov|ev|in|yn)$/.test(surname))
        return `${surname}a`;
    return surname;
}
function nameAt(poolKey, gender, n) {
    var _a;
    const pool = names_1.NAMES[poolKey] || names_1.NAMES.IN_NORTH;
    const givens = pool[gender];
    const firsts = givens.length;
    const lasts = pool.last.length;
    const middles = ((_a = (gender === "male" ? pool.middleMale : pool.middleFemale)) === null || _a === void 0 ? void 0 : _a.length) || 1;
    const combos = firsts * lasts * middles;
    const slot = (n * STRIDE + (fnv1a(`${poolKey}:${gender}`) % combos)) % combos;
    const first = givens[slot % firsts];
    let last = pool.last[Math.floor(slot / firsts) % lasts];
    if (gender === "female" && pool.feminiseSurname)
        last = feminise(last);
    if (pool.order === "last-first") {
        const list = gender === "male" ? pool.middleMale : pool.middleFemale;
        const middle = list ? ` ${list[Math.floor(slot / (firsts * lasts)) % list.length]}` : "";
        return { first, last, full: `${last}${middle} ${first}` };
    }
    return { first, last, full: `${first} ${last}` };
}
function displayName(parts, i) {
    const roll = unit("handle", i);
    if (roll > 0.22)
        return parts.full;
    const suffix = names_1.HANDLE_SUFFIXES[Math.floor(unit("suffix", i) * names_1.HANDLE_SUFFIXES.length)];
    const digits = 10 + Math.floor(unit("digits", i) * 89);
    switch (Math.floor(unit("shape", i) * 6)) {
        case 0:
            return `${parts.first} ${suffix}`;
        case 1:
            return `${parts.first}_${suffix}`;
        case 2:
            return `${parts.first.toLowerCase()}_${parts.last.toLowerCase()}${digits}`;
        case 3:
            return `${suffix}_${parts.first}`;
        case 4:
            return `${parts.first}${parts.last[0]}${digits}`;
        default:
            return `${parts.first} ${parts.last[0]}.`;
    }
}
let population = null;
function personas() {
    if (population)
        return population;
    const dealt = new Map();
    const list = [];
    for (let i = 0; i < exports.SYNTHETIC_POPULATION; i++) {
        const country = countryFor(unit("country", i));
        const poolKey = poolKeyFor(country, i);
        const gender = genderFor(i);
        const dealKey = `${poolKey}:${gender}`;
        const n = dealt.get(dealKey) || 0;
        dealt.set(dealKey, n + 1);
        const stake = Math.min(12000, Math.max(2, Math.round(Math.exp(3.55 + 1.6 * gauss("stake", i)))));
        const winRate = Math.min(0.74, Math.max(0.36, 0.505 + 0.058 * gauss("skill", i)));
        list.push({
            name: displayName(nameAt(poolKey, gender, n), i),
            country,
            winRate,
            stake,
            volume: Math.max(6, Math.round(10 + Math.exp(2.6 + 0.85 * gauss("volume", i)))),
            startMinute: Math.floor(unit("start", i) * 780),
            sessionMinutes: 260 + Math.floor(unit("session", i) * 740),
            payout: 0.78 + unit("payout", i) * 0.14,
            secondStart: unit("second", i) < 0.55
                ? 700 + Math.floor(unit("secondAt", i) * 500)
                : undefined,
        });
    }
    population = list;
    return list;
}
function persona(i) {
    return personas()[i];
}
function dayNumber(ms) {
    return Math.floor(ms / 86400000);
}
function volumeForDay(i, day, weekend) {
    const swing = 0.55 + unit("vol", i, day) * 0.9;
    const p = persona(i);
    return Math.max(0, Math.round(p.volume * swing * (weekend ? 0.62 : 1)));
}
function dayResult(i, day, progress) {
    const p = persona(i);
    const dow = (day + 4) % 7;
    const planned = volumeForDay(i, day, dow === 0 || dow === 6);
    const trades = Math.round(planned * progress);
    if (trades <= 0)
        return { trades: 0, wins: 0, losses: 0, profit: 0 };
    const z = gauss("luck", i, day);
    const mean = trades * p.winRate;
    const sd = Math.sqrt(trades * p.winRate * (1 - p.winRate));
    const wins = Math.min(trades, Math.max(0, Math.round(mean + z * sd)));
    const losses = trades - wins;
    return {
        trades,
        wins,
        losses,
        profit: wins * p.stake * p.payout - losses * p.stake,
    };
}
function sessionProgress(i, nowMs, dayStartMs) {
    const p = persona(i);
    const minutes = (nowMs - dayStartMs) / 60000;
    const first = Math.min(1, Math.max(0, (minutes - p.startMinute) / p.sessionMinutes));
    if (!p.secondStart)
        return first;
    const second = Math.min(1, Math.max(0, (minutes - p.secondStart) / p.sessionMinutes));
    return first * 0.55 + second * 0.45;
}
function daysInPeriod(period, now) {
    switch (period) {
        case "daily":
            return 1;
        case "weekly":
            return now.getUTCDay() + 1;
        case "monthly":
            return now.getUTCDate();
        default:
            return ALLTIME_DAYS;
    }
}
const cache = new Map();
const CACHE_MS = 10000;
function syntheticLeaderboard(period, metric, now = new Date()) {
    const nowMs = now.getTime();
    const bucket = Math.floor(nowMs / CACHE_MS);
    const key = `${period}:${metric}:${bucket}`;
    const hit = cache.get(key);
    if (hit)
        return hit.rows;
    const today = dayNumber(nowMs);
    const dayStartMs = today * 86400000;
    const span = daysInPeriod(period, now);
    const rows = [];
    for (let i = 0; i < exports.SYNTHETIC_POPULATION; i++) {
        let trades = 0;
        let wins = 0;
        let losses = 0;
        let profit = 0;
        for (let d = 0; d < span; d++) {
            const day = today - d;
            const progress = d === 0 ? sessionProgress(i, nowMs, dayStartMs) : 1;
            const r = dayResult(i, day, progress);
            trades += r.trades;
            wins += r.wins;
            losses += r.losses;
            profit += r.profit;
        }
        if (period === "daily") {
            const carried = dayResult(i, today - 1, 1);
            const spent = dayResult(i, today - 1, sessionProgress(i, nowMs, dayStartMs));
            trades += carried.trades - spent.trades;
            wins += carried.wins - spent.wins;
            losses += carried.losses - spent.losses;
            profit += carried.profit - spent.profit;
        }
        if (trades < 5)
            continue;
        const p = persona(i);
        rows.push({
            key: `s${i}`,
            name: p.name,
            country: p.country,
            totalProfit: Math.round(profit * 100) / 100,
            totalTrades: trades,
            wins,
            losses,
            winRate: Math.round((wins / trades) * 1000) / 10,
        });
    }
    rows.sort((a, b) => metric === "winRate"
        ? b.winRate - a.winRate
        : metric === "volume"
            ? b.totalTrades - a.totalTrades
            : b.totalProfit - a.totalProfit);
    cache.clear();
    cache.set(key, { at: nowMs, rows });
    return rows;
}
function avatarSeedFor(id) {
    return fnv1a(`avatar:${id}`).toString(36);
}
function syntheticQualifiedCount(period, now = new Date()) {
    return syntheticLeaderboard(period, "profit", now).length;
}
