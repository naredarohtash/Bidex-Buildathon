"use client";
// v2: simplified w-full overflow-hidden input layout

import React, { useRef, useEffect, useState, type RefObject, memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ChevronDown, Timer, AlarmClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useBinaryStore, MIN_TRADE_DURATION_SECONDS } from "@/store/trade/use-binary-store";
import { getChartSynchronizedTime, useSystemTimezone, formatTimeInTimezone, formatClockInTimezone, nextClockOccurrence, calculateNextExpiryTime } from "@/utils/time-sync";

interface ExpirySelectorProps {
  expiryMinutes: number;
  expiryTime: string;
  increaseExpiry: () => void;
  decreaseExpiry: () => void;
  setExpiryMinutes: (minutes: number) => void;
  setExpiryTime: (time: string) => void;
  showExpiryDropdown: boolean;
  setShowExpiryDropdown: (show: boolean) => void;
  expiryButtonRef: RefObject<HTMLDivElement | null>;
  presetExpiryTimes: Array<{
    minutes: number;
    display: string;
    profit: number;
    remaining: string;
    expiryTime: Date;
  }>;
  isMobile?: boolean;
  darkMode?: boolean;
}

// Duration option data, rendered as a two-column list.
// Sub-minute expiries (00:05 / 00:10 / 00:15 / 00:30) are intentionally absent —
// see MIN_TRADE_DURATION_SECONDS.
// `label` is the clock spelling the field itself shows and is kept for the option's
// tooltip; `short` is what the list rows render, because at row height a label
// like "1:00:00" reads as a time of day rather than a length.
const durationOptions = [
  { label: "01:00", short: "1m", seconds: 60 },
  { label: "02:00", short: "2m", seconds: 120 },
  { label: "03:00", short: "3m", seconds: 180 },
  { label: "04:00", short: "4m", seconds: 240 },
  { label: "05:00", short: "5m", seconds: 300 },
  { label: "10:00", short: "10m", seconds: 600 },
  { label: "15:00", short: "15m", seconds: 900 },
  { label: "30:00", short: "30m", seconds: 1800 },
  { label: "45:00", short: "45m", seconds: 2700 },
  // Hours unpadded to match what formatDuration renders in the field.
  { label: "1:00:00", short: "1h", seconds: 3600 },
  { label: "2:00:00", short: "2h", seconds: 7200 },
  { label: "3:00:00", short: "3h", seconds: 10800 },
  { label: "4:00:00", short: "4h", seconds: 14400 },
];

// The longest expiry the platform offers, and so the ceiling the +/- stepper walks
// up to a minute at a time. Also caps CLOCK mode, where the target used to be able
// to run to any hour of the day.
const MAX_TRADE_DURATION_SECONDS = 14400;

/* Width of the expiry dropdown, in one place.

   It used to be a Tailwind class on the panel plus the same number repeated as
   a literal in the left-edge maths and again in maxWidth. Three copies of one
   measurement is three chances for them to disagree, and rescaling the class
   left the other two behind — a panel positioned against a width it no longer
   had, sitting off its own button. */
const EXPIRY_PANEL_WIDTH = 163;

// Upcoming wall-clock expiries, fine-grained near the front and coarser further
// out. The list used to be the next occurrence of each configured duration bucket,
// which collapsed to whatever those happened to round to — four options at 20:53,
// and no way to ask for 21:20 at all. The order endpoint validates the expiry
// timestamp rather than a bucket and accepts any future minute boundary, so the
// picker can offer real times.
export function buildClockOptions(now: Date, tz?: string) {
  const offsets: number[] = [];
  for (let m = 1; m <= 10; m++) offsets.push(m);        // every minute for ten
  for (let m = 15; m <= 60; m += 5) offsets.push(m);    // then every five to the hour
  for (let m = 75; m <= 240; m += 15) offsets.push(m);  // then every quarter to four hours

  // Zeroing seconds first means every target lands exactly on a minute, which is
  // also how the backend tells a CLOCK expiry from a DURATION one.
  const base = new Date(now);
  base.setSeconds(0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");

  return offsets
    .map((m) => {
      const target = new Date(base.getTime() + m * 60000);
      const msLeft = target.getTime() - now.getTime();
      return {
        display: tz ? formatClockInTimezone(target, tz) : `${pad(target.getHours())}:${pad(target.getMinutes())}`,
        minutes: Math.max(1, Math.round(msLeft / 60000)),
        remaining: formatCountdown(msLeft),
        msLeft,
      };
    })
    .filter((item) => item.msLeft >= 30000)
    .map(({ msLeft, ...rest }) => rest);
}

// MM:SS while that stays readable; past an hour the seconds are noise.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total >= 3600) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Format seconds as MM:SS, widening to HH:MM:SS only once there are hours to show.
// Always emitting HH:MM:SS made every value 8 characters wide, which overflowed the
// 270px order panel and got clipped by the dropdown chevron. This also matches how
// durationOptions labels itself ("01:00" for a minute, "01:00:00" for an hour), and
// parseDurationString already reads the 2-part form, so the input round-trips.
function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  // Hours are not zero-padded: "1:03:00" is the conventional timer form and saves
  // a full digit of width, which is what lets the hour-plus values render close to
  // the same size as MM:SS instead of being shrunk to fit.
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Keep sub-hour and hour-plus expiries close in apparent size. HH:MM:SS is three
// glyphs wider than MM:SS, so instead of the large drop that left "1:03:00" tiny
// beside "59:00", it steps down one notch and tightens tracking. Only double-digit
// hours — unreachable from the preset list — need the small size.
function timeValueClasses(value: string): string {
  // Match proportional responsive scale with Amount Box so long strings fit perfectly
  if (value.length >= 8) return "text-[17px] tracking-tight";
  return "text-[19px] tracking-tight";
}

// PERFORMANCE: Wrapped in React.memo to prevent unnecessary re-renders
const ExpirySelector = memo(function ExpirySelector({
  expiryMinutes,
  expiryTime,
  increaseExpiry,
  decreaseExpiry,
  setExpiryMinutes,
  setExpiryTime,
  showExpiryDropdown,
  setShowExpiryDropdown,
  expiryButtonRef,
  presetExpiryTimes,
  isMobile = false,
  darkMode = true,
}: ExpirySelectorProps) {
  const t = useTranslations("binary_components");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mountedFlag, setMountedFlag] = useState(false);
  useEffect(() => {
    setMountedFlag(true);
  }, []);
  const isNavy = mountedFlag && resolvedTheme === "navy";

  // Sync with Zustand store
  const durationMode = useBinaryStore((state) => state.durationMode);
  const customDurationSeconds = useBinaryStore((state) => state.customDurationSeconds);
  const setCustomDurationSeconds = useBinaryStore((state) => state.setCustomDurationSeconds);
  const setDurationMode = useBinaryStore((state) => state.setDurationMode);
  const timezone = useSystemTimezone();

  const isDuration = durationMode === "DURATION";
  const [localTimeVal, setLocalTimeVal] = useState(isDuration ? formatDuration(customDurationSeconds) : expiryTime);

  useEffect(() => {
    if (isDuration) {
      setLocalTimeVal(formatDuration(customDurationSeconds));
    } else {
      setLocalTimeVal(expiryTime);
    }
  }, [isDuration, customDurationSeconds, expiryTime]);

  const parseDurationString = (str: string): number | null => {
    const clean = str.trim();
    if (!clean) return null;
    const parts = clean.split(":");
    if (parts.length === 3) {
      const hrs = parseInt(parts[0]);
      const mins = parseInt(parts[1]);
      const secs = parseInt(parts[2]);
      if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs)) {
        return hrs * 3600 + mins * 60 + secs;
      }
    } else if (parts.length === 2) {
      const mins = parseInt(parts[0]);
      const secs = parseInt(parts[1]);
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    } else {
      const val = parseInt(clean);
      if (!isNaN(val)) {
        return val * 60;
      }
    }
    return null;
  };

  const parseClockString = (str: string): string | null => {
    const clean = str.trim();
    const parts = clean.split(":");
    if (parts.length >= 2) {
      const hrs = parseInt(parts[0]);
      const mins = parseInt(parts[1]);
      if (!isNaN(hrs) && !isNaN(mins) && hrs >= 0 && hrs < 24 && mins >= 0 && mins < 60) {
        return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      }
    }
    return null;
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value.replace(/[^\d:]/g, "");
    setLocalTimeVal(valStr);

    if (isDuration) {
      const seconds = parseDurationString(valStr);
      if (seconds !== null) {
        // Typing is the one path that could still ask for more than four hours;
        // the stepper and the option chips are both bounded by construction.
        const clamped = Math.min(MAX_TRADE_DURATION_SECONDS, seconds);
        setCustomDurationSeconds(clamped);
        const approxMinutes = Math.max(1, Math.round(clamped / 60));
        setExpiryMinutes(approxMinutes);
      }
    } else {
      const clockTimeVal = parseClockString(valStr);
      if (clockTimeVal !== null) {
        setExpiryTime(clockTimeVal);
        const parts = clockTimeVal.split(":");
        const hrs = parseInt(parts[0]);
        const mins = parseInt(parts[1]);
        if (!isNaN(hrs) && !isNaN(mins)) {
          const now = getChartSynchronizedTime();
          const target = new Date(now);
          target.setHours(hrs, mins, 0, 0);
          if (target < now) {
            target.setDate(target.getDate() + 1);
          }
          const diffMins = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
          setExpiryMinutes(diffMins);
        }
      }
    }
  };

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // FIXED: Only attach event listener when dropdown is open
  useEffect(() => {
    if (!showExpiryDropdown) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        expiryButtonRef.current &&
        !expiryButtonRef.current.contains(event.target as Node)
      ) {
        setShowExpiryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showExpiryDropdown, setShowExpiryDropdown, expiryButtonRef]);

  // Adjust CanDecrease/CanIncrease based on clock vs duration mode
  const canDecrease = isDuration
    // One step down must still land on or above the floor, otherwise the button
    // looks enabled but does nothing.
    ? customDurationSeconds >= MIN_TRADE_DURATION_SECONDS + 60
    : (() => {
        const now = getChartSynchronizedTime();
        const target = nextClockOccurrence(expiryTime, now, timezone);
        if (target) {
          // We can decrease if target time minus 1 minute is still strictly in the future
          return new Date(target.getTime() - 60000) > now;
        }
        return false;
      })();

  // Both modes stop at four hours. CLOCK used to return a flat `true`, so the
  // stepper would happily walk the target into next week.
  const canIncrease = isDuration
    ? customDurationSeconds < MAX_TRADE_DURATION_SECONDS
    : (() => {
        const now = getChartSynchronizedTime();
        const target = nextClockOccurrence(expiryTime, now, timezone);
        if (!target) return false;
        return target.getTime() + 60000 <= now.getTime() + MAX_TRADE_DURATION_SECONDS * 1000;
      })();

  // Rebuilt on every render while the panel is open rather than memoised, so the
  // countdowns tick with the parent's one-second update instead of freezing at
  // whatever they read when it opened. Thirty-odd date additions, only while open.
  const clockOptions = !isDuration && showExpiryDropdown
    ? buildClockOptions(getChartSynchronizedTime(), timezone)
    : [];

  // Clock time this expiry lands on, for the line under the options.
  const selectedExpiryClock = (() => {
    if (isDuration) {
      const target = new Date(getChartSynchronizedTime().getTime() + customDurationSeconds * 1000);
      return formatTimeInTimezone(target, timezone, { hour: "2-digit", minute: "2-digit" });
    } else {
      const target = calculateNextExpiryTime(expiryMinutes);
      return formatTimeInTimezone(target, timezone, { hour: "2-digit", minute: "2-digit" });
    }
  })();

  return (
    <div className="relative flex-1 sf-pro-selectors">
      <div
        ref={expiryButtonRef}
        className={`relative rounded-lg cursor-pointer transition-all duration-300 ${
          isMobile
            ? "h-[46px] overflow-visible"
            : `overflow-hidden ${
                isNavy
                  ? "bg-black/15 border border-[#22345c] shadow-sm hover:border-[#2c4374]"
                  : darkMode
                    ? "bg-black/20 border border-[#2a2d36] shadow-sm hover:border-[#383c48]"
                    : "bg-zinc-50/40 border border-zinc-300 shadow-sm hover:border-zinc-400"
              } ${showExpiryDropdown ? (isNavy ? "border-[#223966]" : darkMode ? "border-zinc-700" : "border-zinc-400") : ""}`
        }`}
        onClick={() => setShowExpiryDropdown(!showExpiryDropdown)}
      >
        {isMobile ? (
          /* One bordered field — minus, value, plus sharing a single edge —
             rather than the value box and a separate stepper pair beside it.
             Mirrors amount-selector's mobile field; see the comment there. */
          <div className="relative h-full flex items-center px-1.5">
            <span
              className={`absolute -top-[7px] left-2.5 z-20 px-1 text-[11px] font-semibold leading-none bg-white dark:bg-[#0f1115] ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}
            >
              Time
            </span>

            <div
              className={`relative flex-1 h-9 flex items-center rounded-md border transition-all cursor-text overflow-hidden focus-within:ring-2 ${
                isNavy
                  ? `bg-black/20 focus-within:border-emerald-500/70 focus-within:ring-emerald-500/10 ${showExpiryDropdown ? "border-[#2c4374]" : "border-[#2a3f6b]"}`
                  : darkMode
                    ? `bg-black/35 focus-within:border-emerald-500/70 focus-within:ring-emerald-500/20 ${showExpiryDropdown ? "border-zinc-600" : "border-[#333742]"}`
                    : `bg-zinc-50 focus-within:border-emerald-500 focus-within:ring-emerald-550/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] ${showExpiryDropdown ? "border-zinc-400" : "border-zinc-300"}`
              }`}
            >
              <button
                aria-label="Earlier expiry"
                className={`m-1 w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center transition-all duration-100 ${
                  !canDecrease
                    ? darkMode
                      ? "bg-zinc-900/50 text-zinc-700 cursor-not-allowed"
                      : "bg-zinc-100/50 text-zinc-300 cursor-not-allowed"
                    : darkMode
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white active:scale-[0.92] active:bg-zinc-900 cursor-pointer"
                      : "bg-zinc-150 hover:bg-zinc-200 text-zinc-650 hover:text-zinc-900 active:scale-[0.92] active:bg-zinc-300/80 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canDecrease) {
                    if (isDuration) {
                      const newSecs = Math.max(MIN_TRADE_DURATION_SECONDS, customDurationSeconds - 60);
                      setCustomDurationSeconds(newSecs);
                      const approxMinutes = Math.max(1, Math.round(newSecs / 60));
                      setExpiryMinutes(approxMinutes);
                    } else {
                      const now = getChartSynchronizedTime();
                      const target = nextClockOccurrence(expiryTime, now, timezone);
                      if (target) {
                        const newTarget = new Date(target.getTime() - 60000);
                        if (newTarget > now) {
                          setExpiryTime(formatClockInTimezone(newTarget, timezone));
                          const diffMins = Math.max(1, Math.round((newTarget.getTime() - now.getTime()) / 60000));
                          setExpiryMinutes(diffMins);
                        }
                      }
                    }
                  }
                }}
                disabled={!canDecrease}
              >
                <Minus size={14} className="stroke-[2.5]" />
              </button>

              {/* Mode switch, in the row instead of a pill fighting the label
                  for the border above. Icon alone carries the current mode
                  (stopwatch = counting down from now, clock = a fixed time of
                  day); the label above already says "Time" once. */}
              <button
                aria-label={isDuration ? "Switch to a clock time" : "Switch to a duration"}
                title={isDuration ? "Switch to a clock time" : "Switch to a duration"}
                onClick={(e) => {
                  e.stopPropagation();
                  setDurationMode(isDuration ? "CLOCK" : "DURATION");
                }}
                className={`shrink-0 rounded p-1 -mr-0.5 transition-colors cursor-pointer ${
                  darkMode ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                }`}
              >
                {isDuration ? <Timer size={14} /> : <AlarmClock size={14} />}
              </button>

              <div
                className="relative flex-1 min-w-0 h-full flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExpiryDropdown(!showExpiryDropdown);
                  timeInputRef.current?.focus();
                }}
              >
                {/* Visual Odometer Drop Layer */}
                <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${timeValueClasses(localTimeVal)} font-numeric font-extrabold tabular-nums`}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={localTimeVal}
                      initial={{ y: -20, opacity: 0, filter: "blur(2px)" }}
                      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                      exit={{ y: 20, opacity: 0, filter: "blur(2px)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 30, mass: 1 }}
                      className={darkMode ? "text-white" : "text-zinc-900"}
                    >
                      {localTimeVal}
                    </motion.span>
                  </AnimatePresence>
                </div>

                {/* Native Transparent Input overlay */}
                <input
                  ref={timeInputRef}
                  type="text"
                  /* Read-only on a phone, so tapping it opens the picker
                     without also raising the keyboard over the panel the
                     tap just opened. Every value this field can hold is in
                     that picker or on the +/- steppers either side, so
                     nothing becomes unreachable; the desktop field below
                     stays typeable, where a keyboard costs nothing. */
                  readOnly
                  inputMode="none"
                  className={`${timeValueClasses(localTimeVal)} relative z-10 w-full font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-center cursor-pointer text-transparent selection:bg-emerald-500/20 caret-transparent`}
                  value={localTimeVal}
                  spellCheck="false"
                  autoComplete="off"
                  onChange={handleTimeInputChange}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExpiryDropdown(!showExpiryDropdown);
                  }}
                />
              </div>

              <button
                aria-label="Later expiry"
                className={`m-1 w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center transition-all duration-100 ${
                  !canIncrease
                    ? darkMode
                      ? "bg-zinc-900/50 text-zinc-700 cursor-not-allowed"
                      : "bg-zinc-100/50 text-zinc-300 cursor-not-allowed"
                    : darkMode
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white active:scale-[0.92] active:bg-zinc-900 cursor-pointer"
                      : "bg-zinc-150 hover:bg-zinc-200 text-zinc-650 hover:text-zinc-900 active:scale-[0.92] active:bg-zinc-300/80 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canIncrease) {
                    if (isDuration) {
                      const newSecs = Math.min(MAX_TRADE_DURATION_SECONDS, customDurationSeconds + 60);
                      setCustomDurationSeconds(newSecs);
                      const approxMinutes = Math.max(1, Math.round(newSecs / 60));
                      setExpiryMinutes(approxMinutes);
                    } else {
                      const now = getChartSynchronizedTime();
                      const target = nextClockOccurrence(expiryTime, now, timezone);
                      if (target) {
                        const newTarget = new Date(target.getTime() + 60000);
                        setExpiryTime(formatClockInTimezone(newTarget, timezone));
                        const diffMins = Math.max(1, Math.round((newTarget.getTime() - now.getTime()) / 60000));
                        setExpiryMinutes(diffMins);
                      }
                    }
                  }
                }}
                disabled={!canIncrease}
              >
                <Plus size={14} className="stroke-[2.5]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col pt-3 pb-1.5 px-1.5">
            {/* Header */}
            <div className="flex justify-between items-center h-5">
              {/* 13px, held deliberately against the terminal's 95% scale. These
                  two words label the only inputs on the panel that take a value,
                  and at 11px they read as a caption rather than a field label. */}
              <span className={`text-[13px] font-extrabold tracking-wide ${darkMode ? "text-zinc-200" : "text-zinc-700"}`}>
                Time
              </span>

              {/* Separated Flat Buttons */}
              <div className="flex items-center gap-1">
                <button
                  aria-label="Earlier expiry"
                  className={`w-[17px] h-[17px] rounded-md flex items-center justify-center transition-all duration-100 ${
                    !canDecrease
                      ? darkMode
                        ? "bg-zinc-900/50 border border-zinc-800/80 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-100/50 border border-zinc-200 text-zinc-300 cursor-not-allowed"
                      : darkMode
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 active:scale-[0.92] active:bg-zinc-900 active:text-zinc-400 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.7)] cursor-pointer"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 border border-zinc-250 active:scale-[0.92] active:bg-zinc-300/80 active:text-zinc-700 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.15)] cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canDecrease) {
                      if (isDuration) {
                        const newSecs = Math.max(MIN_TRADE_DURATION_SECONDS, customDurationSeconds - 60);
                        setCustomDurationSeconds(newSecs);
                        const approxMinutes = Math.max(1, Math.round(newSecs / 60));
                        setExpiryMinutes(approxMinutes);
                      } else {
                        const now = getChartSynchronizedTime();
                        const target = nextClockOccurrence(expiryTime, now, timezone);
                        if (target) {
                          const newTarget = new Date(target.getTime() - 60000);
                          if (newTarget > now) {
                            setExpiryTime(formatClockInTimezone(newTarget, timezone));
                            const diffMins = Math.max(1, Math.round((newTarget.getTime() - now.getTime()) / 60000));
                            setExpiryMinutes(diffMins);
                          }
                        }
                      }
                    }
                  }}
                  disabled={!canDecrease}
                >
                  <Minus size={9.5} className="stroke-[2.5]" />
                </button>

                <button
                  aria-label="Later expiry"
                  className={`w-[17px] h-[17px] rounded-md flex items-center justify-center transition-all duration-100 ${
                    !canIncrease
                      ? darkMode
                        ? "bg-zinc-900/50 border border-zinc-800/80 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-100/50 border border-zinc-200 text-zinc-300 cursor-not-allowed"
                      : darkMode
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 active:scale-[0.92] active:bg-zinc-900 active:text-zinc-400 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.7)] cursor-pointer"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 border border-zinc-250 active:scale-[0.92] active:bg-zinc-300/80 active:text-zinc-700 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.15)] cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canIncrease) {
                      if (isDuration) {
                        const newSecs = Math.min(MAX_TRADE_DURATION_SECONDS, customDurationSeconds + 60);
                        setCustomDurationSeconds(newSecs);
                        const approxMinutes = Math.max(1, Math.round(newSecs / 60));
                        setExpiryMinutes(approxMinutes);
                      } else {
                        const now = getChartSynchronizedTime();
                        const target = nextClockOccurrence(expiryTime, now, timezone);
                        if (target) {
                          const newTarget = new Date(target.getTime() + 60000);
                          setExpiryTime(formatClockInTimezone(newTarget, timezone));
                          const diffMins = Math.max(1, Math.round((newTarget.getTime() - now.getTime()) / 60000));
                          setExpiryMinutes(diffMins);
                        }
                      }
                    }
                  }}
                  disabled={!canIncrease}
                >
                  <Plus size={9.5} className="stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Time Input Box */}
            <div
              className={`relative flex items-center justify-center px-1.5 rounded-md border transition-all cursor-text overflow-hidden focus-within:ring-2 w-full h-10 mt-1.5 ${
                isNavy
                  ? "bg-black/20 border-[#2a3f6b] hover:border-[#35508a] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/10"
                  : darkMode
                    ? "bg-black/35 border-[#333742] hover:border-[#3d4250] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/20"
                    : "bg-zinc-50 border-zinc-300 hover:border-zinc-400 focus-within:border-emerald-500 focus-within:ring-emerald-550/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setShowExpiryDropdown(!showExpiryDropdown);
                timeInputRef.current?.focus();
              }}
            >
              {/* Visual Odometer Drop Layer */}
              <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${timeValueClasses(localTimeVal)} font-numeric font-extrabold tabular-nums`}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={localTimeVal}
                    initial={{ y: -20, opacity: 0, filter: "blur(2px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: 20, opacity: 0, filter: "blur(2px)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, mass: 1 }}
                    className={darkMode ? "text-white" : "text-zinc-900"}
                  >
                    {localTimeVal}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Native Transparent Input overlay */}
              <input
                ref={timeInputRef}
                type="text"
                // DURATION mode renders HH:MM:SS, which at 19px overflowed the card and
                // got clipped by the chevron under the parent's overflow-hidden. Step the
                // size down for the longer string; CLOCK mode's HH:MM keeps the large
                // type. tabular-nums stops the value jittering as the digits change.
                className={`${timeValueClasses(localTimeVal)} relative z-10 font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-center cursor-text flex-1 min-w-0 text-transparent selection:bg-emerald-500/20 caret-emerald-500`}
                value={localTimeVal}
                spellCheck="false"
                autoComplete="off"
                onChange={handleTimeInputChange}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExpiryDropdown(!showExpiryDropdown);
                }}
              />
            </div>

            <div className="relative w-full mt-2 h-[27px] flex items-center p-[2px] rounded-full border overflow-hidden select-none border-zinc-200/60 dark:border-zinc-800/80 bg-zinc-250/20 dark:bg-black/30">
              {/* Sliding Pill Background Indicator */}
              <div
                className={`absolute top-[2px] bottom-[2px] w-[calc(50%-3px)] rounded-md ${
                  isNavy
                    ? "bg-[#1c2a4a]/60 border border-[#2f4a7d]"
                    : darkMode
                      ? "bg-zinc-800 border border-[#3a3f4c]"
                      : "bg-white shadow-sm border border-zinc-200"
                }`}
                style={{
                  transform: isDuration ? "translateX(0)" : "translateX(100%)",
                  left: "2px",
                  transition: "transform 255ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                }}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDurationMode("DURATION");
                }}
                className={`flex-1 h-full flex items-center justify-center text-center text-[10px] font-bold tracking-normal z-10 transition-colors duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer ${
                  isDuration
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                DUR
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDurationMode("CLOCK");
                }}
                className={`flex-1 h-full flex items-center justify-center text-center text-[10px] font-bold tracking-normal z-10 transition-colors duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer ${
                  !isDuration
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                CLK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isMounted &&
        createPortal(
          <AnimatePresence>
            {showExpiryDropdown && (
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: isMobile ? 10 : -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: isMobile ? 10 : -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                className={`fixed rounded-lg shadow-2xl overflow-hidden z-[9999] right-2 md:right-auto ${isMobile ? "origin-bottom" : "origin-top"} ${
                  darkMode
                    ? "bg-card/98 border border-border"
                    : "bg-white/98 border border-gray-200"
                }`}
                style={{
                  // Single source for the width; see EXPIRY_PANEL_WIDTH.
                  width: EXPIRY_PANEL_WIDTH,
                  /* getBoundingClientRect already reports the position this
                     fixed panel is placed at. The /0.95 here undid the page's
                     `zoom: 0.95`; with the zoom gone it just pushes the panel
                     5% down and right of the button it belongs to.

                     On mobile the field sits right above the trade buttons at
                     the bottom of the screen, with the chart's open space
                     above it — opening downward like desktop's right-column
                     placement does either gets clipped by the viewport edge
                     or lands on top of Call/Put. Anchoring to the field's top
                     instead of its bottom opens the panel upward, into that
                     open space, the same direction a trader's thumb already
                     came from. */
                  ...(isMobile
                    ? {
                        bottom: expiryButtonRef.current
                          ? window.innerHeight - expiryButtonRef.current.getBoundingClientRect().top + 4
                          : 0,
                      }
                    : {
                        top: expiryButtonRef.current
                          ? expiryButtonRef.current.getBoundingClientRect().bottom + 4
                          : 0,
                      }),
                  // Right-aligned to the Time card. Left-aligning it made a panel wider
                  // than the card overhang leftwards once the viewport clamp kicked in,
                  // which is what put it on top of the payout figures.
                  left: expiryButtonRef.current
                    ? Math.max(
                        8,
                        Math.min(
                          expiryButtonRef.current.getBoundingClientRect().right - EXPIRY_PANEL_WIDTH,
                          window.innerWidth - EXPIRY_PANEL_WIDTH - 8
                        )
                      )
                    : 0,
                  maxWidth: isMobile ? "calc(100vw - 16px)" : EXPIRY_PANEL_WIDTH,
                }}
              >
                {/* Full-word tabs, not the card's abbreviated DUR/CLK pill — this
                    panel has the width to say what the two modes actually are,
                    and switching mode is what a trader opens this panel to do. */}
                <div className={`grid grid-cols-2 gap-1 p-1.5 border-b ${darkMode ? "border-zinc-800" : "border-zinc-200"}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDurationMode("DURATION");
                    }}
                    className={`py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-colors cursor-pointer ${
                      isDuration
                        ? "bg-blue-500 text-white"
                        : darkMode
                          ? "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
                          : "bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Duration
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDurationMode("CLOCK");
                    }}
                    className={`py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-colors cursor-pointer ${
                      !isDuration
                        ? "bg-blue-500 text-white"
                        : darkMode
                          ? "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
                          : "bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Clock
                  </button>
                </div>

                <div className="p-1 max-h-[228px] overflow-y-auto">
              {isDuration ? (
                // Two columns of rows, filled top-to-bottom then over: the values stay
                // in ascending order down each column, which a wrapping grid could not
                // do without leaving a ragged last row. Labels are "1m"/"1h" rather
                // than the clock spelling the field uses — at row height, "1:00:00"
                // reads as a time of day rather than a length.
                <div className="grid grid-cols-2">
                  {[
                    durationOptions.slice(0, Math.ceil(durationOptions.length / 2)),
                    durationOptions.slice(Math.ceil(durationOptions.length / 2)),
                  ].map((column, ci) => (
                    <div
                      key={ci}
                      className={`flex flex-col ${
                        // A rule between the columns, so the two runs read as two
                        // lists rather than one field of loose numbers.
                        ci === 1
                          ? `pl-1 border-l ${darkMode ? "border-zinc-800" : "border-zinc-200"}`
                          : "pr-1"
                      }`}
                    >
                      {column.map((option) => {
                        const isSelected = customDurationSeconds === option.seconds;
                        return (
                          <button
                            key={option.seconds}
                            title={option.label}
                            className={`w-full px-2 py-[5px] rounded-md text-[11px] font-bold tabular-nums leading-none text-center transition-colors duration-100 cursor-pointer ${
                              isSelected
                                ? "bg-blue-500 text-white"
                                : darkMode
                                  ? "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
                                  : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomDurationSeconds(option.seconds);
                              setExpiryMinutes(Math.max(1, Math.round(option.seconds / 60)));
                              setShowExpiryDropdown(false);
                            }}
                          >
                            {option.short}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                // Clock mode stays a single scrolling list: these are absolute times,
                // and the countdown beside each is what makes it choosable. Rows read
                // the truth — the old list paired a bucket's nominal length with the
                // real time to settlement ("3m · 01:44") and the two disagreed.
                <div className="flex flex-col gap-px">
                  {clockOptions.map((item) => {
                    const isSelected = expiryTime === item.display;
                    return (
                      <button
                        key={item.display}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-[5px] rounded-md transition-colors duration-100 cursor-pointer ${
                          isSelected
                            ? "bg-blue-500 text-white"
                            : darkMode
                              ? "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
                              : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                        }`}
                        onClick={() => {
                          setExpiryMinutes(item.minutes);
                          setExpiryTime(item.display);
                          setShowExpiryDropdown(false);
                        }}
                      >
                        <span className="text-[11px] font-bold tabular-nums leading-none">{item.display}</span>
                        <span className={`text-[10px] font-semibold tabular-nums leading-none ${
                          isSelected ? "text-blue-100" : darkMode ? "text-zinc-500" : "text-zinc-400"
                        }`}>
                          in {item.remaining}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* What the current selection actually settles at — the one piece of
                context the old rows carried that the chips cannot. */}
            <div className={`px-2.5 py-1 border-t text-[10px] font-semibold flex items-center justify-between ${
              darkMode
                ? "border-zinc-800 bg-zinc-950/50 text-zinc-400"
                : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}>
              <span>Settles at</span>
              <span className={`font-numeric font-bold tabular-nums ${darkMode ? "text-zinc-200" : "text-zinc-800"}`}>
                {selectedExpiryClock}
              </span>
            </div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
});

export default ExpirySelector;