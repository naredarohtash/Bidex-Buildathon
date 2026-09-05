"use client";

import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useLogoCacheStore } from "@/store/logo-cache";

interface LogoProps {
  type?: "icon" | "text";
  className?: string;
  width?: number;
  height?: number;
  /**
   * Which artwork to use, independent of the active theme.
   *
   * "auto" follows the theme and is right almost everywhere. The exception is a
   * surface that is dark in every theme — the auth pages' brand panel is one —
   * where following the theme puts the dark-ink lockup on a near-black panel
   * and the brand disappears in light mode.
   */
  appearance?: "auto" | "dark" | "light";
}

export default function Logo({
  type = "icon",
  className,
  appearance = "auto",
}: LogoProps) {
  const { resolvedTheme } = useTheme();
  const { logoVersion } = useLogoCacheStore();
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Preload both light and dark theme images in the background
  useEffect(() => {
    if (!mounted) return;

    const preloadImage = (url: string) => {
      const img = new window.Image();
      img.src = url;
    };

    const cacheBuster = `?v=${logoVersion}`;

    if (type === "icon") {
      preloadImage(`/img/logo/logo.webp${cacheBuster}`);
      preloadImage(`/img/logo/logo-dark.webp${cacheBuster}`);
    } else {
      preloadImage(`/img/logo/logo-text.webp${cacheBuster}`);
      preloadImage(`/img/logo/logo-text-dark.webp${cacheBuster}`);
    }
  }, [mounted, logoVersion, type]);

  const getLogoUrl = () => {
    const cacheBuster = mounted ? `?v=${logoVersion}` : '';

    if (!mounted) {
      return type === "icon" ? "/img/logo/logo-dark.webp" : "/img/logo/logo-text-dark.webp";
    }

    const isDark =
      appearance === "auto"
        ? resolvedTheme
          ? resolvedTheme !== "light"
          : true
        : appearance === "dark";

    if (type === "icon") {
      const baseUrl = isDark ? "/img/logo/logo-dark.webp" : "/img/logo/logo.webp";
      return `${baseUrl}${cacheBuster}`;
    } else {
      const baseUrl = isDark ? "/img/logo/logo-text-dark.webp" : "/img/logo/logo-text.webp";
      return `${baseUrl}${cacheBuster}`;
    }
  };

  const url = getLogoUrl();

  const renderFallback = (fillContainer = false) => {
    const isDark =
      appearance === "auto"
        ? resolvedTheme
          ? resolvedTheme !== "light"
          : true
        : appearance === "dark";

    if (type === "icon") {
      return (
        <div className={cn(
          "flex items-center justify-center select-none bg-zinc-950 p-1.5 rounded-xl border border-blue-500/40 shadow-lg shadow-blue-500/15",
          fillContainer ? "w-full h-full" : className
        )}>
          <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7FB0E2" />
                <stop offset="50%" stopColor="#2E6CE2" />
                <stop offset="100%" stopColor="#0B1E84" />
              </linearGradient>
            </defs>
            <path d="M16 2L28 9V23L16 30L4 23V9L16 2Z" stroke="url(#logoGradIcon)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M11 6V26" stroke="#5C93DC" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="9" y="11" width="4" height="10" fill="#5C93DC" rx="0.5" />
            <path d="M11 11h5a2.5 2.5 0 0 1 0 5h-5 M11 16h6a2.5 2.5 0 0 1 0 5h-6" stroke="url(#logoGradIcon)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    }

    return (
      <div className={cn(
        "flex items-center gap-3 bg-transparent select-none", 
        fillContainer ? "w-full h-full" : className
      )}>
        {/* Brand Icon (Custom Hexagon Box) */}
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-950 border border-blue-500/40 text-white shadow-lg shadow-blue-500/15 shrink-0">
          <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGradFull" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7FB0E2" />
                <stop offset="50%" stopColor="#2E6CE2" />
                <stop offset="100%" stopColor="#0B1E84" />
              </linearGradient>
            </defs>
            <path d="M16 2L28 9V23L16 30L4 23V9L16 2Z" stroke="url(#logoGradFull)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M11 6V26" stroke="#5C93DC" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="9" y="11" width="4" height="10" fill="#5C93DC" rx="0.5" />
            <path d="M11 11h5a2.5 2.5 0 0 1 0 5h-5 M11 16h6a2.5 2.5 0 0 1 0 5h-6" stroke="url(#logoGradFull)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        
        {/* Brand Text */}
        <div className="flex flex-col justify-center select-none">
          <span className={cn(
            "font-black text-xl tracking-wider uppercase leading-none",
            isDark ? "text-white" : "text-slate-900"
          )}>
            BIDEX
          </span>
          <span className="text-[8px] lg:text-[9px] font-bold text-blue-500 tracking-widest uppercase leading-tight mt-0.5">
            BINARY OPTIONS BROKER
          </span>
        </div>
      </div>
    );
  };

  if (imageError) {
    return renderFallback(false);
  }

  /* The lockup is 710×157 — a 4.5:1 strip carrying the mark, BIDEX, and the
     "BINARY OPTIONS BROKER" line beneath it. Capped at 140px wide it rendered
     about 31px tall, which put that second line at roughly 4px: present in the
     file, illegible on the screen, and the reason the header read as a bare
     wordmark. Sized to the header instead (h-16), so the whole lockup is
     actually readable. */
  const containerClass = type === "icon"
    ? "relative h-7 w-7 lg:h-8 lg:w-8 flex-shrink-0"
    /* A step down from h-9/h-11. At the larger size the lockup was the loudest
       thing in a 64px header — taller than the nav, the buttons and the profile
       control it sits beside — and a wordmark that outweighs the navigation is
       a wordmark competing with it. Still tall enough for the "BINARY OPTIONS
       BROKER" line to read, which is the floor this size has. */
    : "relative h-8 lg:h-9 w-auto max-w-[160px] lg:max-w-[190px] flex-shrink-0";

  return (
    <div className={cn(containerClass, className)}>
      {!imageLoaded && renderFallback(true)}
      <img
        src={url}
        /* The brand, not the word "Logo" — this is the site's top-level link
           and what a screen reader announces for it, and what search engines
           read as the name of the page's home. */
        alt="Bidex — Binary Options Broker"
        className={cn(
          "object-contain w-full h-full transition-opacity duration-200",
          imageLoaded ? "opacity-100 block" : "opacity-0 absolute inset-0 w-0 h-0 pointer-events-none"
        )}
        decoding="async"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );
}
