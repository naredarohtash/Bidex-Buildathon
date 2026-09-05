"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientIp = clientIp;
exports.isPrivateIp = isPrivateIp;
exports.brandFromHints = brandFromHints;
exports.parseUserAgent = parseUserAgent;
exports.locateIp = locateIp;
exports.liveSessions = liveSessions;
exports.dropSession = dropSession;
exports.currentSid = currentSid;
exports.alertNewDevice = alertNewDevice;
const redis_1 = require("@b/utils/redis");
const first = (v) => { var _a; return Array.isArray(v) ? String((_a = v[0]) !== null && _a !== void 0 ? _a : "") : typeof v === "string" ? v : ""; };
function clientIp(data) {
    var _a, _b;
    const headers = (data === null || data === void 0 ? void 0 : data.headers) || {};
    const forwarded = (_a = first(headers["x-forwarded-for"]).split(",")[0]) === null || _a === void 0 ? void 0 : _a.trim();
    const candidate = forwarded ||
        first(headers["x-real-ip"]).trim() ||
        first(headers["cf-connecting-ip"]).trim() ||
        String((data === null || data === void 0 ? void 0 : data.ip) || ((_b = data === null || data === void 0 ? void 0 : data.connection) === null || _b === void 0 ? void 0 : _b.remoteAddress) || "").trim();
    if (!candidate)
        return null;
    const ip = candidate.replace(/^::ffff:/i, "");
    return ip || null;
}
function isPrivateIp(ip) {
    if (!ip)
        return true;
    return (ip === "::1" ||
        ip === "127.0.0.1" ||
        /^10\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^f[cd]/i.test(ip));
}
const HINT_BRANDS = [
    [/^brave$/i, "Brave"],
    [/^(microsoft )?edge$/i, "Edge"],
    [/^opera( gx)?$/i, "Opera"],
    [/^vivaldi$/i, "Vivaldi"],
    [/^yandex( browser)?$/i, "Yandex Browser"],
    [/^duckduckgo/i, "DuckDuckGo"],
    [/^samsung internet$/i, "Samsung Internet"],
];
function brandFromHints(raw) {
    const header = String(raw || "");
    if (!header)
        return null;
    for (const [, name] of header.matchAll(/"([^"]+)";\s*v="[^"]*"/g)) {
        const hit = HINT_BRANDS.find(([re]) => re.test(name.trim()));
        if (hit)
            return hit[1];
    }
    return null;
}
function parseUserAgent(raw, hint) {
    var _a;
    const ua = String(raw || "");
    if (!ua)
        return { browser: null, os: null, deviceType: null, deviceName: null };
    const browserName = (_a = brandFromHints(hint)) !== null && _a !== void 0 ? _a : (/Edg[A-Za-z]{0,3}\//.test(ua) ? "Edge"
        : /OPR\/|Opera/.test(ua) ? "Opera"
            : /Vivaldi\//.test(ua) ? "Vivaldi"
                : /YaBrowser\//.test(ua) ? "Yandex Browser"
                    : /DuckDuckGo\/|Ddg[A-Za-z]*\//.test(ua) ? "DuckDuckGo"
                        : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
                            : /UCBrowser\//.test(ua) ? "UC Browser"
                                : /Brave\//.test(ua) ? "Brave"
                                    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
                                        : /MSIE |Trident\//.test(ua) ? "Internet Explorer"
                                            : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
                                                : /Safari\//.test(ua) ? "Safari"
                                                    : null);
    const browserVersion = (() => {
        var _a, _b;
        const pick = (re) => { var _a, _b, _c; return (_c = (_b = (_a = ua.match(re)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.split(".")[0]) !== null && _c !== void 0 ? _c : null; };
        switch (browserName) {
            case "Edge": return pick(/Edg[A-Za-z]{0,3}\/([\d.]+)/);
            case "Opera": return pick(/OPR\/([\d.]+)/);
            case "Vivaldi": return pick(/Vivaldi\/([\d.]+)/);
            case "Yandex Browser": return pick(/YaBrowser\/([\d.]+)/);
            case "DuckDuckGo": return pick(/(?:DuckDuckGo|Ddg[A-Za-z]*)\/([\d.]+)/);
            case "Samsung Internet": return pick(/SamsungBrowser\/([\d.]+)/);
            case "UC Browser": return pick(/UCBrowser\/([\d.]+)/);
            case "Brave": return (_a = pick(/Brave\/([\d.]+)/)) !== null && _a !== void 0 ? _a : pick(/Chrome\/([\d.]+)/);
            case "Firefox": return pick(/(?:Firefox|FxiOS)\/([\d.]+)/);
            case "Internet Explorer": return (_b = pick(/MSIE ([\d.]+)/)) !== null && _b !== void 0 ? _b : pick(/rv:([\d.]+)/);
            case "Chrome": return pick(/(?:Chrome|CriOS)\/([\d.]+)/);
            case "Safari": return pick(/Version\/([\d.]+)/);
            default: return null;
        }
    })();
    const browser = browserName && browserVersion ? `${browserName} ${browserVersion}` : browserName;
    const os = (() => {
        const win = ua.match(/Windows NT ([\d.]+)/);
        if (win) {
            const map = {
                "10.0": "Windows 10/11",
                "6.3": "Windows 8.1",
                "6.2": "Windows 8",
                "6.1": "Windows 7",
            };
            return map[win[1]] || "Windows";
        }
        const ios = ua.match(/(?:iPhone|CPU) OS ([\d_]+)/);
        if (ios)
            return `iOS ${ios[1].replace(/_/g, ".").split(".").slice(0, 2).join(".")}`;
        if (/Mac OS X|Macintosh/.test(ua))
            return "macOS";
        const android = ua.match(/Android ([\d.]+)/);
        if (android)
            return `Android ${android[1].split(".")[0]}`;
        if (/CrOS/.test(ua))
            return "ChromeOS";
        if (/Linux/.test(ua))
            return "Linux";
        return null;
    })();
    const deviceType = /iPad|Tablet|Android(?!.*Mobile)/.test(ua) ? "Tablet"
        : /Mobi|iPhone|iPod|Android/.test(ua) ? "Phone"
            : "Desktop";
    const deviceName = /iPhone/.test(ua) ? "iPhone"
        : /iPad/.test(ua) ? "iPad"
            : /Macintosh/.test(ua) ? "Mac"
                : /Windows/.test(ua) ? "Windows PC"
                    : /Android/.test(ua) ? (deviceType === "Tablet" ? "Android tablet" : "Android phone")
                        : /CrOS/.test(ua) ? "Chromebook"
                            : /Linux/.test(ua) ? "Linux PC"
                                : null;
    return { browser, os, deviceType, deviceName };
}
const EMPTY_PLACE = { city: null, region: null, country: null, countryCode: null };
const geoKey = (ip) => `ip-place:${ip}`;
async function locateIp(ip) {
    if (!ip || isPrivateIp(ip))
        return EMPTY_PLACE;
    if (String(process.env.SIGNIN_GEO_LOOKUP || "").toLowerCase() === "off")
        return EMPTY_PLACE;
    const redis = redis_1.RedisSingleton.getInstance();
    try {
        const cached = await redis.get(geoKey(ip));
        if (cached)
            return JSON.parse(cached);
    }
    catch (_a) {
    }
    let place = EMPTY_PLACE;
    try {
        const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
            signal: AbortSignal.timeout(3000),
        });
        const body = await response.json();
        if (body === null || body === void 0 ? void 0 : body.success) {
            place = {
                city: body.city || null,
                region: body.region || null,
                country: body.country || null,
                countryCode: body.country_code || null,
            };
        }
    }
    catch (_b) {
    }
    try {
        await redis.set(geoKey(ip), JSON.stringify(place), "EX", 7 * 24 * 60 * 60);
    }
    catch (_c) {
    }
    return place;
}
const SESSION_PREFIX = "sessionId:";
async function liveSessions(userId) {
    const redis = redis_1.RedisSingleton.getInstance();
    const found = [];
    let cursor = "0";
    do {
        const [next, keys] = (await redis.scan(cursor, "MATCH", `${SESSION_PREFIX}*`, "COUNT", 500));
        cursor = next;
        if (keys.length) {
            const values = await redis.mget(...keys);
            values.forEach((value, index) => {
                var _a;
                if (!value)
                    return;
                try {
                    const session = JSON.parse(value);
                    const owner = (session === null || session === void 0 ? void 0 : session.userId) || ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id);
                    if (owner === userId) {
                        found.push({
                            sid: keys[index].slice(SESSION_PREFIX.length),
                            accessToken: session.accessToken,
                            refreshToken: session.refreshToken,
                            ipAddress: session.ipAddress || undefined,
                        });
                    }
                }
                catch (_b) {
                }
            });
        }
    } while (cursor !== "0");
    return found;
}
async function dropSession(sid) {
    const redis = redis_1.RedisSingleton.getInstance();
    await redis.del(`${SESSION_PREFIX}${sid}`);
}
function currentSid(sessions, data) {
    var _a, _b;
    const cookies = (data === null || data === void 0 ? void 0 : data.cookies) || {};
    const accessToken = cookies.accessToken || ((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.accessToken);
    const refreshToken = cookies.refreshToken;
    const declared = (data === null || data === void 0 ? void 0 : data.sessionId) || cookies.sessionId;
    const match = sessions.find((s) => (accessToken && s.accessToken === accessToken) ||
        (refreshToken && s.refreshToken === refreshToken) ||
        (declared && s.sid === declared));
    return (_b = match === null || match === void 0 ? void 0 : match.sid) !== null && _b !== void 0 ? _b : null;
}
async function alertNewDevice(input) {
    const { user, previous, device, place, ip, userAgent, at } = input;
    if (!previous.length)
        return;
    const knownAgent = previous.some((row) => row.userAgent && row.userAgent === userAgent);
    const knownCountry = !place.countryCode || previous.some((row) => row.countryCode === place.countryCode);
    if (knownAgent && knownCountry)
        return;
    let email = user === null || user === void 0 ? void 0 : user.email;
    let firstName = user === null || user === void 0 ? void 0 : user.firstName;
    if (!email && (user === null || user === void 0 ? void 0 : user.id)) {
        const { models } = require("@b/db");
        const row = await models.user.findByPk(user.id, {
            attributes: ["email", "firstName"],
            raw: true,
        });
        email = row === null || row === void 0 ? void 0 : row.email;
        firstName = row === null || row === void 0 ? void 0 : row.firstName;
    }
    if (!email)
        return;
    const describedDevice = [device.browser, device.os].filter(Boolean).join(" on ") ||
        device.deviceName ||
        "An unrecognised device";
    const describedPlace = [place.city, place.region, place.country]
        .filter((part, index, all) => part && all.indexOf(part) === index)
        .join(", ") || "an unknown location";
    try {
        const { emailQueue } = require("@b/utils/emails");
        await emailQueue.add({
            emailData: {
                TO: email,
                FIRSTNAME: firstName || (user === null || user === void 0 ? void 0 : user.firstName) || "there",
                DEVICE: describedDevice,
                LOCATION: describedPlace,
                IP: ip || "unknown",
                TIME: at.toUTCString(),
                CREATED_AT: at.toLocaleString(),
            },
            emailType: "NewDeviceSignIn",
        });
    }
    catch (error) {
        const { logger } = require("@b/utils/console");
        logger.error("SECURITY", "New-device alert could not be queued", error);
    }
}
