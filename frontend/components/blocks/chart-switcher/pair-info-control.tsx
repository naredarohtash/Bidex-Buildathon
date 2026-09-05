/**
 * Pair Info Control Component
 *
 * Displays a system-themed overlay containing:
 * - A live clock synchronized with the server time and matching the selected timezone
 * - A timezone dropdown selector
 * - A pair info modal launcher button
 */

"use client";

import React, { useState, useEffect, useRef, useMemo, memo } from "react";
import { TIME_ZONES, canonicalZoneId, findZone, utcOffset } from "@/lib/time-zones";
import { applyTimeZone } from "@/app/[locale]/terminal/lib/time-zone-sync";
import { Info, ChevronDown, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { getChartSynchronizedTime } from "@/utils/time-sync";
import { PairInfoModal } from "./pair-info-modal";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";

interface PairInfoControlProps {
  symbol: string;
  currency?: string;
  decimals?: number;
  /**
   * Drops the word "Asset" from the info button, leaving the ⓘ alone.
   *
   * On a phone this control shares the top of the chart with the instrument
   * box, which already names the asset — so the label was repeating what was
   * two centimetres above it, in a strip where every character costs chart.
   */
  compact?: boolean;
}

/* Exported because the phone's timezone control lives in Settings now, not on
   the chart — one list, so the two cannot offer different zones. */
/* One list, shared. This file used to declare its own sixty-odd zones beside
   the one in `lib/time-zones`, which is exactly the drift the comment here
   warned about: the account screen gained twenty-seven countries' clocks and
   the chart did not. Re-exported so every existing importer — the settings
   overlay among them — keeps working. */
export { TIME_ZONES };

const TZ_FLAG_CODES: Record<string, string> = {
  // UTC / Generic
  "UTC": "generic",
  
  // Americas
  "America/New_York": "us",
  "America/Chicago": "us",
  "America/Denver": "us",
  "America/Phoenix": "us",
  "America/Los_Angeles": "us",
  "America/Anchorage": "us",
  "America/Honolulu": "us",
  "America/Toronto": "ca",
  "America/Vancouver": "ca",
  "America/Mexico_City": "mx",
  "America/Bogota": "co",
  "America/Lima": "pe",
  "America/Santiago": "cl",
  "America/Argentina/Buenos_Aires": "ar",
  "America/Sao_Paulo": "br",
  "America/Caracas": "ve",
  
  // Europe
  "Europe/London": "gb",
  "Europe/Dublin": "ie",
  "Europe/Paris": "fr",
  "Europe/Berlin": "de",
  "Europe/Rome": "it",
  "Europe/Madrid": "es",
  "Europe/Amsterdam": "nl",
  "Europe/Brussels": "be",
  "Europe/Zurich": "ch",
  "Europe/Stockholm": "se",
  "Europe/Oslo": "no",
  "Europe/Copenhagen": "dk",
  "Europe/Helsinki": "fi",
  "Europe/Athens": "gr",
  "Europe/Istanbul": "tr",
  "Europe/Kiev": "ua",
  "Europe/Moscow": "ru",
  
  // Middle East & Africa
  "Asia/Jerusalem": "il",
  "Asia/Riyadh": "sa",
  "Asia/Dubai": "ae",
  "Asia/Tehran": "ir",
  "Africa/Cairo": "eg",
  "Africa/Lagos": "ng",
  "Africa/Johannesburg": "za",
  "Africa/Nairobi": "ke",
  "Africa/Casablanca": "ma",
  
  // Asia
  "Asia/Kolkata": "in",
  /* Kept: the alias is resolved before lookup, but a stored `Asia/Calcutta`
     that reaches this map directly should still find India's flag. */
  "Asia/Calcutta": "in",
  "Asia/Karachi": "pk",
  "Asia/Dhaka": "bd",
  "Asia/Bangkok": "th",
  "Asia/Jakarta": "id",
  "Asia/Singapore": "sg",
  "Asia/Kuala_Lumpur": "my",
  "Asia/Manila": "ph",
  "Asia/Hong_Kong": "hk",
  "Asia/Shanghai": "cn",
  "Asia/Taipei": "tw",
  "Asia/Seoul": "kr",
  "Asia/Tokyo": "jp",
  
  // Oceania
  "Australia/Sydney": "au",
  "Australia/Melbourne": "au",
  "Australia/Brisbane": "au",
  "Australia/Perth": "au",
  "Pacific/Auckland": "nz",
  "Pacific/Fiji": "fj"
};

/* The map below predates the shared list and only knows the ids that were in
   this file. Anything it misses falls back to the zone's own `flagCode`, so the
   countries added to `lib/time-zones` arrive here with their flags rather than
   with a globe. */
const flagCodeFor = (tzId: string): string | null =>
  TZ_FLAG_CODES[tzId] || findZone(tzId)?.flagCode?.toLowerCase() || null;

const getTzFlagUrl = (tzId: string): string => {
  const code = flagCodeFor(tzId) || "generic";
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
};

/**
 * A zone's flag, or a globe for the ones that have no country — UTC, and any
 * zone the browser reports that the map does not carry.
 *
 * Exported alongside TIME_ZONES because the timezone control lives in Settings
 * on mobile now, and a second copy of a 60-entry zone→country map is a second
 * thing to forget to update. `size` because the two callers sit at different
 * scales: a 27px chart pill and a settings row.
 */
export const renderTzFlag = (tzId: string, altText: string, size: "sm" | "md" = "sm") => {
  if (tzId === "UTC" || !flagCodeFor(tzId)) {
    return <Globe size={size === "md" ? 14 : 11} className="text-sky-400 shrink-0" />;
  }
  return (
    <img
      src={getTzFlagUrl(tzId)}
      alt={altText}
      className={`${
        size === "md" ? "w-5 h-3.5" : "w-4 h-3"
      } object-cover rounded-[2px] shrink-0 border border-zinc-500/10 shadow-[0_0.5px_1px_rgba(0,0,0,0.15)]`}
    />
  );
};

export const PairInfoControl = memo(function PairInfoControl({
  symbol,
  currency = "USD",
  decimals = 2,
  compact = false,
}: PairInfoControlProps) {
  /* Two forms, and which one depends on how much room there is to be
     understood in.
  
     The pill sits on the chart's own toolbar between a running clock and the
     asset button, where it has room for three or four characters — so it
     carries the abbreviation, which is what a trader glancing at an axis reads.
     It used to lowercase India's into "Ist", a word rather than an
     abbreviation and the only one treated that way; the list says "IST".
  
     The dropdown has room to be unambiguous, and needs to be: CST is Chicago,
     Shanghai and Havana. Every row there carries the full offset, the same
     number the account screen and the settings panel show. */
  const tzShort = (tz: { label: string }): string => tz.label;
  const tzFull = (tz: { id: string }): string => utcOffset(tz.id);

  const { resolvedTheme } = useTheme();
  const showDrawingTools = useChartStore((s: any) => s.settings?.showDrawingTools ?? false);
  // Fade in with the chart rather than floating over its loading skeleton
  const chartHasData = useChartStore((s: any) => (s.candles?.length ?? 0) > 0);
  const chartLoading = useChartStore((s: any) => s.state?.isLoading ?? false);
  const chartReady = chartHasData && !chartLoading;
  const [mounted, setMounted] = useState(false);
  const [showTzDropdown, setShowTzDropdown] = useState(false);
  const [selectedTz, setSelectedTz] = useState(TIME_ZONES[0]); // Default: UTC
  const [timeText, setTimeText] = useState("00:00:00");
  const [isPairInfoOpen, setIsPairInfoOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Timezone synchronization with localStorage & window events
  useEffect(() => {
    let saved = localStorage.getItem("binary_timezone");
    if (!saved) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
          saved = detected;
          localStorage.setItem("binary_timezone", detected);
          window.dispatchEvent(new CustomEvent("binary_timezone_changed", { detail: detected }));
        }
      } catch (e) {
        // Fallback
      }
    }

    // Helper to find or dynamically resolve and add to TIME_ZONES
    const resolveAndSetTz = (raw: string) => {
      /* Old IANA names first — `Asia/Calcutta` is `Asia/Kolkata`, and without
         this it would be appended as a second India rather than found as the
         one that is already listed. */
      const tzId = canonicalZoneId(raw);
      let found = TIME_ZONES.find((tz) => tz.id === tzId);
      if (!found && tzId) {
        try {
          const label = new Intl.DateTimeFormat("en-US", { timeZone: tzId, timeZoneName: "short" })
            .formatToParts(new Date())
            .find(p => p.type === "timeZoneName")?.value || "LOCAL";
          const name = tzId.split("/").pop()?.replace(/_/g, " ") || tzId;
          found = { id: tzId, label, name, flagCode: "GLO" };
          TIME_ZONES.push(found);
        } catch (err) {
          found = { id: tzId, label: "LOCAL", name: tzId.split("/").pop() || tzId, flagCode: "GLO" };
          TIME_ZONES.push(found);
        }
      }
      if (found) setSelectedTz(found);
    };

    if (saved) resolveAndSetTz(saved);

    const handleTzChange = (e: any) => {
      if (e.detail) resolveAndSetTz(e.detail);
    };

    window.addEventListener("binary_timezone_changed", handleTzChange);
    return () => {
      window.removeEventListener("binary_timezone_changed", handleTzChange);
    };
  }, []);

  // Live clock ticker
  useEffect(() => {
    const updateClock = () => {
      try {
        const syncDate = getChartSynchronizedTime();
        const formatter = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: selectedTz.id === "UTC" ? "Etc/UTC" : selectedTz.id,
        });
        setTimeText(formatter.format(syncDate));
      } catch (err) {
        // Fallback to client local time if formatter fails
        const d = new Date();
        setTimeText(d.toTimeString().split(" ")[0]);
      }
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [selectedTz]);

  // Click outside to close dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTzDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  if (!mounted) return null;

  const isNavy = resolvedTheme === "navy";
  const isLight = resolvedTheme === "light";

  /* Quiet at rest, whole at the pointer.

     This is a clock, a timezone you set once, and a way into the instrument
     panel — three things a trader glances at, none of them things they watch.
     It was drawn like something they watch: a near-opaque fill, a full border, a
     drop shadow and a saturated blue button, floating over the top-left of the
     candles. On a dark chart that made it the brightest object on screen after
     the price itself.

     The fills and borders below are roughly half the weight they were and the
     shadow is gone, so at rest the cluster reads as chart furniture. Hover
     restores it (see the opacity pair on the container) — legibility is only
     needed when someone is actually reaching for it, and colour transitions are
     already global in styles/theme.css, so the return is animated for free. */
  const containerClass = isNavy
    ? "bg-[#0b111e]/72 border-[#1b253b]/68 text-zinc-300 hover:bg-[#0b111e]/90 hover:border-[#1b253b]/95"
    : isLight
    ? "bg-white/78 border-slate-200/75 text-slate-600 hover:bg-white/95 hover:border-slate-200"
    : "bg-[#151a25]/72 border-[#2b313e]/62 text-zinc-400 hover:bg-[#151a25]/90 hover:border-[#2b313e]/85"; // default dark

  const dropdownBg = isNavy
    ? "bg-[#0f1624] border-[#1b253b] text-zinc-300"
    : isLight
    ? "bg-white border-slate-200 text-slate-700 shadow-md"
    : "bg-[#181d2a] border-[#2b313e] text-zinc-300";

  const dividerColor = isNavy
    ? "bg-[#1b253b]/80"
    : isLight
    ? "bg-slate-200"
    : "bg-[#2b313e]/80";

  const hoverClass = isNavy
    ? "hover:bg-[#141d2f] hover:text-white"
    : isLight
    ? "hover:bg-slate-100 hover:text-slate-900"
    : "hover:bg-[#1f2638] hover:text-white";

  const activeTzClass = isNavy
    ? "bg-[#141d2f] text-emerald-400 font-medium"
    : isLight
    ? "bg-slate-100 text-emerald-600 font-semibold"
    : "bg-[#1f2638] text-emerald-400 font-medium";

  /* A pill inside a pill was the noisiest part of the cluster: its own fill, its
     own border and an inset shadow, all to hold three letters. It keeps the
     letters and gives up the box, and the box comes back on hover so the target
     is still obviously a control. */
  const tzButtonBg = isNavy
    ? "bg-transparent border-transparent text-zinc-400 hover:bg-[#0c1422] hover:border-[#1b253b]/90 hover:text-zinc-200"
    : isLight
    ? "bg-transparent border-transparent text-slate-500 hover:bg-slate-100/80 hover:border-slate-200 hover:text-slate-800"
    : "bg-transparent border-transparent text-zinc-500 hover:bg-[#191e2b] hover:border-[#252a37] hover:text-zinc-300";

  // The chart engine publishes its docked indicators panel's right edge as a CSS
  // variable while the panel is open, so this pill slides clear of it instead of
  // sitting underneath. Falls back to the drawing toolbar offset.
  const leftOffset = showDrawingTools ? "56px" : "12px";

  /* The phone reads this differently.
     On a desktop the pill is a control cluster: a clock, a timezone you can
     change, and a way into the instrument's details, bordered together because
     they share a row. On a phone it sits directly under the asset selector, on
     top of the chart, and a bordered box with a backdrop blur and a shadow is
     the second most prominent thing on the screen — for a clock.
     So: no box. The time is quiet text the eye can skip, and the info button is
     its own control with its own edge, standing apart from the clock rather
     than sharing a border with it. The timezone leaves entirely; it is a
     preference set once, and it now lives in Settings. */
  if (compact) {
    return (
      <>
        <div
          data-chart-clock
          style={{ left: `var(--bidex-indicators-panel-left, ${leftOffset})` }}
          className={`absolute top-[10px] z-[45] flex items-center gap-2 select-none transition-opacity duration-300 sf-pro-selectors ${
            chartReady ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* The dot keeps its full strength — it is the one part that carries
              meaning (the feed is live), and it is 6px wide. Only the figures
              are faded. */}
          <div className="flex items-center gap-1.5 leading-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span
              className={`text-[11px] font-medium tabular-nums tracking-tight ${
                isLight ? "text-slate-900/45" : "text-white/45"
              }`}
            >
              {timeText}
            </span>
          </div>

          <button
            onClick={() => setIsPairInfoOpen(true)}
            aria-label="Asset information"
            className={`w-[22px] h-[22px] rounded-full flex items-center justify-center border active:scale-95 transition-all outline-none focus:outline-none cursor-pointer ${
              isLight
                ? "border-slate-900/10 text-[#0052ff]/80"
                : "border-white/10 text-blue-400/80"
            }`}
          >
            <Info size={12} className="stroke-[2.2]" />
          </button>
        </div>

        {isPairInfoOpen && (
          <PairInfoModal
            isOpen={isPairInfoOpen}
            onClose={() => setIsPairInfoOpen(false)}
            symbol={symbol}
            currency={currency}
            decimals={decimals}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        data-chart-clock
        /* Inline, because an unlayered `*` rule in styles/theme.css sets
           `transition` on every element in the app and beats Tailwind's
           `transition-*` utilities — that rule covers colour, background and
           border, but not opacity, so the fade in and out has to be declared
           here or it snaps. */
        style={{
          left: `var(--bidex-indicators-panel-left, ${leftOffset})`,
          transition: "opacity 220ms ease",
        }}
        className={`absolute top-[11px] z-[45] flex items-center h-[27px] px-2 rounded-[5px] border backdrop-blur-md select-none gap-2 sf-pro-selectors ${
          chartReady ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        } ${containerClass}`}
      >
        {/* Live Clock Section */}
        <div className="flex items-center gap-1 font-sans text-[11px] font-medium tabular-nums leading-none tracking-tight">
          {/* Not pulsing. A dot that breathes is a dot the eye keeps returning
              to, and this one is reporting that a clock is running — which it
              always is. It stays green, which is the whole of what it has to
              say. */}
          <span className="w-1 h-1 rounded-full bg-emerald-500" />
          <span>{timeText}</span>
        </div>

        {/* Divider */}
        <div className={`w-px h-3 ${dividerColor}`} />

        {/* Timezone Selector Section */}
        <div ref={dropdownRef} className="relative flex items-center h-full">
          <button
            onClick={() => setShowTzDropdown((prev) => !prev)}
            className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-[1.5px] rounded-[3px] border transition-colors cursor-pointer outline-none focus:outline-none ${tzButtonBg}`}
          >
            {renderTzFlag(selectedTz.id, selectedTz.label)}
            <span>{tzShort(selectedTz)}</span>
            <ChevronDown size={10} className={`transition-transform duration-150 text-zinc-500 ${showTzDropdown ? "rotate-180" : ""}`} />
          </button>

          {/* Timezone Dropdown */}
          {showTzDropdown && (
            <div
              /* 215, not 171: the rows carry "UTC+05:30" now rather than
                 "IST", and at the old width the last character of the offset
                 was cut off by the panel's own edge. */
              className={`absolute top-8 left-[-10px] w-[215px] max-h-60 overflow-y-auto rounded border shadow-2xl z-[99] flex flex-col py-1 outline-none scrollbar-thin scrollbar-thumb-zinc-800 ${dropdownBg}`}
            >
              <div className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest border-b select-none mb-1 ${isLight ? "text-slate-400 border-slate-100" : "text-zinc-500 border-zinc-800"}`}>
                Select Timezone
              </div>
              {TIME_ZONES.map((tz) => (
                <button
                  key={tz.id}
                  onClick={() => {
                    setSelectedTz(tz);
                    setShowTzDropdown(false);
                    /* The shared setter: this device and the account behind it.
                       Writing localStorage here directly was the last place a
                       zone could be changed without the profile hearing about
                       it — pick one on the chart, open your profile, and it
                       still said the old one. */
                    applyTimeZone(tz.id);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    selectedTz.id === tz.id ? activeTzClass : hoverClass
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {renderTzFlag(tz.id, tz.name)}
                    <span className="truncate">{tz.name}</span>
                  </span>
                  <span className="text-[10px] opacity-70 shrink-0 font-mono font-medium ml-1.5 tabular-nums">{tzFull(tz)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className={`w-px h-3 ${dividerColor}`} />

        {/* Info Button Section */}
        <button
          /* Opens the instrument panel and nothing else.

             It also dispatched "open-market-browser", so one click raised the
             asset dropdown behind the panel it had just opened — two surfaces
             for two unrelated jobs, from a button that names one of them. */
          onClick={() => setIsPairInfoOpen(true)}
          /* It was #0052ff bold with wide tracking — the one saturated colour in
             a monochrome corner of the chart, so the eye went to it before the
             price. It inherits the cluster's own muted tone now and finds its
             blue on hover, which is when it is being aimed at. */
          className="flex items-center gap-1 text-current hover:text-[#0052ff] dark:hover:text-blue-400 active:scale-95 text-[10px] font-semibold tracking-wide leading-none h-full outline-none focus:outline-none cursor-pointer"
        >
          <Info size={11} className="stroke-[2.2]" />
          <span>Asset</span>
        </button>
      </div>

      {/* Pair Info Modal */}
      {isPairInfoOpen && (
        <PairInfoModal
          isOpen={isPairInfoOpen}
          onClose={() => setIsPairInfoOpen(false)}
          symbol={symbol}
          currency={currency}
          decimals={decimals}
        />
      )}
    </>
  );
});

export default PairInfoControl;
