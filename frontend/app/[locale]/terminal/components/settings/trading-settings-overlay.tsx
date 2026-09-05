"use client";

/**
 * Settings — three sections behind three tabs.
 *
 * Two rebuilds got here. The first flattened everything into one scrolling
 * column of rows; it fixed the right problem (seven identical cards, each with
 * a coloured icon, a subtitle restating its title, and a nested box around its
 * control) and then overcorrected — a theme picker, a grid slider, a time zone,
 * a wallpaper uploader, one-click trading and a daily loss limit all became the
 * same row, in one list, in no order you could predict.
 *
 * The second split them into an index of three destinations. Right grouping,
 * wrong navigation: three items is not enough to earn a screen, so opening
 * settings showed a short menu above six hundred pixels of empty column, and
 * every control was a click in and a click back.
 *
 * So: the grouping from the second, the directness of the first.
 *
 * - **Appearance** — what the workspace looks like.
 * - **Trading** — how orders get placed, and what you hear.
 * - **Risk & limits** — the two rules that can stop you trading.
 *
 * What each level is allowed to do is the point:
 *
 * - A **section** is flat rows under small-caps headings, running the full
 *   width of the column with a hairline between them. Nothing there is dressed
 *   up, and nothing is boxed.
 * - Two sections are **cards** — the daily loss limit and the cooldown —
 *   because they carry live state and can take the buy button away from you.
 *   They are framed so that everything else can be plain. See
 *   `risk-settings.tsx`.
 * - The **accent is blue and means chosen**. Amber and red are states, not
 *   decoration: they appear when a figure is near its limit or past it.
 *
 * The column is wider than the ranking that docks in the same place — see
 * `SETTINGS_DOCK_WIDTH`. Settings is operated, not read.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Blend,
  Contrast,
  Crosshair,
  Frame,
  Image as ImageIcon,
  MousePointerClick,
  Scaling,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useRiskManagement } from "../risk-management/use-risk-management";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { imageUploader } from "@/utils/upload";
import { TIME_ZONES, renderTzFlag } from "@/components/blocks/chart-switcher/pair-info-control";
import { applyTimeZone } from "../../lib/time-zone-sync";
import { canonicalZoneId, utcOffset } from "@/lib/time-zones";
import { MOBILE_NAV_HEIGHT } from "../navigation/mobile-navigation";
import { SETTINGS_DOCK_WIDTH, SETTINGS_PANEL_SURFACE, DOCK_TRANSITION } from "../layout/dock";
import { DailyLimitSection, TradeCooldownSection } from "./risk-settings";
import {
  FieldRow,
  RowMark,
  SectionHead,
  SettingsSection,
  SettingRow,
  Slider,
  Switch,
  Tabs,
  TileRow,
  ThemeChoice,
} from "./settings-controls";
import type { ThemeOption } from "./settings-controls";

// ============================================================================
// TYPES
// ============================================================================

interface TradingSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
  balance: number;
  currentPrice?: number;
  symbol: string;
  currency?: string;
  oneClickEnabled: boolean;
  onOneClickChange: (enabled: boolean) => void;
  oneClickMaxAmount: number;
  currentAmount: number;
  onPlaceOrder?: (side: "RISE" | "FALL", amount: number, expiryMinutes: number) => Promise<boolean>;
  isMobile?: boolean;
  isSidebarCollapsed?: boolean;
  /** See the same prop on the ranking column — the layout owns this number. */
  dockedWidth?: number;
  onDockReady?: () => void;
}

type Page = "appearance" | "risk";

/* Light, then dusk, then night — the order the day runs in, so the list has a
   direction rather than being three options in whatever order they were
   written.

   `palette` is that theme's own tokens, lifted from globals.css, and the tile
   in the picker is drawn with them. That is the mark doing real work: Navy and
   Dark are two shades of near-black and no word tells them apart, but two
   pictures side by side do — and a picture of the workspace answers the
   question a swatch could not, which is what the theme looks like to work in.

   `line` is `--muted` lifted a few points. At its token value the bars standing
   in for text vanish into the surface behind them once the drawing is scaled
   down to the width of a third of the column. */
const THEMES: readonly ThemeOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright, for daylight",
    palette: {
      bg: "hsl(220 20% 97%)",
      card: "hsl(0 0% 100%)",
      border: "hsl(214 22% 88%)",
      line: "hsl(214 20% 86%)",
      text: "hsl(240 10% 20%)",
      accent: "hsl(221 83% 53%)",
    },
  },
  {
    value: "navy",
    label: "Navy",
    description: "Deep blue, easier at night",
    palette: {
      bg: "hsl(222 47% 8%)",
      card: "hsl(222 47% 12%)",
      border: "hsl(222 47% 24%)",
      line: "hsl(222 40% 29%)",
      text: "hsl(210 40% 96%)",
      accent: "hsl(217 91% 60%)",
    },
  },
  {
    value: "dark",
    label: "Dark",
    description: "Near-black, least glare",
    palette: {
      bg: "hsl(240 10% 3.9%)",
      card: "hsl(240 8% 9%)",
      border: "hsl(240 5% 21%)",
      line: "hsl(240 5% 28%)",
      text: "hsl(0 0% 92%)",
      accent: "hsl(217 91% 60%)",
    },
  },
];

// ============================================================================
// MAIN
// ============================================================================

export function TradingSettingsOverlay({
  isOpen,
  onClose,
  balance,
  currentPrice: propCurrentPrice,
  currency = "USDT",
  oneClickEnabled,
  onOneClickChange,
  onPlaceOrder = async () => false,
  isMobile = false,
  dockedWidth = 0,
  onDockReady,
}: TradingSettingsOverlayProps) {
  const tCommon = useTranslations("common");
  const storeCurrentPrice = useBinaryStore((s) => s.currentPrice);
  const currentPrice = propCurrentPrice ?? storeCurrentPrice;

  const [page, setPage] = useState<Page>("appearance");

  const riskManagement = useRiskManagement({
    balance,
    currentPrice,
    onLimitOrderTriggered: useCallback(
      async (order) => {
        await onPlaceOrder(order.side, order.amount, order.expiryMinutes);
      },
      [onPlaceOrder]
    ),
    onDailyLimitReached: useCallback(() => {}, []),
    onCooldownStarted: useCallback(() => {}, []),
  });

  const dailyLimit = riskManagement.state.dailyLimit;
  const cooldown = riskManagement.state.cooldown;
  const updateDailyLimit = riskManagement.updateDailyLimit;
  const updateCooldown = riskManagement.updateCooldown;
  const getCooldownRemaining = riskManagement.getCooldownRemaining;
  const overrideCooldown = riskManagement.overrideCooldown;
  const overrideDailyLimit = riskManagement.overrideDailyLimit;
  const tradingStatus = useMemo(() => riskManagement.canTrade(), [riskManagement]);

  /* The hook takes partials; the panel used to spread the whole settings object
     into every update, so two controls changed in quick succession could write
     back a stale copy of the other one's field. */
  const handleCooldownChange = useCallback(
    (next: Parameters<typeof updateCooldown>[0]) => updateCooldown(next),
    [updateCooldown]
  );
  const handleDailyLimitChange = useCallback(
    (next: Parameters<typeof updateDailyLimit>[0]) => updateDailyLimit(next),
    [updateDailyLimit]
  );
  /* Long enough to get back to the chart and see what the limit was hiding,
     short enough that it is not simply "off". */
  const handleDailyLimitOverride = useCallback(() => overrideDailyLimit(60), [overrideDailyLimit]);

  useEffect(() => {
    if (isMobile) return;
    onDockReady?.();
  }, [isMobile, onDockReady]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* Reopening lands on the first tab rather than wherever you were last. Reset
     on close, not on open, and only after the dock has finished sliding shut —
     resetting on the same frame as the close plays the tab change as a visible
     flicker inside a column that is already animating away. */
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setPage("appearance");
      setTzOpen(false);
    }, 350);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ── Appearance ────────────────────────────────────────────────────────────

  const { theme: currentTheme, resolvedTheme, setTheme } = useTheme();

  /* `theme` is the literal string "system" on deployments whose configured
     default is system — the tile to ring is then whatever that resolved to,
     not a fourth option this picker does not offer. */
  const selectedTheme = (currentTheme === "system" ? resolvedTheme : currentTheme) ?? "dark";

  /* Sets the class on <html> as well as the store. next-themes writes it on its
     own schedule and the terminal reads the class directly in a dozen places,
     so doing it here is what makes the switch land on the same frame as the
     click rather than the one after. */
  const handleThemeSelect = useCallback(
    (next: string) => {
      setTheme(next);
      if (typeof window === "undefined") return;
      const html = document.documentElement;
      html.classList.remove("light", "dark", "navy");
      html.classList.add(next === "dark" ? "dark" : next === "navy" ? "navy" : "light");
    },
    [setTheme]
  );

  const showGrid = useChartStore((s: any) => s.settings?.showGrid ?? true);
  const showCrosshair = useChartStore((s: any) => s.settings?.showCrosshair ?? true);
  const updateChartSettings = useCallback((updated: any) => {
    const store = useChartStore.getState();
    if (store.updateSettings) store.updateSettings(updated);
  }, []);

  const [gridOpacity, setGridOpacity] = useState(3);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chart_grid_opacity");
      if (!raw) return;
      const saved = parseFloat(raw);
      if (Number.isNaN(saved)) return;
      /* Stored as 0–1 once, as a 1–10 step since. A value under 1 is the old
         scale. The clamp is 10, not 5: the engine's ceiling is 10 (it draws
         `0.03 × value` alpha, see `setChartGridOpacity`), and the panel's old
         maximum of 5 could only reach half of the strength the chart can
         actually draw. Anything already stored is inside the wider range, so
         nothing has to be migrated. */
      setGridOpacity(
        saved > 0 && saved < 1
          ? Math.max(1, Math.min(10, Math.round(saved * 10)))
          : Math.max(1, Math.min(10, Math.round(saved)))
      );
    } catch {}
  }, []);

  const handleOpacityChange = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(10, next));
    setGridOpacity(clamped);
    if (typeof window !== "undefined" && (window as any).setChartGridOpacity) {
      (window as any).setChartGridOpacity(clamped);
    } else {
      try {
        localStorage.setItem("chart_grid_opacity", String(clamped));
      } catch {}
    }
  }, []);

  /* Chart timezone. It reads and writes the same `binary_timezone` key and
     fires the same `binary_timezone_changed` event as the chart's own clock
     pill, so the clock, the axis and the pill all follow it. */
  const [timezone, setTimezone] = useState("UTC");
  useEffect(() => {
    try {
      setTimezone(
        localStorage.getItem("binary_timezone") ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "UTC"
      );
    } catch {
      setTimezone("UTC");
    }
  }, []);

  /* The same setter the header's clock uses: this device, and the account
     behind it, so the profile's Time zone row never disagrees with the chart.
     See lib/time-zone-sync. */
  const handleTimezoneChange = useCallback((tzId: string) => {
    setTimezone(tzId);
    applyTimeZone(tzId);
  }, []);

  /* The saved zone may not be one of the listed ones — the chart resolves and
     appends whatever the browser reports. Shown as itself rather than silently
     falling back to UTC, which would misreport what the chart is actually on. */
  const timezoneOptions = useMemo(() => {
    const current = canonicalZoneId(timezone);
    if (!current || TIME_ZONES.some((tz) => tz.id === current)) return TIME_ZONES;
    return [
      {
        id: current,
        label: current,
        name: current.split("/").pop()?.replace(/_/g, " ") || current,
        /* Not a country we list: the globe, which is what `renderTzFlag` draws
           for anything it has no flag for. */
        flagCode: "GLO",
      },
      ...TIME_ZONES,
    ];
  }, [timezone]);

  const selectedZone = useMemo(
    () =>
      timezoneOptions.find((tz) => tz.id === canonicalZoneId(timezone)) ?? {
        id: timezone,
        label: timezone,
        name: timezone,
        flagCode: "GLO",
      },
    [timezoneOptions, timezone]
  );

  /* The abbreviation the price axis uses, straight off the zone's own record —
     "IST", "EST/EDT". It is already in `TIME_ZONES`, so there is nothing to
     derive: `Intl` hands back "GMT+5:30" for half the world, which is the
     offset again rather than the name a trader reads off an axis.

     A zone the browser reported and we do not list carries its raw IANA id in
     that field, which is not an abbreviation — hence the shape test rather than
     a length one. */
  const zoneAbbrev = useMemo(() => {
    const label = selectedZone.label ?? "";
    return /^[A-Z0-9+\-/]{2,9}$/.test(label) ? label : "";
  }, [selectedZone.label]);

  const [tzOpen, setTzOpen] = useState(false);

  /* A clock that does not tick is a screenshot of a time. Thirty seconds is
     enough for a face that shows minutes, and it only runs while the panel is
     open — a settings column is not a place to keep a timer alive. */
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setClockTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isOpen]);

  const zoneTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone === "UTC" ? "UTC" : timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
    } catch {
      return "";
    }
    /* `clockTick` is the dependency that makes this re-run; the zone is what it
       reads. Listing it is not a lint appeasement — it is the tick. */
  }, [timezone, clockTick]);

  // ── Wallpaper ─────────────────────────────────────────────────────────────

  const [wallpaper, setWallpaper] = useState({ visible: false, opacity: 50, size: 100, imageUrl: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("chart_custom_background");
      if (stored) setWallpaper(JSON.parse(stored));
    } catch {}
  }, []);

  const saveWallpaper = useCallback((next: typeof wallpaper) => {
    setWallpaper(next);
    try {
      localStorage.setItem("chart_custom_background", JSON.stringify(next));
      window.dispatchEvent(new Event("chart-background-updated"));
    } catch {}
  }, []);

  /* Uploaded and stored as a URL, never inlined as base64.

     It used to be read with FileReader and kept in localStorage as a data URL —
     up to 2MB of image, which base64 inflates to about 2.7MB. That is why the
     wallpaper never appeared on a second device, and the damage did not stop
     there: preferences sync to the account through one PUT with a 256KB
     ceiling, and the server rejects the WHOLE request when it is exceeded. From
     the moment a wallpaper was set, every push carrying it failed with a 413 and
     took every other setting batched alongside it down as well — silently, since
     the sync advances its baseline optimistically and never retries. */
  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      /* Any image the browser will name as one — WebP and AVIF included, and
         HEIC, which `imageUploader` converts on the way out. The old list was
         four MIME types written by hand, which is a list that goes stale every
         time a format ships; the browser already knows what an image is.

         The extension check is the fallback for the files it does not: some
         systems hand over an empty `type` for SVG and HEIC. */
      const named = file.type.startsWith("image/");
      const looksLikeImage = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|heic|heif|tiff?|jfif)$/i.test(file.name);
      if (!named && !looksLikeImage) {
        setUploadError("That file is not an image.");
        e.target.value = "";
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setUploadError("That file is over 2 MB.");
        e.target.value = "";
        return;
      }
      setUploadError(null);
      setUploading(true);
      try {
        const result = await imageUploader({ file, dir: "chart-backgrounds", size: { maxWidth: 2560, maxHeight: 1440 } });
        if (result?.success && result.url) {
          saveWallpaper({ ...wallpaper, imageUrl: result.url, visible: true });
        } else {
          setUploadError("Upload failed. Try again.");
        }
      } catch {
        setUploadError("Upload failed. Try again.");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [wallpaper, saveWallpaper]
  );

  const pickFile = useCallback(() => fileRef.current?.click(), []);

  /* An `alert()` for a failed upload stops the whole page on a trading screen.
     The message belongs next to the control that produced it. */
  const [uploadError, setUploadError] = useState<string | null>(null);

  /* A dot on the tab is earned by a rule that has actually fired — not by one
     that is merely switched on. */
  const riskAlert = !tradingStatus.allowed;

  const blockedNotice = !tradingStatus.allowed && (
    <div className="mx-3 mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2.5">
      <div className="text-[12px] font-medium text-red-600 dark:text-red-400">
        {tCommon("trading_blocked")}
      </div>
      {tradingStatus.reason && (
        <div className="mt-1 text-[11px] leading-[1.5] text-muted-foreground">
          {tradingStatus.reason}
        </div>
      )}
    </div>
  );

  // ── Pages ─────────────────────────────────────────────────────────────────

  const appearance = (
    <>
      {/* First on the page, because it is what most people open this panel to
          change — and the one control here that is looked at rather than read:
          three pictures of the workspace, painted in the three themes. See
          `ThemeChoice`.

          Its heading is sentence case, not the small-caps `SectionLabel` the
          groups below use. Those label a list of settings; this one names the
          thing you came for, and setting it in caps over three tiles that
          already pull the eye is a heading competing with its own content.

          It sits under a heading and a line rather than inside a `FieldBox`,
          which is what held the rows it replaces. Three tiles already read as
          one group, and a box around them would cost 32px of a 320px column to
          say what the grouping says for free. */}
      <section>
        <SectionHead title="Interface theme" hint="Pick how the app looks." />
        <div className="px-4 pb-1">
          <ThemeChoice options={THEMES} value={selectedTheme} onSelect={handleThemeSelect} />
        </div>
      </section>

      {/* One-click trading, second on the tab.

          It sits above the time zone and the chart because of what it costs to
          get wrong: the other settings change how the terminal looks, and this
          one decides whether pressing Rise or Fall opens a position or asks
          first. A setting that spends money belongs where it is read, not
          filed after the wallpaper.

          It is named for what it turns on, as asked. Worth knowing what that
          costs: the same setting lived on the Trading tab as "Confirm before
          opening a trade" — inverted on purpose, so the switch read *on* for
          the safer of the two states and a green light never meant "a step has
          been removed". Named this way round, on is the riskier setting, which
          is why the line underneath says plainly what it does rather than
          selling the speed.

          It has been *moved*, not copied. The same preference behind two
          switches with opposite polarity, on two tabs of one panel, is a panel
          that contradicts itself. */}
      <section>
        <SectionHead title="Trading" />

        <div>
          <TileRow
            icon={<MousePointerClick size={14} strokeWidth={1.9} />}
            title="One-click trading"
            meta="Opens a trade without confirming"
            control={
              <Switch
                label="One-click trading"
                checked={oneClickEnabled}
                onChange={onOneClickChange}
              />
            }
          />
        </div>
      </section>

      {/* The zone, in the same shape as everything else on the tab.

          It is not a way of drawing the chart — it is what the terminal thinks
          the hour is, and it drives the price axis, the clock in the header and
          the Time zone row on the account screen at once. So it sits above
          "Chart" rather than inside it.

          The row names the zone rather than the setting: "India", not "Time
          zone" — the section label above already said that, and the one thing
          you came to check is which zone you are on. Under it, the city and the
          offset, which is the precise version of the same fact.

          The name carries the abbreviation the axis uses — India IST — quieter
          and smaller, because it is the same fact in the form a trader reads
          off a chart rather than a second setting. The offset goes underneath.
          Between the three of them the row answers "which zone, called what, at
          what offset" without a word being repeated.

          The right edge keeps the live clock, which is the fastest way to see
          the setting is wrong.

          The whole row is the button. The list opens under it in place instead
          of over it, so the thing you are choosing from does not cover the
          thing you are choosing for. */}
      <section>
        <SectionHead title="Time zone" />

        {/* Boxed, where the settings rows are not. The rows are *settings* —
            a name and its switch, read down one margin. This is a *control*: a
            value you open, with a list that comes out of it. The border is what
            makes the list belong to the row it came from rather than looking
            like four more rows that appeared in the sheet, and it is the same
            shape the file chooser wears at the bottom of the tab. */}
        <div className="px-4 pb-1">
          <div className="overflow-hidden rounded-lg border border-border">
            <TileRow
              compact
              icon={renderTzFlag(timezone, selectedZone.name, "sm")}
              title={
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate">{selectedZone.name}</span>
                  {zoneAbbrev && (
                    <span className="shrink-0 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">
                      {zoneAbbrev}
                    </span>
                  )}
                </span>
              }
              meta={utcOffset(timezone)}
              value={zoneTime || undefined}
              onClick={() => setTzOpen((v) => !v)}
              expanded={tzOpen}
            />

            {tzOpen && (
              /* A native <select> cannot draw a flag — an <option> renders text
                 and nothing else — so this is a listbox. Sixty zone names read as
                 a wall of near-identical strings; a flag is recognised before a
                 word of one is. */
              <div
                role="listbox"
                aria-label="Time zone"
                className="max-h-60 overflow-y-auto border-t border-border/60"
              >
                {timezoneOptions.map((tz) => {
                  const active = canonicalZoneId(timezone) === tz.id;
                  return (
                    <button
                      key={tz.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        handleTimezoneChange(tz.id);
                        setTzOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px]",
                        active
                          ? "bg-blue-500/10 font-semibold text-blue-600 dark:text-blue-400"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      {renderTzFlag(tz.id, tz.name, "sm")}
                      <span className="min-w-0 flex-1 truncate">{tz.name}</span>
                      {/* The offset, not the abbreviation. "CST" is Chicago,
                          Shanghai and Havana; "UTC+08:00" is one number, and it
                          is the same one the account screen shows. */}
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {utcOffset(tz.id)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Built to the reference's anatomy — rows of mark → name → line about
          it → control, split by hairlines, with the value at the right edge.

          Full-bleed, not boxed. The reference draws its blocks on a floating
          modal, where a rounded panel is what separates the block from the
          dialog around it; this column *is* the panel, and a second rounded
          surface inside it is a frame drawn on a frame. The rows run edge to
          edge between two hairlines and the text keeps the same 16px margin as
          everything else on the tab, so the whole column reads down one line.

          Three things in it are the reference's and are the point:

          - **The marks are neutral.** A tile the colour of the row it sits on,
            a glyph the colour of the words under it. Tinting every tile with
            the accent spends the one colour that means *this is on* — a column
            of blue squares says nothing about which settings are running.
          - **Every row is two lines.** The name is what it is; the line under
            it is what it does. That is what lets the names be short enough to
            fit a 320px column without truncating mid-sentence.
          - **The value sits at the end of its own row**, tabular, in the same
            place on every row that has one, so a column of settings can be read
            down the right edge.

          The accent stays blue. The reference is green throughout, and green in
          a trading terminal is already taken: it means the price went up. A
          settings switch that borrows it is a switch that looks like a
          position. */}
      <section>
        <SectionHead title="Chart" />

        <div>
          <TileRow
            icon={<Frame size={14} strokeWidth={1.9} />}
            title="Grid lines"
            meta="Behind the price"
            control={
              <Switch
                label="Grid lines"
                checked={showGrid}
                onChange={(next) => updateChartSettings({ showGrid: next })}
              />
            }
          />

          <div className="border-t border-border/60">
            <TileRow
              icon={<Contrast size={14} strokeWidth={1.9} />}
              title="Opacity"
              value={`${gridOpacity * 10}%`}
              dimmed={!showGrid}
            >
              <Slider
                label="Grid opacity"
                value={gridOpacity}
                min={1}
                max={10}
                onChange={handleOpacityChange}
                disabled={!showGrid}
              />
            </TileRow>
          </div>

          {/* The crosshair had no control anywhere in the app until this row:
              `toggleCrosshair` was written in desktop-layout and never
              rendered, so the setting existed, persisted with the rest of the
              chart's view settings, and could be *off* with no way back on.

              Named for the cross, not for "the crosshair", because when it is
              off a dashed horizontal line still follows the pointer — that is
              the price striker, a different thing — and the time chip still
              tracks along the bottom. */}
          <div className="border-t border-border/60">
            <TileRow
              icon={<Crosshair size={14} strokeWidth={1.9} />}
              title="Crosshair"
              meta="Follows the pointer"
              control={
                <Switch
                  label="Crosshair"
                  checked={showCrosshair}
                  onChange={(next) => updateChartSettings({ showCrosshair: next })}
                />
              }
            />
          </div>
        </div>
      </section>

      {/* The background image, as a drop zone rather than a section.

          One dashed target does the whole job of choosing: it says what it
          wants, what it costs (2 MB), and it is the thing you press. The
          version this replaces spent a 96px dashed panel saying "Default
          background" — a picture of the absence of a picture — and then put the
          actual button under it.

          The tile here is tinted, unlike the marks on the rows above. Those are
          settings and this is an action: the one blue thing in a section is the
          thing that does something.

          Opacity and size keep a real slider, not the five-step meter the grid
          opacity uses. Those five steps are the truth about the grid — the
          chart draws five strengths. A wallpaper's opacity is continuous, and a
          control that pretends otherwise would take away values the chart can
          actually render. */}
      <section>
        <SectionHead title="Background" />

        <div>
          {wallpaper.imageUrl && (
            <TileRow
              icon={
                /* The image itself is the mark: one look says which one is
                   loaded, which no filename does. */
                <img
                  src={wallpaper.imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-[5px] object-cover"
                />
              }
              title="Custom background"
              meta={wallpaper.visible ? "Behind the candles" : "Uploaded, not shown"}
              control={
                <span className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => saveWallpaper({ ...wallpaper, imageUrl: "", visible: false })}
                    className="text-[11.5px] font-medium text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                  <span className="h-4 w-px bg-border" />
                  <Switch
                    label="Show the background image"
                    checked={wallpaper.visible}
                    onChange={(next) => saveWallpaper({ ...wallpaper, visible: next })}
                  />
                </span>
              }
            />
          )}

          {wallpaper.imageUrl && (
            <div className="border-t border-border/60">
              <TileRow
                icon={<Blend size={14} strokeWidth={1.9} />}
                title="Opacity"
                value={`${wallpaper.opacity}%`}
                dimmed={!wallpaper.visible}
              >
                <Slider
                  label="Background opacity"
                  value={wallpaper.opacity}
                  min={0}
                  max={100}
                  onChange={(v) => saveWallpaper({ ...wallpaper, opacity: v })}
                  disabled={!wallpaper.visible}
                />
              </TileRow>
            </div>
          )}

          {wallpaper.imageUrl && (
            <div className="border-t border-border/60">
              <TileRow
                icon={<Scaling size={14} strokeWidth={1.9} />}
                title="Size"
                value={`${wallpaper.size}%`}
                dimmed={!wallpaper.visible}
              >
                <Slider
                  label="Background size"
                  value={wallpaper.size}
                  min={10}
                  max={300}
                  onChange={(v) => saveWallpaper({ ...wallpaper, size: v })}
                  disabled={!wallpaper.visible}
                />
              </TileRow>
            </div>
          )}

          <div className={cn("px-4 py-3", wallpaper.imageUrl && "border-t border-border/60")}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-left",
                "hover:border-blue-500/50 hover:bg-blue-500/[0.04]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              {/* The same mark every row on the tab wears. It was a 32px
                  tinted tile on the argument that an action should look unlike
                  a setting; next to four neutral 28px tiles it just looked like
                  a fifth icon that had not been finished. The dashed edge
                  around it already says this one is a target. */}
              <RowMark>
                <ImageIcon size={14} strokeWidth={1.9} />
              </RowMark>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold leading-none text-foreground">
                  {uploading ? "Uploading…" : wallpaper.imageUrl ? "Replace file" : "Choose file"}
                </span>
                <span className="mt-1.5 block truncate text-[11px] leading-none text-muted-foreground">
                  Any image · max 2 MB
                </span>
              </span>
            </button>

            {/* Next to the control that produced it. An `alert()` for a failed
                upload stops a trading screen. */}
            {uploadError && (
              <p className="mt-2 text-[11px] leading-tight text-red-600 dark:text-red-400">
                {uploadError}
              </p>
            )}
          </div>
        </div>
      </section>

    </>
  );

  const risk = (
    <div>
      {/* The tab gets the same head as every section on the other one, so the
          two tabs read as one panel.

          The line under it says what the rules are *for*, not what they do to
          you. "Rules that can stop you trading" describes them from the
          platform's side and reads as a restriction to switch off; the reason
          anyone turns them on is the money still in the account at the end of a
          bad session. */}
      <SectionHead title="Risk controls" hint="The two rules that can save your hard-earned money." />

      <DailyLimitSection
        dailyLimit={dailyLimit}
        onChange={handleDailyLimitChange}
        onOverride={handleDailyLimitOverride}
        balance={balance}
        currency={currency}
      />
      <TradeCooldownSection
        cooldown={cooldown}
        onChange={handleCooldownChange}
        getRemaining={getCooldownRemaining}
        onOverride={overrideCooldown}
      />
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────

  const TABS = [
    {
      value: "appearance" as const,
      label: "System settings",
      icon: <Settings2 size={14} strokeWidth={2} />,
    },
    {
      value: "risk" as const,
      label: "Risk Controller",
      icon: <ShieldCheck size={14} strokeWidth={2} />,
      badge: riskAlert,
    },
  ];

  const body = (
    <>
      {/* The desktop dock already carries a "Settings" title and a close button
          in the band above the column, so the title appears only on mobile,
          which has no band. `pr-14` clears the terminal's own back button. */}
      {isMobile && (
        <div className="flex h-11 shrink-0 items-center border-b border-border px-4 pr-14">
          <h2 className="text-[14px] font-semibold text-foreground">Settings</h2>
        </div>
      )}

      <Tabs tabs={TABS} value={page} onChange={setPage} />

      {/* `scrollbar-gutter: stable` keeps the 8px the scrollbar takes reserved
          whether or not one is showing. Without it, opening the time zone list
          made the tab taller than the panel, the scrollbar appeared, and every
          row in the column lost 8px of width — the whole sidebar visibly
          shrank at the moment you pressed something. */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] pb-4 pt-3">
        {blockedNotice}
        {page === "appearance" && appearance}
        {page === "risk" && risk}
      </div>
    </>
  );

  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div
        style={{ bottom: MOBILE_NAV_HEIGHT }}
        className={cn("absolute inset-x-0 top-0 z-50 flex flex-col", SETTINGS_PANEL_SURFACE)}
      >
        {body}
      </div>
    );
  }

  return (
    <aside
      style={{ width: dockedWidth, transition: DOCK_TRANSITION }}
      inert={!isOpen}
      className={cn(
        "relative z-30 h-full shrink-0 overflow-hidden",
        SETTINGS_PANEL_SURFACE,
        dockedWidth > 0 && "border-r border-border"
      )}
    >
      <div className="flex h-full flex-col" style={{ width: SETTINGS_DOCK_WIDTH }}>
        {body}
      </div>
    </aside>
  );
}

export default TradingSettingsOverlay;
