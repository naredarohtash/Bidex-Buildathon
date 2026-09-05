export enum ConnectionStatus {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

type MessageCallback = (data: any) => void;
type StatusCallback = (status: ConnectionStatus) => void;

export type MarketType = "spot" | "eco" | "futures";

/* Use a symbol key on globalThis to ensure singleton persists across HMR in
   Next.js. Not "__wsManager__" - the chart engine (a compiled vendor bundle
   with no source here, frozen since before this repo's first commit) embeds
   its own copy of this exact transport under that same string, and whichever
   copy constructs first wins the shared slot. That frozen copy is driven
   only by the engine's own internal call sequence; a real caller here
   (market-data-ws.ts, after it stopped colliding under its own key - see the
   comment there) got handed that instance instead of a fresh one and its
   connect()/send() calls raced against state the frozen copy wasn't
   expecting, surfacing as "WebSocket error for spot: {}" and "Cannot send
   message: WebSocket for spot is not open". A distinct key keeps this
   transport this service's own. */
const WS_MANAGER_KEY = Symbol.for("__wsManagerApp__");

class WebSocketManager {
  private static instance: WebSocketManager;
  private connections: Map<string, WebSocket> = new Map();
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private connectionUrls: Map<string, string> = new Map(); // Store URLs for reconnection
  private intentionallyClosed: Set<string> = new Set(); // Track intentional closes
  private subscriptions: Map<string, Map<string, Set<MessageCallback>>> =
    new Map();
  private statusListeners: Map<string, Set<StatusCallback>> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private messageQueues: Map<string, any[]> = new Map(); // Queue messages until connection is ready
  private reconnectDelay = 1000; // First retry delay; doubles from here
  private maxReconnectDelay = 30000; // Ceiling for the backoff
  private debug = process.env.NODE_ENV !== "production"; // Enable debug in development

  // Liveness tracking. A WebSocket whose connection dies without a close frame
  // — wifi handover, NAT table expiry, Cloudflare dropping it mid-flight —
  // stays at readyState OPEN in the browser forever. No close event fires, so
  // nothing above ever learns the feed is gone and the chart simply stops
  // moving. Watching how long it has been since the last frame arrived is the
  // only way to notice from this side.
  private lastMessageAt: Map<string, number> = new Map();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  /* The poll has to be short relative to the shortest staleness bar in use, or
     the bar means nothing: a 30s poll against a 30s bar detects a dead feed
     somewhere between 30 and 60 seconds late. The work per tick is reading a
     number per connection, so the rate is free. */
  private healthCheckMs = 10000;
  private stalenessMs = 120000;

  /**
   * Per-connection override of `stalenessMs`.
   *
   * The default is deliberately generous because most connections here are
   * event-driven — an order feed with no orders on it is quiet and healthy, and
   * closing it over that would be pure churn. A market data feed is the opposite:
   * it ticks continuously, so silence is evidence rather than calm, and it is
   * what the chart is drawn from. Those connections declare a much shorter bar
   * for themselves (see market-data-ws.ts) instead of every connection paying
   * for the strictest case.
   */
  private connectionStaleness: Map<string, number> = new Map();

  /**
   * The staleness bar applied at the moment a tab comes back, which is much
   * lower than the one applied to a tab that has been in front of you all along.
   *
   * `stalenessMs` is deliberately generous because a quiet minute on a live feed
   * is normal and churning the socket over it is worse than waiting. Coming back
   * from the background is not that situation: either frames kept arriving and
   * this is a few hundred milliseconds old, or the connection is gone. Ten
   * seconds separates those two cleanly, and a false positive costs one
   * reconnect.
   */
  private wakeStalenessMs = 10000;
  /**
   * Frames buffered while the tab was frozen are delivered when it resumes, but
   * not before `visibilitychange` fires. Auditing on that event directly would
   * read a `lastMessageAt` from before the freeze and condemn a socket that is
   * about to prove itself. This is the grace period for those frames to land.
   */
  private wakeAuditDelayMs = 400;
  private wakeAuditTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    // A tab returning to the foreground or the network coming back are far
    // better signals than whatever the backoff timer is waiting on. The usual
    // case is a laptop closed for an hour: the socket is long dead and the
    // backoff is sitting on its 30s ceiling.
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleWake);
      document.addEventListener("visibilitychange", this.handleWake);
      /* visibilitychange is the main signal but not the only one that matters.
         A page restored from the back/forward cache — iOS Safari's usual answer
         to returning from another app — resumes with its sockets already torn
         down and fires pageshow, not necessarily a visibility transition. focus
         covers the desktop case of a window that was never hidden, only behind
         another one, on a machine that has since been asleep. Both land in the
         same audit, which is idempotent and cheap, so extra firings cost
         nothing. */
      window.addEventListener("pageshow", this.handleWake);
      window.addEventListener("focus", this.handleWake);
    }
  }

  /**
   * Declares how long this connection may go silent before it is presumed dead.
   *
   * Callers know what their own traffic looks like; this manager does not.
   */
  public setStalenessMs(connectionId: string, ms: number): void {
    this.connectionStaleness.set(connectionId, ms);
  }

  /**
   * How long since a frame last arrived on this connection, or null when that
   * cannot be judged — no socket at all, or one that has yet to say anything.
   *
   * This is the only honest measure of whether a feed is live: readyState says
   * OPEN on a socket whose connection died without a close frame, and the
   * status map believes it. Callers that gate on live data (the trading feed
   * guard) should ask this, not the status.
   */
  public getSilenceMs(connectionId = "default"): number | null {
    if (!this.connections.has(connectionId)) return null;
    const last = this.lastMessageAt.get(connectionId);
    if (!last) return null;
    return Date.now() - last;
  }

  /** Per-connection liveness, for diagnostics. */
  public describeConnections(): Array<{
    id: string;
    readyState: number;
    status: ConnectionStatus;
    silentMs: number | null;
  }> {
    const out: Array<{
      id: string;
      readyState: number;
      status: ConnectionStatus;
      silentMs: number | null;
    }> = [];
    this.connections.forEach((socket, id) => {
      out.push({
        id,
        readyState: socket.readyState,
        status: this.connectionStatus.get(id) || ConnectionStatus.DISCONNECTED,
        silentMs: this.getSilenceMs(id),
      });
    });
    return out;
  }

  // Get singleton instance - uses globalThis to survive HMR in development
  public static getInstance(): WebSocketManager {
    // Check globalThis first (survives HMR)
    if ((globalThis as any)[WS_MANAGER_KEY]) {
      return (globalThis as any)[WS_MANAGER_KEY];
    }

    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
      // Store in globalThis for HMR persistence
      (globalThis as any)[WS_MANAGER_KEY] = WebSocketManager.instance;
    }
    return WebSocketManager.instance;
  }

  // Connect to a WebSocket server
  public connect(url: string, connectionId = "default"): void {
    // If already connecting, connected, or reconnecting, do nothing
    // IMPORTANT: Check status FIRST to handle race conditions where multiple
    // components call connect() nearly simultaneously. The status is set to
    // CONNECTING before the WebSocket is created, preventing duplicate connections.
    const currentStatus = this.connectionStatus.get(connectionId);
    if (
      currentStatus === ConnectionStatus.CONNECTED ||
      currentStatus === ConnectionStatus.CONNECTING ||
      currentStatus === ConnectionStatus.RECONNECTING
    ) {
      return;
    }

    // If there's an existing connection that's closing, clean it up first
    const existingConnection = this.connections.get(connectionId);
    if (existingConnection) {
      if (existingConnection.readyState === WebSocket.OPEN || existingConnection.readyState === WebSocket.CONNECTING) {
        existingConnection.close();
      }
      this.connections.delete(connectionId);
    }

    // Clear intentionally closed flag since we're making a new connection
    this.intentionallyClosed.delete(connectionId);

    // Store the URL for potential reconnection
    this.connectionUrls.set(connectionId, url);

    // Initialize message queue for this connection if it doesn't exist
    if (!this.messageQueues.has(connectionId)) {
      this.messageQueues.set(connectionId, []);
    }

    // Update connection status FIRST to prevent race conditions
    // This must happen before any async operations
    this.connectionStatus.set(connectionId, ConnectionStatus.CONNECTING);
    this.notifyStatusListeners(connectionId);

    // Create a new WebSocket connection
    // Note: WebSocket in browser automatically includes cookies for same-origin requests
    try {
      // Get access token from cookies if available
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };

      const accessToken = getCookie('accessToken');

      // Convert relative path to full WebSocket URL
      let resolvedUrl = url;
      if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const isDev = process.env.NODE_ENV === "development";
        const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";
        // In development, connect directly to backend (Next.js rewrites don't support WebSocket upgrades)
        const host = isDev ? `${window.location.hostname}:${backendPort}` : window.location.host;
        // Ensure the path has a leading slash
        const path = url.startsWith('/') ? url : `/${url}`;
        resolvedUrl = `${protocol}//${host}${path}`;
      }

      // Add token to URL if available (for authentication)
      let authUrl = resolvedUrl;
      if (accessToken) {
        const separator = resolvedUrl.includes('?') ? '&' : '?';
        authUrl = `${resolvedUrl}${separator}token=${accessToken}`;
      }

      const ws = new WebSocket(authUrl);

      // Set up event handlers
      ws.onopen = () => this.handleOpen(connectionId);
      ws.onmessage = (event) => this.handleMessage(event, connectionId);
      ws.onclose = () => this.handleClose(connectionId, url);
      ws.onerror = (error) => this.handleError(error, connectionId);

      // Store the connection
      this.connections.set(connectionId, ws);
    } catch (error) {
      console.error(
        `Error creating WebSocket connection for ${connectionId}:`,
        error
      );
      // Reset status on error so retry can work
      this.connectionStatus.set(connectionId, ConnectionStatus.ERROR);
      this.handleError(new Event("error"), connectionId);
    }
  }

  // Handle WebSocket open event
  private handleOpen(connectionId: string): void {
    this.connectionStatus.set(connectionId, ConnectionStatus.CONNECTED);
    this.reconnectAttempts.set(connectionId, 0); // Reset reconnect attempts
    this.lastMessageAt.set(connectionId, Date.now());
    this.startHealthCheck();
    this.notifyStatusListeners(connectionId);

    // Process any queued messages
    this.processMessageQueue(connectionId);
  }

  // Process queued messages
  private processMessageQueue(connectionId: string): void {
    if (!this.messageQueues.has(connectionId)) return;

    const queue = this.messageQueues.get(connectionId)!;
    if (queue.length === 0) return;

    // Send all queued messages
    while (queue.length > 0) {
      const message = queue.shift()!;
      this.sendMessageImmediate(message, connectionId);
    }
  }

  // Handle WebSocket message event
  private handleMessage(event: MessageEvent, connectionId: string): void {
    // Any frame at all proves the connection is alive, whatever it carries.
    this.lastMessageAt.set(connectionId, Date.now());

    try {
      const data = JSON.parse(event.data);
      // Handle different message formats
      let streamKey = data.stream || "default";

      // Special handling for support ticket messages
      if (data.method === "reply" && data.payload?.id) {
        streamKey = `ticket-${data.payload.id}`;
      } else if (data.method === "update" && data.payload?.id) {
        streamKey = `ticket-${data.payload.id}`;
      }

      // Notify subscribers
      if (this.subscriptions.has(connectionId)) {
        const connectionSubscriptions = this.subscriptions.get(connectionId)!;
        if (connectionSubscriptions.has(streamKey)) {
          const callbacks = connectionSubscriptions.get(streamKey)!;
          callbacks.forEach((callback) => {
            try {
              callback(data.data || data);
            } catch (error) {
              console.error(`Error in callback for ${streamKey}:`, error);
            }
          });
        }
      }
    } catch (error) {
      console.error(
        `Error parsing WebSocket message for ${connectionId}:`,
        error
      );
    }
  }

  // Handle WebSocket close event
  private handleClose(connectionId: string, url: string): void {
    // Check if this was an intentional close
    const wasIntentionallyClosed = this.intentionallyClosed.has(connectionId);

    this.connections.delete(connectionId);

    // Only update status and reconnect if this wasn't an intentional close
    if (!wasIntentionallyClosed) {
      this.connectionStatus.set(connectionId, ConnectionStatus.DISCONNECTED);
      this.notifyStatusListeners(connectionId);

      // Attempt to reconnect only for unintentional disconnections
      this.reconnect(connectionId, url);
    }
  }

  // Handle WebSocket error event
  private handleError(error: Event, connectionId: string): void {
    console.error(`WebSocket error for ${connectionId}:`, error);
  }

  // Attempt to reconnect to the WebSocket server
  private reconnect(connectionId: string, url: string): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeouts.has(connectionId)) {
      clearTimeout(this.reconnectTimeouts.get(connectionId)!);
    }

    // Get current reconnect attempts
    const attempts = this.reconnectAttempts.get(connectionId) || 0;

    // Update connection status
    this.connectionStatus.set(connectionId, ConnectionStatus.RECONNECTING);
    this.notifyStatusListeners(connectionId);

    // Exponential backoff, with jitter so that every open tab does not come
    // back at the same instant and hit the server in lockstep — which is
    // precisely when it can least afford it, since the common cause of a mass
    // disconnect is the server having just restarted.
    const ceiling = Math.min(
      this.reconnectDelay * Math.pow(2, attempts),
      this.maxReconnectDelay
    );
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);

    // Retries continue indefinitely. This used to stop after five attempts,
    // which with the backoff above is about thirty seconds of trying before it
    // gave up for good — shorter than a deploy, a lift ride, or a router
    // restarting. After that the terminal stayed dead until a manual reload.
    const timeout = setTimeout(() => {
      this.reconnectTimeouts.delete(connectionId);
      this.reconnectAttempts.set(connectionId, attempts + 1);

      // Hand the status back to DISCONNECTED before reconnecting. connect()
      // returns early when it sees CONNECTED, CONNECTING or RECONNECTING, and
      // the line above set RECONNECTING — so this timer called connect() and
      // connect() immediately returned, every single time. The retry never ran
      // at all, and the first disconnection of any kind froze the terminal
      // permanently. The guard is right; it just must not see its own state.
      this.connectionStatus.set(connectionId, ConnectionStatus.DISCONNECTED);
      this.connect(url, connectionId);
    }, delay);

    // Store the timeout
    this.reconnectTimeouts.set(connectionId, timeout);
  }

  /**
   * Force-closes any connection that has gone quiet for too long. Closing is
   * what produces the close event, which is what schedules a reconnect, so this
   * is the recovery path for a socket that died without telling anyone.
   *
   * A live market feed ticks continuously, so two minutes of total silence
   * means the connection is gone rather than the market being calm. If it ever
   * does fire early the cost is one quick reconnect, which is cheap now that
   * reconnecting works.
   */
  private startHealthCheck(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      const now = Date.now();
      this.connections.forEach((socket, connectionId) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (this.intentionallyClosed.has(connectionId)) return;

        const last = this.lastMessageAt.get(connectionId) ?? now;
        const limit =
          this.connectionStaleness.get(connectionId) ?? this.stalenessMs;
        if (now - last <= limit) return;

        console.warn(
          `No data on ${connectionId} for ${Math.round(
            (now - last) / 1000
          )}s — closing to force a reconnect`
        );
        try {
          socket.close();
        } catch {
          // The close handler still runs and schedules the retry.
        }
      });
    }, this.healthCheckMs);
  }

  /**
   * A tab has come back, or the network has.
   *
   * This used to return the moment a socket reported OPEN, which defeated it in
   * exactly the case it exists for. Read the note on `lastMessageAt`: a socket
   * whose connection died without a close frame stays OPEN in the browser
   * forever, and that is precisely what backgrounding a mobile browser produces
   * — the OS suspends the tab, the connection is torn down underneath it, and
   * nothing tells the page. So on return the socket claimed to be open, this
   * handler believed it and did nothing, and the only remaining safety net was
   * `startHealthCheck` — a setInterval, which mobile browsers throttle to a
   * crawl or freeze outright while hidden, and which then wants two minutes of
   * silence before it acts.
   *
   * The result was a chart frozen at the price it held when you switched away,
   * still accepting trades against it, until something happened to knock the
   * socket over or the page was reloaded. Reloading "fixing" it is the tell:
   * the reconnect path works, it was simply never reached.
   *
   * Being open is therefore not evidence here. Only a recent frame is.
   */
  private handleWake = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    // Sockets that are visibly gone: reconnect now, no waiting on the backoff.
    this.connectionUrls.forEach((url, connectionId) => {
      if (this.intentionallyClosed.has(connectionId)) return;
      const socket = this.connections.get(connectionId);
      if (socket && socket.readyState === WebSocket.OPEN) return; // audited below

      const pending = this.reconnectTimeouts.get(connectionId);
      if (pending) {
        clearTimeout(pending);
        this.reconnectTimeouts.delete(connectionId);
      }
      this.reconnectAttempts.set(connectionId, 0);
      this.connectionStatus.set(connectionId, ConnectionStatus.DISCONNECTED);
      this.connect(url, connectionId);
    });

    // Sockets that merely *claim* to be open: give any buffered frames a moment
    // to arrive, then judge them on whether one did.
    if (this.wakeAuditTimer) clearTimeout(this.wakeAuditTimer);
    this.wakeAuditTimer = setTimeout(() => {
      this.wakeAuditTimer = null;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      const now = Date.now();
      this.connections.forEach((socket, connectionId) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (this.intentionallyClosed.has(connectionId)) return;

        const last = this.lastMessageAt.get(connectionId) ?? 0;
        const silentFor = now - last;
        if (silentFor <= this.wakeStalenessMs) return;

        console.warn(
          `${connectionId} reported open but has been silent for ${Math.round(
            silentFor / 1000
          )}s across a wake — treating it as dead`
        );
        // Closing rather than reconnecting by hand: the close handler already
        // owns the reconnect, and going around it risks two sockets racing over
        // one connectionId. Attempts are reset so it comes back on the base
        // delay instead of wherever the backoff had climbed to.
        this.reconnectAttempts.set(connectionId, 0);
        try {
          socket.close();
        } catch {
          // The close handler still runs and schedules the retry.
        }
      });
    }, this.wakeAuditDelayMs);
  };

  // Subscribe to a WebSocket stream
  public subscribe(
    streamKey: string,
    callback: MessageCallback,
    connectionId = "default"
  ): void {
    // Initialize subscriptions map for this connection if it doesn't exist
    if (!this.subscriptions.has(connectionId)) {
      this.subscriptions.set(connectionId, new Map());
    }

    // Initialize callbacks set for this stream if it doesn't exist
    const connectionSubscriptions = this.subscriptions.get(connectionId)!;
    if (!connectionSubscriptions.has(streamKey)) {
      connectionSubscriptions.set(streamKey, new Set());
    }

    // Add the callback to the set
    connectionSubscriptions.get(streamKey)!.add(callback);
  }

  // Unsubscribe from a WebSocket stream
  public unsubscribe(
    streamKey: string,
    callback: MessageCallback,
    connectionId = "default"
  ): void {
    if (this.subscriptions.has(connectionId)) {
      const connectionSubscriptions = this.subscriptions.get(connectionId)!;
      if (connectionSubscriptions.has(streamKey)) {
        const callbacks = connectionSubscriptions.get(streamKey)!;
        callbacks.delete(callback);

        // If no more callbacks, remove the stream
        if (callbacks.size === 0) {
          connectionSubscriptions.delete(streamKey);
        }
      }
    }
  }

  // Send a message to the WebSocket server (queues if not connected)
  public sendMessage(message: any, connectionId = "default"): void {
    // Check if the connection is ready
    if (
      this.connections.has(connectionId) &&
      this.connectionStatus.get(connectionId) === ConnectionStatus.CONNECTED
    ) {
      // Connection is ready, send immediately
      this.sendMessageImmediate(message, connectionId);
    } else {
      // Connection is not ready, queue the message
      if (!this.messageQueues.has(connectionId)) {
        this.messageQueues.set(connectionId, []);
      }

      this.messageQueues.get(connectionId)!.push(message);
    }
  }

  // Send a message immediately without queueing
  private sendMessageImmediate(message: any, connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      connection.send(messageStr);
    } else {
      console.error(
        `Cannot send message: WebSocket for ${connectionId} is not open`
      );
    }
  }

  // Add a status listener
  public addStatusListener(
    callback: StatusCallback,
    connectionId = "default"
  ): void {
    // Initialize status listeners set for this connection if it doesn't exist
    if (!this.statusListeners.has(connectionId)) {
      this.statusListeners.set(connectionId, new Set());
    }

    // Add the callback to the set
    this.statusListeners.get(connectionId)!.add(callback);

    // Notify the listener of the current status
    const status =
      this.connectionStatus.get(connectionId) || ConnectionStatus.DISCONNECTED;
    callback(status);
  }

  // Remove a status listener
  public removeStatusListener(
    callback: StatusCallback,
    connectionId = "default"
  ): void {
    if (this.statusListeners.has(connectionId)) {
      this.statusListeners.get(connectionId)!.delete(callback);
    }
  }

  // Notify all status listeners of a status change
  private notifyStatusListeners(connectionId: string): void {
    const status =
      this.connectionStatus.get(connectionId) || ConnectionStatus.DISCONNECTED;
    if (this.statusListeners.has(connectionId)) {
      this.statusListeners.get(connectionId)!.forEach((callback) => {
        try {
          callback(status);
        } catch (error) {
          console.error(`Error in status listener for ${connectionId}:`, error);
        }
      });
    }
  }

  // Get the current connection status
  public getStatus(connectionId = "default"): ConnectionStatus {
    return (
      this.connectionStatus.get(connectionId) || ConnectionStatus.DISCONNECTED
    );
  }

  // Close a WebSocket connection
  public close(connectionId = "default"): void {
    // Mark as intentionally closed FIRST to prevent reconnection attempts
    this.intentionallyClosed.add(connectionId);

    // Clear any reconnect timeouts for this connection
    const timeout = this.reconnectTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(connectionId);
    }

    const connection = this.connections.get(connectionId);
    if (connection) {
      // Only close if the connection is open or connecting
      // Avoid errors when closing already closed connections
      if (connection.readyState === WebSocket.OPEN || connection.readyState === WebSocket.CONNECTING) {
        connection.close();
      }
      this.connections.delete(connectionId);
    }

    // Always update status and clean up data regardless of connection state
    this.connectionStatus.set(connectionId, ConnectionStatus.DISCONNECTED);
    this.notifyStatusListeners(connectionId);

    // Clear associated data
    this.subscriptions.delete(connectionId);
    this.messageQueues.delete(connectionId);
    this.reconnectAttempts.delete(connectionId);
    this.connectionUrls.delete(connectionId);
  }

  // Close all WebSocket connections
  public closeAll(): void {
    this.connections.forEach((connection, connectionId) => {
      this.close(connectionId);
    });
  }
}

// Export singleton instance
export const wsManager = WebSocketManager.getInstance();
