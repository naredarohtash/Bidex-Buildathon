"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Phone,
  Bell,
  MessageSquare,
  Loader2,
  AlertCircle,
  Send,
  CheckCircle2,
  XCircle,
  Smartphone,
  Info,
  Shield,
  Check,
  X,
  Volume2,
  VolumeX,
  Moon,
  Play,
  ChevronDown,
  ChevronRight,
  Settings,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/user";
import { useTranslations } from "next-intl";
import { useSettings } from "@/hooks/use-settings";
import { $fetch } from "@/lib/api";
import {
  isPushSupported,
  getPermissionStatus,
  enablePushNotifications,
  disablePushNotifications,
  isSubscribed as checkIsSubscribed,
  getPushSupportDetails,
  syncSubscriptionWithServer,
  getVapidPublicKey,
} from "@/lib/push-notifications";
import { NOTIFICATION_TYPE_INFO, type NotificationType, type SoundType } from "@/components/binary/notifications/types";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const SettingsSection = memo(function SettingsSection({
  title,
  description,
  children,
  defaultExpanded = false,
}: SettingsSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-border/40 rounded-xl overflow-hidden bg-zinc-900/10 font-sans">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors text-left"
      >
        <div>
          <h4 className="text-sm font-bold text-white leading-none">{title}</h4>
          {description && (
            <p className="text-xs text-zinc-450 mt-1.5 font-medium leading-none">{description}</p>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-5 border-t border-border/20">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface LocalSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const LocalSlider = memo(function LocalSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: LocalSliderProps) {
  return (
    <input
      type="range"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer"
    />
  );
});

const colorClasses = {
  amber: {
    bg: "bg-amber-500/10",
    icon: "text-amber-405",
    activeBg: "bg-amber-500/20",
    border: "border-amber-500/20",
  },
  blue: {
    bg: "bg-blue-500/10",
    icon: "text-blue-400",
    activeBg: "bg-blue-500/20",
    border: "border-blue-500/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    icon: "text-emerald-450",
    activeBg: "bg-emerald-500/20",
    border: "border-emerald-500/20",
  },
  purple: {
    bg: "bg-purple-500/10",
    icon: "text-purple-400",
    activeBg: "bg-purple-500/20",
    border: "border-purple-500/20",
  },
};

const NotificationChannel = memo(function NotificationChannel({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  disabled,
  color = "amber",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  color?: "amber" | "blue" | "emerald" | "purple";
}) {
  const styles = colorClasses[color];

  return (
    <div
      className={cn(
        "flex items-center justify-between p-5 rounded-xl border transition-all duration-200 font-sans",
        enabled
          ? "bg-zinc-800/25 border-border shadow-sm"
          : "bg-zinc-900/40 border-border/40"
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("p-3 rounded-xl border flex-shrink-0", enabled ? styles.activeBg + " " + styles.border : styles.bg + " border-transparent")}>
          <Icon className={cn("h-5 w-5", styles.icon)} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-white">{title}</h4>
            {enabled && (
              <Badge className="bg-emerald-500/10 border-0 text-emerald-400 text-xs font-bold px-2 py-0.5 leading-none rounded">
                Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-450 mt-2 leading-relaxed font-semibold">{description}</p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
});

// Push Notification Channel with browser permission handling
const PushNotificationChannel = memo(function PushNotificationChannel({
  userPushEnabled,
  onToggle,
  isUpdating,
}: {
  userPushEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  isUpdating: boolean;
}) {
  const t = useTranslations("dashboard_user");
  const tCommon = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  const [pushState, setPushState] = useState<{
    supported: boolean;
    permission: NotificationPermission | "unsupported";
    subscribed: boolean;
    loading: boolean;
    error: string | null;
    supportDetails?: ReturnType<typeof getPushSupportDetails>;
  }>({
    supported: true,
    permission: "default",
    subscribed: false,
    loading: true,
    error: null,
  });
  const [testState, setTestState] = useState<{
    sending: boolean;
    result: "success" | "error" | null;
    message: string | null;
  }>({
    sending: false,
    result: null,
    message: null,
  });

  // Check push notification status on mount
  useEffect(() => {
    setMounted(true);

    const checkPushStatus = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const supportDetails = getPushSupportDetails();
      const supported = supportDetails.supported;
      const permission = getPermissionStatus();
      let subscribed = false;

      if (supported && permission === "granted") {
        try {
          const timeoutPromise = new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 3000);
          });
          subscribed = await Promise.race([checkIsSubscribed(), timeoutPromise]);

          if (subscribed) {
            console.log("[Push] Local subscription found, syncing with server...");
            const syncResult = await syncSubscriptionWithServer();
            if (syncResult.synced) {
              console.log("[Push] Subscription synced successfully");
            } else {
              console.warn("[Push] Subscription sync issue:", syncResult.error);
            }
          }
        } catch (err) {
          console.error("[Push] Error checking subscription:", err);
        }
      }

      setPushState({
        supported,
        permission,
        subscribed,
        loading: false,
        error: null,
        supportDetails,
      });
    };

    checkPushStatus();
  }, []);

  /* Whether this server can do Web Push at all.
     
     Push needs a VAPID key pair configured server-side. Without one,
     subscribeToPush throws "Web Push is not configured on this server" — after
     the browser has already been asked for notification permission. So a user
     was prompted for a permission that could not be used, then shown a failure
     for something they had done nothing wrong in. The server is asked first and
     the control is not offered at all when the answer is no. */
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getVapidPublicKey()
      .then((res) => {
        if (!cancelled) setPushConfigured(!!res?.webPushAvailable && !!res?.publicKey);
      })
      .catch(() => {
        if (!cancelled) setPushConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnablePush = async () => {
    setPushState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await enablePushNotifications();

      if (result.success) {
        setPushState((prev) => ({
          ...prev,
          permission: "granted",
          subscribed: true,
          loading: false,
        }));
        onToggle(true);
      } else {
        let errorMessage = result.error || "Failed to enable push notifications";

        const details = getPushSupportDetails();
        if (
          errorMessage.includes("not supported") &&
          (details.isIOS || details.isAndroid) &&
          !details.isStandalone
        ) {
          errorMessage =
            "Please add this site to your Home Screen first, then try again.";
        }

        setPushState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
          permission: getPermissionStatus(),
          supportDetails: details,
        }));
      }
    } catch (err: any) {
      setPushState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "An unexpected error occurred",
        permission: getPermissionStatus(),
      }));
    }
  };

  const handleDisablePush = async () => {
    setPushState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await disablePushNotifications();

      if (result.success) {
        setPushState((prev) => ({
          ...prev,
          subscribed: false,
          loading: false,
        }));
        onToggle(false);
      } else {
        setPushState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || "Failed to disable push notifications",
        }));
      }
    } catch (err: any) {
      setPushState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "An unexpected error occurred",
      }));
    }
  };

  const handleSendTestNotification = async () => {
    setTestState({ sending: true, result: null, message: null });
    try {
      const res = await fetch("/api/user/profile/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTestState({
          sending: false,
          result: "success",
          message: "Test notification dispatched to service worker successfully.",
        });
      } else {
        setTestState({
          sending: false,
          result: "error",
          message: data.error || "Server failed to dispatch test payload.",
        });
      }
    } catch (err: any) {
      setTestState({
        sending: false,
        result: "error",
        message: err.message || "Network error dispatching test notification.",
      });
    }
  };

  if (!mounted) return null;

  const styles = colorClasses.purple;
  const isEnabled = userPushEnabled && pushState.subscribed;
  const isLoading = pushState.loading || isUpdating;

  // Render not supported block
  if (!pushState.supported) {
    const details = pushState.supportDetails;
    let notSupportedMessage =
      "Push notifications are not supported on your current browser or system environment.";

    if (!details?.isSecureContext) {
      notSupportedMessage =
        "Push notifications require a secure context (HTTPS). Localhost is supported without HTTPS.";
    } else if (details?.isIOS && !details?.isStandalone) {
      notSupportedMessage =
        "To enable push notifications on iOS, tap the Share button and select 'Add to Home Screen'. Then open the app from your Home Screen.";
    } else if (details?.isAndroid && !details?.isStandalone) {
      notSupportedMessage =
        "To enable push notifications, add this site to your Home Screen. Tap the menu (⋮) and select 'Add to Home Screen' or 'Install App'.";
    }

    return (
      <div className="flex flex-col gap-4 p-5 rounded-xl border border-border/40 bg-zinc-900/20 font-sans">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-xl bg-zinc-800/40 text-zinc-500 flex-shrink-0")}>
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white">
                  {tCommon("push_notifications")}
                </h4>
                <Badge className="bg-zinc-800/50 border-0 text-zinc-400 text-xs font-bold px-2 py-0.5 rounded">
                  {!details?.isSecureContext
                    ? "HTTPS Required"
                    : details?.isIOS || details?.isAndroid
                      ? "Requires Home Screen App"
                      : t("not_supported")}
                </Badge>
              </div>
              <p className="text-xs text-zinc-450 mt-2 leading-relaxed font-semibold">{notSupportedMessage}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Permission blocked
  if (pushState.permission === "denied") {
    return (
      <div className="flex items-center justify-between p-5 rounded-xl border border-border/40 bg-zinc-900/40 font-sans">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex-shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white">
                {tCommon("push_notifications")}
              </h4>
              <Badge className="bg-red-500/10 border-0 text-red-400 text-xs font-bold px-2 py-0.5 rounded">
                {t("blocked")}
              </Badge>
            </div>
            <p className="text-xs text-zinc-450 mt-2 font-semibold">
              {t("push_permission_denied")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Not available on this server — say so rather than offering a button that
  // asks for a browser permission and then fails.
  if (pushConfigured === false) {
    return (
      <div className="flex items-start gap-4 p-5 rounded-xl border border-border/40 bg-zinc-900/40 font-sans">
        <div className="p-3 rounded-xl border border-border/40 bg-zinc-900 flex-shrink-0">
          <Bell className="h-5 w-5 text-zinc-500" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">
            {tCommon("push_notifications")}
          </h4>
          <p className="text-xs text-zinc-450 mt-2 font-semibold">
            Not available on this server. In-app and email notifications are
            unaffected.
          </p>
        </div>
      </div>
    );
  }

  // Unsubscribed state - show Enable button
  if (!pushState.subscribed) {
    return (
      <div className="flex items-center justify-between p-5 rounded-xl border border-border/40 bg-zinc-900/40 font-sans">
        <div className="flex items-start gap-4">
          <div className={cn("p-3 rounded-xl border flex-shrink-0", styles.bg + " " + styles.border)}>
            <Bell className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              {tCommon("push_notifications")}
            </h4>
            <p className="text-xs text-zinc-450 mt-2 font-semibold">
              {t("receive_notifications_on_your_devices")}
            </p>
            {pushState.error && (
              <p className="text-xs text-red-400 mt-2 font-bold">{pushState.error}</p>
            )}
          </div>
        </div>
        <Button
          onClick={handleEnablePush}
          disabled={isLoading}
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("enable")
          )}
        </Button>
      </div>
    );
  }

  // Subscribed state - show config switches and diagnostic panels
  const details = pushState.supportDetails;
  return (
    <div className="space-y-4 font-sans">
      
      {/* Push status toggle row */}
      <div
        className={cn(
          "flex items-center justify-between p-5 rounded-xl border transition-all duration-200",
          isEnabled
            ? "bg-zinc-800/25 border-border"
            : "bg-zinc-900/40 border-border/40"
        )}
      >
        <div className="flex items-start gap-4">
          <div className={cn("p-3 rounded-xl border flex-shrink-0", isEnabled ? styles.activeBg + " " + styles.border : styles.bg + " border-transparent")}>
            <Bell className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white">
                {tCommon("push_notifications")}
              </h4>
              {isEnabled && (
                <Badge className="bg-emerald-500/10 border-0 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-455 mt-2 font-semibold">
              {t("receive_notifications_on_your_devices")}
            </p>
            {pushState.error && (
              <p className="text-xs text-red-400 mt-2 font-bold">{pushState.error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleDisablePush}
            disabled={isLoading}
            variant="ghost"
            className="text-xs text-zinc-400 hover:text-red-400 h-9 px-2 font-bold hover:bg-transparent"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("unsubscribe")
            )}
          </Button>
          <Switch
            checked={userPushEnabled}
            onCheckedChange={onToggle}
            disabled={isLoading}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {/* Subscription troubleshooting controls */}
      {isEnabled && (
        <div className="p-5 rounded-xl border border-border/40 bg-zinc-900/20 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h5 className="text-xs font-bold text-white">Push System Testing</h5>
              <p className="text-xs text-zinc-450 mt-1.5 font-semibold">
                Dispatch a push notification to test receipt on this device.
              </p>
            </div>
            <Button
              onClick={handleSendTestNotification}
              disabled={testState.sending}
              variant="outline"
              className="h-8.5 px-3 rounded-lg bg-zinc-900 border-border hover:bg-zinc-800 text-xs font-bold text-zinc-300"
            >
              {testState.sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Sending...
                </>
              ) : (
                "Send Test Notification"
              )}
            </Button>
          </div>

          {/* Test results notification logs */}
          {testState.result && (
            <div className="flex items-center gap-2 text-xs font-bold">
              {testState.result === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-450" />
                  <span className="text-emerald-400">{testState.message}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-450" />
                  <span className="text-red-400">{testState.message}</span>
                </>
              )}
            </div>
          )}

          {/* Troubleshooting diagnostics log detail box */}
          <div className="pt-4 border-t border-border/20">
            <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-zinc-400" />
              Mobile Push Diagnostic Logs
            </h5>
            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-zinc-400">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 border border-border/20">
                <span>Secure context</span>
                {details?.isSecureContext ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 border border-border/20">
                <span>Service worker</span>
                {details?.hasServiceWorker ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 border border-border/20">
                <span>Push manager</span>
                {details?.hasPushManager ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 border border-border/20">
                <span>Notification API</span>
                {details?.hasNotification ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
              </div>
            </div>
            
            {/* iOS/Android Troubleshooting expanded guide panels */}
            {(details?.isIOS || details?.isAndroid) && (
              <div className="mt-3 p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs leading-relaxed text-zinc-400 space-y-2">
                <p className="font-bold text-amber-450 flex items-center gap-1.5">
                  <Info className="h-4 w-4" />
                  Troubleshoot Mobile Notifications
                </p>
                {details.isIOS ? (
                  <p>Safari browser requires installing this platform to your home screen before notifications can register. Tap Share → &quot;Add to Home Screen&quot;, then open the installed app and sign in again.</p>
                ) : (
                  <p>Android device may sleep app events to optimize battery. Go to Settings → Apps → select browser or app → Battery → set optimization to &quot;Unrestricted&quot;.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
});

export const NotificationsTab = memo(function NotificationsTab() {
  const t = useTranslations("dashboard_user");
  const tCommon = useTranslations("common");
  const { user, updateUser } = useUserStore();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { settings, settingsFetched } = useSettings();

  if (!user || !settingsFetched) {
    return (
      <div className="space-y-6 font-sans">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            {t("notification_preferences")}
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5">
            {t("choose_how_you_want_to_receive_notifications")}
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border p-8">
          <div className="flex flex-col items-center justify-center font-semibold">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs text-zinc-450 mt-3.5">
              {t("loading_notification_settings")}...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const emailEnabled =
    settings?.emailChannelStatus === true ||
    settings?.emailChannelStatus === "true";
  const smsEnabled =
    settings?.smsChannelStatus === true ||
    settings?.smsChannelStatus === "true";
  const pushEnabled =
    settings?.pushChannelStatus === true ||
    settings?.pushChannelStatus === "true";

  const handleUpdateNotifications = async (type: string, enabled: boolean) => {
    setIsUpdating(type);
    await updateUser({
      settings: {
        ...user.settings,
        [type]: enabled,
      },
    });
    setIsUpdating(null);
  };

  const noChannelsEnabled = !emailEnabled && !smsEnabled && !pushEnabled;

  return (
    <div className="space-y-6 font-sans">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight">
          {t("notification_preferences")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1.5 font-medium">
          {t("choose_how_you_want_to_receive_notifications")}
        </p>
      </div>

      {/* Modern Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* LEFT COLUMN: Overview Status Logs & Info Guidelines */}
        <div className="space-y-6">
          
          {/* Active Channels Overview Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-card border border-border p-6 shadow-sm animate-none"
          >
            <div className="flex flex-col items-center">
              <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Channel Configuration</h3>
              
              <div className="w-full space-y-3 text-left pt-2">
                <div className="flex items-center justify-between text-xs font-semibold p-3 rounded-lg bg-zinc-900/30 border border-border/20">
                  <span className="text-zinc-400 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Channel
                  </span>
                  <span className={emailEnabled ? "text-emerald-400" : "text-red-400"}>
                    {emailEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold p-3 rounded-lg bg-zinc-900/30 border border-border/20">
                  <span className="text-zinc-400 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    SMS Channel
                  </span>
                  <span className={smsEnabled ? "text-emerald-400" : "text-red-400"}>
                    {smsEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold p-3 rounded-lg bg-zinc-900/30 border border-border/20">
                  <span className="text-zinc-400 flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Push Channel
                  </span>
                  <span className={pushEnabled ? "text-emerald-400" : "text-red-400"}>
                    {pushEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Safety Guidelines Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border bg-zinc-950/20 p-5 flex items-start gap-4 shadow-sm animate-none"
          >
            <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex-shrink-0 animate-none animate-pulse">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-none">Stay Secure & Alert</h4>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-semibold">
                Critical account updates, login session security warnings, and wallet configuration logs are sent directly using active channels. Keeping notifications enabled safeguards your trading operations.
              </p>
            </div>
          </motion.div>

        </div>

        {/* RIGHT COLUMN: Communication Channels Switches stack */}
        <div className="lg:col-span-2 space-y-6">
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-card border border-border overflow-hidden shadow-sm animate-none"
          >
            <div className="p-6 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-850 text-zinc-300">
                  <MessageSquare className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-none">{t("communication_channels")}</h3>
                  <p className="text-xs text-zinc-400 mt-1.5 font-medium leading-none">Configure active delivery destinations</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {noChannelsEnabled ? (
                <div className="text-center py-10 space-y-4">
                  <div className="p-4 bg-zinc-900 border border-border inline-flex rounded-full">
                    <MessageSquare className="h-8 w-8 text-zinc-550" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">No Channels Configured</h4>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-2 leading-relaxed">
                      All communication streams are currently turned off. Contact an administrator to restore notifications services.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {emailEnabled && (
                    <NotificationChannel
                      icon={Mail}
                      title={tCommon("email_notifications")}
                      description={`${t("receive_notifications_via_email_at")} ${user.email}`}
                      enabled={user.settings?.email || false}
                      onToggle={(enabled) => handleUpdateNotifications("email", enabled)}
                      disabled={isUpdating === "email"}
                      color="blue"
                    />
                  )}

                  {smsEnabled && (
                    <NotificationChannel
                      icon={Phone}
                      title={tCommon("sms_notifications")}
                      description={`${t("receive_notifications_via_sms_at")} ${user.phone || "Not linked in profile settings"}`}
                      enabled={user.settings?.sms || false}
                      onToggle={(enabled) => handleUpdateNotifications("sms", enabled)}
                      disabled={isUpdating === "sms"}
                      color="emerald"
                    />
                  )}

                  {pushEnabled && (
                    <PushNotificationChannel
                      userPushEnabled={user.settings?.push || false}
                      onToggle={(enabled) => handleUpdateNotifications("push", enabled)}
                      isUpdating={isUpdating === "push"}
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>


        </div>

      </div>
    </div>
  );
});

export default NotificationsTab;
