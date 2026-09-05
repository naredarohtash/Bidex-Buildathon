import { NextResponse } from "next/server";
import { vortexToBidexSymbol } from "@/lib/utils/symbol-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const duration = searchParams.get("duration");

  if (!symbol) {
    return NextResponse.json({ error: "symbol query parameter is required" }, { status: 400 });
  }

  // 1. Map and normalize the symbol name using centralized helper
  const normalizedSymbol = vortexToBidexSymbol(symbol);

  // 2. Map TradingView resolution interval to backend format
  const intervalMap: Record<string, string> = {
    "1m": "1",
    "2m": "2",
    "3m": "3",
    "5m": "5",
    "10m": "10",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "8h": "480",
    "12h": "720",
    "1d": "1D",
    "3d": "3D",
    "1w": "1W",
    "1M": "1M"
  };
  let normalizedInterval = interval || "1";
  if (intervalMap[normalizedInterval]) {
    normalizedInterval = intervalMap[normalizedInterval];
  }


  // 3. Construct the target backend URL
  const backendUrl = process.env.BIDEX_API_URL || process.env.BINDEX_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://otcterminal.live";
  const targetUrl = new URL(`${backendUrl.replace(/\/$/, "")}/api/chart`);
  targetUrl.searchParams.set("asset", normalizedSymbol);
  targetUrl.searchParams.set("interval", normalizedInterval);
  if (from) targetUrl.searchParams.set("from", from);
  if (to) targetUrl.searchParams.set("to", to);
  if (duration) targetUrl.searchParams.set("duration", duration);
  
  /* No baked-in fallback. A literal key here is a credential published to
     everyone with repository access, and it stays in git history whether or not
     it is still valid — this one had already been superseded on the provider,
     so it bought nothing and leaked anyway. Without the env var the provider
     answers 403, which is diagnosable; a stale key silently authenticating as
     another identity is not. */
  const apiKey = process.env.BIDEX_API_KEY;
  if (apiKey) targetUrl.searchParams.set("api_key", apiKey);

  try {
    // Construct forwarding headers
    const headers = new Headers();
    headers.set("Origin", "http://localhost:3000");
    headers.set("Referer", "http://localhost:3000");
    
    // Copy client cookies / authorization if present
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("Cookie", cookie);
    const auth = request.headers.get("authorization");
    if (auth) headers.set("Authorization", auth);

    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      const errorText = await res.text();
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(errorJson, { status: res.status });
      } catch {
        return new NextResponse(errorText, { status: res.status, headers: { "Content-Type": "application/json" } });
      }
    }

    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      return NextResponse.json(data.data);
    }
    if (Array.isArray(data)) {
      return NextResponse.json(data);
    }
    return NextResponse.json([]);
  } catch (err: any) {
    console.error("[Proxy Route Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch chart data from backend" }, { status: 500 });
  }
}
