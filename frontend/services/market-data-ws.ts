import { ConnectionStatus, wsManager } from "./ws-manager";
import { isExtensionAvailable } from "@/lib/extensions";
import { setTimeOffset as setGlobalTimeOffset, getTimeOffset as getGlobalTimeOffset } from "@/utils/time-sync";

// Export ConnectionStatus for use in other files
export { ConnectionStatus } from "./ws-manager";

// Define data types
export interface TradeData {
  id: string | number;
  price: number;
  amount: number;
  timestamp: number;
  side: "buy" | "sell";
  symbol: string;
  cost?: number;
  datetime?: string;
  info?: any;
}

export interface OrderbookData {
  bids: Array<[number, number]>; // [price, amount]
  asks: Array<[number, number]>; // [price, amount]
  timestamp: number;
  symbol: string;
  nonce?: number;
  datetime?: string;
}

export interface TickerData {
  symbol: string;
  timestamp: number;
  datetime: string;
  high: number;
  low: number;
  bid: number;
  bidVolume: number;
  ask: number;
  askVolume: number;
  vwap: number;
  open: number;
  close: number;
  last: number;
  previousClose: number;
  change: number;
  percentage: number;
  average: number;
  baseVolume: number;
  quoteVolume: number;
  info?: any;
}

export interface OHLCVData {
  stream: string;
  data: Array<[number, number, number, number, number, number]>; // [timestamp, open, high, low, close, volume]
}

export type MarketType = "spot" | "eco" | "futures";

export interface MarketDataSubscription {
  symbol: string;
  type: "orderbook" | "trades" | "ticker" | "ohlcv";
  marketType: MarketType;
  limit?: number;
  interval?: string; // For OHLCV data
}

// Helper function to get current candle timestamp
// offset: milliseconds to add to local clock to align with exchange time
function getCurrentCandleTimestamp(interval: string, offset: number = 0): number {
  const now = Date.now() + offset;
  let intervalMs = 0;

  switch (interval) {
    case "1m":
      intervalMs = 60 * 1000;
      break;
    case "2m":
      intervalMs = 2 * 60 * 1000;
      break;
    case "3m":
      intervalMs = 3 * 60 * 1000;
      break;
    case "5m":
      intervalMs = 5 * 60 * 1000;
      break;
    case "10m":
      intervalMs = 10 * 60 * 1000;
      break;
    case "15m":
      intervalMs = 15 * 60 * 1000;
      break;
    case "30m":
      intervalMs = 30 * 60 * 1000;
      break;
    case "1h":
      intervalMs = 60 * 60 * 1000;
      break;
    case "2h":
      intervalMs = 2 * 60 * 60 * 1000;
      break;
    case "4h":
      intervalMs = 4 * 60 * 60 * 1000;
      break;
    case "6h":
      intervalMs = 6 * 60 * 60 * 1000;
      break;
    case "8h":
      intervalMs = 8 * 60 * 60 * 1000;
      break;
    case "12h":
      intervalMs = 12 * 60 * 60 * 1000;
      break;
    case "1d":
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case "3d":
      intervalMs = 3 * 24 * 60 * 60 * 1000;
      break;
    case "1w":
      intervalMs = 7 * 24 * 60 * 60 * 1000;
      break;
    case "1M":
      intervalMs = 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      intervalMs = 60 * 60 * 1000; // Default to 1 hour
  }

  return Math.floor(now / intervalMs) * intervalMs;
}

/* Use a symbol key on globalThis to ensure singleton persists across HMR in
   Next.js. This must NOT be "__marketDataWs__": the chart engine
   (components/(ext)/chart-engine/dist/index.js, a compiled vendor bundle
   with no source here) embeds its own frozen copy of this exact class from
   before this repo's first commit, registered under that same string. Since
   whichever copy constructs first wins the shared slot, callers here could
   silently receive the engine's ancient instance instead of this one -
   missing every method added since (setTimeOffset/getTimeOffset included),
   throwing "not a function" on use. A distinct key keeps this service's
   instance this service's, at the cost of one extra WS connection alongside
   the engine's own internal one (harmless - the backend serves any number of
   concurrent clients). */
const MARKET_DATA_WS_KEY = Symbol.for("__marketDataWsApp__");

/**
 * How long a market connection may go silent before the transport presumes it
 * dead and rebuilds it.
 *
 * A live market feed ticks several times a second, so this is not a market
 * being quiet — it is the connection being gone. The transport's own default is
 * two minutes, which is right for the event-driven feeds (orders, tickets) but
 * far too patient for the one the chart is drawn from: that is two minutes of a
 * frozen candle that the trade panel will happily price against.
 */
const MARKET_FEED_STALENESS_MS = 30000;

// Define the market data WebSocket service
export class MarketDataWebSocketService {
  private static instance: MarketDataWebSocketService;
  private isInitialized = false;
  private activeSubscriptions: Map<string, MarketDataSubscription> = new Map();
  private callbacks: Map<string, Set<(data: any) => void>> = new Map();
  private connectedMarketTypes: Set<MarketType> = new Set();
  private subscriptionSent: Map<string, boolean> = new Map();
  private pendingSubscriptions: Map<MarketType, Set<string>> = new Map();
  private connectionStatusMap: Map<MarketType, ConnectionStatus> = new Map();
  private debug = process.env.NODE_ENV !== "production" && true;

  // Clock offset (ms) between local browser time and exchange server time.
  // Positive value means exchange is ahead of local clock.
  // Set by the chart component after loading historical bars.
  private timeOffset: number = typeof window !== "undefined"
    ? Number(localStorage.getItem("binary_time_offset") || "0")
    : 0;

  // Track active stream subscriptions to prevent duplicates
  private activeStreamSubscriptions: Map<string, Set<string>> = new Map();

  // Track which market types have status listeners registered to prevent duplicates
  private statusListenersRegistered: Set<MarketType> = new Set();

  /* Which market types have connected at least once, so a CONNECTED status can
     be told apart from a re-CONNECTED one. Only the latter implies time passed
     with no data, which is what the chart needs to know about. */
  private hasConnectedBefore: Set<MarketType> = new Set();

  // Debounce unsubscribe to prevent spam when components remount quickly
  private unsubscribeTimers: Map<string, NodeJS.Timeout> = new Map();

  // Cache last received data for each subscription to provide immediate data to late subscribers
  private lastDataCache: Map<string, any> = new Map();

  // WebSocket connections for different market types
  private wsConnections: Map<MarketType, string> = new Map();

  constructor() {
    // All backends now use /api/ prefix
    // Initialize WebSocket URLs for different market types
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const isDev = process.env.NODE_ENV === "development";
      const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";

      // In development, connect directly to backend (Next.js rewrites don't support WebSocket upgrades)
      // In production, use same host (frontend and backend are served from same domain)
      let baseWsUrl: string;
      if (process.env.NEXT_PUBLIC_WEBSOCKET_URL) {
        baseWsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
      } else if (isDev) {
        // Development: connect directly to backend port
        baseWsUrl = `${protocol}//${window.location.hostname}:${backendPort}`;
      } else {
        // Production: use same host
        baseWsUrl = `${protocol}//${window.location.host}`;
      }

      this.wsConnections.set("spot", `${baseWsUrl}/api/exchange/market`);
      this.wsConnections.set("eco", `${baseWsUrl}/api/ecosystem/market`);
      this.wsConnections.set("futures", `${baseWsUrl}/api/futures/market`);
    } else {
      // Server-side rendering fallback
      const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";
      this.wsConnections.set("spot", `ws://localhost:${backendPort}/api/exchange/market`);
      this.wsConnections.set("eco", `ws://localhost:${backendPort}/api/ecosystem/market`);
      this.wsConnections.set("futures", `ws://localhost:${backendPort}/api/futures/market`);
    }

    // Initialize connection status for all market types
    this.wsConnections.forEach((_, marketType) => {
      this.connectionStatusMap.set(marketType, ConnectionStatus.DISCONNECTED);
      this.pendingSubscriptions.set(marketType, new Set());
      this.activeStreamSubscriptions.set(marketType, new Set());
    });
  }

  // Get singleton instance - uses globalThis to survive HMR in development
  public static getInstance(): MarketDataWebSocketService {
    // Check globalThis first (survives HMR)
    if ((globalThis as any)[MARKET_DATA_WS_KEY]) {
      return (globalThis as any)[MARKET_DATA_WS_KEY];
    }

    if (!MarketDataWebSocketService.instance) {
      MarketDataWebSocketService.instance = new MarketDataWebSocketService();
      // Store in globalThis for HMR persistence
      (globalThis as any)[MARKET_DATA_WS_KEY] = MarketDataWebSocketService.instance;
    }
    return MarketDataWebSocketService.instance;
  }

  // Get appropriate limit based on provider and tick size
  public getProviderLimit(tickSize: number): number {
    const provider =
      typeof window !== "undefined" ? process.env.NEXT_PUBLIC_EXCHANGE : "bin"; // Default to binance if not specified

    // Define limits based on provider and tick size
    if (provider === "xt") {
      // XT only supports 5, 10, 20, or 50
      if (tickSize <= 0.01) return 5;
      if (tickSize <= 0.1) return 10;
      if (tickSize <= 1) return 20;
      return 50;
    } else if (provider === "kuc") {
      // Kucoin limits
      if (tickSize <= 0.01) return 50;
      if (tickSize <= 0.1) return 50;
      if (tickSize <= 1) return 100;
      return 100;
    } else {
      // Binance and others
      if (tickSize <= 0.01) return 40;
      if (tickSize <= 0.1) return 80;
      if (tickSize <= 1) return 160;
      return 320;
    }
  }

  // Initialize the WebSocket service
  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  // Format symbol for WebSocket (ensure it has a / between currency and pair)
  private formatSymbol(symbol: string): string {
    // If the symbol already contains a /, return it as is
    if (symbol.includes("/")) {
      return symbol;
    }

    // Convert other delimiters to slash format
    if (symbol.includes("-")) {
      return symbol.replace(/-/g, "/");
    }
    if (symbol.includes("_")) {
      return symbol.replace(/_/g, "/");
    }

    // For symbols without delimiters (like BTCUSDT), try to split intelligently
    const midPoint = Math.floor(symbol.length / 2);
    
    // Try different split points around the middle to find a reasonable split
    for (let i = Math.max(2, midPoint - 2); i <= Math.min(symbol.length - 2, midPoint + 2); i++) {
      const base = symbol.substring(0, i);
      const quote = symbol.substring(i);
      
      // Prefer splits where quote is 3-4 characters (common for crypto quotes)
      if (quote.length >= 3 && quote.length <= 4) {
        return `${base}/${quote}`;
      }
    }

    // Fallback: split at midpoint
    const currency = symbol.substring(0, midPoint);
    const pair = symbol.substring(midPoint);
    return `${currency}/${pair}`;
  }

  // Ensure connection for a specific market type
  private ensureConnection(marketType: MarketType): void {
    // If already connected to this market type, do nothing
    if (this.connectedMarketTypes.has(marketType)) return;

    // Get the WebSocket URL for this market type
    const url = this.wsConnections.get(marketType);
    if (!url) {
      console.error(`No WebSocket URL defined for market type: ${marketType}`);
      return;
    }

    // IMPORTANT: Add to connectedMarketTypes BEFORE calling connect
    // This prevents race conditions where multiple components call ensureConnection
    // simultaneously and both pass the check before either adds to the Set
    this.connectedMarketTypes.add(marketType);

    // Connect to the WebSocket server
    wsManager.setStalenessMs(marketType, MARKET_FEED_STALENESS_MS);
    wsManager.connect(url, marketType);

    // Add a status listener to monitor connection state (only once per market type)
    if (!this.statusListenersRegistered.has(marketType)) {
      this.statusListenersRegistered.add(marketType);
      wsManager.addStatusListener((status) => {
        // Update connection status
        this.connectionStatusMap.set(marketType, status);

        // If connection is established, re-ask for everything, then flush
        // anything queued while we were down.
        if (status === ConnectionStatus.CONNECTED) {
          const isReconnect = this.hasConnectedBefore.has(marketType);
          this.hasConnectedBefore.add(marketType);

          this.resubscribeAll(marketType);
          this.processPendingSubscriptions(marketType);

          /* Re-ask for history after a reconnection, not just after the first
             connect.

             The chart decides whether it is missing bars by comparing its newest
             candle against the clock, and it only makes that comparison when
             history loads. Nothing re-evaluates it while ticks are streaming, so
             a feed that drops and returns leaves a hole that no longer looks
             like one: the flag was last set when the data was current, and the
             first tick back arrives fresh. The gap simply stays there until the
             page is reloaded or the asset switched.

             Resubscribing restores the live stream but says nothing about the
             minutes that passed while it was gone. triggerRefetch is the chart's
             own way of asking for its window again, and a reconnection is
             exactly the moment to use it. Guarded on having connected before so
             the initial load, which is already fetching, is not made to fetch
             twice. */
          if (isReconnect) {
            try {
              const chartStore =
                (window as any).__chartStore?.getState?.() ??
                (window as any).__useChartStore?.getState?.();
              chartStore?.triggerRefetch?.();
            } catch {
              // A chart that is not mounted is not a failure worth reporting.
            }
          }
        }

        // The server tracks subscriptions per connection, so the moment this
        // one drops, everything we thought we had subscribed to is gone. The
        // local bookkeeping has to be dropped with it or we will never ask
        // again — see resubscribeAll.
        if (
          status === ConnectionStatus.DISCONNECTED ||
          status === ConnectionStatus.RECONNECTING ||
          status === ConnectionStatus.ERROR
        ) {
          this.forgetSubscriptionState(marketType);
        }

        // If connection fails permanently (after all reconnect attempts),
        // remove from connectedMarketTypes to allow new connection attempts
        if (status === ConnectionStatus.ERROR) {
          this.connectedMarketTypes.delete(marketType);
          this.statusListenersRegistered.delete(marketType);
        }
      }, marketType);
    }
  }

  /**
   * Drops the record of what we believe is subscribed on this connection.
   *
   * `activeStreamSubscriptions` and `subscriptionSent` exist to stop duplicate
   * SUBSCRIBE messages, and they do that job. But they describe a *connection*,
   * not an intent, and nothing was clearing them when the connection went away.
   * `activeSubscriptions` — what the user actually wants to watch — is
   * deliberately left intact; that is the intent, and resubscribeAll replays it.
   */
  private forgetSubscriptionState(marketType: MarketType): void {
    this.activeStreamSubscriptions.get(marketType)?.clear();

    for (const [key, sub] of this.activeSubscriptions.entries()) {
      if (sub.marketType === marketType) {
        this.subscriptionSent.delete(key);
      }
    }
  }

  /**
   * Re-sends every subscription this market type is meant to have.
   *
   * The server keeps its subscription list against the individual connection,
   * so a reconnect hands us a fresh one holding nothing. Everything has to be
   * asked for again — but the client believed it was still subscribed, and
   * sendSubscriptionMessage returns early whenever isStreamSubscribed() says a
   * stream is live. After a reconnect that was always true, so no SUBSCRIBE was
   * ever sent again: the socket came back, the terminal looked connected, and
   * not one candle arrived until the page was reloaded.
   *
   * forgetSubscriptionState() is what makes the resend possible; without
   * clearing that state first, every call below would return early exactly as
   * before. Duplicates are harmless in any case — the server ignores a
   * SUBSCRIBE for a stream it is already running.
   */
  private resubscribeAll(marketType: MarketType): void {
    this.forgetSubscriptionState(marketType);

    if (!this.activeStreamSubscriptions.has(marketType)) {
      this.activeStreamSubscriptions.set(marketType, new Set());
    }

    // Collapse to one message per distinct stream; several components commonly
    // watch the same symbol.
    const unique = new Map<string, MarketDataSubscription>();
    for (const sub of this.activeSubscriptions.values()) {
      if (sub.marketType !== marketType) continue;
      unique.set(
        `${sub.type}:${sub.symbol}:${sub.interval ?? ""}:${sub.limit ?? ""}`,
        sub
      );
    }

    for (const sub of unique.values()) {
      this.sendSubscriptionMessage(sub);
    }
  }

  // Process pending subscriptions for a market type
  private processPendingSubscriptions(marketType: MarketType): void {
    if (!this.pendingSubscriptions.has(marketType)) return;

    const pendingKeys = this.pendingSubscriptions.get(marketType)!;
    if (pendingKeys.size === 0) return;

    // Create a set of unique subscriptions to send
    const uniqueSubscriptions = new Map<string, MarketDataSubscription>();

    // Process each pending subscription
    for (const key of pendingKeys) {
      const subscription = this.activeSubscriptions.get(key);
      if (subscription) {
        // Use type and symbol as deduplication key
        const dedupeKey = `${subscription.type}:${subscription.symbol}`;
        uniqueSubscriptions.set(dedupeKey, subscription);
      }
    }

    // Send subscription messages for each unique subscription
    for (const subscription of uniqueSubscriptions.values()) {
      this.sendSubscriptionMessage(subscription);
    }

    // Clear pending subscriptions
    this.pendingSubscriptions.get(marketType)!.clear();
  }

  // Get the subscription key
  private getSubscriptionKey(
    type: string,
    symbol: string,
    marketType: MarketType,
    interval?: string
  ): string {
    return interval
      ? `${marketType}:${type}:${symbol}:${interval}`
      : `${marketType}:${type}:${symbol}`;
  }

  // Get the stream key
  private getStreamKey(
    type: string,
    limit?: number,
    interval?: string,
    symbol?: string
  ): string {
    const parts: string[] = [type];
    if (interval) {
      parts.push(interval);
    }
    if (limit) {
      parts.push(String(limit));
    }
    if (symbol) {
      parts.push(this.formatSymbol(symbol));
    }
    return parts.join(":");
  }

  // Check if a stream is already subscribed
  private isStreamSubscribed(
    streamKey: string,
    marketType: MarketType
  ): boolean {
    return (
      this.activeStreamSubscriptions.get(marketType)?.has(streamKey) || false
    );
  }

  // Normalize OHLCV data to a consistent format
  private normalizeOHLCVData(data: any, interval: string): any {
    // If data is already an array of candles, wrap it in the expected format
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      Array.isArray(data[0]) &&
      data[0].length >= 6
    ) {
      return {
        stream: `ohlcv:${interval}`,
        data: data,
      };
    }

    // If data has stream and data properties, return it as is (backend enhanced format)
    if (
      data &&
      data.stream &&
      data.stream.startsWith("ohlcv:") &&
      Array.isArray(data.data)
    ) {
      return data;
    }

    // Try to parse if it's a string
    if (typeof data === "string") {
      try {
        const parsedData = JSON.parse(data);

        if (
          parsedData &&
          parsedData.stream &&
          parsedData.stream.startsWith("ohlcv:") &&
          Array.isArray(parsedData.data)
        ) {
          return parsedData;
        }

        // Handle case where the data might be a single candle update
        if (parsedData && Array.isArray(parsedData) && parsedData.length >= 6) {
          return {
            stream: `ohlcv:${interval}`,
            data: [parsedData],
          };
        }
      } catch (e) {
        console.error("[Market Data WS] Failed to parse string data:", e);
      }
    }

    // Try to return it in the expected format anyway
    if (data && data.stream && data.data) {
      return data;
    }

    return null;
  }

  // Enhance the WebSocket service to better handle current candle updates

  // Add this function to the MarketDataWebSocketService class
  /** Set the time offset (ms) between local clock and exchange server time. */
  public setTimeOffset(offset: number): void {
    setGlobalTimeOffset(offset, true);
    this.timeOffset = offset;
    if (this.debug) {
      console.log(`[Market Data WS] Time offset updated: ${offset}ms`);
    }
  }

  /** Get the current time offset (ms). */
  public getTimeOffset(): number {
    return getGlobalTimeOffset();
  }

  private ensureCurrentCandleInMessage(message: any, interval: string): any {
    // Skip if not an OHLCV message or no data
    if (
      !message?.stream?.startsWith("ohlcv") ||
      !Array.isArray(message.data) ||
      message.data.length === 0
    ) {
      return message;
    }

    // Get the current candle timestamp (adjusted for exchange clock skew)
    const currentCandleTimestamp = getCurrentCandleTimestamp(interval, this.timeOffset);

    // Check if the current candle is in the message
    let hasCurrentCandle = false;
    for (const candleData of message.data) {
      if (Array.isArray(candleData) && candleData.length >= 6) {
        const timestamp = Number(candleData[0]);
        // Use a 5-second tolerance to account for potential timing differences
        if (Math.abs(timestamp - currentCandleTimestamp) < 5000) {
          hasCurrentCandle = true;
          break;
        }
      }
    }

    // If the current candle is not in the message, add it
    if (!hasCurrentCandle && message.data.length > 0) {
      // Get the last candle in the message
      const lastCandle = message.data[message.data.length - 1];
      if (Array.isArray(lastCandle) && lastCandle.length >= 6) {
        // Create a new candle with the current timestamp
        const newCandle = [
          currentCandleTimestamp,
          lastCandle[4], // Use the close of the last candle as the open
          lastCandle[4], // Use the close of the last candle as the high
          lastCandle[4], // Use the close of the last candle as the low
          lastCandle[4], // Use the close of the last candle as the close
          0, // Start with zero volume
        ];

        // Add the new candle to the message
        const newData = [...message.data, newCandle];

        // Sort by timestamp
        newData.sort((a, b) => a[0] - b[0]);

        // Create a new message with the updated data
        const newMessage = {
          ...message,
          data: newData,
        };

        return newMessage;
      }
    }

    return message;
  }

  // Modify the processOHLCVMessage method to use the new function
  private processCurrentCandleUpdate(message: any, interval: string): boolean {
    // First ensure the current candle is in the message
    const enhancedMessage = this.ensureCurrentCandleInMessage(
      message,
      interval
    );

    // Skip if not an OHLCV message or no data
    if (
      !enhancedMessage?.stream?.startsWith("ohlcv") ||
      !Array.isArray(enhancedMessage.data) ||
      enhancedMessage.data.length === 0
    ) {
      return false;
    }

    // Get the current candle timestamp
    const currentCandleTimestamp = getCurrentCandleTimestamp(interval, this.timeOffset);

    // Check if any of the candles in the message is the current candle
    for (const candleData of enhancedMessage.data) {
      if (Array.isArray(candleData) && candleData.length >= 6) {
        const timestamp = Number(candleData[0]);

        // Check if this is the current candle (with some tolerance for timestamp differences)
        // Use a 5-second tolerance to account for potential timing differences
        const isCurrentCandle =
          Math.abs(timestamp - currentCandleTimestamp) < 5000;

        if (isCurrentCandle) {
          return true;
        }
      }
    }

    return false;
  }

  // Subscribe to market data
  public subscribe<T>(
    subscription: MarketDataSubscription,
    callback: (data: T) => void
  ): () => void {
    if (!this.isInitialized) {
      this.initialize();
    }

    // Format the symbol to ensure it has a / between currency and pair
    const formattedSymbol = this.formatSymbol(subscription.symbol);
    const { type, marketType, interval } = subscription;

    // Determine appropriate limit based on provider if it's an orderbook subscription
    let limit = subscription.limit;
    if (type === "orderbook" && !limit) {
      // Default tick size if not specified
      const tickSize = 0.01;
      limit = this.getProviderLimit(tickSize);
    }

    // Create a new subscription object with the formatted symbol and adjusted limit
    const formattedSubscription = {
      ...subscription,
      symbol: formattedSymbol,
      limit,
    };

    const subscriptionKey = this.getSubscriptionKey(
      type,
      formattedSymbol,
      marketType,
      interval
    );
    const streamKey = this.getStreamKey(type, limit, interval, formattedSymbol);

    // Ensure we have a connection for this market type
    this.ensureConnection(marketType);

    // Register the callback
    if (!this.callbacks.has(subscriptionKey)) {
      this.callbacks.set(subscriptionKey, new Set());
    }
    this.callbacks.get(subscriptionKey)!.add(callback);

    // If we have cached data for this subscription, immediately provide it to the new callback
    if (this.lastDataCache.has(subscriptionKey)) {
      const cachedData = this.lastDataCache.get(subscriptionKey);
      
      // Check if the cached OHLCV data is stale (from a previous candle period)
      let isStale = false;
      if (type === "ohlcv" && cachedData && Array.isArray(cachedData.data) && cachedData.data.length > 0) {
        const lastCandle = cachedData.data[cachedData.data.length - 1];
        if (Array.isArray(lastCandle) && lastCandle.length > 0) {
          const lastCandleTime = Number(lastCandle[0]);
          const currentCandleTime = getCurrentCandleTimestamp(interval || "1h", this.timeOffset);
          if (lastCandleTime < currentCandleTime) {
            isStale = true;
          }
        }
      }

      if (!isStale) {
        // Call the callback immediately with cached data
        try {
          callback(cachedData);
        } catch (error) {
          console.error(`Error in immediate callback for ${subscriptionKey}:`, error);
        }
      }
    }

    // Store the subscription
    this.activeSubscriptions.set(subscriptionKey, formattedSubscription);

    // Check if we're connected
    const isConnected =
      this.connectionStatusMap.get(marketType) === ConnectionStatus.CONNECTED;

    // Cancel any pending unsubscribe for THIS EXACT SUBSCRIPTION (same symbol)
    // Use subscriptionKey instead of streamKey to ensure we only cancel if it's the SAME symbol
    if (this.unsubscribeTimers.has(subscriptionKey)) {
      clearTimeout(this.unsubscribeTimers.get(subscriptionKey)!);
      this.unsubscribeTimers.delete(subscriptionKey);
    }

    // If connected, send subscription immediately (if not already sent)
    // Otherwise, queue it for when connection is established
    if (isConnected) {
      if (
        !this.subscriptionSent.has(subscriptionKey) &&
        !this.isStreamSubscribed(streamKey, marketType)
      ) {
        this.sendSubscriptionMessage(formattedSubscription);
        this.subscriptionSent.set(subscriptionKey, true);

        // Mark this stream as subscribed
        this.activeStreamSubscriptions.get(marketType)!.add(streamKey);
      }
    } else {
      // Add to pending subscriptions
      if (!this.pendingSubscriptions.has(marketType)) {
        this.pendingSubscriptions.set(marketType, new Set());
      }
      this.pendingSubscriptions.get(marketType)!.add(subscriptionKey);
    }

    // Subscribe to the WebSocket stream for the specific market type
    wsManager.subscribe(
      streamKey,
      (data: any) => {
        try {
          // Update clock synchronization offset continuously using server timestamp if present in WebSocket payload
          if (data && typeof data.timestamp === "number") {
            const clientTime = Date.now();
            const rawOffset = data.timestamp - clientTime;
            setGlobalTimeOffset(rawOffset, false);
            this.timeOffset = getGlobalTimeOffset();
          }

          // Handle different OHLCV data formats
          if (type === "ohlcv") {
            // Normalize the data format
            const normalizedData = this.normalizeOHLCVData(
              data,
              interval || "1h"
            );

            if (!normalizedData) {
              console.error("[Market Data WS] Failed to normalize data:", data);
              return;
            }

            // Check if the interval matches - handle both formats: ohlcv:interval and ohlcv:interval:symbol
            if (interval && normalizedData.stream) {
              const streamParts = normalizedData.stream.split(":");
              const dataInterval = streamParts[1]; // Should be the interval part
              
              if (dataInterval !== interval) {
                return;
              }
            }

            // Pass normalized data directly to callbacks - do NOT add synthetic candles
            // as they cause fake visual movements on the chart
            const enrichedData = normalizedData;

            // Cache data for late subscribers
            this.lastDataCache.set(subscriptionKey, enrichedData);

            // Get callbacks for this subscription and call them
            const callbacks = this.callbacks.get(subscriptionKey);

            if (callbacks && callbacks.size > 0) {
              callbacks.forEach((cb) => {
                try {
                  cb(enrichedData as any);
                } catch (error) {
                  console.error(
                    `[Market Data WS] Error in callback for ${subscriptionKey}:`,
                    error
                  );
                }
              });
            }
            return;
          }

          // Handle data structure - check if data is wrapped in a data property
          let actualData = data;
          const dataSymbol = data.symbol; // Keep track of symbol from wrapper
          if (data.data && typeof data.data === 'object') {
            actualData = data.data;
          }



          // For orderbook and ticker data, we don't need to validate symbol since it's already filtered by subscription
          // For trades data, check if the data is for this symbol
          if (type === "trades") {
            // Check symbol from wrapper first, then from data
            const checkSymbol = dataSymbol || actualData.symbol || (Array.isArray(actualData) && actualData.length > 0 && actualData[0].symbol);
            if (checkSymbol && checkSymbol !== formattedSymbol) {
              return; // Skip if the symbol doesn't match
            }
          }

          // Ensure orderbook and ticker data have symbol property
          if ((type === "orderbook" || type === "ticker") && !actualData.symbol) {
            actualData.symbol = formattedSymbol;
            actualData.timestamp = actualData.timestamp || Date.now();
          }

          const callbacks = this.callbacks.get(subscriptionKey);
          if (callbacks) {
            // Cache the data for late subscribers
            this.lastDataCache.set(subscriptionKey, actualData);

            callbacks.forEach((cb) => {
              try {
                cb(actualData);
              } catch (error) {
                console.error(
                  `Error in callback for ${subscriptionKey}:`,
                  error
                );
              }
            });
          } else {
            console.warn(`[Market Data WS] No callbacks found for ${subscriptionKey}!`);
          }
        } catch (error) {
          console.error(
            `Error processing WebSocket data for ${subscriptionKey}:`,
            error
          );
        }
      },
      marketType
    );

    // Return unsubscribe function
    return () => {
      this.unsubscribe(formattedSubscription, callback);
    };
  }

  // Unsubscribe from market data
  public unsubscribe<T>(
    subscription: MarketDataSubscription,
    callback: (data: T) => void
  ): void {
    const { type, symbol, marketType, interval } = subscription;
    const formattedSymbol = this.formatSymbol(symbol);
    const subscriptionKey = this.getSubscriptionKey(
      type,
      formattedSymbol,
      marketType,
      interval
    );
    const streamKey = this.getStreamKey(type, subscription.limit, interval, formattedSymbol);

    // Remove the callback
    const callbacks = this.callbacks.get(subscriptionKey);
    if (callbacks) {
      callbacks.delete(callback);

      // If no more callbacks, unsubscribe from the WebSocket
      if (callbacks.size === 0) {
        // Check if any other subscriptions are using this stream BEFORE removing the current one
        let shouldUnsubscribe = true;
        for (const [key, sub] of this.activeSubscriptions.entries()) {
          if (
            key !== subscriptionKey && // Don't count the current subscription we're removing
            sub.marketType === marketType &&
            sub.type === type &&
            this.getStreamKey(sub.type, sub.limit, sub.interval, sub.symbol) === streamKey
          ) {
            shouldUnsubscribe = false;
            break;
          }
        }

        // Clean up the subscription data
        this.callbacks.delete(subscriptionKey);
        this.activeSubscriptions.delete(subscriptionKey);
        // For OHLCV, clear the cache immediately to prevent stale candle data from being
        // served to the next subscriber (e.g., after switching assets). For other types,
        // keep the cache briefly to support fast component remounts on the SAME symbol.
        if (type === "ohlcv") {
          this.lastDataCache.delete(subscriptionKey);
        }
        // Non-OHLCV cache cleared in the debounce timer below when unsubscribe is confirmed.

        // Remove from activeStreamSubscriptions IMMEDIATELY so new subscriptions can use this stream
        // This must happen before the debounce timeout to allow immediate re-subscription
        if (shouldUnsubscribe) {
          this.activeStreamSubscriptions.get(marketType)?.delete(streamKey);
        }

        // Only send unsubscribe if we previously sent a subscribe and no other subscriptions are using this stream
        if (this.subscriptionSent.has(subscriptionKey) && shouldUnsubscribe) {
          // Cancel any existing unsubscribe timer for this exact subscription
          if (this.unsubscribeTimers.has(subscriptionKey)) {
            clearTimeout(this.unsubscribeTimers.get(subscriptionKey)!);
          }

          // Debounce the unsubscribe by 100ms to handle rapid component remounts
          const timer = setTimeout(() => {
            // Double-check that no new subscriptions appeared FOR THE SAME SYMBOL during the debounce period
            let stillShouldUnsubscribe = true;
            for (const [key, sub] of this.activeSubscriptions.entries()) {
              if (
                key === subscriptionKey || // Check if the EXACT subscription (same symbol) still exists
                (
                  sub.marketType === marketType &&
                  sub.type === type &&
                  sub.symbol === formattedSymbol && // IMPORTANT: Check symbol matches
                  this.getStreamKey(sub.type, sub.limit, sub.interval, sub.symbol) === streamKey
                )
              ) {
                stillShouldUnsubscribe = false;
                break;
              }
            }

            if (stillShouldUnsubscribe) {
              this.sendUnsubscriptionMessage(subscription);
              this.subscriptionSent.delete(subscriptionKey);
              this.lastDataCache.delete(subscriptionKey);
              // Note: activeStreamSubscriptions was already deleted immediately when callbacks reached 0
            }

            this.unsubscribeTimers.delete(subscriptionKey);
          }, 100);

          this.unsubscribeTimers.set(subscriptionKey, timer);
        }

        // Remove from pending subscriptions if it's there
        if (this.pendingSubscriptions.has(marketType)) {
          this.pendingSubscriptions.get(marketType)!.delete(subscriptionKey);
        }
      }
    }
  }

  // Send a subscription message
  private sendSubscriptionMessage(subscription: MarketDataSubscription): void {
    const { symbol, type, marketType, limit, interval } = subscription;
    const formattedSymbol = this.formatSymbol(symbol);
    const streamKey = this.getStreamKey(type, limit, interval, formattedSymbol);
    const subscriptionKey = this.getSubscriptionKey(type, formattedSymbol, marketType, interval);

    // Check if this stream is already subscribed
    if (this.isStreamSubscribed(streamKey, marketType)) {
      return;
    }

    // Create the subscription message
    const message = {
      action: "SUBSCRIBE",
      payload: {
        type,
        ...(limit ? { limit } : {}),
        ...(interval ? { interval } : {}),
        symbol: formattedSymbol,
      },
    };

    // Send subscription message to the appropriate WebSocket connection
    wsManager.sendMessage(message, marketType);

    // Mark this stream as subscribed
    this.activeStreamSubscriptions.get(marketType)!.add(streamKey);

    // Mark this subscription as sent so it can be properly unsubscribed later
    this.subscriptionSent.set(subscriptionKey, true);
  }

  // Send an unsubscription message
  private sendUnsubscriptionMessage(
    subscription: MarketDataSubscription
  ): void {
    const { symbol, type, marketType, limit, interval } = subscription;
    const formattedSymbol = this.formatSymbol(symbol);
    const streamKey = this.getStreamKey(type, limit, interval, formattedSymbol);

    // Create the unsubscription message
    const message = {
      action: "UNSUBSCRIBE",
      payload: {
        type,
        ...(limit ? { limit } : {}),
        ...(interval ? { interval } : {}),
        symbol: formattedSymbol,
      },
    };

    // Send unsubscription message to the appropriate WebSocket connection
    wsManager.sendMessage(message, marketType);

    // Remove this stream from active subscriptions
    this.activeStreamSubscriptions.get(marketType)?.delete(streamKey);
  }

  // Get the API endpoint for a market type
  public getMarketEndpoint(marketType: MarketType): string {
    switch (marketType) {
      case "spot":
        return "/api/exchange/market";
      case "eco":
        return "/api/ecosystem/market";
      case "futures":
        return "/api/futures/market";
      default:
        return "/api/exchange/market";
    }
  }

  // Subscribe to connection status updates for a specific market type
  public subscribeToConnectionStatus(
    callback: (status: ConnectionStatus) => void,
    marketType: MarketType
  ): () => void {
    wsManager.addStatusListener(callback, marketType);
    return () => wsManager.removeStatusListener(callback, marketType);
  }

  // Get the current connection status for a specific market type
  public getConnectionStatus(marketType: MarketType): ConnectionStatus {
    return (
      this.connectionStatusMap.get(marketType) || ConnectionStatus.DISCONNECTED
    );
  }

  /**
   * Milliseconds since any market data last arrived, across every market type
   * this service holds a connection for. Null when there is nothing to judge:
   * no connection at all, or one that has not spoken yet.
   *
   * The connection *status* cannot answer this. A socket whose connection died
   * without a close frame stays OPEN in the browser and the status stays
   * CONNECTED, which is exactly the state a frozen chart is in. Only the arrival
   * time of a real frame distinguishes the two, so anything that gates on the
   * feed being live — the trading guard above all — asks this instead.
   */
  public getFeedSilenceMs(): number | null {
    let newest: number | null = null;
    for (const marketType of this.connectedMarketTypes) {
      const silent = wsManager.getSilenceMs(marketType);
      if (silent === null) continue;
      if (newest === null || silent < newest) newest = silent;
    }
    return newest;
  }

  // Check if we have any active subscriptions for a market type
  private hasActiveSubscriptionsForMarketType(marketType: MarketType): boolean {
    for (const subscription of this.activeSubscriptions.values()) {
      if (subscription.marketType === marketType) {
        return true;
      }
    }
    return false;
  }

  // Close connection for a market type if no active subscriptions
  private closeUnusedConnections(): void {
    for (const marketType of this.connectedMarketTypes) {
      if (!this.hasActiveSubscriptionsForMarketType(marketType)) {
        wsManager.close(marketType);
        this.connectedMarketTypes.delete(marketType);
        this.connectionStatusMap.set(marketType, ConnectionStatus.DISCONNECTED);
      }
    }
  }

  // Clean up all subscriptions
  public cleanup(): void {
    // Unsubscribe from all streams
    this.activeSubscriptions.forEach((subscription) => {
      if (
        this.subscriptionSent.has(
          this.getSubscriptionKey(
            subscription.type,
            subscription.symbol,
            subscription.marketType,
            subscription.interval
          )
        )
      ) {
        this.sendUnsubscriptionMessage(subscription);
      }
    });

    // Close all connections
    this.connectedMarketTypes.forEach((marketType) => {
      wsManager.close(marketType);
      this.connectionStatusMap.set(marketType, ConnectionStatus.DISCONNECTED);
    });

    // Clear all maps and sets
    this.activeSubscriptions.clear();
    this.callbacks.clear();
    this.connectedMarketTypes.clear();
    this.subscriptionSent.clear();
    this.activeStreamSubscriptions.forEach((set) => set.clear());
    this.statusListenersRegistered.clear();

    // Clear pending subscriptions
    this.pendingSubscriptions.forEach((set) => set.clear());

    // Reset initialization flag
    this.isInitialized = false;
  }
}

// Export singleton instance
export const marketDataWs = MarketDataWebSocketService.getInstance();
