import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const duration = searchParams.get("duration");

  const debug = searchParams.get("debug");
  if (debug) {
    console.log("[Chart Proxy Debug]", debug);
    return NextResponse.json({ ok: true });
  }

  console.log("[Chart Proxy] GET", { symbol, interval, from, to, duration });

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol query parameter is required" },
      { status: 400 }
    );
  }

  // Forward to the local backend exchange chart endpoint
  const backendPort =
    process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.BACKEND_PORT || "4000";
  const backendBase = `http://localhost:${backendPort}`;
  const targetUrl = new URL(`${backendBase}/api/exchange/chart`);

  targetUrl.searchParams.set("symbol", symbol);
  if (interval) targetUrl.searchParams.set("interval", interval);
  if (from) targetUrl.searchParams.set("from", from);
  if (to) targetUrl.searchParams.set("to", to);
  if (duration) targetUrl.searchParams.set("duration", duration);

  try {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    // Forward cookies / authorization if present
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("Cookie", cookie);
    const auth = request.headers.get("authorization");
    if (auth) headers.set("Authorization", auth);

    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers,
      /* Shorter than the browser's, longer than the backend's.

         This sat at 10s, exactly equal to the $fetch timeout in the browser
         that calls it, while the backend behind it was allowed 24s. Nothing in
         the chain could report a failure: the browser aborted first and showed
         Chrome's "signal timed out" instead of whatever this layer had learned.

         8s leaves the backend's 6s worst case room to answer and still fails
         before the browser gives up at 10s, so a real outage arrives here as a
         diagnosable error rather than an abort. */
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Chart Proxy] Backend error:", res.status, errorText.substring(0, 200));
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(errorJson, { status: res.status });
      } catch {
        return NextResponse.json(
          { error: `Backend returned status ${res.status}` },
          { status: res.status }
        );
      }
    }

    const data = await res.json();

    const payload = Array.isArray(data)
      ? data
      : data && Array.isArray(data.data)
        ? data.data
        : data;

    /* Never cached, and it must stay that way.

       A stale-while-revalidate window was tried here to make switching asset
       feel instant, on the reasoning that settled bars cannot change. That
       reasoning was wrong in one crucial respect: this series has to join the
       live feed exactly. Serving history that ended up to five minutes ago,
       while the WebSocket delivers ticks for right now, leaves nothing in
       between — and the chart draws precisely that, a hole between the last
       cached bar and the first live one.

       A gap in a price chart is not a cosmetic flaw. Traders read those bars.
       Whatever the redraw costs, it is never worth showing a market that did
       not happen. */
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("[Chart Proxy] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}
