// /server/api/exchange/binary/leaderboard/synthetic.ts

/**
 * Synthetic traders for the leaderboard.
 *
 * WHY THIS EXISTS, AND WHEN TO DELETE IT
 *
 * The board ranks real settled orders and the platform has not launched, so it
 * renders "Nobody has qualified today yet" on every screenshot, demo and design
 * review. This fills it with a stable population of invented traders so the
 * screen can be evaluated and shown.
 *
 * It stops on its own, on a date baked into the file below. Nothing has to be
 * remembered for that to happen, and `BIDEX_SYNTHETIC_LEADERBOARD=false` turns
 * it off immediately if you want it gone sooner.
 *
 * HOW IT WORKS
 *
 * Nothing is stored and nothing is random at request time. Every figure is a
 * pure function of (trader index, day, clock), so two browsers polling the same
 * second see the same board, a restart changes nothing, and yesterday's numbers
 * are still yesterday's numbers tomorrow.
 *
 *  - Identity — country, name, skill, stake size, session hours — is hashed
 *    from the trader's index and never changes.
 *  - A day's trade count is that trader's usual volume, varied per day and
 *    thinned at weekends, scaled by how much of *their* session has elapsed.
 *    Someone whose session starts at 19:00 has no trades at noon, so the board
 *    fills through the day rather than arriving complete at midnight.
 *  - Wins come from a normal approximation to the binomial with the deviation
 *    fixed for that trader-day. As the trade count climbs, the win count
 *    follows it unevenly, so a total drifts up, stalls, and drops back the way
 *    a real session does — without a per-trade loop.
 *
 * Most of the population loses money, because at an 85% payout the break-even
 * win rate is 54% and most win rates here are below it. A leaderboard shows the
 * top of a distribution; the top of this one is where it should be.
 */

import { COUNTRY_WEIGHTS, HANDLE_SUFFIXES, NAMES, REGIONAL_POOLS } from "./names";

export const SYNTHETIC_ENV_FLAG = "BIDEX_SYNTHETIC_LEADERBOARD";

/**
 * The date this switches itself off: 1 March 2027.
 *
 * Every safety here has to survive being forgotten, and the two obvious ones
 * do not. Off-by-default with an env var to enable puts the safety in
 * somebody's memory of a deployment step. Hiding the population as soon as a
 * real trader qualifies sounds better and is worse in practice — the team's own
 * test trades qualify, so the board a pre-launch server exists to demonstrate
 * blanks itself the first time anyone tests trading on it.
 *
 * A date survives both. It needs nothing set to work now, it cannot quietly
 * run for years, and when it lapses the failure is a board that looks empty —
 * visible, harmless, and one line to extend. Set the flag to `always` to carry
 * it past this date deliberately.
 */
const SUNSET = Date.UTC(2027, 2, 1);

/**
 * Three states, and the default expires.
 *
 *   unset / "auto"  — shown until SUNSET, then not
 *   "always"        — shown regardless of the date
 *   "false" / "off" — never shown
 */
function mode(): "auto" | "off" | "always" {
  const v = String(process.env[SYNTHETIC_ENV_FLAG] ?? "").toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "off") return "off";
  if (v === "always" || v === "force") return "always";
  return "auto";
}

/** Whether the population is available at all. */
export function syntheticEnabled(): boolean {
  const m = mode();
  if (m === "off") return false;
  if (m === "always") return true;
  return Date.now() < SUNSET;
}

/**
 * Whether invented traders may be shown.
 *
 * `realQualified` is unused today and is kept in the signature deliberately:
 * it is the hook for "stop the moment this platform has customers", which is
 * the right rule once the team is no longer the only one trading here.
 */
export function syntheticAllowed(realQualified: number): boolean {
  void realQualified;
  return syntheticEnabled();
}

/** Population size. Only the top of it is ever returned. */
export const SYNTHETIC_POPULATION = Number(
  process.env.BIDEX_SYNTHETIC_LEADERBOARD_SIZE || 4200
);

/** How far back "alltime" reaches. */
const ALLTIME_DAYS = 90;

export interface SyntheticTrader {
  key: string;
  name: string;
  country: string;
  totalProfit: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
}

/* ── deterministic noise ─────────────────────────────────────────────────── */

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One uniform in [0,1) from a string. Same string, same number, forever. */
function unit(...parts: (string | number)[]): number {
  return fnv1a(parts.join(":")) / 4294967296;
}

/** Box-Muller from two independent hashes, so the tails are the right shape. */
function gauss(...parts: (string | number)[]): number {
  const u1 = Math.max(unit("g1", ...parts), 1e-9);
  const u2 = unit("g2", ...parts);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function pick<T>(list: T[], u: number): T {
  return list[Math.min(list.length - 1, Math.floor(u * list.length))];
}

/* ── who they are ────────────────────────────────────────────────────────── */

interface Persona {
  name: string;
  country: string;
  /** Probability of winning one trade. */
  winRate: number;
  /** Typical stake in USD. */
  stake: number;
  /** Trades on a normal day. */
  volume: number;
  /** Minute of the day their session starts, and how long it runs. */
  startMinute: number;
  sessionMinutes: number;
  /** Minute of a second sitting, for the traders that have one. */
  secondStart?: number;
  /** Their broker payout, as a fraction of stake. */
  payout: number;
}

const COUNTRY_TOTAL = COUNTRY_WEIGHTS.reduce((n, [, w]) => n + w, 0);

function countryFor(u: number): string {
  let x = u * COUNTRY_TOTAL;
  for (const [iso, weight] of COUNTRY_WEIGHTS) {
    x -= weight;
    if (x <= 0) return iso;
  }
  return COUNTRY_WEIGHTS[0][0];
}

/**
 * Names are dealt, not drawn.
 *
 * Picking first and last independently from a hash put five traders called
 * "Soe Zaw" in one top twelve: with 4,200 people and pools of a few hundred
 * combinations, collisions are not unlikely, they are certain. Instead each
 * country walks its own first × last grid on a stride coprime with the grid
 * size, so it visits every combination once before any repeats — and stays
 * deterministic, because the walk is indexed by position, not by chance.
 */
const STRIDE = 9973; // prime, and larger than any pool grid here

/** Which of a country's regional pools this trader belongs to. */
function poolKeyFor(country: string, i: number): string {
  const regions = REGIONAL_POOLS[country];
  if (!regions) return country;
  const total = regions.reduce((n, [, w]) => n + w, 0);
  let x = unit("region", i) * total;
  for (const [key, weight] of regions) {
    x -= weight;
    if (x <= 0) return key;
  }
  return regions[0][0];
}

/**
 * The board is about 70% male, which is what a retail binary book looks like.
 * Gender is settled first because it decides which given names are available —
 * and, in Vietnamese, which middle element: Văn is a man's, Thị is a woman's.
 */
function genderFor(i: number): "male" | "female" {
  return unit("gender", i) < 0.7 ? "male" : "female";
}

/** Slavic surnames take a feminine ending. Ivanov → Ivanova, Nowak stays. */
function feminise(surname: string): string {
  if (/(ski|cki|dzki)$/.test(surname)) return surname.replace(/i$/, "a");
  if (/(ov|ev|in|yn)$/.test(surname)) return `${surname}a`;
  return surname;
}

function nameAt(
  poolKey: string,
  gender: "male" | "female",
  n: number
): { first: string; last: string; full: string } {
  const pool = NAMES[poolKey] || NAMES.IN_NORTH;
  const givens = pool[gender];
  const firsts = givens.length;
  const lasts = pool.last.length;
  const middles = (gender === "male" ? pool.middleMale : pool.middleFemale)?.length || 1;
  const combos = firsts * lasts * middles;

  const slot = (n * STRIDE + (fnv1a(`${poolKey}:${gender}`) % combos)) % combos;
  const first = givens[slot % firsts];
  let last = pool.last[Math.floor(slot / firsts) % lasts];
  if (gender === "female" && pool.feminiseSurname) last = feminise(last);

  if (pool.order === "last-first") {
    const list = gender === "male" ? pool.middleMale : pool.middleFemale;
    const middle = list ? ` ${list[Math.floor(slot / (firsts * lasts)) % list.length]}` : "";
    return { first, last, full: `${last}${middle} ${first}` };
  }
  return { first, last, full: `${first} ${last}` };
}

/**
 * A fifth of the board signs up under a handle rather than a name.
 *
 * Built from the name already dealt, so two traders cannot collide on a handle
 * without having collided on a name first. A page of nothing but Firstname
 * Lastname is the tell that a list was generated.
 */
function displayName(parts: { first: string; last: string; full: string }, i: number): string {
  const roll = unit("handle", i);
  if (roll > 0.22) return parts.full;

  const suffix = HANDLE_SUFFIXES[Math.floor(unit("suffix", i) * HANDLE_SUFFIXES.length)];
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

/**
 * The population, built once.
 *
 * One pass so each country can deal its own names in sequence; after that every
 * figure is a pure function of the persona and the clock.
 */
let population: Persona[] | null = null;

function personas(): Persona[] {
  if (population) return population;

  const dealt = new Map<string, number>();
  const list: Persona[] = [];

  for (let i = 0; i < SYNTHETIC_POPULATION; i++) {
    const country = countryFor(unit("country", i));
    const poolKey = poolKeyFor(country, i);
    const gender = genderFor(i);
    /* Dealt per pool *and* per gender, so each grid is walked separately and a
       name cannot repeat before its own grid is exhausted. */
    const dealKey = `${poolKey}:${gender}`;
    const n = dealt.get(dealKey) || 0;
    dealt.set(dealKey, n + 1);

    /* Stakes are lognormal: most of the room is at 20-150 USD with a thin tail
       of accounts trading four figures. A flat range would put a quarter of the
       board on whale stakes, which is not what a retail book looks like. The
       tail is what puts the top ten in five figures on a good day. */
    const stake = Math.min(12000, Math.max(2, Math.round(Math.exp(3.55 + 1.6 * gauss("stake", i)))));

    /* Centred just under break-even at an 85% payout, so the population as a
       whole loses and the board is the tail that did not. */
    const winRate = Math.min(0.74, Math.max(0.36, 0.505 + 0.058 * gauss("skill", i)));

    list.push({
      name: displayName(nameAt(poolKey, gender, n), i),
      country,
      winRate,
      stake,
      /* Enough trades that a total moves while you are looking at it: the
         busiest books settle something every half minute. */
      volume: Math.max(6, Math.round(10 + Math.exp(2.6 + 0.85 * gauss("volume", i)))),
      /* Sessions are long and overlapping on purpose. Short ones meant the
         leaders had finished trading by mid-afternoon and their totals sat
         frozen for the rest of the day — the board was correct and looked
         dead. Now most of the top is still mid-session at any hour. */
      startMinute: Math.floor(unit("start", i) * 780),
      sessionMinutes: 260 + Math.floor(unit("session", i) * 740),
      payout: 0.78 + unit("payout", i) * 0.14,
      secondStart:
        unit("second", i) < 0.55
          ? 700 + Math.floor(unit("secondAt", i) * 500)
          : undefined,
    });
  }

  population = list;
  return list;
}

function persona(i: number): Persona {
  return personas()[i];
}

/* ── what they did ───────────────────────────────────────────────────────── */

/** Days since the epoch, in UTC — the key every day's figures hang off. */
function dayNumber(ms: number): number {
  return Math.floor(ms / 86400000);
}

/** Trades that trader would place on that whole day. */
function volumeForDay(i: number, day: number, weekend: boolean): number {
  const swing = 0.55 + unit("vol", i, day) * 0.9;
  const p = persona(i);
  return Math.max(0, Math.round(p.volume * swing * (weekend ? 0.62 : 1)));
}

/**
 * One day for one trader.
 *
 * `progress` is how much of the day has passed, 0-1; a finished day is 1. The
 * deviation `z` is fixed for the trader-day, so a total moves as the trade
 * count climbs rather than being redrawn on every request.
 */
function dayResult(i: number, day: number, progress: number) {
  const p = persona(i);
  const dow = (day + 4) % 7; // 1970-01-01 was a Thursday
  const planned = volumeForDay(i, day, dow === 0 || dow === 6);

  const trades = Math.round(planned * progress);
  if (trades <= 0) return { trades: 0, wins: 0, losses: 0, profit: 0 };

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

/**
 * How much of this trader's day is done, right now.
 *
 * Two sittings for a bit over half the board — a stretch in the morning and
 * another in the evening, which is how someone with a job trades. With one
 * sitting each, everybody who started early was finished by mid-afternoon and
 * the top of the board stopped moving until midnight.
 */
function sessionProgress(i: number, nowMs: number, dayStartMs: number): number {
  const p = persona(i);
  const minutes = (nowMs - dayStartMs) / 60000;

  const first = Math.min(1, Math.max(0, (minutes - p.startMinute) / p.sessionMinutes));
  if (!p.secondStart) return first;

  const second = Math.min(1, Math.max(0, (minutes - p.secondStart) / p.sessionMinutes));
  // The two sittings split the day's volume between them.
  return first * 0.55 + second * 0.45;
}

/* ── the board ───────────────────────────────────────────────────────────── */

type Period = "daily" | "weekly" | "monthly" | "alltime";

function daysInPeriod(period: Period, now: Date): number {
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

const cache = new Map<string, { at: number; rows: SyntheticTrader[] }>();
/* Figures only move when a trade settles, so recomputing more often than this
   buys nothing. Ten seconds also means every client polling in the same window
   agrees with every other one. */
const CACHE_MS = 10_000;

/**
 * The synthetic population for a period, ranked by the metric.
 *
 * Returns the whole population, not a page of it — the caller merges these with
 * the real traders before ranking, so the two are ordered against each other
 * rather than concatenated.
 */
export function syntheticLeaderboard(
  period: Period,
  metric: "profit" | "winRate" | "volume",
  now: Date = new Date()
): SyntheticTrader[] {
  const nowMs = now.getTime();
  const bucket = Math.floor(nowMs / CACHE_MS);
  const key = `${period}:${metric}:${bucket}`;
  const hit = cache.get(key);
  if (hit) return hit.rows;

  const today = dayNumber(nowMs);
  const dayStartMs = today * 86400000;
  const span = daysInPeriod(period, now);

  const rows: SyntheticTrader[] = [];

  for (let i = 0; i < SYNTHETIC_POPULATION; i++) {
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let profit = 0;

    for (let d = 0; d < span; d++) {
      const day = today - d;
      // Only today is partial; every earlier day in the window is complete.
      const progress = d === 0 ? sessionProgress(i, nowMs, dayStartMs) : 1;
      const r = dayResult(i, day, progress);
      trades += r.trades;
      wins += r.wins;
      losses += r.losses;
      profit += r.profit;
    }

    /* The day board is a rolling day, not a calendar one.
    
       Every session on this board is measured from midnight UTC, so for the
       first hours of each UTC day nobody has traded yet and the daily board —
       the one the terminal actually shows — is empty for everybody, everywhere.
       That is exactly the screen this file exists to prevent, and it was
       reappearing for a few hours out of every twenty-four.
    
       So the day carries the tail of the one before it: yesterday in full, less
       the part of yesterday that has already been counted by the same clock
       fraction today. Trader by trader the two add up to one day's trading, and
       a board read at 00:10 shows a day's worth of it rather than nothing. Only
       the daily window does this — the longer ones are already full. */
    if (period === "daily") {
      const carried = dayResult(i, today - 1, 1);
      const spent = dayResult(i, today - 1, sessionProgress(i, nowMs, dayStartMs));
      trades += carried.trades - spent.trades;
      wins += carried.wins - spent.wins;
      losses += carried.losses - spent.losses;
      profit += carried.profit - spent.profit;
    }

    if (trades < 5) continue; // the same qualification the real board applies

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

  rows.sort((a, b) =>
    metric === "winRate"
      ? b.winRate - a.winRate
      : metric === "volume"
        ? b.totalTrades - a.totalTrades
        : b.totalProfit - a.totalProfit
  );

  // One bucket at a time is all that is ever read; keep the map from growing.
  cache.clear();
  cache.set(key, { at: nowMs, rows });
  return rows;
}

/**
 * The seed a trader's generated avatar is picked from.
 *
 * Not the user id. The board deliberately anonymises everybody — see
 * `displayNameFor` — and shipping the id so the client can hash it would undo
 * that for the sake of choosing a picture. This is the hash, so the same
 * trader gets the same animal on every device and in every session, and the id
 * it came from does not leave the server.
 *
 * It has to be an id rather than a name: seeded on the display name, anybody
 * changing their nickname would change animal, and the "you" box and that same
 * trader's row on the board — which are named by two different functions —
 * would show two different animals for one person.
 */
export function avatarSeedFor(id: string): string {
  return fnv1a(`avatar:${id}`).toString(36);
}

/** How many synthetic traders qualified — for "you are #x of y". */
export function syntheticQualifiedCount(period: Period, now: Date = new Date()): number {
  return syntheticLeaderboard(period, "profit", now).length;
}
