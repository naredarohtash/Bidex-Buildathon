import { create } from "zustand";
import WebSocketManager from "@/lib/websocket-manager";

interface MessageHandler {
  handler: (message: any) => void;
  filter: (message: any) => boolean;
}

interface Subscription {
  type: string;
  payload?: any;
}

interface WebSocketConnection {
  isConnected: boolean;
  wsManager: WebSocketManager | null;
  subscriptions: Subscription[];
  subscriptionQueue: Subscription[];
  isTypeSubscribed: (type: string, payload?: any) => boolean;
}

interface WebSocketState {
  connections: Record<string, WebSocketConnection>;
  messageHandlers: Record<string, MessageHandler[]>;

  createConnection: (
    connectionKey: string,
    path: string,
    options?: WebSocketOptions
  ) => Promise<void>;
  removeConnection: (connectionKey: string) => void;

  send: (connectionKey: string, message: any) => void;

  subscribe: (connectionKey: string, type: string, payload?: any) => void;
  unsubscribe: (connectionKey: string, type: string, payload?: any) => void;

  addMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void,
    filter?: (message: any) => boolean
  ) => void;
  removeMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void
  ) => void;

  isConnectionOpen: (connectionKey: string) => boolean;
}

interface WebSocketOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: any) => void;
}

const createWebSocketConnection = (): WebSocketConnection => ({
  isConnected: false,
  wsManager: null,
  subscriptions: [],
  subscriptionQueue: [],
  isTypeSubscribed: function (type: string, payload?: any) {
    return this.subscriptions.some(
      (sub) =>
        sub.type === type &&
        JSON.stringify(sub.payload) === JSON.stringify(payload)
    );
  },
});

export const useWebSocketStore = create<WebSocketState>()((set, get) => ({
  connections: {},
  messageHandlers: {},

  createConnection: async (
    connectionKey: string,
    path: string,
    options?: WebSocketOptions
  ): Promise<void> => {
    const connections = get().connections;
    const connection = connections[connectionKey];

    if (!path) {
      return Promise.reject("Path is invalid");
    }

    if (connection && connection.isConnected) {
      options?.onOpen?.();
      return Promise.resolve();
    }

    // Convert relative path to full WebSocket URL
    let wsUrl = path;
    if (typeof window !== "undefined" && path.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const isDev = process.env.NODE_ENV === "development";
      const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";
      // In development, connect directly to backend (Next.js rewrites don't support WebSocket upgrades)
      const host = isDev ? `${window.location.hostname}:${backendPort}` : window.location.host;
      wsUrl = `${protocol}//${host}${path}`;
    }

    const wsManager = new WebSocketManager(wsUrl);

    set((state) => ({
      connections: {
        ...state.connections,
        [connectionKey]: {
          isConnected: false,
          wsManager,
          subscriptions: [],
          subscriptionQueue: [],
          isTypeSubscribed: createWebSocketConnection().isTypeSubscribed,
        },
      },
    }));

    wsManager.on("open", () => {
      console.log("WebSocket Connected to", path);

      set((state) => ({
        connections: {
          ...state.connections,
          [connectionKey]: {
            ...state.connections[connectionKey],
            isConnected: true,
          },
        },
      }));

      options?.onOpen?.();

      // Re-send ALL active subscriptions on (re)connect.
      // This is critical: after a backend restart, the backend loses all
      // subscribed clients. We must re-subscribe every active subscription
      // so that ORDER_COMPLETED events are delivered again.
      const conn = get().connections[connectionKey];
      const allSubs = [
        ...(conn?.subscriptions || []),
        ...(conn?.subscriptionQueue || []),
      ];
      allSubs.forEach((sub) => {
        wsManager.send({
          action: "SUBSCRIBE",
          payload: { type: sub.type, ...sub.payload },
        });
      });

      // Clear the queue now that it's been processed
      set((state) => ({
        connections: {
          ...state.connections,
          [connectionKey]: {
            ...state.connections[connectionKey],
            subscriptionQueue: [],
          },
        },
      }));
    });

    wsManager.on("close", () => {
      console.log("WebSocket Disconnected from", path);

      // Move all active subscriptions back to the queue so they get
      // re-sent when the socket reconnects after a backend restart.
      set((state) => {
        const conn = state.connections[connectionKey];
        return {
          connections: {
            ...state.connections,
            [connectionKey]: {
              ...conn,
              isConnected: false,
              subscriptions: [],
              subscriptionQueue: [...(conn?.subscriptions || []), ...(conn?.subscriptionQueue || [])],
            },
          },
        };
      });

      options?.onClose?.();
    });

    wsManager.on("error", (error) => {
      // Transient by nature — the manager retries automatically. Log as a
      // warning (not console.error) so a routine reconnect doesn't surface as a
      // fatal error overlay in dev.
      console.warn("WebSocket error on", path, ":", error);
      options?.onError?.(error);
    });

    wsManager.on("message", (message) => {
      const handlers = get().messageHandlers[connectionKey] || [];
      handlers.forEach(({ handler, filter }) => {
        if (filter(message)) {
          handler(message);
        }
      });

      options?.onMessage?.(message);
    });

    wsManager.connect();
  },

  removeConnection: (connectionKey: string) => {
    const connections = get().connections;
    const connection = connections[connectionKey];

    if (connection && connection.isConnected && connection.wsManager) {
      connection.wsManager.disconnect();

      set((state) => ({
        connections: {
          ...state.connections,
          [connectionKey]: {
            ...state.connections[connectionKey],
            isConnected: false,
            wsManager: null,
          },
        },
      }));
    }
  },

  send: (connectionKey: string, message: any) => {
    const connections = get().connections;
    const connection = connections[connectionKey];

    if (connection && connection.isConnected && connection.wsManager) {
      connection.wsManager.send(message);
    }
  },

  subscribe: (connectionKey: string, type: string, payload?: any) => {
    const connections = get().connections;
    const connection = connections[connectionKey];

    if (!connection) return;

    if (!connection.isTypeSubscribed(type, payload)) {
      const newSubscription = { type, payload };

      set((state) => ({
        connections: {
          ...state.connections,
          [connectionKey]: {
            ...state.connections[connectionKey],
            subscriptions: [
              ...state.connections[connectionKey].subscriptions,
              newSubscription,
            ],
          },
        },
      }));

      if (connection.wsManager?.isConnected()) {
        connection.wsManager.send({
          action: "SUBSCRIBE",
          payload: { type, ...payload },
        });
      } else {
        set((state) => ({
          connections: {
            ...state.connections,
            [connectionKey]: {
              ...state.connections[connectionKey],
              subscriptionQueue: [
                ...state.connections[connectionKey].subscriptionQueue,
                newSubscription,
              ],
            },
          },
        }));
      }
    }
  },

  unsubscribe: (connectionKey: string, type: string, payload?: any) => {
    const connections = get().connections;
    const connection = connections[connectionKey];

    if (!connection) return;

    set((state) => ({
      connections: {
        ...state.connections,
        [connectionKey]: {
          ...state.connections[connectionKey],
          subscriptions: state.connections[connectionKey].subscriptions.filter(
            (sub) =>
              sub.type !== type ||
              JSON.stringify(sub.payload) !== JSON.stringify(payload)
          ),
        },
      },
    }));

    if (connection.wsManager?.isConnected()) {
      connection.wsManager.send({
        action: "UNSUBSCRIBE",
        payload: { type, ...payload },
      });
    }
  },

  addMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void,
    filter: (message: any) => boolean = () => true
  ) => {
    set((state) => ({
      messageHandlers: {
        ...state.messageHandlers,
        [connectionKey]: [
          ...(state.messageHandlers[connectionKey] || []),
          { handler, filter },
        ],
      },
    }));
  },

  removeMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void
  ) => {
    set((state) => ({
      messageHandlers: {
        ...state.messageHandlers,
        [connectionKey]: (state.messageHandlers[connectionKey] || []).filter(
          (item) => item.handler !== handler
        ),
      },
    }));
  },

  isConnectionOpen: (connectionKey: string): boolean => {
    const connections = get().connections;
    const connection = connections[connectionKey];
    return connection?.isConnected || false;
  },
}));

export default useWebSocketStore;
