"use client";

/**
 * The terminal's bottom bar — five destinations, and a drawer for the rest.
 *
 * It carried all eight of the desktop rail's icons for a while, on the theory
 * that matching the desktop meant showing what the desktop shows. At 48px of
 * pitch that was eight 22px glyphs with nothing between them. It then went the
 * other way — chart, positions, account and a menu — which put Leaderboard and
 * Support behind a drawer they did not earn being behind.
 *
 * The bar is now ordered by how often a trader actually reaches for each,
 * left to right:
 *
 *   Terminal   the chart. The product; everything else is a detour from it.
 *   Trades     what is at risk right now, checked while a position runs.
 *   Leaders    the standings — pulled in and out of through a session.
 *   Support    wanted rarely, but wanted badly and immediately when it is.
 *   Account    balance and profile: deliberate visits, not glances.
 *   Menu       Analytics, Journal, Settings — once a session.
 *
 * Menu stays a destination rather than being dissolved into Account, because
 * those have nothing to do with the account and everything to do with
 * reviewing how the trading went.
 */

import { useState, useEffect } from "react";
import { Menu, User } from "lucide-react";
import { useTheme } from "next-themes";
import { TerminalIcon, LeaderboardIcon, SupportIcon } from "../layout/terminal-icons";

/* The desktop rail's own glyphs and its own 22px, so the two navigations are
   one set of icons rather than two that happen to mean the same things. The
   bar's height does not move to accommodate them — the chip around each icon
   gives up the difference instead. */
const NAV_ICON_PX = 22;

/**
 * The bar's own height, as a CSS length — 44px of controls plus whatever the
 * device reserves for its home indicator.
 *
 * Exported because it is not only this component's business any more. Every
 * full-screen surface stops at this line rather than covering it, so the
 * navigation stays reachable from inside a section instead of the section
 * having to be dismissed first. One expression, used by the bar and by
 * everything that clears it, so the two cannot drift apart.
 *
 * The clearance used to be a `<div className="h-safe-area-bottom" />`, which
 * looks like it does this and does not: no such utility is defined anywhere in
 * the project, so it resolved to nothing and the bar sat under the home
 * indicator on the phones that have one. It is a real env() inset now.
 *
 * The 1px is the border-top, and it is not a rounding fudge — measured, the bar
 * occupies 43px against the 41.8px `h-11` alone, and a surface stopping at
 * 41.8px lays its own edge over the bar's rule.
 */
export const MOBILE_NAV_HEIGHT =
  "calc(2.75rem + 1px + env(safe-area-inset-bottom, 0px))";

export type MobileNavTab =
  | "menu"
  | "chart"
  | "positions"
  | "account"
  // Reached from the drawer rather than the bar, but still the active tab
  // while their surface is open.
  | "leaders"
  | "analytics"
  | "journal"
  | "support"
  | "settings";

interface MobileNavigationProps {
  activeTab: MobileNavTab;
  onSelect: (tab: MobileNavTab) => void;
  /** Open positions — the count that decides whether to look. */
  activePositionsCount?: number;
  isAuthenticated?: boolean;
}

export default function MobileNavigation({
  activeTab,
  onSelect,
  activePositionsCount = 0,
  isAuthenticated = true,
}: MobileNavigationProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDarkMode = mounted
    ? resolvedTheme === "dark" || resolvedTheme === "navy"
    : false;

  /* "menu" is never the active tab — the drawer closes onto whatever is behind
     it — so it is styled as a plain control rather than a destination. */
  const items: Array<{
    id: MobileNavTab;
    label: string;
    render: () => React.ReactNode;
    badge?: number;
    hidden?: boolean;
  }> = [
    { id: "chart", label: "Trading Terminal", render: () => <TerminalIcon /> },
    {
      id: "positions",
      label: "Live & settled trades",
      render: () => <PositionsGlyph />,
      badge: activePositionsCount,
    },
    {
      id: "leaders",
      label: "Leaderboard",
      /* These two hardcode their own width/height for the desktop rail, so
         they are normalised to the bar's size here rather than forked. */
      render: () => <SizedIcon><LeaderboardIcon /></SizedIcon>,
    },
    {
      id: "support",
      label: "Support Centre",
      render: () => <SizedIcon><SupportIcon /></SizedIcon>,
    },
    {
      id: "account",
      label: "My Account",
      render: () => <User size={NAV_ICON_PX} strokeWidth={2.2} />,
      hidden: !isAuthenticated,
    },
    { id: "menu", label: "Menu", render: () => <Menu size={NAV_ICON_PX} strokeWidth={2.2} /> },
  ];

  const visible = items.filter((i) => !i.hidden);

  return (
    <nav
      className={`w-full shrink-0 border-t ${
        isDarkMode ? "bg-[#0f1115] border-[#1e222a]" : "bg-white border-[#eceff3]"
      }`}
    >
      <div className="flex h-11 items-center px-2">
        {visible.map(({ id, label, render, badge }) => {
          const isActive = activeTab === id && id !== "menu";
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className="flex-1 h-full flex items-center justify-center min-w-0"
            >
              <span
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  isActive
                    ? "text-blue-500 bg-blue-500/10"
                    : isDarkMode
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {render()}
                {!!badge && badge > 0 && (
                  <span
                    className={`absolute top-0 right-0 min-w-[14px] h-[14px] px-1 rounded-full bg-[#2f80ed] text-white text-[9px] font-bold leading-none flex items-center justify-center ring-2 ${
                      isDarkMode ? "ring-[#0f1115]" : "ring-white"
                    }`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Home-indicator clearance on devices that have one */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}

/** Normalises the rail glyphs, which carry the desktop's own hardcoded sizes. */
function SizedIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex"
      style={{ ["--nav-icon" as any]: `${NAV_ICON_PX}px` }}
    >
      <span className="flex [&>svg]:w-[var(--nav-icon)] [&>svg]:h-[var(--nav-icon)]">
        {children}
      </span>
    </span>
  );
}

/** Two rows in a frame — the Live / Settled list, as a glyph. */
function PositionsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={NAV_ICON_PX}
      height={NAV_ICON_PX}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 10h6M7 14h10" />
      <circle cx="17" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
