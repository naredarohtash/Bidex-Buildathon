/**
 * Trading Notifications Store
 *
 * Zustand store for managing in-app trading notifications.
 * Handles toasts, notification history, and settings.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  TradingNotification,
  NotificationSettings,
  CreateNotificationOptions,
  NotificationType,
  SoundType,
} from "../types";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  MAX_STORED_NOTIFICATIONS,
  NOTIFICATION_SETTINGS_KEY,
} from "../types";

// ============================================================================
// TOAST TIMEOUT TRACKING
// Prevents memory leaks by tracking setTimeout IDs for auto-dismiss
// ============================================================================
const toastTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Clear a specific toast timeout
 */
function clearToastTimeout(id: string): void {
  const timeoutId = toastTimeouts.get(id);
  if (timeoutId) {
    clearTimeout(timeoutId);
    toastTimeouts.delete(id);
  }
}

/**
 * Clear all toast timeouts (for cleanup)
 */
function clearAllToastTimeouts(): void {
  for (const [id, timeoutId] of toastTimeouts) {
    clearTimeout(timeoutId);
  }
  toastTimeouts.clear();
}

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

interface TradingNotificationsState {
  // Notification list
  notifications: TradingNotification[];
  // Active toasts (currently showing)
  activeToasts: TradingNotification[];
  // Unread count
  unreadCount: number;
  // Settings
  settings: NotificationSettings;

  // Actions
  addNotification: (options: CreateNotificationOptions) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  clearOldNotifications: (maxAge: number) => void;

  // Toast management
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;

  // Settings
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  resetSettings: () => void;

  // Helpers
  isInQuietHours: () => boolean;
  shouldShowNotification: (type: NotificationType) => boolean;
  shouldPlaySound: (type: NotificationType) => boolean;
  shouldShowPush: (type: NotificationType) => boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isInQuietHours(settings: NotificationSettings): boolean {
  if (!settings.quietHoursEnabled) return false;

  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHours * 60 + currentMinutes;

  const [startH, startM] = settings.quietHoursStart.split(":").map(Number);
  const [endH, endM] = settings.quietHoursEnd.split(":").map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

// ============================================================================
// STORE
// ============================================================================

export const useTradingNotificationsStore = create<TradingNotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      activeToasts: [],
      unreadCount: 0,
      settings: DEFAULT_NOTIFICATION_SETTINGS,

      // Add a new notification
      addNotification: (options: CreateNotificationOptions): string => {
        const { settings, notifications, activeToasts } = get();

        // Check if notifications are enabled
        if (!settings.enabled) return "";

        // Check quiet hours
        if (isInQuietHours(settings)) return "";

        // Check type preferences
        const typePrefs = settings.typePreferences[options.type];
        if (!typePrefs?.enabled) return "";

        const id = generateId();
        const notification: TradingNotification = {
          ...options,
          id,
          timestamp: Date.now(),
          read: false,
          showToast: options.showToast ?? typePrefs.showToast,
          playSound: options.playSound ?? typePrefs.playSound,
          duration: options.duration ?? settings.toastDuration,
        };

        // Add to notifications list
        const updatedNotifications = [notification, ...notifications].slice(
          0,
          MAX_STORED_NOTIFICATIONS
        );

        // Add to active toasts if needed
        let updatedToasts = activeToasts;
        if (notification.showToast && settings.toastEnabled) {
          /* Trade results are never dropped; everything else still queues.

             maxToasts existed to stop an unbounded stack of chatter, and for
             informational notices that is right. A settled trade is not chatter:
             it is the outcome of the trader's own money, one card per position,
             and if thirty expire together thirty of them settled and the trader
             is owed thirty answers. Silently discarding the twenty-sixth because
             a cap was written for a different kind of message loses a result
             that has no other transient home.

             They are short-lived and self-dismiss, so the stack drains itself. */
          const isTradeResult =
            notification.type === "trade_win" ||
            notification.type === "trade_loss" ||
            notification.type === "trade_refund";
          updatedToasts = isTradeResult
            ? [notification, ...activeToasts]
            : [notification, ...activeToasts].slice(0, settings.maxToasts);
        }

        set({
          notifications: updatedNotifications,
          activeToasts: updatedToasts,
          unreadCount: get().unreadCount + 1,
        });

        // Auto-dismiss toast after duration (if not persistent)
        if (notification.showToast && notification.duration && notification.duration > 0) {
          // Track the timeout ID to prevent memory leaks
          const timeoutId = setTimeout(() => {
            // Clean up timeout tracking
            toastTimeouts.delete(id);
            get().dismissToast(id);
          }, notification.duration);
          toastTimeouts.set(id, timeoutId);
        }

        return id;
      },

      // Remove a notification
      removeNotification: (id: string) => {
        const { notifications, activeToasts } = get();
        const notification = notifications.find((n) => n.id === id);
        const wasUnread = notification && !notification.read;

        // Clear any pending timeout for this notification
        clearToastTimeout(id);

        set({
          notifications: notifications.filter((n) => n.id !== id),
          activeToasts: activeToasts.filter((n) => n.id !== id),
          unreadCount: wasUnread
            ? Math.max(0, get().unreadCount - 1)
            : get().unreadCount,
        });
      },

      // Mark notification as read
      markAsRead: (id: string) => {
        const { notifications } = get();
        const notification = notifications.find((n) => n.id === id);

        if (notification && !notification.read) {
          set({
            notifications: notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, get().unreadCount - 1),
          });
        }
      },

      // Mark all as read
      markAllAsRead: () => {
        const { notifications } = get();
        set({
          notifications: notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        });
      },

      // Clear all notifications
      clearNotifications: () => {
        // Clear all pending toast timeouts
        clearAllToastTimeouts();

        set({
          notifications: [],
          activeToasts: [],
          unreadCount: 0,
        });
      },

      // Clear old notifications
      clearOldNotifications: (maxAge: number) => {
        const { notifications } = get();
        const cutoff = Date.now() - maxAge;
        const filtered = notifications.filter((n) => n.timestamp > cutoff);
        const unreadFiltered = filtered.filter((n) => !n.read).length;

        set({
          notifications: filtered,
          unreadCount: unreadFiltered,
        });
      },

      // Dismiss a toast
      dismissToast: (id: string) => {
        const { activeToasts } = get();

        // Clear any pending timeout for this toast
        clearToastTimeout(id);

        set({
          activeToasts: activeToasts.filter((n) => n.id !== id),
        });
      },

      // Dismiss all toasts
      dismissAllToasts: () => {
        // Clear all pending toast timeouts
        clearAllToastTimeouts();

        set({ activeToasts: [] });
      },

      // Update settings
      updateSettings: (newSettings: Partial<NotificationSettings>) => {
        const { settings } = get();
        set({
          settings: { ...settings, ...newSettings },
        });
      },

      // Reset settings to defaults
      resetSettings: () => {
        set({ settings: DEFAULT_NOTIFICATION_SETTINGS });
      },

      // Check if in quiet hours
      isInQuietHours: () => {
        return isInQuietHours(get().settings);
      },

      // Check if should show notification
      shouldShowNotification: (type: NotificationType) => {
        const { settings } = get();
        if (!settings.enabled) return false;
        if (isInQuietHours(settings)) return false;
        const typePrefs = settings.typePreferences[type];
        return typePrefs?.enabled ?? true;
      },

      // Check if should play sound
      shouldPlaySound: (type: NotificationType) => {
        const { settings } = get();
        if (!settings.enabled || !settings.sound.enabled) return false;
        if (isInQuietHours(settings)) return false;
        const typePrefs = settings.typePreferences[type];
        return typePrefs?.playSound ?? false;
      },

      // Check if should show push notification
      shouldShowPush: (type: NotificationType) => {
        const { settings } = get();
        if (!settings.enabled || !settings.pushEnabled) return false;
        if (settings.pushPermission !== "granted") return false;
        if (isInQuietHours(settings)) return false;
        const typePrefs = settings.typePreferences[type];
        return typePrefs?.pushNotification ?? false;
      },
    }),
    {
      name: NOTIFICATION_SETTINGS_KEY,
      partialize: (state) => ({
        settings: state.settings,
        // Don't persist active toasts, they should be cleared on reload
      }),
      /* Deep-merge, because zustand's default merge is shallow and `settings` is
         a nested object.

         A browser that stored its settings under an older build keeps that exact
         object forever: the shallow merge replaces `settings` wholesale, so a
         `typePreferences` written before trade_win / trade_loss / trade_refund
         existed has no entry for them. Every guard on the way to a toast reads
         `settings.typePreferences[type]?.enabled`, which is then undefined and
         falsy — so addNotification returns early and the result card is never
         created. Nothing in the code looks wrong, the defaults are correct, and
         the only thing carrying the fault is a stale blob in localStorage.

         Merging per-type over the defaults means a preference the user has
         actually set is kept and anything they have never seen picks up its
         default, which repairs those browsers on the next load rather than
         asking anyone to clear storage. */
      merge: (persisted: any, current) => {
        const saved = persisted?.settings;
        if (!saved) return current;
        return {
          ...current,
          settings: {
            ...current.settings,
            ...saved,
            sound: { ...current.settings.sound, ...(saved.sound || {}) },
            typePreferences: Object.fromEntries(
              Object.entries(current.settings.typePreferences).map(([type, def]) => [
                type,
                { ...(def as object), ...((saved.typePreferences || {})[type] || {}) },
              ])
            ) as typeof current.settings.typePreferences,
          },
        };
      },
    }
  )
);

// ============================================================================
// SELECTORS
// ============================================================================

export const selectUnreadNotifications = (
  state: TradingNotificationsState
): TradingNotification[] => state.notifications.filter((n) => !n.read);

export const selectNotificationsByType = (
  state: TradingNotificationsState,
  type: NotificationType
): TradingNotification[] => state.notifications.filter((n) => n.type === type);

export const selectRecentNotifications = (
  state: TradingNotificationsState,
  limit: number = 10
): TradingNotification[] => state.notifications.slice(0, limit);
