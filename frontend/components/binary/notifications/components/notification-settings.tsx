/**
 * Notification Settings Component
 *
 * Full settings panel for notifications including:
 * - Master enable/disable
 * - Toast position and behavior
 * - Push notification settings
 * - Sound settings
 * - Quiet hours
 * - Per-type preferences
 */

"use client";

import React, { memo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Moon,
  Settings,
  ChevronDown,
  ChevronRight,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Trash2,
  CheckCheck,
  Check,
} from "lucide-react";
import type { NotificationType, SoundType, TradingNotification } from "../types";
import { NOTIFICATION_TYPE_INFO } from "../types";
import {
  useTradingNotificationsStore,
  SoundManager,
  requestNotificationPermission,
} from "../core";
// ============================================================================
// OVERLAY THEME (inline to avoid chart-engine dependency)
// ============================================================================

interface OverlayTheme {
  bg: string;
  bgSubtle: string;
  bgMuted: string;
  bgCard: string;
  bgInput: string;
  bgHover: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  hoverBg: string;
  activeBg: string;
  backdrop: string;
}

function getOverlayTheme(darkMode: boolean): OverlayTheme {
  if (darkMode) {
    return {
      bg: 'bg-zinc-900',
      bgSubtle: 'bg-zinc-800/50',
      bgMuted: 'bg-zinc-800/30',
      bgCard: 'bg-zinc-800',
      bgInput: 'bg-zinc-700',
      bgHover: 'bg-zinc-700',
      border: 'border-zinc-800/50',
      borderSubtle: 'border-zinc-800/30',
      borderStrong: 'border-zinc-700',
      text: 'text-white',
      textSecondary: 'text-zinc-400',
      textMuted: 'text-zinc-500',
      textDim: 'text-zinc-600',
      hoverBg: 'hover:bg-zinc-700/50',
      activeBg: 'bg-zinc-700',
      backdrop: 'bg-black/60',
    };
  }

  return {
    bg: 'bg-white',
    bgSubtle: 'bg-gray-50',
    bgMuted: 'bg-gray-50/50',
    bgCard: 'bg-gray-100',
    bgInput: 'bg-gray-100',
    bgHover: 'bg-gray-100',
    border: 'border-gray-200/50',
    borderSubtle: 'border-gray-100/50',
    borderStrong: 'border-gray-300',
    text: 'text-gray-900',
    textSecondary: 'text-gray-500',
    textMuted: 'text-gray-400',
    textDim: 'text-gray-300',
    hoverBg: 'hover:bg-gray-100',
    activeBg: 'bg-gray-100',
    backdrop: 'bg-black/40',
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

const ToggleSwitch = memo(function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = "md",
}: ToggleSwitchProps) {
  const sizeClasses = size === "sm" ? "w-8 h-4" : "w-10 h-5";
  const dotSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const dotTranslate = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative rounded-full transition-colors ${sizeClasses} ${
        checked ? "bg-blue-500" : "bg-zinc-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 ${dotSize} rounded-full bg-white transition-transform ${
          checked ? dotTranslate : "translate-x-0"
        }`}
      />
    </button>
  );
});

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  darkMode?: boolean;
}

const Slider = memo(function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
  darkMode = true,
}: SliderProps) {
  return (
    <input
      type="range"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      step={step}
      className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${
        darkMode ? "bg-zinc-700" : "bg-gray-200"
      } [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer`}
    />
  );
});

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  darkMode: boolean;
  defaultExpanded?: boolean;
}

const Section = memo(function Section({
  title,
  description,
  children,
  darkMode,
  defaultExpanded = false,
}: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const theme = {
    border: darkMode ? "border-zinc-800/50" : "border-gray-200/50",
    text: darkMode ? "text-white" : "text-gray-900",
    textMuted: darkMode ? "text-zinc-400" : "text-gray-500",
    textSecondary: darkMode ? "text-zinc-400" : "text-gray-500",
    bg: darkMode ? "bg-zinc-900/50" : "bg-gray-50",
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${theme.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-4 py-3 ${theme.bg} hover:opacity-80 transition-opacity`}
      >
        <div>
          <h3 className={`text-sm font-medium ${theme.text}`}>{title}</h3>
          {description && (
            <p className={`text-xs ${theme.textSecondary} mt-0.5`}>{description}</p>
          )}
        </div>
        {expanded ? (
          <ChevronDown size={16} className={theme.textSecondary} />
        ) : (
          <ChevronRight size={16} className={theme.textSecondary} />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const NotificationSettings = memo(function NotificationSettings({
  isOpen,
  onClose,
  darkMode = true,
}: NotificationSettingsProps) {
  const notifications = useTradingNotificationsStore((state) => state.notifications);
  const unreadCount = useTradingNotificationsStore((state) => state.unreadCount);
  const markAsRead = useTradingNotificationsStore((state) => state.markAsRead);
  const markAllAsRead = useTradingNotificationsStore((state) => state.markAllAsRead);
  const clearNotifications = useTradingNotificationsStore((state) => state.clearNotifications);
  const removeNotification = useTradingNotificationsStore((state) => state.removeNotification);

  const [filter, setFilter] = useState<"all" | "unread" | "alerts">("all");

  // Filtered notifications
  const filteredNotifications = notifications.filter((item) => {
    if (filter === "unread") return !item.read;
    if (filter === "alerts") return item.type === "alert_triggered" || item.type === "price_alert";
    return true;
  });

  // Use shared theme from overlay-theme.ts
  const theme = getOverlayTheme(darkMode);

  // Type icons
  const typeIcons: Record<NotificationType, React.ElementType> = {
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
    info: Info,
    trade_win: TrendingUp,
    trade_loss: TrendingDown,
    trade_refund: Info,
    order_placed: CheckCircle,
    order_cancelled: X,
    alert_triggered: Bell,
    price_alert: Bell,
    signal: Info,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 ${
              darkMode ? "bg-black/70" : "bg-black/40"
            } backdrop-blur-sm`}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className={`relative mr-auto h-full w-[380px] max-w-[380px] flex flex-col ${theme.bg} border-r ${theme.border} shadow-2xl`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${darkMode ? "bg-blue-500/10" : "bg-blue-50"}`}>
                  <Bell size={18} className="text-blue-500" />
                </div>
                <div>
                  <h2 className={`text-sm font-semibold ${theme.text}`}>
                    Notification Center
                  </h2>
                  <p className={`text-chart-sm ${theme.textMuted}`}>
                    {notifications.length} total messages
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${theme.hoverBg} ${theme.textSecondary} transition-colors`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content for TAB 1: NOTIFICATIONS */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-2">
              {/* Notification List Toolbar */}
              <div className={`flex items-center justify-between px-4 py-2 border-b ${theme.border}`}>
                <div className="flex items-center gap-1">
                  {(["all", "unread", "alerts"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md capitalize transition-all cursor-pointer ${
                        filter === t
                          ? darkMode
                            ? "bg-zinc-800 text-white border border-zinc-700"
                            : "bg-gray-200 text-gray-900 border border-gray-300"
                          : `${theme.textMuted} hover:${theme.text}`
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                        className={`p-1.5 rounded-lg ${theme.hoverBg} text-blue-400 hover:text-blue-300 transition-colors`}
                        title="Mark all as read"
                      >
                        <CheckCheck size={15} />
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        className={`p-1.5 rounded-lg ${theme.hoverBg} text-rose-400 hover:text-rose-300 transition-colors`}
                        title="Clear all"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notifications Scroll List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className={`p-4 rounded-full ${darkMode ? "bg-zinc-800/50" : "bg-gray-100"} mb-3`}>
                        <BellOff size={28} className={theme.textMuted} />
                      </div>
                      <h4 className={`text-sm font-bold ${theme.text}`}>No notifications</h4>
                      <p className={`text-xs ${theme.textMuted} mt-1 max-w-[200px]`}>
                        {filter === "unread" ? "You have no unread notifications" : "Trade updates and alerts will appear here"}
                      </p>
                    </div>
                  ) : (
                    filteredNotifications.map((item) => {
                      const Icon = typeIcons[item.type] || Info;
                      return (
                        <div
                          key={item.id}
                          onClick={() => !item.read && markAsRead(item.id)}
                          className={`relative p-3 rounded-xl border transition-all cursor-pointer group ${
                            !item.read
                              ? darkMode
                                ? "bg-zinc-800/80 border-blue-500/40 shadow-sm"
                                : "bg-blue-50/70 border-blue-200 shadow-sm"
                              : darkMode
                              ? "bg-zinc-900/50 border-zinc-800/60 hover:bg-zinc-800/50"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                              item.type === "trade_win" || item.type === "success"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : item.type === "trade_loss" || item.type === "error"
                                ? "bg-rose-500/10 text-rose-500"
                                : "bg-blue-500/10 text-blue-500"
                            }`}>
                              <Icon size={16} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <h4 className={`text-xs font-bold ${theme.text} truncate`}>
                                  {item.title}
                                </h4>
                                <span className={`text-[10px] font-medium ${theme.textMuted} shrink-0`}>
                                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              <p className={`text-[11px] ${theme.textSecondary} mt-1 leading-snug`}>
                                {item.message}
                              </p>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeNotification(item.id);
                              }}
                              className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-all shrink-0`}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            {/* Content for TAB 2: SETTINGS removed */}

            {/* Footer */}
            <div className={`px-4 py-3 border-t ${theme.border}`}>
              <button
                onClick={clearNotifications}
                disabled={notifications.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg ${
                  darkMode
                    ? "bg-zinc-800 text-rose-450 hover:bg-rose-500/10"
                    : "bg-gray-250 text-rose-600 hover:bg-rose-50"
                } transition-colors disabled:opacity-50`}
              >
                <Trash2 size={13} />
                Clear All Notifications
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default NotificationSettings;
