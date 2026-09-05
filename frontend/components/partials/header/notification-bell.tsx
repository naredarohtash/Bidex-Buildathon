"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, X, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@/i18n/routing";
import { formatDistanceToNow } from "date-fns";
import { useNotificationsStore } from "@/store/notification-store";
import { useTranslations } from "next-intl";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "investment":
      return "💰";
    case "message":
      return "💬";
    case "user":
      return "👤";
    case "alert":
      return "⚠️";
    case "system":
      return "⚙️";
    default:
      return "🔔";
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case "investment":
      return "bg-green-500";
    case "message":
      return "bg-blue-500";
    case "user":
      return "bg-purple-500";
    case "alert":
      return "bg-red-500";
    case "system":
      return "bg-gray-500";
    default:
      return "bg-blue-500";
  }
};

interface NotificationBellProps {
  /**
   * "terminal" is the mobile trading header: no border box, no dot — a bare
   * bell with the unread count on it. The count is the point there; a 2px dot
   * on a phone says "something happened" and then makes you tap to find out
   * whether it was one thing or nine.
   */
  variant?: "default" | "binary" | "terminal";
}

export function NotificationBell({ variant = "default" }: NotificationBellProps) {
  const t = useTranslations("common");
  const tComponents = useTranslations("components");
  const {
    notifications,
    stats,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    soundEnabled,
    toggleSound,
  } = useNotificationsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Animate bell when new notifications arrive
  useEffect(() => {
    if (stats.unread > 0) {
      setHasNewNotification(true);
      const timer = setTimeout(() => setHasNewNotification(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [stats.unread]);

  // Get recent notifications (last 5)
  const recentNotifications = notifications.slice(0, 5);

  const handleNotificationClick = async (notification: any) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    if (notification.link) {
      window.open(notification.link, "_blank");
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "transition-all duration-200 flex items-center justify-center outline-none focus:outline-none",
            variant === "terminal"
              ? "relative w-10 h-10 rounded-lg cursor-pointer text-zinc-800 active:bg-zinc-100 dark:text-zinc-200 dark:active:bg-white/5"
              : variant === "binary"
                ? "group w-9 h-9 rounded-md border cursor-pointer bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-card dark:hover:bg-muted dark:border-border dark:text-zinc-400 dark:hover:text-zinc-100"
                : "relative w-10 h-10 rounded-xl border text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
          )}
        >
          {variant === "terminal" ? (
            <>
              <motion.div
                animate={
                  hasNewNotification
                    ? { rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }
                    : {}
                }
                transition={{ duration: 0.5 }}
              >
                <Bell className="h-[21px] w-[21px]" strokeWidth={1.8} />
              </motion.div>

              <AnimatePresence>
                {stats.unread > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f04438] text-white text-[11px] font-bold leading-none flex items-center justify-center ring-2 ring-white dark:ring-[#0f1115]"
                  >
                    {stats.unread > 99 ? "99+" : stats.unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          ) : variant === "binary" ? (
            <div className="relative">
              <motion.div
                animate={
                  hasNewNotification
                    ? {
                        rotate: [0, -10, 10, -10, 0],
                        scale: [1, 1.1, 1],
                      }
                    : {}
                }
                transition={{ duration: 0.5 }}
                className="flex items-center justify-center"
              >
                <Bell className="h-[18px] w-[18px] text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
              </motion.div>

              <AnimatePresence>
                {stats.unread > 0 && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#ff5c5c] rounded-full ring-[1.5px] ring-white dark:ring-background"
                  />
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <motion.div
                animate={
                  hasNewNotification
                    ? {
                        rotate: [0, -10, 10, -10, 0],
                        scale: [1, 1.1, 1],
                      }
                    : {}
                }
                transition={{ duration: 0.5 }}
              >
                <Bell className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </motion.div>

              <AnimatePresence>
                {stats.unread > 0 && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Badge
                      variant="destructive"
                      className="h-5 w-5 p-0 flex items-center justify-center text-xs font-bold rounded-full bg-red-500 text-white border-2 border-white dark:border-zinc-900"
                    >
                      {stats.unread > 99 ? "99+" : stats.unread}
                    </Badge>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          "w-80 p-0 shadow-xl border bg-white dark:bg-card",
          variant === "binary"
            ? "border-zinc-200 dark:border-border rounded-md"
            : "border-zinc-200 dark:border-zinc-800 rounded-xl"
        )}
        align="end"
        sideOffset={8}
        style={{ zIndex: 100 }}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center justify-between p-4 border-b",
            variant === "binary" ? "border-zinc-200 dark:border-border" : "border-zinc-200 dark:border-zinc-700"
          )}>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{t("notifications")}</h3>
              {stats.unread > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {stats.unread} {t("new")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleSound}
                title={soundEnabled ? "Disable sound" : "Enable sound"}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>

              {stats.unread > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleMarkAllRead}
                  title={tComponents("mark_all_as_read")}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <ScrollArea className="h-80">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }}
                  className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
                />
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-zinc-500 dark:text-zinc-400">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{t("no_notifications_yet")}</p>
              </div>
            ) : (
              <div className="p-2">
                {recentNotifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "group relative p-3 rounded-lg mb-2 cursor-pointer transition-all duration-200",
                      variant === "binary"
                        ? "hover:bg-zinc-50 dark:hover:bg-muted"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                      !notification.read &&
                        (variant === "binary"
                          ? "bg-blue-50/50 dark:bg-muted/50 border-l-4 border-blue-500"
                          : "bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500")
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Notification Icon */}
                      <div
                        className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm",
                          getNotificationColor(notification.type)
                        )}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={cn(
                              "text-sm font-medium truncate",
                              !notification.read && "font-semibold"
                            )}
                          >
                            {notification.title}
                          </h4>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {notification.link && (
                              <ExternalLink className="h-3 w-3 text-zinc-400" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-zinc-500">
                            {notification.createdAt &&
                              formatDistanceToNow(
                                new Date(notification.createdAt),
                                { addSuffix: true }
                              )}
                          </span>

                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className={cn(
            "p-3 border-t",
            variant === "binary" ? "border-zinc-200 dark:border-border" : "border-zinc-200 dark:border-zinc-700"
          )}>
            <Link href="/user/notification">
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-center gap-2",
                  variant === "binary"
                    ? "rounded-md border-zinc-200 hover:bg-zinc-50 dark:border-border dark:hover:bg-muted dark:bg-card"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
                onClick={() => setIsOpen(false)}
              >
                {tComponents("view_all_notifications")}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
