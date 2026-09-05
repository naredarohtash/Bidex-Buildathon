export default class WebSocketManager {
  private url: string;
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity; // Never stop trying
  private baseReconnectTimeout = 1000;
  private maxReconnectTimeout = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  // Last time we received any message (or opened). Used to detect a socket that
  // the browser silently froze while the tab was backgrounded (readyState stays
  // OPEN but no data flows), so we can force a fresh connection on return.
  private lastMessageAt = 0;
  private lastRecoveryAt = 0;
  private recoveryHandler: (() => void) | null = null;
  private eventHandlers: Record<string, Array<(data: any) => void>> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };

  constructor(url: string) {
    this.url = url;
    // Recover the connection when the tab becomes visible again or the network
    // comes back. Backgrounded tabs throttle timers and often kill or freeze
    // WebSockets; without this the chart/data stays frozen after you return.
    if (typeof window !== "undefined") {
      this.recoveryHandler = () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - this.lastRecoveryAt < 3000) return; // debounce rapid triggers
        // Only revive a genuinely dead socket — don't churn a healthy (but idle)
        // connection, which would spam reconnects on endpoints that send no data.
        if (!this.isConnected()) {
          this.lastRecoveryAt = now;
          this.forceReconnect();
        }
      };
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", this.recoveryHandler);
      }
      window.addEventListener("online", this.recoveryHandler);
    }
  }

  public connect(): void {
    this.shouldReconnect = true;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = (event) => {
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.eventHandlers.open.forEach((handler) => handler(event));
      };

      this.socket.onclose = (event) => {
        this.eventHandlers.close.forEach((handler) => handler(event));
        this.attemptReconnect();
      };

      this.socket.onerror = (event) => {
        this.eventHandlers.error.forEach((handler) => handler(event));
      };

      this.socket.onmessage = (event) => {
        this.lastMessageAt = Date.now();
        try {
          const data = JSON.parse(event.data);
          this.eventHandlers.message.forEach((handler) => handler(data));
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect) return;
    this.reconnectAttempts++;
    // Exponential backoff capped at maxReconnectTimeout
    const delay = Math.min(
      this.baseReconnectTimeout * Math.pow(1.5, Math.min(this.reconnectAttempts - 1, 10)),
      this.maxReconnectTimeout
    );
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Immediately drop any existing socket and reconnect, resetting the backoff.
   * Used on tab-visible / network-online so we don't wait out an accumulated
   * (possibly 30s) backoff, and to replace a silently-frozen socket.
   */
  public forceReconnect(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.onclose = null; // don't let this manual close schedule a reconnect
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.connect();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.recoveryHandler && typeof window !== "undefined") {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", this.recoveryHandler);
      }
      window.removeEventListener("online", this.recoveryHandler);
      this.recoveryHandler = null;
    }
    if (this.socket) {
      try {
        this.socket.onclose = null; // intentional close — don't reconnect
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public send(data: any): void {
    if (this.isConnected() && this.socket) {
      this.socket.send(typeof data === "string" ? data : JSON.stringify(data));
    } else {
      console.warn("Cannot send message, WebSocket is not connected");
    }
  }

  public on(event: string, handler: (data: any) => void): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    } else {
      this.eventHandlers[event] = [handler];
    }
  }

  public off(event: string, handler: (data: any) => void): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (h) => h !== handler
      );
    }
  }
}
