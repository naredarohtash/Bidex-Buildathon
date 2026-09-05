import { NextResponse } from "next/server";

// In-memory cache for asset statuses from local backend
interface CacheEntry {
  timestamp: number;
  assets: Record<string, string>;
}

let assetsCache: CacheEntry | null = null;
const CACHE_TTL_MS = 10000; // 10 seconds TTL

async function fetchAssetStatusesFromBackend(): Promise<Record<string, string>> {
  const now = Date.now();
  if (assetsCache && now - assetsCache.timestamp < CACHE_TTL_MS) {
    return assetsCache.assets;
  }

  try {
    const backendPort =
      process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.BACKEND_PORT || "4000";
    const res = await fetch(`http://localhost:${backendPort}/api/exchange/market-status`, {
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      // Backend may return { assets: [...] } or similar - build a statusMap
      const statusMap: Record<string, string> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.symbol) statusMap[item.symbol.toUpperCase()] = item.status || "LIVE";
        }
      } else if (data && Array.isArray(data.assets)) {
        for (const item of data.assets) {
          if (item.symbol) statusMap[item.symbol.toUpperCase()] = item.status || "LIVE";
        }
      }
      assetsCache = { timestamp: now, assets: statusMap };
      return statusMap;
    }
  } catch {
    // Backend unavailable — all markets LIVE by default
  }

  return assetsCache ? assetsCache.assets : {};
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol query parameter is required" },
      { status: 400 }
    );
  }

  // For standard crypto pairs (no OTC suffix), always return LIVE
  // Only OTC assets can be PAUSED/closed
  const upperSymbol = symbol.toUpperCase();
  const isOtc =
    upperSymbol.includes("OTC") ||
    upperSymbol.includes("/INR") ||
    upperSymbol.endsWith("_OTC");

  if (!isOtc) {
    return NextResponse.json({ symbol, status: "LIVE" });
  }

  // For OTC assets, try to get status from local backend
  const statuses = await fetchAssetStatusesFromBackend();
  const status = statuses[upperSymbol] || "LIVE";

  return NextResponse.json({ symbol, normalizedSymbol: upperSymbol, status });
}
