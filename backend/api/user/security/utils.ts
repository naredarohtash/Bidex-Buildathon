// /server/api/user/security/utils.ts

import { RedisSingleton } from "@b/utils/redis";

/**
 * What the security page is allowed to say.
 *
 * Every value here is measured, never inferred from a guess:
 *
 * - the IP comes off the request (the proxy header first, since the socket
 *   address behind nginx is always 127.0.0.1);
 * - the browser, OS and device come from the User-Agent string the browser
 *   sent, parsed rather than pattern-matched loosely — a wrong device name on
 *   this page reads as a stranger's session;
 * - the place comes from one lookup of that IP, stored on the row so it is
 *   resolved once and never re-guessed;
 * - "active" means the Redis session key still exists, not that we saw the
 *   person recently.
 *
 * When any of these cannot be determined the value is null, and the page shows
 * a dash. Nothing substitutes a plausible default.
 */

/* ── The request ──────────────────────────────────────────────────────── */

const first = (v: unknown): string =>
  Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";

/**
 * The caller's address.
 *
 * `x-forwarded-for` is a chain — client, then each proxy — so the client is the
 * left-most entry. The socket address is only a fallback for a direct hit.
 */
export function clientIp(data: any): string | null {
  const headers = data?.headers || {};
  const forwarded = first(headers["x-forwarded-for"]).split(",")[0]?.trim();
  const candidate =
    forwarded ||
    first(headers["x-real-ip"]).trim() ||
    first(headers["cf-connecting-ip"]).trim() ||
    String(data?.ip || data?.connection?.remoteAddress || "").trim();

  if (!candidate) return null;
  // ::ffff:203.0.113.7 is an IPv4 address wearing an IPv6 hat.
  const ip = candidate.replace(/^::ffff:/i, "");
  return ip || null;
}

/** Addresses that can never be located, and should not be sent to a lookup. */
export function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^f[cd]/i.test(ip)
  );
}

/* ── The device ───────────────────────────────────────────────────────── */

export interface DeviceInfo {
  /** Name and major version together, e.g. "Chrome 140". */
  browser: string | null;
  os: string | null;
  deviceType: "Desktop" | "Phone" | "Tablet" | null;
  deviceName: string | null;
}

/**
 * The brand a Chromium browser admits to in `Sec-CH-UA`.
 *
 * Every Chromium browser sends the same User-Agent on purpose, so the string
 * alone cannot tell Brave from Chrome — Brave in particular ships Chrome's
 * exact agent as an anti-fingerprinting measure. The client-hint header is the
 * one place a browser still names itself, as a list like
 * `"Not_A Brand";v="8", "Chromium";v="131", "Brave";v="131"`.
 *
 * Only a brand we can draw is returned, and the padding entries every browser
 * sends — the deliberate nonsense brand, plain Chromium, and Chrome itself,
 * which the agent already covers — are ignored. A browser that sends no hint,
 * or names nothing we know, leaves the agent to decide.
 */
const HINT_BRANDS: [RegExp, string][] = [
  [/^brave$/i, "Brave"],
  [/^(microsoft )?edge$/i, "Edge"],
  [/^opera( gx)?$/i, "Opera"],
  [/^vivaldi$/i, "Vivaldi"],
  [/^yandex( browser)?$/i, "Yandex Browser"],
  [/^duckduckgo/i, "DuckDuckGo"],
  [/^samsung internet$/i, "Samsung Internet"],
];

export function brandFromHints(raw: string | null | undefined): string | null {
  const header = String(raw || "");
  if (!header) return null;
  for (const [, name] of header.matchAll(/"([^"]+)";\s*v="[^"]*"/g)) {
    const hit = HINT_BRANDS.find(([re]) => re.test(name.trim()));
    if (hit) return hit[1];
  }
  return null;
}

/**
 * Read a User-Agent.
 *
 * Order matters twice over: every Chromium browser claims to be Chrome, and
 * Chrome claims to be Safari. Testing the impostors first is the whole trick,
 * and each one is matched on the token only it sends — `OPR/`, `Vivaldi/`,
 * `YaBrowser/` — rather than on its name appearing anywhere in the string.
 *
 * `hint` is the `Sec-CH-UA` header, when there is one. It wins over the agent
 * because it is the browser naming itself: Brave is invisible in the agent and
 * visible here, and nothing else this reads is any less trustworthy than the
 * agent it sits beside. Tor Browser is deliberately absent — it ships Firefox
 * ESR's agent unchanged and sends no hint, which is the point of it, so it is
 * recorded as the Firefox it says it is rather than guessed at.
 */
export function parseUserAgent(
  raw: string | null | undefined,
  hint?: string | null
): DeviceInfo {
  const ua = String(raw || "");
  if (!ua) return { browser: null, os: null, deviceType: null, deviceName: null };

  const browserName =
    brandFromHints(hint)
    ?? (/Edg[A-Za-z]{0,3}\//.test(ua) ? "Edge"
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

  /* The major version, and only the major. A browser's build number changes
     every few weeks and tells the account holder nothing; "Chrome 140" is
     enough to recognise a session as theirs or not.

     Read from the token that names the browser rather than from the first
     `Version/` in the string: every Chromium UA still carries a Safari token
     for compatibility, so matching Safari's would label Chrome with Safari's
     number. Safari itself is the exception — its real version lives in
     `Version/`, because `Safari/` holds a WebKit build. */
  const browserVersion = (() => {
    const pick = (re: RegExp) => ua.match(re)?.[1]?.split(".")[0] ?? null;
    switch (browserName) {
      case "Edge": return pick(/Edg[A-Za-z]{0,3}\/([\d.]+)/);
      case "Opera": return pick(/OPR\/([\d.]+)/);
      case "Vivaldi": return pick(/Vivaldi\/([\d.]+)/);
      case "Yandex Browser": return pick(/YaBrowser\/([\d.]+)/);
      case "DuckDuckGo": return pick(/(?:DuckDuckGo|Ddg[A-Za-z]*)\/([\d.]+)/);
      case "Samsung Internet": return pick(/SamsungBrowser\/([\d.]+)/);
      case "UC Browser": return pick(/UCBrowser\/([\d.]+)/);
      /* Brave is normally named by the client hint alone, and a browser that
         names itself there still carries Chrome's version in its agent. */
      case "Brave": return pick(/Brave\/([\d.]+)/) ?? pick(/Chrome\/([\d.]+)/);
      case "Firefox": return pick(/(?:Firefox|FxiOS)\/([\d.]+)/);
      /* IE 11 stopped saying MSIE and moved its number into `rv:`. */
      case "Internet Explorer": return pick(/MSIE ([\d.]+)/) ?? pick(/rv:([\d.]+)/);
      case "Chrome": return pick(/(?:Chrome|CriOS)\/([\d.]+)/);
      case "Safari": return pick(/Version\/([\d.]+)/);
      default: return null;
    }
  })();

  const browser = browserName && browserVersion ? `${browserName} ${browserVersion}` : browserName;

  const os = (() => {
    const win = ua.match(/Windows NT ([\d.]+)/);
    if (win) {
      // Microsoft stopped incrementing NT at 10.0, so 10 and 11 are the same
      // string. Claiming one of them would be a coin toss.
      const map: Record<string, string> = {
        "10.0": "Windows 10/11",
        "6.3": "Windows 8.1",
        "6.2": "Windows 8",
        "6.1": "Windows 7",
      };
      return map[win[1]] || "Windows";
    }
    const ios = ua.match(/(?:iPhone|CPU) OS ([\d_]+)/);
    if (ios) return `iOS ${ios[1].replace(/_/g, ".").split(".").slice(0, 2).join(".")}`;
    /* No version for macOS, deliberately. Safari and every Chromium browser
       freeze the Mac token at "10_15_7" whatever the machine is actually
       running, so the number in the string is not the number on the About
       screen. Printing it would be a confident lie; "macOS" is the true part.

       Windows above has the same problem and is handled the same way: NT 10.0
       is both Windows 10 and Windows 11, so it says so. */
    if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
    const android = ua.match(/Android ([\d.]+)/);
    if (android) return `Android ${android[1].split(".")[0]}`;
    if (/CrOS/.test(ua)) return "ChromeOS";
    if (/Linux/.test(ua)) return "Linux";
    return null;
  })();

  const deviceType: DeviceInfo["deviceType"] =
    /iPad|Tablet|Android(?!.*Mobile)/.test(ua) ? "Tablet"
    : /Mobi|iPhone|iPod|Android/.test(ua) ? "Phone"
    : "Desktop";

  const deviceName =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows PC"
    : /Android/.test(ua) ? (deviceType === "Tablet" ? "Android tablet" : "Android phone")
    : /CrOS/.test(ua) ? "Chromebook"
    : /Linux/.test(ua) ? "Linux PC"
    : null;

  return { browser, os, deviceType, deviceName };
}

/* ── The place ────────────────────────────────────────────────────────── */

export interface Place {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
}

const EMPTY_PLACE: Place = { city: null, region: null, country: null, countryCode: null };
const geoKey = (ip: string) => `ip-place:${ip}`;

/**
 * Where an address is, once.
 *
 * There is no geolocation database on this server and adding one costs about a
 * hundred megabytes of resident memory on a box that already runs close to its
 * limit, so the lookup is a single HTTPS call, cached in Redis for a week and
 * then written onto the row so it is never repeated for that sign-in.
 *
 * It fails open in every direction: a private address, a timeout, a rate limit
 * or an unparseable answer all return nulls, and the page then shows the IP
 * with no place beside it. Set SIGNIN_GEO_LOOKUP=off to stop the call entirely
 * — the rest of the page is unaffected.
 */
export async function locateIp(ip: string | null): Promise<Place> {
  if (!ip || isPrivateIp(ip)) return EMPTY_PLACE;
  if (String(process.env.SIGNIN_GEO_LOOKUP || "").toLowerCase() === "off") return EMPTY_PLACE;

  const redis = RedisSingleton.getInstance();
  try {
    const cached = await redis.get(geoKey(ip));
    if (cached) return JSON.parse(cached) as Place;
  } catch {
    /* A cache miss is not a failure. */
  }

  let place: Place = EMPTY_PLACE;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(3000),
    });
    const body: any = await response.json();
    if (body?.success) {
      place = {
        city: body.city || null,
        region: body.region || null,
        country: body.country || null,
        countryCode: body.country_code || null,
      };
    }
  } catch {
    /* Offline, blocked, or slow. The row simply carries no place. */
  }

  try {
    await redis.set(geoKey(ip), JSON.stringify(place), "EX", 7 * 24 * 60 * 60);
  } catch {
    /* Caching is an optimisation, not a requirement. */
  }
  return place;
}

/* ── The sessions ─────────────────────────────────────────────────────── */

export interface LiveSession {
  sid: string;
  accessToken?: string;
  refreshToken?: string;
  ipAddress?: string;
}

const SESSION_PREFIX = "sessionId:";

/**
 * Every session Redis is currently holding for this account.
 *
 * Sessions are stored one key per session with no per-user index, so this is a
 * SCAN. That is acceptable here because it runs on two deliberate actions — a
 * person opening their security page, or signing every device out — and never
 * on a hot path.
 */
export async function liveSessions(userId: string): Promise<LiveSession[]> {
  const redis = RedisSingleton.getInstance();
  const found: LiveSession[] = [];
  let cursor = "0";

  do {
    const [next, keys]: [string, string[]] = (await redis.scan(
      cursor,
      "MATCH",
      `${SESSION_PREFIX}*`,
      "COUNT",
      500
    )) as any;
    cursor = next;

    if (keys.length) {
      const values = await redis.mget(...keys);
      values.forEach((value, index) => {
        if (!value) return;
        try {
          /* Two shapes live under this prefix. `createSession` writes a flat
             record with `userId`; the older token helper writes the whole user
             under `user`. Reading only the first silently hides half of
             somebody's devices, so both are accepted. */
          const session = JSON.parse(value);
          const owner = session?.userId || session?.user?.id;
          if (owner === userId) {
            found.push({
              sid: keys[index].slice(SESSION_PREFIX.length),
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              ipAddress: session.ipAddress || undefined,
            });
          }
        } catch {
          /* A malformed value is not this account's session. */
        }
      });
    }
  } while (cursor !== "0");

  return found;
}

/** Drop one session, so the device holding it is signed out on its next call. */
export async function dropSession(sid: string): Promise<void> {
  const redis = RedisSingleton.getInstance();
  await redis.del(`${SESSION_PREFIX}${sid}`);
}

/**
 * Which of these sessions is the one asking.
 *
 * Matched on a token the caller and the stored session provably share. Which
 * token that is depends on which helper wrote the session, so all three routes
 * are tried; the key name itself is checked last, for the shape that carries no
 * token at all. Without a match the page simply labels nothing "This device"
 * and a sign-out-everywhere spares nothing — never the wrong row.
 */
export function currentSid(sessions: LiveSession[], data: any): string | null {
  const cookies = data?.cookies || {};
  const accessToken = cookies.accessToken || data?.user?.accessToken;
  const refreshToken = cookies.refreshToken;
  const declared = data?.sessionId || cookies.sessionId;

  const match = sessions.find(
    (s) =>
      (accessToken && s.accessToken === accessToken) ||
      (refreshToken && s.refreshToken === refreshToken) ||
      (declared && s.sid === declared)
  );
  return match?.sid ?? null;
}

/* ── The alert ────────────────────────────────────────────────────────── */

interface AlertInput {
  user: any;
  previous: { userAgent?: string | null; countryCode?: string | null }[];
  device: DeviceInfo;
  place: Place;
  ip: string | null;
  userAgent: string | null;
  at: Date;
}

/**
 * Email the account holder when a device they have not used before signs in.
 *
 * The hard part is not sending it — it is not sending it constantly. A new
 * session id is not a new device: signing out and back in on the same laptop
 * writes a new row every time, and an alert per sign-in is an alert nobody
 * reads. So the test is the device, not the session:
 *
 *  - a User-Agent no earlier row has, or
 *  - a country no earlier row has.
 *
 * The second is the one that catches a stolen session replayed from elsewhere,
 * and it is also the one that fires when somebody travels. That trade is taken
 * deliberately: a wrong "was this you?" costs a moment's attention, and a
 * missed one costs the account.
 *
 * Nothing is sent when there are no earlier rows at all. On the day this
 * shipped every account had none, and "we noticed a new sign-in" as a greeting
 * to a device somebody has used for months is a false alarm that teaches people
 * to ignore the real one.
 */
export async function alertNewDevice(input: AlertInput): Promise<void> {
  const { user, previous, device, place, ip, userAgent, at } = input;

  if (!previous.length) return;

  const knownAgent = previous.some((row) => row.userAgent && row.userAgent === userAgent);
  const knownCountry =
    !place.countryCode || previous.some((row) => row.countryCode === place.countryCode);
  if (knownAgent && knownCountry) return;

  /* The middleware usually attaches the whole user record, but "usually" is
     not good enough for the one email that matters most. */
  let email = user?.email;
  let firstName = user?.firstName;
  if (!email && user?.id) {
    const { models } = require("@b/db");
    const row = await models.user.findByPk(user.id, {
      attributes: ["email", "firstName"],
      raw: true,
    });
    email = row?.email;
    firstName = row?.firstName;
  }
  if (!email) return;

  const describedDevice =
    [device.browser, device.os].filter(Boolean).join(" on ") ||
    device.deviceName ||
    "An unrecognised device";
  const describedPlace =
    [place.city, place.region, place.country]
      .filter((part, index, all) => part && all.indexOf(part) === index)
      .join(", ") || "an unknown location";

  try {
    const { emailQueue } = require("@b/utils/emails");
    await emailQueue.add({
      emailData: {
        TO: email,
        FIRSTNAME: firstName || user?.firstName || "there",
        DEVICE: describedDevice,
        LOCATION: describedPlace,
        IP: ip || "unknown",
        TIME: at.toUTCString(),
        CREATED_AT: at.toLocaleString(),
      },
      emailType: "NewDeviceSignIn",
    });
  } catch (error: any) {
    const { logger } = require("@b/utils/console");
    logger.error("SECURITY", "New-device alert could not be queued", error);
  }
}
