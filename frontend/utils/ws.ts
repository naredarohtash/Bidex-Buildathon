// WebSocketManager.ts
export interface WebSocketManagerConfig {
  pingIntervalMs?: number; // default 30000ms
  stalenessMs?: number; // close if nothing arrives for this long; default 120000ms
  reconnectInterval?: number; // first retry delay, doubles from here; default 1000ms
  maxReconnectDelayMs?: number; // ceiling for the backoff; default 30000ms
  maxReconnectAttempts?: number; // default Infinity — see reconnect()
}

class WebSocketManager {
  public url: string;
  public ws: WebSocket | null = null;
  public manualDisconnect: boolean = false;
  private listeners: Record<string, ((...args: any[]) => void)[]> = {};
  private reconnectInterval: number;
  private maxReconnectDelayMs: number;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Heartbeat
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private pingIntervalMs: number;
  private stalenessMs: number;
  private lastMessageAt: number = 0;

  constructor(wsPath: string, config?: WebSocketManagerConfig) {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const isDev = process.env.NODE_ENV === "development";
    const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";
    // In development, connect directly to backend (Next.js rewrites don't support WebSocket upgrades)
    const wsHost = isDev ? `${window.location.hostname}:${backendPort}` : window.location.host;
    this.url = `${wsProtocol}//${wsHost}${wsPath}`;

    // Set configurable parameters with defaults.
    this.pingIntervalMs = config?.pingIntervalMs || 30000;
    this.stalenessMs = config?.stalenessMs || 120000;
    this.reconnectInterval = config?.reconnectInterval || 1000;
    this.maxReconnectDelayMs = config?.maxReconnectDelayMs || 30000;
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? Infinity;

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleWake);
      document.addEventListener("visibilitychange", this.handleWake);
    }
  }

  connect() {
    // CLOSING has to be excluded as well as OPEN and CONNECTING. The old guard
    // only skipped when the socket was CLOSED, so a retry that landed mid-close
    // fell through and was silently dropped.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.CLOSING)
    ) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("WebSocket connection opened.");
      this.manualDisconnect = false;
      this.listeners["open"]?.forEach((cb) => cb());
      this.reconnectAttempts = 0;
      // startPing() existed but was never called from anywhere, so the
      // heartbeat had never actually run. That is what froze the chart.
      //
      // Two things go wrong without it. Cloudflare closes a WebSocket that has
      // been idle for roughly 100 seconds, and nothing was keeping this one
      // busy. Worse, when a connection dies without a close frame — a wifi
      // change, a NAT table expiring, Cloudflare dropping it mid-flight — the
      // browser leaves readyState at OPEN indefinitely. onclose never fires, so
      // reconnect() is never reached, and the terminal sits holding a socket it
      // believes is live while no data arrives. Only a refresh recovers it.
      //
      // The ping keeps the connection from going idle, and the pong timeout is
      // what detects the silent death and forces the close that triggers a
      // reconnect.
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      // Any inbound frame proves the connection is alive, not just a PONG.
      this.lastMessageAt = Date.now();

      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        console.error("Error parsing message:", e);
        return;
      }
      // If the server sends a PONG (in response to our PING), clear our pong timeout.
      if (message.type === "PONG") {
        return;
      }
      // If the server sends a PING, reply with a PONG.
      if (message.type === "PING") {
        this.send({ type: "PONG" });
        return;
      }
      // Process other messages.
      this.listeners["message"]?.forEach((cb) => cb(message));
    };

    this.ws.onclose = () => {
      // Only log if not a manual disconnect
      if (!this.manualDisconnect) {
        console.log("WebSocket connection closed");
      }
      this.listeners["close"]?.forEach((cb) => cb());
      this.stopPing();
      if (!this.manualDisconnect) {
        this.reconnect();
      }
    };

    this.ws.onerror = (error: Event) => {
      // Only log errors if not manually disconnecting
      // This prevents spurious errors when navigating away
      if (!this.manualDisconnect) {
        console.error("WebSocket error:", error);
      }
    };
  }

  disconnect() {
    this.manualDisconnect = true;

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleWake);
      document.removeEventListener("visibilitychange", this.handleWake);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Only close if not already closing/closed
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch (e) {
          // Ignore close errors during cleanup
        }
      }
      this.ws = null;
    }
    this.stopPing();
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (!this.manualDisconnect) {
      console.error("WebSocket connection not open.");
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback
      );
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Retries forever by default, with an exponential backoff capped at 30s.
   *
   * This used to stop after ten tries at a flat five seconds — fifty seconds of
   * effort, and then it gave up permanently. Any outage longer than that (a
   * deploy, a laptop asleep, a router restarting) left the terminal dead until
   * the user reloaded, and because every client counts down together they all
   * went dark at the same moment.
   *
   * Backing off matters as much as persisting: without it, every open tab
   * hammers the server at a fixed interval the instant it comes back up, which
   * is exactly when it can least afford it. The jitter spreads the herd out so
   * reconnections don't arrive in lockstep.
   */
  reconnect() {
    if (this.manualDisconnect) return;
    if (this.reconnectTimer) return; // one attempt in flight at a time
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached, giving up.");
      return;
    }

    const ceiling = Math.min(
      this.reconnectInterval * 2 ** this.reconnectAttempts,
      this.maxReconnectDelayMs
    );
    // 50-100% of the ceiling, so clients don't all return in lockstep.
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * A tab coming back to the foreground, or the network returning, is a much
   * better signal than whatever the backoff timer happens to be waiting on. The
   * common case is a laptop lid closed for an hour: the backoff is sitting on a
   * 30s ceiling and the socket is long dead, and without this the user watches a
   * frozen chart until the timer elapses. Reset and retry immediately instead.
   */
  private handleWake = () => {
    if (this.manualDisconnect) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (this.isConnected()) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  };

  // --- Heartbeat ---
  /**
   * Sends a PING on an interval and closes the socket if nothing has come back
   * from the server for a long time.
   *
   * Deliberately NOT a strict ping/pong: the server does not implement a PONG
   * reply. A timeout armed on each PING and cleared only by a matching PONG
   * would therefore expire every single time and tear down a perfectly healthy
   * connection every forty seconds — trading a chart that freezes occasionally
   * for one that drops constantly.
   *
   * So liveness is judged on any inbound frame, and the PING exists only to
   * keep traffic moving: Cloudflare closes a WebSocket left idle for about a
   * hundred seconds, and an unanswered ping still resets that clock. If a PONG
   * reply is ever added server-side, it counts as inbound data and this gets
   * sharper at no cost.
   */
  private startPing() {
    this.stopPing(); // never leave a previous interval running
    this.lastMessageAt = Date.now();
    this.pingIntervalId = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      this.send({ type: "PING" });

      if (Date.now() - this.lastMessageAt > this.stalenessMs) {
        /* warn, not error.

           Nothing here has failed. This is the watchdog doing its job: a socket
           has gone quiet for two minutes, so it is torn down and the reconnect
           below picks it straight back up. Reporting a successful self-heal at
           error level put a red entry in the console and, under Next's dev
           overlay, threw a full-screen error dialog over a running terminal for
           an event the code recovers from unaided.

           It also costs more than noise: an error that appears during normal
           operation teaches whoever sees it that errors here are ignorable,
           which is exactly the wrong lesson for the one console a trader might
           actually open. */
        console.warn(
          `[ws] no data for ${Math.round(
            (Date.now() - this.lastMessageAt) / 1000
          )}s — recycling the connection`
        );
        // Forces onclose, which is what schedules the reconnect. Without this a
        // silently dead socket would never be noticed.
        try {
          this.ws.close();
        } catch (e) {
          // Ignore — the close handler still runs.
        }
      }
    }, this.pingIntervalMs);
  }

  private stopPing() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}

export default WebSocketManager;
