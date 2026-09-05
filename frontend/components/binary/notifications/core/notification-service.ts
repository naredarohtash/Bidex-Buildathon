/**
 * Notification Service
 *
 * High-level service for creating trading notifications.
 * Integrates store, sounds, and push notifications.
 */

import type {
  TradingNotification,
  CreateNotificationOptions,
  NotificationType,
  SoundType,
} from "../types";
import type { OrderSide } from "@/types/binary-trading";
import { useTradingNotificationsStore } from "./notification-store";
import { SoundManager } from "./sound-manager";
import { PushNotificationService } from "./push-notifications";

// ============================================================================
// TYPE TO SOUND MAPPING
// ============================================================================

const TYPE_TO_SOUND: Record<NotificationType, SoundType> = {
  success: "success",
  warning: "notification",
  error: "error",
  info: "notification",
  trade_win: "trade_win",
  trade_loss: "trade_loss",
  trade_refund: "notification",
  order_placed: "order_placed",
  order_cancelled: "notification",
  alert_triggered: "alert_triggered",
  price_alert: "alert_triggered",
  signal: "notification",
};

// ============================================================================
// NOTIFICATION SERVICE CLASS
// ============================================================================

class NotificationServiceClass {
  /**
   * Show a notification with all integrations
   */
  notify(options: CreateNotificationOptions): string {
    const store = useTradingNotificationsStore.getState();

    // Check if notifications are enabled
    if (!store.settings.enabled) return "";

    // Check quiet hours
    if (store.isInQuietHours()) return "";

    // Check type preferences
    if (!store.shouldShowNotification(options.type)) return "";

    // Add notification to store
    const id = store.addNotification(options);

    if (!id) return "";

    // Get the created notification
    const notification = store.notifications.find((n) => n.id === id);
    if (!notification) return id;

    // Play sound if enabled
    if (store.shouldPlaySound(options.type)) {
      const soundType = options.soundKey || TYPE_TO_SOUND[options.type];
      // Trade sounds are owned by the audio-feedback engine (order panel +
      // trading interface). Skip them here so a trade never plays two
      // overlapping sounds. Non-trade notifications still sound.
      //
      // A refund is matched on the notification type rather than the sound
      // name: it maps to the generic "notification" tone, which is shared with
      // several unrelated events, so excluding by sound name would silence
      // those too. It was the one settlement still playing twice — the sharp
      // generic tone on top of the soft one the audio engine plays for it.
      const ownedByAudioFeedback =
        options.type === "trade_refund" ||
        soundType === "order_placed" ||
        soundType === "trade_win" ||
        soundType === "trade_loss";
      if (soundType && !ownedByAudioFeedback) {
        SoundManager.play(soundType);
      }
    }

    // Show push notification if enabled
    if (store.shouldShowPush(options.type)) {
      PushNotificationService.showTradingNotification(notification);
    }

    return id;
  }

  // =========================================================================
  // CONVENIENCE METHODS
  // =========================================================================

  /**
   * Show a success notification
   */
  success(title: string, message: string, data?: TradingNotification["data"]): string {
    return this.notify({
      type: "success",
      title,
      message,
      priority: "normal",
      data,
    });
  }

  /**
   * Show a warning notification
   */
  warning(title: string, message: string, data?: TradingNotification["data"]): string {
    return this.notify({
      type: "warning",
      title,
      message,
      priority: "normal",
      data,
    });
  }

  /**
   * Show an error notification
   */
  error(title: string, message: string, data?: TradingNotification["data"]): string {
    return this.notify({
      type: "error",
      title,
      message,
      priority: "high",
      data,
    });
  }

  /**
   * Show an info notification
   */
  info(title: string, message: string, data?: TradingNotification["data"]): string {
    return this.notify({
      type: "info",
      title,
      message,
      priority: "low",
      data,
    });
  }

  // =========================================================================
  // TRADING-SPECIFIC NOTIFICATIONS
  // =========================================================================

  /**
   * Notify about order placement
   */
  orderPlaced(params: {
    orderId: string;
    symbol: string;
    side: OrderSide;
    amount: number;
  }): string {
    return this.notify({
      type: "order_placed",
      title: "Order Placed",
      message: `${params.side} order placed for ${params.amount.toFixed(2)} on ${params.symbol}`,
      priority: "normal",
      data: {
        orderId: params.orderId,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
      },
    });
  }

  /**
   * Notify about order cancellation
   */
  orderCancelled(params: {
    orderId: string;
    symbol: string;
    amount: number;
  }): string {
    return this.notify({
      type: "order_cancelled",
      title: "Order Cancelled",
      message: `Order cancelled for ${params.symbol}. ${params.amount.toFixed(2)} refunded.`,
      priority: "normal",
      data: {
        orderId: params.orderId,
        symbol: params.symbol,
        amount: params.amount,
      },
    });
  }

  /**
   * Notify about trade win
   */
  tradeWin(params: {
    orderId: string;
    symbol: string;
    side: OrderSide;
    amount: number;
    profit: number;
    profitPercentage: number;
    entryTime?: number;
    expiryTime?: number;
    durationMinutes?: number;
    currency?: string;
  }): string {
    return this.notify({
      type: "trade_win",
      title: "Trade Won! 🎉",
      message: `Your ${params.side} position on ${params.symbol} won!`,
      priority: "high",
      data: {
        orderId: params.orderId,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
        profit: params.profit,
        profitPercentage: params.profitPercentage,
        entryTime: params.entryTime,
        expiryTime: params.expiryTime,
        durationMinutes: params.durationMinutes,
        currency: params.currency,
      },
    });
  }

  /**
   * Notify about trade loss
   */
  tradeLoss(params: {
    orderId: string;
    symbol: string;
    side: OrderSide;
    amount: number;
    profit: number;
    profitPercentage: number;
    entryTime?: number;
    expiryTime?: number;
    durationMinutes?: number;
    currency?: string;
  }): string {
    return this.notify({
      type: "trade_loss",
      title: "Trade Lost",
      message: `Your ${params.side} position on ${params.symbol} lost.`,
      priority: "normal",
      data: {
        orderId: params.orderId,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
        profit: params.profit,
        profitPercentage: params.profitPercentage,
        entryTime: params.entryTime,
        expiryTime: params.expiryTime,
        durationMinutes: params.durationMinutes,
        currency: params.currency,
      },
    });
  }

  /**
   * Notify about price alert triggered
   */
  priceAlert(params: {
    alertId: string;
    symbol: string;
    targetPrice: number;
    currentPrice: number;
    condition: "crosses_above" | "crosses_below" | "crosses";
  }): string {
    const conditionText =
      params.condition === "crosses_above"
        ? "risen above"
        : params.condition === "crosses_below"
        ? "fallen below"
        : "crossed";

    // Adaptive precision: forex pairs (e.g. 1.39873) need 5 decimals, JPY/indices
    // ~3, large values ~2. Fixed .toFixed(2) would show a misleading 1.40.
    const fmt = (n: number) => {
      const abs = Math.abs(n);
      const dp = abs >= 1000 ? 2 : abs >= 100 ? 3 : abs >= 1 ? 5 : 6;
      return n.toFixed(dp);
    };

    return this.notify({
      type: "price_alert",
      title: `Price Alert: ${params.symbol}`,
      message: `Price has ${conditionText} ${fmt(params.targetPrice)}. Current: ${fmt(params.currentPrice)}`,
      priority: "high",
      data: {
        alertId: params.alertId,
        symbol: params.symbol,
        targetPrice: params.targetPrice,
        currentPrice: params.currentPrice,
      },
    });
  }

  /**
   * A trade that settled level — the stake is returned, nothing is won or lost.
   *
   * Given its own method rather than folded into tradeLoss with a zero profit,
   * which is how it would have had to be reported before: the toast would have
   * been titled "Trade Lost" over a refund, and the notification history would
   * have counted it against the trader. A drawn trade is not a lost one.
   */
  tradeRefund(params: {
    orderId: string;
    symbol: string;
    side: OrderSide;
    amount: number;
    entryTime?: number;
    expiryTime?: number;
    durationMinutes?: number;
    currency?: string;
  }): string {
    return this.notify({
      type: "trade_refund",
      title: "Trade Refunded",
      message: `Your ${params.side} position on ${params.symbol} closed level — stake returned.`,
      priority: "normal",
      data: {
        orderId: params.orderId,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
        profit: 0,
        profitPercentage: 0,
        entryTime: params.entryTime,
        expiryTime: params.expiryTime,
        durationMinutes: params.durationMinutes,
        currency: params.currency,
      },
    });
  }

  /**
   * Notify about trading signal
   */
  signal(params: {
    symbol: string;
    signalType: "buy" | "sell";
    indicator: string;
    strength: number;
  }): string {
    return this.notify({
      type: "signal",
      title: `${params.signalType.toUpperCase()} Signal`,
      message: `${params.indicator} generated a ${params.signalType} signal on ${params.symbol}`,
      priority: "normal",
      data: {
        symbol: params.symbol,
        signalType: params.signalType,
        indicator: params.indicator,
        strength: params.strength,
      },
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const NotificationService = new NotificationServiceClass();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Show a notification
 */
export function notify(options: CreateNotificationOptions): string {
  return NotificationService.notify(options);
}

/**
 * Show a trade win notification
 */
export function notifyTradeWin(params: Parameters<typeof NotificationService.tradeWin>[0]): string {
  return NotificationService.tradeWin(params);
}

/**
 * Show a trade loss notification
 */
export function notifyTradeLoss(params: Parameters<typeof NotificationService.tradeLoss>[0]): string {
  return NotificationService.tradeLoss(params);
}

/**
 * Show a trade refund (draw) notification
 */
export function notifyTradeRefund(params: Parameters<typeof NotificationService.tradeRefund>[0]): string {
  return NotificationService.tradeRefund(params);
}

/**
 * Show an order placed notification
 */
export function notifyOrderPlaced(params: Parameters<typeof NotificationService.orderPlaced>[0]): string {
  return NotificationService.orderPlaced(params);
}

/**
 * Show a price alert notification
 */
export function notifyPriceAlert(params: Parameters<typeof NotificationService.priceAlert>[0]): string {
  return NotificationService.priceAlert(params);
}
