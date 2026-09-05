import { useState, useEffect } from "react";

let timeOffsetMs = 0;

// Load initial offset from localStorage if available on the client side
if (typeof window !== "undefined") {
  timeOffsetMs = Number(localStorage.getItem("binary_time_offset") || "0");
  (window as any).__binary_time_offset = timeOffsetMs;
}

export function setTimeOffset(offsetMs: number, force: boolean = false): void {
  const roundedOffset = Math.round(offsetMs);
  if (force || timeOffsetMs === 0) {
    timeOffsetMs = roundedOffset;
  } else {
    // EMA smoothing: 90% old offset, 10% new offset
    timeOffsetMs = Math.round(timeOffsetMs * 0.9 + roundedOffset * 0.1);
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("binary_time_offset", String(timeOffsetMs));
    (window as any).__binary_time_offset = timeOffsetMs;
  }
}

export function getTimeOffset(): number {
  return timeOffsetMs;
}

// Get chart-synchronized time
export function getChartSynchronizedTime(): Date {
  return new Date(Date.now() + timeOffsetMs);
}

// Get current system timezone from localStorage with auto-detection fallback
export function getSystemTimezone(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("binary_timezone");
    if (saved) return saved;
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        localStorage.setItem("binary_timezone", detected);
        return detected;
      }
    } catch (e) {
      // Fallback if Intl is not supported
    }
  }
  return "UTC";
}

// React hook to listen to timezone changes dynamically with auto-detection on mount
export function useSystemTimezone(): string {
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    if (typeof window !== "undefined") {
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
          // Fallback if Intl is not supported
        }
      }
      if (saved) setTz(saved);

      const handleTzChange = (e: any) => {
        setTz(e.detail);
      };

      window.addEventListener("binary_timezone_changed", handleTzChange);
      return () => {
        window.removeEventListener("binary_timezone_changed", handleTzChange);
      };
    }
  }, []);

  return tz;
}

// Format time for display in chart (respects timezone)
export function formatChartTime(date: Date): string {
  const tz = getSystemTimezone();
  try {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz === "UTC" ? "Etc/UTC" : tz,
    });
  } catch (e) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

// Offset of `tz` from UTC at a given instant, in ms. Derived from Intl rather
// than assumed, so half-hour zones and DST are handled.
export function getTimezoneOffsetMs(date: Date, tz: string): number {
  const zone = tz === "UTC" ? "Etc/UTC" : tz;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  } catch (e) {
    return -date.getTimezoneOffset() * 60000;
  }
}

// "HH:MM" on a 24h clock in `tz`. Normalises the 24:xx some locales emit at midnight.
export function formatClockInTimezone(date: Date, tz: string): string {
  const s = formatTimeInTimezone(date, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
  return s.replace(/^24:/, "00:");
}

// The next instant at which the wall clock in `tz` reads `hhmm`, strictly after `now`.
// Replaces `target.setHours(h, m, 0, 0)`, which builds the time in the BROWSER's
// zone and therefore lands an offset away from the zone the user picked.
export function nextClockOccurrence(hhmm: string, now: Date, tz: string): Date | null {
  const parts = String(hhmm).split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;

  const build = (offset: number) => {
    const shifted = new Date(now.getTime() + offset);
    const wall = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), h, m, 0, 0);
    let ts = wall - offset;
    if (ts <= now.getTime()) ts += 86400000;
    return ts;
  };
  const off = getTimezoneOffsetMs(now, tz);
  let ts = build(off);
  // Re-resolve at the target instant so a DST boundary between now and then is respected.
  const off2 = getTimezoneOffsetMs(new Date(ts), tz);
  if (off2 !== off) ts = build(off2);
  return new Date(ts);
}

// Format time in custom timezone
export function formatTimeInTimezone(date: Date, tz: string, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }): string {
  try {
    return date.toLocaleTimeString([], {
      ...options,
      timeZone: tz === "UTC" ? "Etc/UTC" : tz,
    });
  } catch (e) {
    return date.toLocaleTimeString([], options);
  }
}

// Format date in custom timezone
export function formatDateInTimezone(date: Date, tz: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" }): string {
  try {
    return date.toLocaleDateString([], {
      ...options,
      timeZone: tz === "UTC" ? "Etc/UTC" : tz,
    });
  } catch (e) {
    return date.toLocaleDateString([], options);
  }
}

// Format datetime in custom timezone
export function formatDateTimeInTimezone(date: Date, tz: string, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }): string {
  try {
    return date.toLocaleString([], {
      ...options,
      timeZone: tz === "UTC" ? "Etc/UTC" : tz,
    });
  } catch (e) {
    return date.toLocaleString([], options);
  }
}

// Calculate the next expiry time based on interval
export function calculateNextExpiryTime(intervalMinutes: number): Date {
  const now = getChartSynchronizedTime();
  const minutes = now.getMinutes();
  const remainder = minutes % intervalMinutes;

  const nextExpiryTime = new Date(now);
  if (remainder === 0) {
    // If we're exactly at an interval, use the next one
    nextExpiryTime.setMinutes(minutes + intervalMinutes);
  } else {
    // Otherwise round up to the next interval
    nextExpiryTime.setMinutes(minutes + (intervalMinutes - remainder));
  }
  nextExpiryTime.setSeconds(0);
  nextExpiryTime.setMilliseconds(0);

  // Extend trades by an extra interval if there's less than 30 seconds remaining to close.
  // This generalizes the 30-second bump to cover all times and intervals, preventing
  // sub-30-second trades on any boundary.
  if (nextExpiryTime.getTime() - now.getTime() < 30000) {
    nextExpiryTime.setMinutes(nextExpiryTime.getMinutes() + intervalMinutes);
  }

  return nextExpiryTime;
}

// Format time as countdown (MM:SS)
export function formatCountdown(timeLeftMs: number): string {
  if (timeLeftMs <= 0) return "00:00";

  const minutes = Math.floor(timeLeftMs / 60000);
  const seconds = Math.floor((timeLeftMs % 60000) / 1000);

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Convert a Date to Unix timestamp (seconds)
export function dateToUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

// Convert Unix timestamp (seconds) to Date
export function unixTimestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

