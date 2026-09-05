"use client";

import { useState } from "react";
import { BarChart3, Clock } from "lucide-react";
import ActivePositions from "./active-positions";
import CompletedPositions from "./completed-positions";
import type { Order } from "@/store/trade/use-binary-store";
import { useTranslations } from "next-intl";

interface MobilePositionsPanelProps {
  orders: Order[];
  currentPrice: number;
  onPositionsChange?: (positions: any[]) => void;
  className?: string;
  theme?: "dark" | "light" | "navy";
}

export default function MobilePositionsPanel({
  orders,
  currentPrice,
  onPositionsChange,
  className = "",
  theme = "dark",
}: MobilePositionsPanelProps) {
  const t = useTranslations("common");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  // Count active positions
  const activePositionsCount = orders.filter(
    (order) => order.status === "PENDING"
  ).length;

  // Theme-based classes - matching desktop flat design
  const isDark = theme === "dark" || theme === "navy";
  const bgClass = theme === "navy" ? "bg-background" : theme === "dark" ? "bg-black" : "bg-white";
  const borderClass = isDark ? "border-border" : "border-zinc-200";
  const textClass = isDark ? "text-foreground" : "text-zinc-900";
  const secondaryTextClass = isDark ? "text-muted-foreground" : "text-zinc-600";

  return (
    <div className={`flex flex-col h-full ${bgClass} ${className}`}>
      {/* Header with tabs - flat design matching desktop */}
      <div className={`shrink-0 border-b ${borderClass}`}>
        <div className="flex h-10">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium transition-colors border-r ${borderClass} ${
              activeTab === "active"
                ? `${textClass} ${isDark ? "bg-muted" : "bg-zinc-100"}`
                : `${secondaryTextClass} ${isDark ? "hover:bg-muted/50" : "hover:bg-zinc-50"}`
            }`}
          >
            {/* Top indicator */}
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${activeTab === "active" ? "bg-orange-500" : "bg-transparent"}`} />
            <Clock size={14} />
            <span>{t("active")}</span>
            {activePositionsCount > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold ${
                isDark
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-orange-100 text-orange-600"
              }`}>
                {activePositionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`flex-1 relative flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === "completed"
                ? `${textClass} ${isDark ? "bg-muted" : "bg-zinc-100"}`
                : `${secondaryTextClass} ${isDark ? "hover:bg-muted/50" : "hover:bg-zinc-50"}`
            }`}
          >
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${activeTab === "completed" ? "bg-orange-500" : "bg-transparent"}`} />
            <BarChart3 size={14} />
            <span>{t("history")}</span>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className={`flex-1 overflow-hidden ${theme === "navy" ? "bg-background" : theme === "dark" ? "bg-black" : "bg-white"}`}>
        {activeTab === "active" ? (
          <ActivePositions
            orders={orders}
            currentPrice={currentPrice}
            onPositionsChange={onPositionsChange}
            isMobile={true}
            theme={theme}
            className="h-full"
          />
        ) : (
          <CompletedPositions
            theme={theme}
            className="h-full"
            isMobile={true}
          />
        )}
      </div>
    </div>
  );
}
