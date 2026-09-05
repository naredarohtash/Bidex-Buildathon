"use client";

/**
 * What we email you about.
 *
 * The screen this replaces listed Email, SMS and Push as three "channels", all
 * showing Disabled, with no way to change any of them — and then told the
 * reader that "all communication streams are currently turned off, contact an
 * administrator". On an account panel the reader IS the administrator, so it
 * was a status report about a system nobody could reach, wearing the title
 * "Notification Preferences".
 *
 * SMS and Push are gone rather than shown switched off. Neither exists: there
 * is no SMS provider configured and no push infrastructure at all, so listing
 * them offered a choice that could never be made and implied a capability the
 * platform does not have.
 *
 * What is left is one real switch, and an honest statement of what it does not
 * cover — because the emails people actually mind missing are the ones this
 * cannot turn off.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { Check, Loader2, Mail, ShieldCheck } from "lucide-react";
import { $fetch } from "@/lib/api";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* Sent whether or not the switch is on. Not a design gap — an email confirming
   money left your account is not a preference, and a platform that let you
   silence it would be hiding the one message you most need to see. */
const ALWAYS_SENT = [
  "Password resets and login codes",
  "Deposits credited and withdrawals paid",
  "Anything about your account's security",
];

/* Controlled by the switch. */
const OPTIONAL = [
  "Results of trades you have placed",
  "Account and platform updates",
];

export const NotificationsPanel = memo(function NotificationsPanel() {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const { toast } = useToast();

  const current = useMemo(() => {
    const settings = (user as any)?.settings;
    const parsed = typeof settings === "string" ? safeParse(settings) : settings;
    // Absent means on: an account that has never touched this setting should
    // still hear about its own trades.
    return parsed?.email !== false;
  }, [user]);

  const [enabled, setEnabled] = useState(current);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next); // optimistic — a switch that lags feels broken
      setSaving(true);

      const { error } = await $fetch({
        url: "/api/user/profile",
        method: "PUT",
        body: { settings: { email: next } },
        silent: true,
        silentSuccess: true,
      });
      setSaving(false);

      if (error) {
        setEnabled(previous); // put it back rather than lie about the state
        toast({
          title: "Could not save",
          description: "Your preference was not changed. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const settings = (user as any)?.settings;
      const parsed = typeof settings === "string" ? safeParse(settings) : settings;
      setUser({ ...(user as any), settings: { ...(parsed || {}), email: next } });
      toast({
        title: next ? "Emails on" : "Emails off",
        description: next
          ? "You will hear about your trades and account updates."
          : "You will still get security and payment emails.",
      });
    },
    [enabled, user, setUser, toast]
  );

  return (
    <div className="px-5 py-6 md:px-8">
      {/* Same measure as Personal. A settings page whose column width changes
          from tab to tab reads as three different pages behind one rail. */}
      <div className="mx-auto w-full max-w-[820px] space-y-6">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">Email notifications</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We send to {user?.email || "your registered address"}.
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={saving}
        onClick={() => save(!enabled)}
        className={cn(
          "flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors",
          enabled
            ? "border-verified/30"
            : "border-border bg-card hover:bg-muted/40"
        )}
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            enabled ? "bg-verified/12" : "bg-muted"
          )}
        >
          <Mail
            className={cn(
              "h-4 w-4",
              enabled ? "text-verified" : "text-muted-foreground"
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-foreground">
            {enabled ? "You are getting emails" : "Emails are off"}
          </span>
          <span className="block text-[12px] text-muted-foreground">
            {enabled ? "Tap to stop optional emails" : "Tap to start getting them again"}
          </span>
        </span>

        {/* A real switch, so its state is readable without reading the label. */}
        <span
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-verified" : "bg-muted-foreground/40"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all",
              enabled ? "left-[22px]" : "left-0.5"
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </span>
        </span>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            The switch controls
          </p>
          <ul className="mt-2.5 space-y-2">
            {OPTIONAL.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Stated up front, not buried. Someone turning emails off needs to know
            what will still arrive — otherwise the first security email after
            they "turned emails off" looks like the setting was ignored. */}
        <div className="rounded-xl border border-border p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Always sent
          </p>
          <ul className="mt-2.5 space-y-2">
            {ALWAYS_SENT.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            These cannot be turned off. They are about your money or your account's safety.
          </p>
        </div>
      </div>
  </div>
    </div>
  );
});

function safeParse(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

export default NotificationsPanel;
