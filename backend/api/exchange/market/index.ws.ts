import ExchangeManager from "@b/utils/exchange";
import { hasClients, sendMessageToRoute } from "@b/handler/Websocket";
// The module exports a `clients` registry at runtime but does not declare it in
// its types, so it is reached through the namespace rather than a named import.
// If it is ever absent, anyClientSubscribedTo() falls back to "keep streaming".
import * as WebsocketHandler from "@b/handler/Websocket";
import { logError } from "@b/utils/logger";
import { loadBanStatus, saveBanStatus, handleExchangeError, getCleanOtcSymbol, isSymbolMatch, vortexToBidexSymbol, getOtcOrigin } from "../utils";
import Redis from "ioredis";
import fs from "fs";
import WebSocket from "ws";

function logDebugOtc(msg: string) {
  // Debug logging disabled
}

// Shared Redis client for keeping OTC last_price in sync with live BideX ticks.
// A single persistent connection is much cheaper than one-per-tick.
let _syncRedis: Redis | null = null;
function getSyncRedis(): Redis {
  if (!_syncRedis || _syncRedis.status === "close" || _syncRedis.status === "end") {
    _syncRedis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });
    _syncRedis.on("error", () => { /* swallow – this is best-effort */ });
  }
  return _syncRedis;
}

export const metadata = {};

const activeSecondsCandles = new Map<string, {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>();


function getIntervalDurationMs(interval: string): number {
  const amount = parseInt(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (isNaN(amount)) return 60000;
  switch (unit) {
    case "s": return amount * 1000;
    case "m": return amount * 60000;
    case "h": return amount * 3600000;
    case "d": return amount * 86400000;
    case "w": return amount * 604800000;
    case "M": return amount * 2592000000;
    default: return 60000;
  }
}


function vortexToTvResolution(interval: string): string {
  const map: Record<string, string> = {
    "1m": "1",
    "2m": "2",
    "3m": "3",
    "5m": "5",
    "10m": "10",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "8h": "480",
    "12h": "720",
    "1d": "1D",
    "3d": "3D",
    "1w": "1W",
    "1M": "1M"
  };
  return map[interval] || "1";
}

async function fetchOtcCandle(symbol: string, alignedTimestamp: number, interval: string): Promise<[number, number, number, number, number, number] | null> {
  try {
    const asset = vortexToBidexSymbol(symbol);
    const tvResolution = vortexToTvResolution(interval);
    const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
    const bidexApiKey = process.env.BIDEX_API_KEY;
    
    const durationMs = getIntervalDurationMs(interval);
    const from = alignedTimestamp;
    const to = alignedTimestamp + durationMs;
    
    const response = await fetch(
      `${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=${tvResolution}&from=${from}&to=${to}`,
      {
        headers: {
          ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
          "Origin": getOtcOrigin()
        }
      }
    );
    if (!response.ok) {
      const text = await response.text();
      console.error(`[OtcWebSocketSubscriber] fetchOtcCandle returned status ${response.status} for symbol ${symbol}. Response: ${text}`);
      return null;
    }
    const result = await response.json();
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const match = result.data.find((c: any) => Number(c[0]) === alignedTimestamp);
      if (match) {
        return [
          Number(match[0]),
          Number(match[1]),
          Number(match[2]),
          Number(match[3]),
          Number(match[4]),
          Number(match[5] || 0)
        ];
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

interface CompletedBase {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchCompletedBase(
  symbol: string,
  alignedBucketTs: number,
  tickCandleTs: number
): Promise<CompletedBase | null> {
  if (tickCandleTs <= alignedBucketTs) {
    return null;
  }
  try {
    const asset = vortexToBidexSymbol(symbol);
    const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
    const bidexApiKey = process.env.BIDEX_API_KEY;
    
    const from = alignedBucketTs;
    const to = tickCandleTs - 1;
    
    const response = await fetch(
      `${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=1&from=${from}&to=${to}`,
      {
        headers: {
          ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
          "Origin": getOtcOrigin()
        }
      }
    );
    if (!response.ok) {
      return null;
    }
    const result = await response.json();
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const validCandles = result.data.filter((c: any) => {
        const t = Number(c[0]);
        return t >= alignedBucketTs && t < tickCandleTs;
      });

      if (validCandles.length > 0) {
        validCandles.sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
        
        let high = -Infinity;
        let low = Infinity;
        let volume = 0;
        
        for (const c of validCandles) {
          high = Math.max(high, Number(c[2]));
          low = Math.min(low, Number(c[3]));
          volume += Number(c[5] || 0);
        }
        
        return {
          open: Number(validCandles[0][1]),
          high,
          low,
          close: Number(validCandles[validCandles.length - 1][4]),
          volume
        };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

export class OtcWebSocketSubscriber {
  private static instance: OtcWebSocketSubscriber;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(tick: any) => void | Promise<void>>> = new Map();
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Liveness. This single upstream socket feeds every chart for every user, so
  // when it dies quietly it takes the whole platform's live data with it and
  // nothing downstream can tell — the terminal stays connected, the server keeps
  // its subscriptions, and no candle ever arrives.
  private lastMessageAt = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private openTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private idleCloseTimer: NodeJS.Timeout | null = null;

  /* Tightened after watching it happen in production: the log line
     "no data for 65s — terminating to force reconnect" is a full minute of
     missing candles on a one-minute chart, which is the stop-gap-resume the
     traders were reporting. The upstream connection really does die; the cost
     was how long we waited to notice.

     A ping every 8s draws a protocol-level pong from any compliant server, so a
     connection that is merely quiet still counts as alive and 25s of total
     silence means genuinely dead rather than idle. Worst case is a needless
     reconnect, which takes about a second. */
  private static readonly HEARTBEAT_MS = 8000;
  private static readonly STALE_MS = 25000;
  private static readonly OPEN_TIMEOUT_MS = 15000;
  private static readonly MAX_BACKOFF_MS = 30000;
  /* How long the upstream socket is kept alive with nothing subscribed. Long
     enough to ride out devices switching asset, reconnecting or reloading. */
  private static readonly IDLE_CLOSE_MS = 300000;

  private constructor() {}

  public static getInstance(): OtcWebSocketSubscriber {
    if (!OtcWebSocketSubscriber.instance) {
      OtcWebSocketSubscriber.instance = new OtcWebSocketSubscriber();
    }
    return OtcWebSocketSubscriber.instance;
  }

  public async subscribe(symbol: string, callback: (tick: any) => void | Promise<void>): Promise<() => void> {
    const cleanSymbol = getCleanOtcSymbol(symbol);
    logDebugOtc(`OtcWebSocketSubscriber.subscribe called for symbol: ${symbol} (clean: ${cleanSymbol})`);
    
    if (!this.listeners.has(cleanSymbol)) {
      this.listeners.set(cleanSymbol, new Set());
    }
    this.listeners.get(cleanSymbol)!.add(callback);

    // A new subscriber means the socket is wanted again; call off any pending
    // idle shutdown before it can pull the connection out from under them.
    this.cancelIdleClose();
    this.ensureConnected();

    return () => {
      logDebugOtc(`OtcWebSocketSubscriber unsubscribe called for symbol: ${symbol} (clean: ${cleanSymbol})`);
      const set = this.listeners.get(cleanSymbol);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(cleanSymbol);
        }
      }
      /* Deliberately NOT closed the moment the last listener goes.

         This is one socket shared by every chart on the platform, and it used
         to be destroyed as soon as no producing loop held a listener. With
         several devices open that happens constantly — a loop ends whenever
         hasClients() briefly reports nobody on the route, which a device
         switching asset or reconnecting is enough to cause. Each teardown meant
         a fresh handshake and backoff before prices resumed, so every device
         saw candles stop and a hole appear. The more devices in use, the more
         often it happened, which is exactly the reported behaviour.

         Holding an idle socket costs almost nothing. Re-establishing it costs
         everyone their live data. So it lingers, and only closes if nothing has
         wanted it for a sustained period. */
      if (this.listeners.size === 0) {
        this.scheduleIdleClose();
      }
    };
  }

  private scheduleIdleClose() {
    if (this.idleCloseTimer) return;
    this.idleCloseTimer = setTimeout(() => {
      this.idleCloseTimer = null;
      if (this.listeners.size > 0) return; // someone came back
      if (!this.ws) return;
      logDebugOtc(`Idle for ${OtcWebSocketSubscriber.IDLE_CLOSE_MS}ms, closing WS connection to BideX`);
      try {
        this.ws.close();
      } catch {
        /* the close handler tidies up */
      }
      this.ws = null;
      this.stopHeartbeat();
    }, OtcWebSocketSubscriber.IDLE_CLOSE_MS);
  }

  private cancelIdleClose() {
    if (this.idleCloseTimer) {
      clearTimeout(this.idleCloseTimer);
      this.idleCloseTimer = null;
    }
  }

  private ensureConnected() {
    if (this.ws || this.isConnecting) return;
    this.isConnecting = true;
    logDebugOtc(`OtcWebSocketSubscriber.ensureConnected initiating WS connection to BideX...`);

    const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
    const bidexApiKey = process.env.BIDEX_API_KEY;
    const wsUrl = bidexUrl.replace(/^http/, "ws") + "/ws/all" + (bidexApiKey ? `?api_key=${bidexApiKey}` : "");

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Origin: "http://localhost"
        }
      });

      // A socket that never finishes connecting fires neither "open" nor
      // "close", so isConnecting would stay true forever and ensureConnected()
      // would return early on every subsequent attempt — permanently wedged.
      this.openTimer = setTimeout(() => {
        this.openTimer = null;
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.error(
            `[OtcWebSocketSubscriber] connection did not open within ${OtcWebSocketSubscriber.OPEN_TIMEOUT_MS}ms — retrying`
          );
          try {
            this.ws.terminate();
          } catch {
            /* the close handler still runs */
          }
        }
      }, OtcWebSocketSubscriber.OPEN_TIMEOUT_MS);

      this.ws.on("open", () => {
        logDebugOtc(`OtcWebSocketSubscriber successfully connected to BideX WS`);
        console.log(`[OtcWebSocketSubscriber] Connected to BideX WS at ${wsUrl}`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.clearOpenTimer();
        this.startHeartbeat();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      // A pong is proof of life on a feed that happens to be quiet.
      this.ws.on("pong", () => {
        this.lastMessageAt = Date.now();
      });

      this.ws.on("message", (data: any) => {
        this.lastMessageAt = Date.now();
        try {
          const tick = JSON.parse(data.toString());
          if (tick && tick.type === "TICK") {
            const asset = tick.asset; // e.g. "EUR/USD (OTC)"
            
            // Map BideX asset name to clean OTC symbol (e.g. "EURUSD_OTC" or "AAPL_OTC")
            // To do this, we can find a matching clean symbol in this.listeners
            for (const cleanSymbol of this.listeners.keys()) {
              if (isSymbolMatch(cleanSymbol, asset)) {
                const mappedTick = {
                  symbol: cleanSymbol,
                  price: tick.price,
                  timestamp: tick.timestamp || Date.now(),
                  volume: tick.volume || 0.1,
                  open: tick.open,
                  high: tick.high,
                  low: tick.low,
                  close: tick.close,
                  candle_start_ts: tick.candle_start_ts,
                };
                
                const set = this.listeners.get(cleanSymbol);
                if (set) {
                  set.forEach((cb) => cb(mappedTick));
                }
              }
            }
          }
        } catch (err) {
          console.error("[OtcWebSocketSubscriber] Error parsing BideX WS message:", err);
        }
      });

      this.ws.on("close", () => {
        logDebugOtc(`OtcWebSocketSubscriber connection closed`);
        this.stopHeartbeat();
        this.clearOpenTimer();
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        console.error("[OtcWebSocketSubscriber] socket error:", err);
        if (this.ws) {
          // terminate() rather than close(): a socket that errored may never
          // complete a graceful closing handshake, and close() would then leave
          // it hanging in CLOSING without ever firing "close".
          try {
            this.ws.terminate();
          } catch {
            /* the close handler still runs */
          }
        }
      });

    } catch (err) {
      console.error("[OtcWebSocketSubscriber] Failed to initialize WS:", err);
      this.stopHeartbeat();
      this.clearOpenTimer();
      this.ws = null;
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * The fix for charts freezing platform-wide.
   *
   * When this connection dies without a close frame — a NAT table expiring, the
   * provider dropping it, any network path failing mid-stream — the `ws` client
   * fires neither "close" nor "error". The socket stays at readyState OPEN
   * indefinitely, no ticks arrive, and because "close" never fires,
   * scheduleReconnect() is never reached. Every chart for every user stops, and
   * the server still believes it is connected.
   *
   * The only thing that used to recover it was accidental: switching asset could
   * empty the listener map, and the explicit ws.close() in the unsubscribe path
   * finally produced the close event that triggered a reconnect. That is why
   * charts came back when you changed symbol, and why a reload appeared to help.
   *
   * A ping every 20s keeps the path warm and draws a pong that proves the socket
   * is alive even when the feed is quiet. If nothing at all arrives for 60s the
   * socket is terminated, which does fire "close" and does reconnect.
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor > OtcWebSocketSubscriber.STALE_MS) {
        console.error(
          `[OtcWebSocketSubscriber] no data for ${Math.round(silentFor / 1000)}s — terminating to force reconnect`
        );
        try {
          ws.terminate();
        } catch {
          /* the close handler still runs */
        }
        return;
      }

      try {
        ws.ping();
      } catch {
        /* the staleness check above will catch a socket that cannot be pinged */
      }
    }, OtcWebSocketSubscriber.HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearOpenTimer() {
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  /**
   * A reportable state for the one connection every chart depends on.
   *
   * Until now the only way to discover this feed had died was a user noticing
   * their candles had stopped — the terminal still looked connected, the server
   * still held its subscriptions, and nothing anywhere said otherwise. A silent
   * single point of failure for the whole platform is not something to find out
   * about second-hand.
   *
   * `healthy` is false while any listener is waiting on a feed that is not
   * delivering; a socket with nothing subscribed to it is idle, not broken.
   */
  public getHealth() {
    const connected = this.ws?.readyState === WebSocket.OPEN;
    const silentForMs = this.lastMessageAt ? Date.now() - this.lastMessageAt : null;
    const listening = this.listeners.size > 0;

    return {
      connected,
      listening,
      symbols: this.listeners.size,
      silentForMs,
      reconnectAttempts: this.reconnectAttempts,
      healthy:
        !listening ||
        (connected &&
          silentForMs !== null &&
          silentForMs < OtcWebSocketSubscriber.STALE_MS),
    };
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0) return; // Don't reconnect if no one is listening
    if (this.reconnectTimer) return;

    // Backoff, so that a provider outage is not met with a reconnect attempt
    // every five seconds indefinitely.
    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      OtcWebSocketSubscriber.MAX_BACKOFF_MS
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }
}

/**
 * Is any connected client still subscribed to this stream?
 *
 * Every branch that cannot answer confidently returns `true`, and that asymmetry
 * is deliberate. Answering "no" wrongly stops a live feed for users who are
 * watching it — the exact failure this exists to prevent — while answering "yes"
 * wrongly just leaves a stream running with no audience, costing upstream quota
 * until the last client leaves the route and the loops' own hasClients() guard
 * ends them. A wasted stream is recoverable; a frozen chart is what people see.
 *
 * The registry stores each client's subscriptions as serialised keys, so entries
 * are parsed and compared field by field rather than by string equality —
 * `{"type","interval","symbol"}` and `{"symbol","type","interval"}` describe the
 * same subscription and must not be treated as different ones.
 */
function anyClientSubscribedTo(
  type: string,
  symbol: string,
  interval?: string
): boolean {
  for (const want of clientSubscriptions()) {
    if (want === UNREADABLE_REGISTRY) return true;
    if (
      want.type === type &&
      want.symbol === symbol &&
      (want.interval ?? undefined) === (interval ?? undefined)
    ) {
      return true;
    }
  }
  return false;
}

/* Yielded when the registry cannot be read at all, so callers keep the
   "assume someone is watching" behaviour described above instead of
   concluding from an empty list that nobody is. */
const UNREADABLE_REGISTRY = Symbol("unreadable-registry");

type ClientWant = { type: string; symbol: string; interval?: string; limit?: number };

/**
 * Every subscription every connected client currently holds.
 *
 * This is the only honest account of what the server is supposed to be
 * producing: `activeSubscriptions` records what it *started*, which is a
 * different thing the moment a producing loop ends on its own.
 */
function* clientSubscriptions(): Generator<ClientWant | typeof UNREADABLE_REGISTRY> {
  let routeClients: any;
  try {
    routeClients = (WebsocketHandler as any)?.clients?.get?.(`/api/exchange/market`);
  } catch {
    yield UNREADABLE_REGISTRY;
    return;
  }
  if (!routeClients) {
    yield UNREADABLE_REGISTRY;
    return;
  }

  /* The registry is Map<route, Map<clientId, { ws, subscriptions: Set<string> }>>.
     Iterating that inner Map directly yields [clientId, record] pairs, not
     records — so reading `.subscriptions` off the loop variable gave undefined
     for every client, every time, and this function reported that nobody was
     subscribed to anything. The reaper believed it and stopped live streams
     roughly once a minute; the logs are full of "no subscribers left for
     EUR/ZAR_OTC:ohlcv:1m" while that chart was on screen. Both shapes are
     handled here because the framework is compiled and this is precisely the
     assumption that broke. */
  const records =
    typeof routeClients.values === "function" ? routeClients.values() : routeClients;

  let found = 0;
  for (const record of records) {
    const client: any = Array.isArray(record) ? record[1] : record;
    const subs = client?.subscriptions;
    if (!subs) continue;

    const entries = typeof subs.values === "function" ? subs.values() : subs;
    for (const entry of entries) {
      // Stored as JSON.stringify(payload) by the framework's SUBSCRIBE handler.
      let parsed: any = entry;
      if (typeof entry === "string") {
        try {
          parsed = JSON.parse(entry);
        } catch {
          continue;
        }
      }
      if (!parsed || typeof parsed !== "object") continue;
      if (typeof parsed.type !== "string" || typeof parsed.symbol !== "string") continue;

      found++;
      yield {
        type: parsed.type,
        symbol: parsed.symbol,
        interval: parsed.interval ?? undefined,
        limit: typeof parsed.limit === "number" ? parsed.limit : undefined,
      };
    }
  }

  /* Clients on the route but not one readable subscription between them is a
     contradiction, not a fact, and the only honest reading is that this code no
     longer understands the registry. Saying so out loud keeps the reaper's hands
     off live streams instead of letting a shape change quietly translate into
     "nobody is watching anything" — which is exactly how the last one went
     unnoticed. */
  if (found === 0 && hasClients(`/api/exchange/market`)) {
    yield UNREADABLE_REGISTRY;
  }
}

class BaseMarketDataHandler {
  protected accumulatedBuffer: { [key: string]: any } = {};
  protected bufferInterval: NodeJS.Timeout | null = null;
  protected unblockTime = 0;
  protected activeSubscriptions: Set<string> = new Set();

  /* What each active key is actually watching, so the reaper below can ask
     whether anyone still wants it. The key is a joined string and picking it
     apart again would be guesswork — symbols contain slashes, intervals and
     limits are both optional — so the parts are simply kept as they came in. */
  protected subscriptionParams: Map<
    string,
    { symbol: string; type: string; interval?: string }
  > = new Map();

  private reaperTimer: NodeJS.Timeout | null = null;
  private reapStrikes: Map<string, number> = new Map();

  /* Which producing loops are genuinely running right now.
     Distinct from activeSubscriptions, which records what was *started* and is
     also the flag the loops watch to decide when to stop. Once those two can
     disagree — and they do, because a loop can end on its own — only a separate
     record can answer "is anything actually producing this stream?" */
  private runningStreams: Set<string> = new Set();

  /* Each singleton only ever receives one type (the default export dispatches
     by type), so this is exact rather than a guess, and it keeps the supervisor
     from restarting a ticker stream on the OHLCV handler. */
  private handledType: string | null = null;

  private supervisorTimer: NodeJS.Timeout | null = null;

  protected static streamKey(
    symbol: string,
    type: string,
    interval?: string,
    limit?: number
  ) {
    return `${symbol}:${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}`;
  }

  /**
   * Restarts streams that stopped while someone was still watching.
   *
   * The producing loops run `while (activeSubscriptions.has(key) && hasClients(route))`
   * and delete their key on the way out. Both conditions can go false while a
   * client is still connected and still subscribed: `hasClients` reports on the
   * whole route and dips as devices reconnect, and the reaper removes keys whose
   * subscribers it cannot see. Either way the loop ends, and nothing ever
   * started it again — `start()` only launches a producer when the key is
   * absent, and a client that already subscribed has no reason to subscribe a
   * second time. Its socket is open, the server is simply no longer producing.
   *
   * That is the freeze: candles stop mid-flight, never roll into the next
   * bucket, and come back only when the page is reloaded and the subscription is
   * sent again. Reloading was never fixing a stuck browser — it was asking for a
   * producer that had quietly exited.
   *
   * So the client registry, not our own bookkeeping, decides what should be
   * running. Anything a client still holds a subscription for and that has no
   * live producer gets one, within a few seconds and without the user doing
   * anything.
   */
  protected startStreamSupervisor() {
    if (this.supervisorTimer) return;
    this.supervisorTimer = setInterval(() => {
      try {
        if (!this.handledType) return;
        if (!hasClients(`/api/exchange/market`)) return;

        for (const want of clientSubscriptions()) {
          if (want === UNREADABLE_REGISTRY) return;
          if (want.type !== this.handledType) continue;

          const key = BaseMarketDataHandler.streamKey(
            want.symbol,
            want.type,
            want.interval,
            want.limit
          );
          if (this.runningStreams.has(key)) continue;

          console.info(`[market] no producer for ${key} but a client is subscribed — restarting`);
          this.activeSubscriptions.add(key);
          this.subscriptionParams.set(key, {
            symbol: want.symbol,
            type: want.type,
            interval: want.interval,
          });
          this.reapStrikes.delete(key);
          this.handleSubscription(want.symbol, want.type, want.interval, want.limit);
        }
      } catch (err) {
        // A supervisor that can crash is worse than no supervisor: it runs on a
        // timer, and an unhandled rejection would take the process down.
        console.error("[market] stream supervisor failed:", err);
      }
    }, 5000);
  }

  /**
   * Stops streams that have outlived their last subscriber.
   *
   * Tearing a stream down the moment any one client unsubscribed used to kill
   * the feed for everyone else watching that symbol, so it now only happens
   * once nobody is left — and where that cannot be established confidently it
   * errs towards keeping the stream alive. That is the right way round for a
   * live chart, but it means a stream can linger with no audience, calling the
   * upstream provider roughly once a second and spending quota on data nobody
   * receives. The server logs showed exactly that: candles produced for
   * EUR/ZAR_OTC and NGAS/USD_OTC while the only connected client wanted
   * WTI/USD_OTC.
   *
   * Removing the key is all that is needed — the producing loops test it on
   * every pass and end on their own.
   */
  protected startStreamReaper() {
    if (this.reaperTimer) return;
    this.reaperTimer = setInterval(() => {
      try {
        for (const [key, params] of this.subscriptionParams) {
          if (!this.activeSubscriptions.has(key)) {
            this.subscriptionParams.delete(key);
            continue;
          }
          if (anyClientSubscribedTo(params.type, params.symbol, params.interval)) {
            this.reapStrikes.delete(key);
            continue;
          }

          /* Two consecutive sweeps, not one.
             Several devices switching asset and reconnecting means a
             subscription can be momentarily invisible in the registry while a
             client is mid-reconnect. Acting on a single sweep would stop a feed
             people are actively watching, to save an upstream call. Requiring
             the key to look unwanted twice in a row costs another 30s of
             bandwidth and removes that whole class of mistake. */
          const strikes = (this.reapStrikes.get(key) || 0) + 1;
          if (strikes < 2) {
            this.reapStrikes.set(key, strikes);
            continue;
          }

          console.info(
            `[market] no subscribers left for ${key} — stopping the stream`
          );
          this.reapStrikes.delete(key);
          this.activeSubscriptions.delete(key);
          this.subscriptionParams.delete(key);
        }
      } catch (err) {
        // Never let the sweep throw: it runs on a timer, and an unhandled
        // rejection here would take the process down over wasted bandwidth.
        console.error("[market] stream reaper failed:", err);
      }
    }, 30000);
  }
  protected exchange: any = null;
  protected symbolToStreamKey: { [key: string]: string } = {};

  constructor() {}

  protected flushBuffer(type: string) {
    Object.entries(this.accumulatedBuffer).forEach(([streamKey, data]) => {
      if (Object.keys(data).length > 0) {
        // Normalize the payload key order to match frontend: type, limit, interval, symbol
        const payload: any = { type: data.payload.type };
        if (data.payload.limit !== undefined) payload.limit = data.payload.limit;
        if (data.payload.interval !== undefined) payload.interval = data.payload.interval;
        payload.symbol = data.symbol;

        logDebugOtc(`flushBuffer flushing streamKey: ${streamKey}, payload: ${JSON.stringify(payload)}`);

        sendMessageToRoute("/api/exchange/market", payload, {
          stream: streamKey, // Do not include the symbol in the stream key for frontend
          data: data.msg,
          timestamp: data.timestamp || Date.now(),
        });
        delete this.accumulatedBuffer[streamKey];
      }
    });
  }

  protected async fetchDataWithRetries(fetchFunction: () => Promise<any>) {
    if (Date.now() < this.unblockTime) {
      throw new Error(
        `Blocked until ${new Date(this.unblockTime).toLocaleString()}`
      );
    }
    return await fetchFunction();
  }

  /**
   * Starts a producer, and guarantees exactly one per stream.
   *
   * The guard matters as much as the tracking. The supervisor and an incoming
   * SUBSCRIBE can both decide a stream needs starting within the same moment,
   * and two producers on one stream would each write the same candle into the
   * buffer and fight over when to stop.
   */
  protected handleSubscription(
    symbol: string,
    type: string,
    interval?: string,
    limit?: number
  ) {
    const key = BaseMarketDataHandler.streamKey(symbol, type, interval, limit);
    if (this.runningStreams.has(key)) return;
    this.runningStreams.add(key);

    Promise.resolve(this.runStream(symbol, type, interval, limit))
      .catch((err) => {
        console.error(`[market] stream ${key} ended with an error:`, err);
      })
      .finally(() => {
        // Released here rather than anywhere inside runStream, which returns
        // from several places — a producer that exits without clearing this
        // would look alive forever and could never be restarted.
        this.runningStreams.delete(key);
      });
  }

  private async runStream(
    symbol: string,
    type: string,
    interval?: string,
    limit?: number
  ) {
    const frontendStreamKey = `${type}${interval ? `:${interval}` : ""}${
      limit ? `:${limit}` : ""
    }:${symbol}`;
    // internalStreamKey must match exactly what start() stores in activeSubscriptions
    const internalStreamKey = `${symbol}:${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}`;

    this.symbolToStreamKey[frontendStreamKey] = symbol;

    if (symbol.toUpperCase().endsWith("OTC") || symbol.toUpperCase().includes("OTC")) {

      // Clear stale buffer from any previous subscription for this stream
      delete this.accumulatedBuffer[frontendStreamKey];

      // Map Vortex symbol format (EUR/USD/OTC) → BideX asset name (EUR/USD (OTC))
      const sym = symbol.toUpperCase();
      let bidexAsset = symbol;
      if (sym.endsWith("/OTC"))       bidexAsset = symbol.slice(0, -4) + " (OTC)";
      else if (sym.includes("_OTC")) bidexAsset = symbol.replace(/_OTC/i, " (OTC)");

      const BIDEX_API = process.env.BIDEX_API_URL || process.env.BINDEX_API_URL || "http://localhost:8001";
      /* No baked-in fallback. A literal key here is a credential published to
         everyone with repository access, and it survives in git history whether
         or not it is still valid — this one had already been superseded on the
         provider, so it bought nothing and leaked regardless. Missing config
         should announce itself as a 403 from the provider, which is diagnosable,
         rather than silently authenticate as some other identity. */
      const BIDEX_KEY = process.env.BIDEX_API_KEY;
      const durationMs = interval ? getIntervalDurationMs(interval) : 60000;
      // BideX uses numeric interval: "1m" → "1", "5m" → "5", etc.
      const intervalNum = vortexToTvResolution(interval || "1m");

      logDebugOtc(`OTC block entered: symbol=${symbol} bidexAsset=${bidexAsset} type=${type}`);

      // ─────────────────────────────────────────────────────────────────
      // PATH A — OHLCV: Poll BideX REST API every 1 second.
      // This is the ground-truth approach: BideX Terminal's own chart
      // uses the same /api/chart endpoint. By polling it we get
      // bit-for-bit identical candle data with no parsing complexity.
      // ─────────────────────────────────────────────────────────────────
      if (type === "ohlcv") {
        // ─────────────────────────────────────────────────────────────────
        // ALL TIMEFRAMES: Use the live BideX WebSocket tick stream.
        // For 1m: pass through tick candle directly (1m bucket = tick bucket).
        // For 3m/5m/15m/1h/etc: accumulate incoming 1m ticks into a
        // multi-minute bucket aligned to the requested timeframe interval.
        // This ensures ALL timeframes are driven by the same real-time source
        // as 1m — no polling lag, no stale REST data.
        // ─────────────────────────────────────────────────────────────────
        console.log(`[OTC-WS→OHLCV] Starting WS subscriber for ${bidexAsset} (interval=${interval})`);

        // Multi-minute accumulator state (only used for non-1m timeframes)
        let lastCachedTickTs: number = 0;
        let completedBase: CompletedBase | null = null;
        const isOneMins = (interval === "1m" || interval === "1");

        let unsubscribeOtc: (() => void) | null = null;
        unsubscribeOtc = await OtcWebSocketSubscriber.getInstance().subscribe(symbol, async (tick) => {
          try {
            const tickCandleTs  = Number(tick.candle_start_ts);  // 1m bucket start (ms)
            const tickOpen      = Number(tick.open);
            const tickHigh      = Number(tick.high);
            const tickLow       = Number(tick.low);
            const tickClose     = Number(tick.close);
            const tickVolume    = Number(tick.volume || 1);

            if (tickClose > 0) {
              getSyncRedis().set(`otc:${bidexAsset}:last_price`, String(tickClose)).catch(() => {});
              // Freshness marker so consumers can detect a frozen feed and halt.
              getSyncRedis().set(`otc:${bidexAsset}:last_price_ts`, String(Date.now())).catch(() => {});
            }

            const isSeconds = interval && interval.endsWith("s");
            const tickTime = isSeconds ? Number(tick.timestamp || Date.now()) : Number(tick.candle_start_ts);

            let candle: [number,number,number,number,number,number];

            if (isOneMins) {
              // 1m: use tick directly — no accumulation needed
              candle = [tickCandleTs, tickOpen, tickHigh, tickLow, tickClose, tickVolume];
            } else if (isSeconds) {
              // Seconds timeframes: align bucket start using actual tick time
              const alignedBucketTs = Math.floor(tickTime / durationMs) * durationMs;
              
              let active = activeSecondsCandles.get(frontendStreamKey);
              if (!active || active.timestamp !== alignedBucketTs) {
                active = {
                  timestamp: alignedBucketTs,
                  open: tickClose,
                  high: tickClose,
                  low: tickClose,
                  close: tickClose,
                  volume: 0
                };
                activeSecondsCandles.set(frontendStreamKey, active);
              }
              
              active.high = Math.max(active.high, tickClose);
              active.low = Math.min(active.low, tickClose);
              active.close = tickClose;
              active.volume += tickVolume;
              
              candle = [active.timestamp, active.open, active.high, active.low, active.close, active.volume];
            } else {
              // Non-1m and Non-Seconds (multi-minute/hour/day): align using tickCandleTs
              const alignedBucketTs = Math.floor(tickCandleTs / durationMs) * durationMs;

              if (tickCandleTs !== lastCachedTickTs) {
                lastCachedTickTs = tickCandleTs;
                completedBase = await fetchCompletedBase(symbol, alignedBucketTs, tickCandleTs);
              }

              if (completedBase) {
                candle = [
                  alignedBucketTs,
                  completedBase.open,
                  Math.max(completedBase.high, tickHigh),
                  Math.min(completedBase.low, tickLow),
                  tickClose,
                  completedBase.volume + tickVolume
                ];
              } else {
                // Fallback to tick directly if no completed candles exist in the current timeframe bucket
                candle = [alignedBucketTs, tickOpen, tickHigh, tickLow, tickClose, tickVolume];
              }
            }

            this.accumulatedBuffer[frontendStreamKey] = {
              symbol,
              msg: [candle],
              payload: { type, interval, limit },
              timestamp: Number(tick.timestamp || Date.now()),
            };
          } catch (err) {
            console.error("Error handling OTC ohlcv WS update:", err);
          }
        });

        while (
          this.activeSubscriptions.has(internalStreamKey) &&
          hasClients(`/api/exchange/market`)
        ) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (unsubscribeOtc) unsubscribeOtc();
        this.activeSubscriptions.delete(internalStreamKey);
        console.log(`[OTC-WS→OHLCV] Stopped WS subscriber for ${bidexAsset} (interval=${interval})`);
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // PATH B — ticker / trades / orderbook: use BideX WS ticks.
      // ─────────────────────────────────────────────────────────────────
      let unsubscribeOtc: (() => void) | null = null;
      let activeCandle: [number,number,number,number,number,number] | null = null;

      unsubscribeOtc = await OtcWebSocketSubscriber.getInstance().subscribe(symbol, (tick) => {
        try {
          const timestamp = Number(tick.timestamp || Date.now());
          const price     = Number(tick.price);
          const volume    = Number(tick.volume || 0.1);

          if (price > 0) {
            getSyncRedis().set(`otc:${bidexAsset}:last_price`, price.toString()).catch(() => {});
            getSyncRedis().set(`otc:${bidexAsset}:last_price_ts`, String(Date.now())).catch(() => {});
          }

          let msgToSend: any;

          if (type === "ticker") {
            msgToSend = {
              symbol, timestamp,
              datetime: new Date(timestamp).toISOString(),
              high:  activeCandle ? activeCandle[2] : price,
              low:   activeCandle ? activeCandle[3] : price,
              close: price, last: price,
              change:     activeCandle ? (price - activeCandle[1]) : 0,
              percentage: activeCandle ? ((price - activeCandle[1]) / activeCandle[1] * 100) : 0,
              bid: price - 0.0005,
              ask: price + 0.0005,
            };
          } else if (type === "trades") {
            msgToSend = [{
              id: `otc_${timestamp}_${Math.random()}`,
              timestamp, datetime: new Date(timestamp).toISOString(),
              symbol, side: tick.side?.toLowerCase() || "buy",
              price, amount: volume,
            }];
          } else if (type === "orderbook") {
            msgToSend = {
              symbol, timestamp, datetime: new Date(timestamp).toISOString(),
              bids: [
                [price - 0.0001, 1.2], [price - 0.0002, 3.4],
                [price - 0.0003, 5.6], [price - 0.0004, 7.8], [price - 0.0005, 10.0],
              ],
              asks: [
                [price + 0.0001, 1.1], [price + 0.0002, 2.3],
                [price + 0.0003, 4.5], [price + 0.0004, 6.7], [price + 0.0005, 9.9],
              ],
            };
          }

          if (msgToSend) {
            this.accumulatedBuffer[frontendStreamKey] = {
              symbol, msg: msgToSend, payload: { type, interval, limit },
              timestamp: Number(tick.timestamp || Date.now()),
            };
          }
        } catch (err) {
          console.error("Error handling OTC tick update:", err);
        }
      });

      while (
        this.activeSubscriptions.has(internalStreamKey) &&
        hasClients(`/api/exchange/market`)
      ) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (unsubscribeOtc) unsubscribeOtc();
      this.activeSubscriptions.delete(internalStreamKey);
      return;
    }

    const fetchData = {
      ticker: async () => ({
        msg: await this.exchange.watchTicker(symbol),
        payload: { type },
      }),
      ohlcv: async () => {
        let watchInterval = interval;
        if (interval === "2m" && (!this.exchange.timeframes || !this.exchange.timeframes["2m"])) {
          watchInterval = "1m";
        }
        const rawCandles = await this.exchange.watchOHLCV(
          symbol,
          watchInterval,
          undefined,
          Number(limit) || 1000
        );
        const msg = (interval === "2m" && watchInterval === "1m")
          ? aggregate1mTo2m(rawCandles)
          : rawCandles;
        return {
          msg,
          payload: { type, interval, limit },
        };
      },
      trades: async () => ({
        msg: await this.exchange.watchTrades(
          symbol,
          undefined,
          limit ? Number(limit) : 20
        ),
        payload: { type, limit },
      }),
      orderbook: async () => ({
        msg: await this.exchange.watchOrderBook(
          symbol,
          limit ? Number(limit) : 100
        ),
        payload: { type, limit },
      }),
    };

    while (
      this.activeSubscriptions.has(internalStreamKey) &&
      hasClients(`/api/exchange/market`)
    ) {
      try {
        if (Date.now() < this.unblockTime) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const { msg, payload } = await this.fetchDataWithRetries(() =>
          fetchData[type]()
        );
        this.accumulatedBuffer[frontendStreamKey] = { symbol, msg, payload, timestamp: Date.now() };

        await new Promise((resolve) => setTimeout(resolve, type === "ticker" ? 100 : 250));
      } catch (error) {
        logError("exchange", error, __filename);
        const result = await handleExchangeError(error, ExchangeManager);
        if (typeof result === "number") {
          this.unblockTime = result;
          await saveBanStatus(this.unblockTime);
        } else {
          this.exchange = result;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.activeSubscriptions.delete(internalStreamKey);
  }

  public async start(message: any, flushInterval: number) {
    try {
      this.unblockTime = await loadBanStatus();

      if (typeof message === "string") {
        message = JSON.parse(message);
      }

      const { symbol, type, interval, limit } = message.payload;
      this.handledType = type;

      logDebugOtc(`start method called for symbol: ${symbol}, type: ${type}, action: ${message.action}`);

      if (!this.bufferInterval) {
        this.bufferInterval = setInterval(
          () => this.flushBuffer(type),
          flushInterval
        );
      }

      const isOtc = symbol && (symbol.toUpperCase().endsWith("OTC") || symbol.toUpperCase().includes("OTC"));

      if (!isOtc) {
        if (!this.exchange) {
          this.exchange = await ExchangeManager.startExchange();
          if (!this.exchange) {
            throw new Error("Failed to start exchange");
          }
        }

        const typeMap = {
          ticker: "watchTicker",
          ohlcv: "watchOHLCV",
          trades: "watchTrades",
          orderbook: "watchOrderBook",
        };

        if (!this.exchange.has[typeMap[type]]) {
          console.info(`Endpoint ${type} is not available`);
          return;
        }
      }

      const internalStreamKey = `${symbol}:${type}${
        interval ? `:${interval}` : ""
      }${limit ? `:${limit}` : ""}`;

      if (message.action === "UNSUBSCRIBE") {
        // These handlers are singletons (OHLCVHandler.getInstance()), so
        // activeSubscriptions is shared by every connected client, and the
        // streaming loops below run `while (activeSubscriptions.has(key) && ...)`.
        //
        // Deleting the key here on the first UNSUBSCRIBE therefore stopped the
        // feed for *everyone* watching that symbol, not just the client that
        // asked. Switching chart on one device silently froze the same symbol on
        // every other device and every other account, until someone reloaded and
        // re-subscribed — which was also the long-standing "place a trade on one
        // device and the other says no chart available".
        //
        // Only tear the stream down once nobody is left watching it.
        if (!anyClientSubscribedTo(type, symbol, interval)) {
          this.activeSubscriptions.delete(internalStreamKey);
        }
        return;
      }

      /* Ensure a producer, rather than start one only when the key is new.

         The old shape assumed the key's presence meant a producer was running,
         so a client re-subscribing to a stream whose loop had already exited was
         told, in effect, "already running" — and nothing produced anything. The
         supervisor would catch it within a few seconds, but a SUBSCRIBE is the
         clearest possible signal that someone wants this data now, and it should
         not have to wait. handleSubscription is idempotent, so calling it when a
         producer really is alive costs nothing. */
      this.activeSubscriptions.add(internalStreamKey);
      this.subscriptionParams.set(internalStreamKey, { symbol, type, interval });
      this.reapStrikes.delete(internalStreamKey);
      this.handleSubscription(symbol, type, interval, limit);

      this.startStreamReaper();
      this.startStreamSupervisor();
    } catch (error) {
      logError("exchange", error, __filename);
    }
  }

  public async stop() {
    this.activeSubscriptions.clear();
    this.subscriptionParams.clear();
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
    if (this.supervisorTimer) {
      // Before the buffer interval, and before anything awaits: a supervisor
      // still ticking after stop() would restart the very streams being torn
      // down here.
      clearInterval(this.supervisorTimer);
      this.supervisorTimer = null;
    }
    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
      this.bufferInterval = null;
    }
    if (this.exchange) {
      await ExchangeManager.stopExchange();
      this.exchange = null;
    }
  }
}

export class TickerHandler extends BaseMarketDataHandler {
  private static instance: TickerHandler;

  private constructor() {
    super();
  }

  public static getInstance(): TickerHandler {
    if (!TickerHandler.instance) {
      TickerHandler.instance = new TickerHandler();
    }
    return TickerHandler.instance;
  }
}

export class OHLCVHandler extends BaseMarketDataHandler {
  private static instance: OHLCVHandler;

  private constructor() {
    super();
  }

  public static getInstance(): OHLCVHandler {
    if (!OHLCVHandler.instance) {
      OHLCVHandler.instance = new OHLCVHandler();
    }
    return OHLCVHandler.instance;
  }
}

export class TradesHandler extends BaseMarketDataHandler {
  private static instance: TradesHandler;

  private constructor() {
    super();
  }

  public static getInstance(): TradesHandler {
    if (!TradesHandler.instance) {
      TradesHandler.instance = new TradesHandler();
    }
    return TradesHandler.instance;
  }
}

export class OrderbookHandler extends BaseMarketDataHandler {
  private static instance: OrderbookHandler;

  private constructor() {
    super();
  }

  public static getInstance(): OrderbookHandler {
    if (!OrderbookHandler.instance) {
      OrderbookHandler.instance = new OrderbookHandler();
    }
    return OrderbookHandler.instance;
  }
}

export default async (data: Handler, message: any) => {
  let parsedMessage;
  if (typeof message === "string") {
    try {
      parsedMessage = JSON.parse(message);
    } catch (error) {
      logError("Invalid JSON message", error, __filename);
      return;
    }
  } else {
    parsedMessage = message;
  }

  logDebugOtc(`default export handler received message: ${JSON.stringify(parsedMessage)}`);

  const { type } = parsedMessage.payload;

  switch (type) {
    case "ticker":
      await TickerHandler.getInstance().start(parsedMessage, 100);
      break;
    case "ohlcv":
      await OHLCVHandler.getInstance().start(parsedMessage, 100);
      break;
    case "trades":
      await TradesHandler.getInstance().start(parsedMessage, 700);
      break;
    case "orderbook":
      await OrderbookHandler.getInstance().start(parsedMessage, 600);
      break;
    default:
      throw new Error(`Unknown type: ${type}`);
  }
};

function aggregate1mTo2m(candles1m: any[]): any[] {
  if (!candles1m || candles1m.length === 0) {
    return [];
  }
  const sorted1m = [...candles1m].sort((a, b) => a[0] - b[0]);
  const aggregatedMap = new Map<number, any[]>();
  for (const candle of sorted1m) {
    const [timestamp, open, high, low, close, volume] = candle;
    const t2m = Math.floor(timestamp / 120000) * 120000;
    const existing = aggregatedMap.get(t2m);
    if (!existing) {
      aggregatedMap.set(t2m, [t2m, open, high, low, close, volume]);
    } else {
      existing[2] = Math.max(existing[2], high);
      existing[3] = Math.min(existing[3], low);
      existing[4] = close;
      existing[5] = (existing[5] || 0) + (volume || 0);
    }
  }
  return Array.from(aggregatedMap.values()).sort((a, b) => a[0] - b[0]);
}
