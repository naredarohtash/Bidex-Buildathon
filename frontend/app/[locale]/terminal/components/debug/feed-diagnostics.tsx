"use client";

/**
 * Feed diagnostics — a removable instrument for the "come back to a dead chart"
 * report.
 *
 * The failure only happens on a real phone: a desktop browser, headless or not,
 * keeps its WebSocket through a frozen tab, so both the broken and the fixed
 * build pass every local test. Rather than keep inferring from symptoms, this
 * records what the feed actually looks like at the moment the tab returns, on
 * the device where it goes wrong.
 *
 * It answers the three questions the symptoms cannot separate:
 *
 *   1. Is the socket dead?      readyState + the manager's own status, plus how
 *                               long since a frame actually arrived.
 *   2. Is the clock wrong?      the server offset, and the gap between the
 *                               bucket the client computes and the newest
 *                               candle the server has sent.
 *   3. Did recovery run?        refetch count, and whether the socket object
 *                               was replaced.
 *
 * Off unless asked for: add `?diag=feed` to the terminal URL once (it sticks),
 * or `?diag=off` to stop. Nothing renders and no timer runs otherwise, so this
 * costs nothing for everyone else.
 */

import { useEffect, useRef, useState } from "react";
import { wsManager } from "@/services/ws-manager";

const FLAG = "bidex_feed_diag";
const STORE = "bidex_feed_diag_log";
const MAX_ROWS = 80;
const SAMPLE_MS = 2000;

type Row = { t: number; tag: string; detail: string };

/* The log outlives the page.
   Reloading is what a trader does the moment the chart stops moving, and a
   reload was wiping the only record of why it stopped — so the evidence was
   destroyed by the very reflex the bug provokes. Rows are kept in
   localStorage and reloaded on mount, with the reload itself marked so the
   two sides of it can be told apart. */
function loadRows(): Row[] {
  try {
    const raw = localStorage.getItem(STORE);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows.slice(-MAX_ROWS) : [];
  } catch {
    return [];
  }
}

function saveRows(rows: Row[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(rows.slice(-MAX_ROWS)));
  } catch {}
}

function chartState(): any {
  const w = window as any;
  try {
    return w.__chartStore?.getState?.() ?? w.__useChartStore?.getState?.() ?? null;
  } catch {
    return null;
  }
}

/** Inferred from the candles themselves — the store does not reliably carry it. */
function inferIntervalMs(candles: any[]): number {
  if (!candles || candles.length < 3) return 60000;
  const gaps: number[] = [];
  for (let i = candles.length - 1; i > 0 && gaps.length < 5; i--) {
    const d = Number(candles[i].time) - Number(candles[i - 1].time);
    if (d > 0) gaps.push(d);
  }
  if (!gaps.length) return 60000;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function sample() {
  const now = Date.now();
  const st = chartState();
  const candles: any[] = st?.candles ?? [];
  const newest = candles.length ? Number(candles[candles.length - 1].time) : 0;
  const iv = inferIntervalMs(candles);
  const offset = Number((window as any).__binary_time_offset ?? 0);
  // The same arithmetic the engine uses to decide which bucket "now" is.
  const clientBucket = Math.floor((now + offset) / iv) * iv;

  /* The app's transport, which is what the chart's feed runs on since it was
     moved off the engine's embedded copy. It reports its own liveness, so this
     no longer digs sockets out of globalThis or relies on frame timestamps
     stamped onto them by a patch inside the bundle. */
  let socks: any[] = [];
  try {
    socks = wsManager.describeConnections().map((c) => ({
      id: c.id,
      rs: c.readyState,
      status: c.status,
      silentMs: c.silentMs,
    }));
  } catch {}

  const last = candles.length ? candles[candles.length - 1] : null;

  return {
    now,
    offset,
    iv,
    socks,
    newest,
    bucketsBehind: newest ? Math.round((clientBucket - newest) / iv) : null,
    refetch: st?.refetchTrigger ?? null,
    flatBody: last
      ? last.open === last.high && last.high === last.low && last.low === last.close
      : null,
    close: last?.close ?? null,
    n: candles.length,
  };
}

function fmt(s: ReturnType<typeof sample>): string {
  const sk = s.socks
    .map(
      (x) =>
        `${x.id} rs=${x.rs} ${x.status}${
          x.silentMs === null ? " silent=never" : ` silent=${(x.silentMs / 1000).toFixed(1)}s`
        }`
    )
    .join(" | ");
  return `off=${s.offset}ms iv=${s.iv / 1000}s behind=${s.bucketsBehind} rft=${
    s.refetch
  } n=${s.n} close=${s.close}${s.flatBody ? " FLAT-BODY" : ""} :: ${sk || "no sockets"}`;
}

export default function FeedDiagnostics() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState("");
  const hiddenAt = useRef(0);
  const lastRefetch = useRef<number | null>(null);
  const lastSock = useRef<any>(null);

  // Enable/disable from the URL, then remember it.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("diag");
      if (q === "feed") localStorage.setItem(FLAG, "1");
      if (q === "off") localStorage.removeItem(FLAG);
      setOn(localStorage.getItem(FLAG) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!on) return;

    const push = (tag: string, detail: string) =>
      setRows((r) => {
        const next = [...r.slice(-(MAX_ROWS - 1)), { t: Date.now(), tag, detail }];
        saveRows(next);
        return next;
      });

    // Restore what happened before the last reload, and mark the seam.
    setRows(() => {
      const prior = loadRows();
      const next = [
        ...prior,
        { t: Date.now(), tag: "───── PAGE LOAD ─────", detail: fmt(sample()) },
      ];
      saveRows(next);
      return next;
    });

    const tick = () => {
      const s = sample();
      setLive(fmt(s));

      // Only the transitions are worth a row; a heartbeat every 2s would bury them.
      if (lastRefetch.current !== null && s.refetch !== lastRefetch.current) {
        push("REFETCH", fmt(s));
      }
      lastRefetch.current = s.refetch;

      const idKey = s.socks.map((x) => `${x.id}:${x.rs}:${x.status}`).join(",");
      if (lastSock.current !== null && idKey !== lastSock.current) {
        push("SOCKET", fmt(s));
      }
      lastSock.current = idKey;

      if (s.socks.some((x) => x.silentMs !== null && x.silentMs > 10000)) {
        push("SILENT>10s", fmt(s));
      }
      if (s.bucketsBehind !== null && s.bucketsBehind !== 0) {
        push(`BUCKET${s.bucketsBehind > 0 ? "+" : ""}${s.bucketsBehind}`, fmt(s));
      }
      if (s.flatBody) push("FLAT-BODY", fmt(s));
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        push("HIDDEN", fmt(sample()));
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = 0;
      // The snapshot taken before anything has had a chance to react is the
      // whole point — this is the state the page woke up holding.
      push(`VISIBLE after ${(away / 1000).toFixed(1)}s`, fmt(sample()));
      // And again once recovery has had its window, to show what it did.
      setTimeout(() => push("+3s", fmt(sample())), 3000);
      setTimeout(() => push("+10s", fmt(sample())), 10000);
    };

    tick();
    const h = setInterval(tick, SAMPLE_MS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(h);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [on]);

  if (!on) return null;

  const text = rows
    .map((r) => `${new Date(r.t).toLocaleTimeString()} [${r.tag}] ${r.detail}`)
    .join("\n");

  return (
    /* Over the chart, not over the trade buttons — it sat on top of Call. */
    <div className="fixed left-1 top-[52px] z-[100000] max-w-[98vw] pointer-events-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded bg-black/85 text-[10px] font-mono text-emerald-300 border border-emerald-500/40"
      >
        {open ? "▼ feed diag" : "▲ feed diag"} · {rows.length}
      </button>

      {open && (
        <div className="mt-1 w-[97vw] rounded bg-black/92 border border-emerald-500/30 p-2">
          <div className="text-[9px] font-mono text-emerald-200 break-all mb-1.5">{live}</div>
          <div className="flex gap-1.5 mb-1.5">
            <button
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(text);
                } catch {}
              }}
              className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold"
            >
              Copy log
            </button>
            <button
              onClick={() => {
                setRows([]);
                saveRows([]);
              }}
              className="px-2 py-0.5 rounded bg-zinc-700 text-white text-[10px] font-bold"
            >
              Clear
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(FLAG);
                } catch {}
                setOn(false);
              }}
              className="px-2 py-0.5 rounded bg-zinc-700 text-white text-[10px] font-bold"
            >
              Turn off
            </button>
          </div>
          <pre className="max-h-[42vh] overflow-auto text-[9px] leading-[1.35] font-mono text-zinc-200 whitespace-pre-wrap break-all">
            {text || "waiting…"}
          </pre>
        </div>
      )}
    </div>
  );
}
