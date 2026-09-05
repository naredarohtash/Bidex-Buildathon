"use client";

/**
 * The live (real) balance, and — when there isn't one — why.
 *
 * Every place that showed this used to render a loading shimmer whenever
 * `realBalance` was null. Null meant two different things: "the request is in
 * flight" and "the request came back with nothing". Only the first is a load,
 * but both drew the shimmer, so an expired session left the balance pulsing
 * for ever with nothing to tell the trader what to do about it. The tell was
 * the tier line beside it reading the same null as `?? 0` and confidently
 * printing zero.
 *
 * So the shimmer is now shown only while something is genuinely in flight, and
 * the two failures say what they are. An expired session is by far the common
 * one, and it has an obvious remedy, so it offers it.
 */

import { useRouter, useParams } from "next/navigation";
import { useBinaryStore } from "@/store/trade/use-binary-store";

export default function LiveBalance({
  amount,
  symbol,
  className = "",
  compact = false,
}: {
  /** Already converted to the trader's display currency. */
  amount: number;
  symbol: string;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const params = useParams();
  const walletStatus = useBinaryStore((s) => s.walletStatus);
  const isLoadingWallet = useBinaryStore((s) => s.isLoadingWallet);
  const fetchWalletData = useBinaryStore((s) => s.fetchWalletData);

  const size = compact ? "text-[11px]" : "text-[12px]";

  if (walletStatus === "unauthenticated") {
    const locale = (params?.locale as string) || "en";
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/${locale}/login`);
        }}
        className={`${size} font-semibold text-emerald-600 dark:text-emerald-400 hover:underline ${className}`}
      >
        Sign in to view
      </button>
    );
  }

  if (walletStatus === "error") {
    return (
      <button
        type="button"
        title="Couldn't load your balance. Tap to try again."
        onClick={(e) => {
          e.stopPropagation();
          fetchWalletData(undefined, true, false);
        }}
        className={`${size} font-semibold text-amber-600 dark:text-amber-400 hover:underline ${className}`}
      >
        Unavailable — retry
      </button>
    );
  }

  if (isLoadingWallet || walletStatus === "loading" || walletStatus === "idle") {
    return (
      <span
        className={`inline-block w-16 h-3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700 ${className}`}
      />
    );
  }

  return (
    <span className={className}>
      {symbol}
      {amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}
