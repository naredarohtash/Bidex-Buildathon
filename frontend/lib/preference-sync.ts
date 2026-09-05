"use client";

/**
 * Account-level preference sync.
 *
 * Everything the terminal remembers — pinned asset tabs, trading settings,
 * chart options, active indicators, panel layout — is persisted to browser
 * storage, which is per-device. Two browsers signed into the same account
 * therefore diverge. This mirrors that storage to the account so the workspace
 * follows the user between machines.
 *
 * Model is "sync on load/refresh": the server copy is pulled once when the
 * terminal mounts, and local changes are pushed back as they happen. A second
 * device picks up changes the next time it loads. Last write wins — deliberately
 * simple, so two open devices can never fight over the same key mid-session.
 *
 * Rather than wiring each setting individually, this mirrors a whitelist of
 * storage keys. Anything added to SYNCED_KEYS syncs automatically.
 *
 * ── Account isolation ──────────────────────────────────────────────────────
 * Browser storage outlives a logout: nothing clears it, so signing into a
 * second account on the same browser would otherwise inherit the first
 * account's state. Two defences below:
 *   1. OWNER_KEY records whose data is in storage. On a mismatch every synced
 *      key is purged before the new account's copy is pulled.
 *   2. binary-trading-store is sanitized to its preference fields on the way
 *      out, because it also persists orders, completedOrders and balances.
 *      Those are account data, not preferences, and must never be uploaded.
 */

import { $fetch } from "@/lib/api";

/** Storage keys mirrored to the account. Add new settings here. */
export const SYNCED_KEYS = [
  // workspace
  "binary-trading-store", // pinned asset tabs + selected symbol (sanitized below)
  "trading-settings-store", // trading settings panel
  "binary-risk-management-store",
  "binary-martingale-store",
  "bidex-price-alerts",
  // chart
  "binary-chart-indicators", // active indicators with params and colours
  "bidex_chart_view_settings", // grid / crosshair / axis toggles
  "chart_grid_opacity",
  "custom_candle_colors",
  "chart_custom_background",
  "binary_timezone",
  // layout and misc
  "bidex_drawing_toolbar_position",
  "bidex_drawing_toolbar_user_placed",
  "binary-completed-orders-height",
  "binary_positions_list_collapsed",
  "preferred_currency",
  "theme-store",
] as const;

/**
 * Key families whose names are not known ahead of time.
 *
 * Chart drawings are stored one entry per instrument —
 * `binary-chart-drawings-EURUSD`, `binary-chart-drawings-BTCUSDT` — so no fixed
 * whitelist can name them, and they were the one part of a workspace that never
 * followed the account anywhere: a trendline drawn on the desktop simply did not
 * exist on the laptop.
 */
export const SYNCED_KEY_PREFIXES = ["binary-chart-drawings-"] as const;

/**
 * Ceilings on the prefixed families, which unlike the whitelist have no natural
 * bound — a trader who draws on two hundred instruments would otherwise walk the
 * account blob into the server's 256KB refusal and take every other preference
 * down with it. Newest wins when there are too many, and one enormous drawing
 * set is dropped rather than allowed to crowd out the rest.
 */
const MAX_PREFIXED_KEYS = 40;
const MAX_PREFIXED_BYTES = 24 * 1024;

/** Records which account the locally stored data belongs to. */
const OWNER_KEY = "bidex_prefs_owner";

/**
 * The only fields of binary-trading-store that are preferences. Everything else
 * it persists — orders, completedOrders, demoBalance, binaryMarkets — is
 * account data or a server-owned cache and is deliberately excluded.
 */
const BINARY_STORE_PREFERENCE_FIELDS = [
  "activeMarkets",
  "currentSymbol",
  "timeFrame",
  "tradingMode",
  "selectedExpiryMinutes",
  "selectedOrderType",
  "durationMode",
  "customDurationSeconds",
] as const;

type Snapshot = Record<string, string | null>;

function getItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota or private mode */
  }
}

/**
 * Strip binary-trading-store down to its preference fields. Returns null when
 * there is nothing worth syncing, so the caller can skip the key entirely.
 */
function sanitizeForUpload(key: string, raw: string | null): string | null {
  if (raw === null) return null;
  if (key !== "binary-trading-store") return raw;
  try {
    const parsed = JSON.parse(raw);
    const state = parsed?.state;
    if (!state || typeof state !== "object") return null;
    const kept: Record<string, unknown> = {};
    for (const field of BINARY_STORE_PREFERENCE_FIELDS) {
      if (field in state) kept[field] = state[field];
    }
    if (Object.keys(kept).length === 0) return null;
    return JSON.stringify({ ...parsed, state: kept });
  } catch {
    return null;
  }
}

/**
 * Apply a downloaded value. binary-trading-store is merged field-by-field so
 * the incoming preferences never clobber locally held orders or balances.
 */
function applyDownloaded(key: string, value: string): boolean {
  if (key !== "binary-trading-store") {
    if (getItem(key) === value) return false;
    setItem(key, value);
    return true;
  }
  try {
    const incoming = JSON.parse(value);
    if (!incoming?.state) return false;
    const existingRaw = getItem(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const merged = {
      ...existing,
      ...incoming,
      state: { ...(existing.state || {}), ...incoming.state },
    };
    const serialized = JSON.stringify(merged);
    if (existingRaw === serialized) return false;
    setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/** True if the key belongs to one of the prefixed families. */
export function isSyncedKey(key: string): boolean {
  if ((SYNCED_KEYS as readonly string[]).includes(key)) return true;
  return SYNCED_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * The prefixed keys currently in storage, trimmed to the ceilings above.
 *
 * localStorage has no ordering, so "newest" is approximated by size-capping each
 * entry and then taking the first MAX_PREFIXED_KEYS that survive. Which forty
 * instruments' drawings sync is arbitrary in the rare case of a tie; that the
 * blob stays under the server's limit is not.
 */
function prefixedKeys(): string[] {
  const found: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !SYNCED_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
      const value = getItem(key);
      if (value && value.length > MAX_PREFIXED_BYTES) continue;
      found.push(key);
    }
  } catch {
    /* storage unavailable */
  }
  return found.sort().slice(0, MAX_PREFIXED_KEYS);
}

function readLocal(): Snapshot {
  const out: Snapshot = {};
  if (typeof window === "undefined") return out;
  for (const key of SYNCED_KEYS) out[key] = sanitizeForUpload(key, getItem(key));
  for (const key of prefixedKeys()) out[key] = getItem(key);
  return out;
}

function changedKeys(a: Snapshot, b: Snapshot): string[] {
  // The union of both sides, not the whitelist: a prefixed key that has just
  // appeared is absent from one snapshot entirely, and a key that has been
  // deleted is absent from the other. Iterating only the fixed list would miss
  // both, which is how drawings would have gone on not syncing.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]);
}

/**
 * Drop every synced key. Used when storage belongs to a different account:
 * preferences are account-level now, so carrying them across a switch would
 * both surprise the new user and upload the previous user's state.
 */
export function purgeSyncedKeys(): void {
  if (typeof window === "undefined") return;
  // Prefixed families included, or one account's drawings would stay on the
  // canvas after another signs in on the same browser.
  const keys = [...SYNCED_KEYS, ...prefixedKeys()];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Zustand's persist middleware reads storage once, at store creation — which
 * happens on import, long before this pull finishes. Writing localStorage alone
 * would therefore have no visible effect until the next page load, so the
 * already-created stores are told to re-read. Imported lazily to avoid pulling
 * the terminal stores into every bundle that touches this module.
 */
async function rehydrateStores(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  try {
    const mod: any = await import("@/store/trade/use-binary-store");
    const store = mod.useBinaryStore ?? mod.default;
    if (store?.persist?.rehydrate) tasks.push(Promise.resolve(store.persist.rehydrate()));
  } catch {
    /* store not present in this build — nothing to rehydrate */
  }
  try {
    const mod: any = await import("@/store/trade/use-trading-settings-store");
    const store = mod.useTradingSettingsStore ?? mod.default;
    if (store?.persist?.rehydrate) tasks.push(Promise.resolve(store.persist.rehydrate()));
  } catch {
    /* as above */
  }
  await Promise.allSettled(tasks);
}

/**
 * Hand the freshly downloaded chart preferences to the chart that is already
 * running.
 *
 * This is the step that was missing, and the reason the grid settings looked
 * like they were "dropped" on a second device and after every restart. They were
 * being downloaded correctly — the engine had simply already read storage by the
 * time they landed. It reads `chart_grid_opacity`, `bidex_chart_view_settings`,
 * `custom_candle_colors` and its drawings once, during init, and nothing tells
 * it to look again. So the account's settings sat in localStorage, correct and
 * invisible, until the next full page load, which is indistinguishable from not
 * having synced at all.
 *
 * Each of these has a live entry point; this calls them. Everything is guarded,
 * because the chart may not be mounted when the pull returns — on that path the
 * values are in storage and the engine will read them itself at init, which is
 * the case that already worked.
 */
async function applyChartPreferences(keys: string[]): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as any;

  if (keys.includes("chart_grid_opacity")) {
    const raw = getItem("chart_grid_opacity");
    const value = raw === null ? NaN : parseFloat(raw);
    if (!Number.isNaN(value) && typeof w.setChartGridOpacity === "function") {
      w.setChartGridOpacity(value);
    }
  }

  if (keys.includes("custom_candle_colors")) {
    const raw = getItem("custom_candle_colors");
    if (raw && typeof w.setCustomCandleColors === "function") {
      try {
        w.setCustomCandleColors(JSON.parse(raw));
      } catch {
        /* malformed entry — leave the chart on what it has */
      }
    }
  }

  // The wallpaper. The engine watches for this event rather than polling, so
  // arriving settings have to announce themselves the same way a local change
  // does — otherwise the backdrop appears only after the next reload.
  if (keys.includes("chart_custom_background")) {
    window.dispatchEvent(new Event("chart-background-updated"));
  }

  if (keys.includes("bidex_chart_view_settings")) {
    const raw = getItem("bidex_chart_view_settings");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const store = w.__chartStore ?? w.__useChartStore;
        const update = store?.getState?.()?.updateSettings;
        if (parsed && typeof parsed === "object" && typeof update === "function") {
          update(parsed);
        }
      } catch {
        /* as above */
      }
    }
  }

  /* Drawings for the instrument on screen.
     The engine imports a symbol's drawings when the symbol CHANGES — it holds
     the last one in a ref and returns early if it matches — so the chart already
     showing EURUSD will never re-read EURUSD's drawings on its own, no matter
     what arrives in storage. The ones for other instruments need no help: they
     load when the trader switches to them. */
  const drawingKeys = keys.filter((k) => k.startsWith("binary-chart-drawings-"));
  if (drawingKeys.length === 0) return;

  let currentSymbol: string | undefined;
  try {
    const mod: any = await import("@/store/trade/use-binary-store");
    const store = mod.useBinaryStore ?? mod.default;
    currentSymbol = store?.getState?.()?.currentSymbol;
  } catch {
    return;
  }
  if (!currentSymbol) return;

  const key = `binary-chart-drawings-${currentSymbol}`;
  if (!drawingKeys.includes(key)) return;

  const manager = w.__chart_drawing_manager;
  if (!manager?.importDrawings || !manager?.clearAll) return;
  try {
    const drawings = JSON.parse(getItem(key) || "[]");
    if (!Array.isArray(drawings)) return;
    manager.clearAll();
    if (drawings.length > 0) manager.importDrawings(drawings);
  } catch {
    /* leave the canvas as it is rather than half-clearing it */
  }
}

/**
 * Tell the running UI that the account's chosen currency has arrived.
 *
 * Every place that shows a balance reads `preferred_currency` from storage once
 * when it mounts and then waits for an event — the header dispatches both a
 * `storage` event and `currency-changed` when the trader picks a currency,
 * because a same-tab `setItem` fires neither on its own. This pull writes the
 * same key and dispatched nothing, so on any browser that had not set it
 * locally — a second device, a fresh sign-in, one whose site data had been
 * cleared — every component had already read the "USDT" default and kept
 * showing it. The right currency was sitting in storage, correct and ignored,
 * until the next full page load. That is the "it changes to USDT" report.
 */
function announceCurrencyChange(keys: string[]): void {
  if (typeof window === "undefined") return;
  if (!keys.includes("preferred_currency")) return;
  const value = getItem("preferred_currency");
  window.dispatchEvent(new Event("currency-changed"));
  window.dispatchEvent(
    new StorageEvent("storage", { key: "preferred_currency", newValue: value })
  );
}

/**
 * Pull the account copy into local storage.
 *
 * `since` turns this into a cheap poll: the server answers `unchanged` and the
 * whole map stays on the wire when nothing has been written after that instant.
 */
export async function pullPreferences(
  since?: number
): Promise<{ ok: boolean; snapshot: Snapshot; updatedAt: number; applied: string[] }> {
  const { data, error } = await $fetch<{
    preferences?: Record<string, string>;
    unchanged?: boolean;
    updatedAt: number;
  }>({
    url: since && since > 0 ? `/api/user/preferences?since=${since}` : "/api/user/preferences",
    silent: true,
    silentSuccess: true,
  });

  if (error || !data) return { ok: false, snapshot: readLocal(), updatedAt: since ?? 0, applied: [] };
  if (data.unchanged) return { ok: true, snapshot: readLocal(), updatedAt: data.updatedAt ?? since ?? 0, applied: [] };
  if (!data.preferences) return { ok: false, snapshot: readLocal(), updatedAt: since ?? 0, applied: [] };

  const applied: string[] = [];
  for (const [key, value] of Object.entries(data.preferences)) {
    if (!isSyncedKey(key)) continue;
    if (typeof value !== "string") continue;
    if (applyDownloaded(key, value)) applied.push(key);
  }

  if (applied.length > 0) {
    await rehydrateStores();
    await applyChartPreferences(applied);
    announceCurrencyChange(applied);
  }
  return { ok: true, snapshot: readLocal(), updatedAt: data.updatedAt ?? 0, applied };
}

/**
 * The largest a single preference may be before it is left behind.
 *
 * The server takes the whole PUT or none of it, and refuses anything over 256KB.
 * So one oversized value does not merely fail to sync — it fails the request it
 * travels in and takes every setting batched alongside it with it, silently,
 * because the sync advances its baseline optimistically and never retries.
 *
 * That is not hypothetical: chart_custom_background held the wallpaper as a
 * base64 data URL of up to 2MB, so from the moment a trader set one, none of
 * their preferences reached the account again. The wallpaper is an uploaded URL
 * now, but a value already in a browser from before that change would still be
 * huge, and nothing else should ever be able to do this again.
 */
const MAX_VALUE_BYTES = 32 * 1024;

/**
 * Push the given keys' current local values to the account.
 *
 * Returns the server's own `updatedAt` for the write, or 0 if it did not
 * happen. The caller needs the server's clock rather than its own: it feeds the
 * `since` on the next poll, and a browser running a few seconds fast would
 * otherwise ask for changes "after" an instant the server has not reached and
 * miss every update until its clock caught up.
 */
export async function pushPreferences(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const preferences: Record<string, string | null> = {};
  for (const key of keys) {
    const value = sanitizeForUpload(key, getItem(key));
    // Skipped, not sent as null: null deletes the key on the server, and a value
    // too big to carry is not the same as a value the trader cleared.
    if (value !== null && value.length > MAX_VALUE_BYTES) continue;
    preferences[key] = value;
  }
  if (Object.keys(preferences).length === 0) return 0;
  const { data, error } = await $fetch<{ updatedAt: number }>({
    url: "/api/user/preferences",
    method: "PUT",
    body: { preferences },
    silent: true,
    silentSuccess: true,
  });
  return error ? 0 : Number(data?.updatedAt) || 0;
}

/**
 * Start mirroring for the given account. Returns a stop function.
 *
 * Storage writes from the same tab do not fire the `storage` event, and these
 * settings are written by many unrelated components (zustand persist, the chart
 * engine, plain setItem calls), so this polls a small snapshot rather than
 * trying to intercept every writer.
 */
export function startPreferenceSync(userId: string): () => void {
  let stopped = false;
  let baseline: Snapshot = {};
  let serverAt = 0;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let localTimer: ReturnType<typeof setInterval> | null = null;
  let remoteTimer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  const flush = async () => {
    if (stopped) return;
    const current = readLocal();
    const keys = changedKeys(baseline, current);
    if (keys.length === 0) return;
    // Optimistically advance the baseline: if the push fails, the next poll
    // sees no diff and the change waits for the following edit. Preferences are
    // not critical data, and this avoids hammering a failing endpoint.
    baseline = current;
    busy = true;
    try {
      // Our own write is the newest thing on the account now. Recording the
      // server's timestamp for it stops the next remote poll pulling the change
      // straight back down and re-applying it, which for drawings would clear
      // and re-import the canvas under the trader's cursor.
      const at = await pushPreferences(keys);
      if (at > 0) serverAt = at;
    } finally {
      busy = false;
    }
  };

  (async () => {
    const previousOwner = getItem(OWNER_KEY);
    const switchedAccount = previousOwner !== null && previousOwner !== userId;
    if (switchedAccount) {
      // Storage belongs to a different account. Clear it before pulling, so the
      // new account neither inherits nor re-uploads the previous user's state.
      purgeSyncedKeys();
      await rehydrateStores();
    }

    const { ok, updatedAt } = await pullPreferences();
    if (stopped) return;

    // Only claim ownership once the account's own copy is in place. Failing the
    // pull and then pushing would overwrite the account with whatever this
    // browser happened to be holding.
    if (!ok && switchedAccount) return;
    setItem(OWNER_KEY, userId);
    serverAt = updatedAt;

    baseline = readLocal();

    /* Outbound: what changed in this browser.

       2s and a 700ms settle, down from 4s and 1500ms. The old numbers were
       chosen when this only had to survive until the next page load; a drawing
       the trader expects to appear on the desktop while they are still looking
       at the laptop cannot wait five and a half seconds to leave the machine it
       was made on. The debounce still exists because dragging a slider or a
       trendline writes storage continuously and only the settled value matters. */
    localTimer = setInterval(() => {
      if (stopped || busy) return;
      const current = readLocal();
      if (changedKeys(baseline, current).length === 0) return;
      if (pushTimer) clearTimeout(pushTimer);
      // Cleared as it fires. The remote poll stands down while a push is
      // pending, and a handle left dangling after the timeout ran would hold it
      // down permanently — one local edit and the device would never see
      // another device's work again.
      pushTimer = setTimeout(() => {
        pushTimer = null;
        void flush();
      }, 700);
    }, 2000);

    /* Inbound: what changed on another device.

       This is the half that did not exist. The account copy was pulled once, at
       mount, and never again — so a second device signed into the same account
       showed the workspace as it stood when its tab opened and nothing after
       that. A trendline drawn on the desktop appeared on the laptop only if the
       laptop was reloaded, which is exactly what "they should be visible live"
       is asking not to have to do.

       It carries the timestamp it already holds, so a poll with nothing to
       report costs two numbers rather than the whole preference map — the pinned
       tabs, the indicators, every instrument's drawings — which at this
       frequency, across every open terminal, is the difference between a
       feature and a load problem.

       Skipped while a push is in flight or pending: pulling then would race our
       own outbound change and could apply a copy of the account that predates
       it. Local edits win over remote ones for as long as they are unsent, which
       is the right way round — one of them is under the trader's hands. */
    remoteTimer = setInterval(async () => {
      if (stopped || busy || pushTimer) return;
      if (changedKeys(baseline, readLocal()).length > 0) return;
      busy = true;
      try {
        const res = await pullPreferences(serverAt);
        if (stopped || !res.ok) return;
        serverAt = res.updatedAt || serverAt;
        // Anything applied came from elsewhere; adopt it as the baseline so it
        // is not immediately detected as a local change and pushed back.
        if (res.applied.length > 0) baseline = res.snapshot;
      } finally {
        busy = false;
      }
    }, 3000);
  })();

  return () => {
    stopped = true;
    if (localTimer) clearInterval(localTimer);
    if (remoteTimer) clearInterval(remoteTimer);
    if (pushTimer) clearTimeout(pushTimer);
  };
}
