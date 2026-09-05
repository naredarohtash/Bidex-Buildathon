"use client";

/**
 * The account settings navigation, as a horizontal bar.
 *
 * This replaces a 256px fixed sidebar that carried four links. A whole column of
 * chrome for four items is a poor trade at any width, and on a laptop it took a
 * quarter of the page away from the forms — which are the only reason anyone
 * opens this section. The same four links sit above the content now and cost a
 * single row.
 *
 * One component for every width. The sidebar needed a second copy of itself
 * inside a mobile Sheet, behind a hamburger, so the same four links existed
 * twice and could drift apart; this scrolls horizontally on a narrow screen
 * instead, which is a smaller idea than a drawer and does not hide anything
 * behind a tap.
 *
 * Semantic tokens throughout, so light, dark and navy are all correct without a
 * branch.
 */

import { memo } from "react";
import { User, Shield, Bell, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsTab {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Draws attention to something the account still needs. */
  attention?: boolean;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: "personal", label: "Personal", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "phone-verification", label: "Phone", icon: Phone },
];

export const SettingsNav = memo(function SettingsNav({
  active,
  onChange,
  attention = {},
  className,
}: {
  active: string;
  onChange: (tab: string) => void;
  /** Per-tab flag, e.g. { security: true } when two-factor is off. */
  attention?: Record<string, boolean>;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      aria-label="Account settings"
    >
      {SETTINGS_TABS.map((tab) => {
        const isActive = active === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
              // The active tab is marked by a rule on the border it sits on, so
              // the row reads as one edge rather than a set of loose chips.
              "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
              isActive
                ? "text-foreground after:bg-primary"
                : "text-muted-foreground hover:text-foreground after:bg-transparent"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {attention[tab.id] && !isActive && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                aria-label="Needs attention"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
});

export default SettingsNav;
