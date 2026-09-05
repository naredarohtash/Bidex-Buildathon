"use client";

interface ProfitDisplayProps {
  profitPercentage: number;
  profitAmount: number;
  amount: number;
  symbol: string;
  darkMode?: boolean;
  currencySymbol?: string;
}

export default function ProfitDisplay({
  profitPercentage,
  profitAmount,
  amount,
  symbol,
  darkMode = true,
  currencySymbol = "$",
}: ProfitDisplayProps) {
  const estimatedReturn = amount + profitAmount;
  const ratio = (profitPercentage / 100).toFixed(1);

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-300 shadow-md ${
        darkMode
          ? "bg-card/90 border border-border shadow-black/20"
          : "bg-gradient-to-b from-white to-gray-50/80 border border-gray-200/90 shadow-gray-200/50"
      }`}
    >
      {/* Centered Estimated Return Header & Value */}
      <div className="p-4 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Decorative glowing background mesh */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full blur-[43px] pointer-events-none opacity-20 transition-all duration-500 ${
          darkMode ? "bg-emerald-500" : "bg-emerald-400"
        }`} />

        <span className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 relative z-10 ${
          darkMode ? "text-zinc-400" : "text-gray-500"
        }`}>
          Estimated Return
        </span>

        <span className={`text-2xl font-bold tracking-tight relative z-10 ${
          darkMode 
            ? "text-emerald-400 [text-shadow:0_0_20px_rgba(52,211,153,0.3)]" 
            : "text-emerald-650"
        }`}>
          {currencySymbol}{estimatedReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>

        {/* Payout % + Net Profit row */}
        <div className="flex items-center gap-2 mt-3 relative z-10">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
            darkMode
              ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/20"
              : "text-emerald-650 bg-emerald-50 border-emerald-100"
          }`}>
            +{profitPercentage}% Payout
          </span>
          <span className={`text-[10px] font-semibold ${
            darkMode ? "text-emerald-400" : "text-emerald-650"
          }`}>
            Net Profit: +{currencySymbol}{profitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Risk and Ratio bottom bar */}
      <div
        className={`px-4 py-2 flex items-center justify-between border-t text-[10px] font-bold tracking-wider transition-all duration-300 ${
          darkMode 
            ? "border-border/60 bg-background/20 text-zinc-500" 
            : "border-gray-150 bg-white text-gray-500"
        }`}
      >
        <span>
          RISK: <span className={darkMode ? "text-zinc-300" : "text-zinc-700"}>{currencySymbol}{amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
        </span>
        <span>
          RATIO 1:{ratio}
        </span>
      </div>
    </div>
  );
}
