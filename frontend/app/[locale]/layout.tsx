// RootLayout.tsx (Updated for Custom i18n)
import React from "react";
import "../globals.css";
import "simplebar-react/dist/simplebar.min.css";
import Providers from "@/provider/providers";
import DirectionProvider from "@/provider/direction.provider";
import { config } from "@/i18n/config";
import { TranslationProvider } from "next-intl";
import { loadAllNamespaces, getTranslations } from "next-intl/server";
import { withoutAdminNamespaces } from "@/i18n/admin-namespaces";
import { notFound } from "next/navigation";
import { getUserProfile } from "@/lib/fetchers/user";
import { getSettings } from "@/lib/fetchers/settings";
import ConditionalLayoutProvider from "@/components/layout/conditional-layout-provider";
import { SettingsStatus } from "@/components/development/settings-status";
import { GlobalAuthDetector } from "@/components/auth/global-auth-detector";
import { Geist, Geist_Mono, Space_Grotesk, DM_Sans } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: {
    default: process.env.NEXT_PUBLIC_SITE_NAME || "My App",
    template: `%s - ${process.env.NEXT_PUBLIC_SITE_NAME || "My App"}`,
  },
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "My App Description",
};

// Type for settings result with fallback flag
type SettingsResult = {
  settings: Record<string, any>;
  extensions: any[];
  _fallback?: boolean;
};

// Safe wrapper for SSR API calls with better error handling
async function safeGetUserProfile(retries = 2) {
  const isDevelopment = process.env.NODE_ENV === "development";

  for (let i = 0; i < retries; i++) {
    try {
      const profile = await getUserProfile();
      return profile;
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isDevelopment) {
        console.warn(
          `SSR: Profile fetch attempt ${i + 1}/${retries} failed:`,
          errorMessage
        );
      }

      if (isLastAttempt) {
        if (isDevelopment) {
          console.warn(
            "SSR: All profile fetch attempts failed, continuing without profile"
          );
        }
        return null;
      }

      /* Back off before retrying — in every environment, not just development.
         This was gated on isDevelopment, so in production both attempts fired
         in the same millisecond and the retry bought nothing. A backend that is
         restarting takes seconds to answer (the engine loads 140 models and
         1053 routes before it listens), which is precisely the window this is
         meant to ride out. */
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      }
    }
  }

  return null;
}

async function safeGetSettings(retries = 3): Promise<SettingsResult> {
  const isDevelopment = process.env.NODE_ENV === "development";

  for (let i = 0; i < retries; i++) {
    try {
      const result = await getSettings();
      if (result && (result.settings || result.extensions)) {
        return result as SettingsResult;
      }
      // If result is empty but no error, treat as failed attempt
      throw new Error("Empty settings result");
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isDevelopment) {
        console.warn(
          `SSR: Settings fetch attempt ${i + 1}/${retries} failed:`,
          errorMessage
        );
      }

      if (isLastAttempt) {
        console.error(
          "SSR: All settings fetch attempts failed, using fallback"
        );
        return {
          settings: {},
          extensions: [],
          _fallback: true, // Flag to indicate this is fallback data
        };
      }

      // Wait before retry (exponential backoff in development)
      if (isDevelopment && i < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, i) * 100)
        );
      }
    }
  }

  return { settings: {}, extensions: [], _fallback: true };
}

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function RootLayout(
  props: RootLayoutProps
): Promise<React.JSX.Element> {
  const t = await getTranslations("common");
  try {
    const params = await props.params;
    const { children } = props;
    const { locale } = params;

    // Validate locale first
    if (!config.locales.includes(locale)) {
      // Only log in development to avoid noise from bot attacks
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `Invalid locale: ${locale}. Available locales: ${config.locales.join(", ")}`
        );
      }
      notFound();
    }

    // Everything except the admin dictionaries.
    //
    // These messages are serialised into the HTML of every response, so whatever
    // is handed to the provider below is downloaded and parsed by the browser
    // before it can paint. Sending the full set meant a trader watching a chart
    // paid for ext_admin (171KB) and dashboard_admin (85KB) on every request,
    // for screens they will never open — roughly half the payload of a page
    // whose own markup is 7KB.
    //
    // The admin sections add them back in their own layouts, so nothing there
    // loses a string. See i18n/admin-namespaces.ts.
    const allMessages = await loadAllNamespaces(locale);
    const messages = withoutAdminNamespaces(allMessages);

    // Fetch global configuration with improved error handling
    const isDevelopment = process.env.NODE_ENV === "development";
    let profile = null;
    let settingsResult: SettingsResult = { settings: {}, extensions: [] };

    try {
      // In development, use Promise.allSettled for better error isolation
      // In production, fail fast if needed
      const fetchPromises = [safeGetUserProfile(), safeGetSettings()];

      const [profileResult, settingsResultPromise] =
        await Promise.allSettled(fetchPromises);

      if (profileResult.status === "fulfilled") {
        profile = profileResult.value;
      } else {
        if (isDevelopment) {
          console.warn("Profile fetch failed:", profileResult.reason);
        }
      }

      if (settingsResultPromise.status === "fulfilled") {
        settingsResult = settingsResultPromise.value || {
          settings: {},
          extensions: [],
        };

        // In development, warn if we're using fallback data
        if (isDevelopment && settingsResult._fallback) {
          console.warn(
            "⚠️  Using fallback settings data - menu might not be complete"
          );
        }
      } else {
        if (isDevelopment) {
          console.warn("Settings fetch failed:", settingsResultPromise.reason);
        }
        settingsResult = { settings: {}, extensions: [], _fallback: true };
      }
    } catch (error) {
      console.error("Error fetching layout data:", error);
      // Continue with defaults
      settingsResult = { settings: {}, extensions: [], _fallback: true };
    }

    // Ensure we have valid settings structure
    const { settings = {}, extensions = [], _fallback } = settingsResult || {};

    // In development, add helpful debugging info
    if (isDevelopment && _fallback) {
      console.info(
        "🔧 Development tip: If menu is missing, try refreshing or check backend connection"
      );
    }

    // Always return a valid layout, even if some data is missing
    return (
      <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth" className="notranslate" translate="no">
        <head>
          {/* Marks Apple platforms so globals.css can keep `-webkit-font-smoothing:
              antialiased` there and leave every other platform on `auto`, which is
              what re-enables ClearType on Windows. Inline and parser-blocking on
              purpose: it has to land on <html> before first paint, or text would
              visibly re-rasterise a frame in. It is two property reads and a regex. */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{var p=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||'';if(/Mac|iPhone|iPad|iPod/i.test(p))document.documentElement.setAttribute('data-platform','apple')}catch(e){}",
            }}
          />
          {/* Both faces are needed for the first paint of the terminal — the
              interface text from Onest, and ₹ on every figure from the fill —
              so fetch them alongside the HTML instead of waiting for the CSS to
              be parsed first. crossOrigin is required even same-origin: fonts
              are always fetched in CORS mode, and without it the preload is
              discarded and refetched. */}
          <link rel="preload" href="/fonts/onest-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
          <link rel="preload" href="/fonts/inter-fill.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
          {/* PWA Manifest */}
          <link rel="manifest" href="/manifest.json" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          {/* Favicons - files are replaced directly via admin upload.

              The .ico comes first and without a sizes hint, because it is the
              only one every browser understands: Safari and a long tail of
              feed readers, embedders and older engines ignore WebP icons
              entirely and fall back to whatever /favicon.ico happens to be.
              Listing only WebP left those clients with no icon at all. */}
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <link rel="icon" type="image/png" sizes="32x32" href="/img/logo/favicon-32x32.png" />
          <link rel="icon" type="image/webp" sizes="16x16" href="/img/logo/favicon-16x16.webp" />
          <link rel="icon" type="image/webp" sizes="32x32" href="/img/logo/favicon-32x32.webp" />
          <link rel="icon" type="image/webp" sizes="96x96" href="/img/logo/favicon-96x96.webp" />
          {/* Apple ignores WebP for the home-screen icon — it must be PNG or
              iOS screenshots the page instead of using the mark. */}
          <link rel="apple-touch-icon" sizes="180x180" href="/img/logo/apple-icon-180x180.png" />
          <meta name="theme-color" content="#1226b4" />
        </head>
        {/* No `antialiased` on <body> — that utility disabled ClearType site-wide
            on Windows. Font smoothing is set per platform in globals.css. */}
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${dmSans.variable} font-sans`}
          style={{ "--radius": "0.5rem" } as React.CSSProperties}
          suppressHydrationWarning
        >
          <TranslationProvider locale={locale} messages={messages}>
            <Providers
              profile={profile}
              settings={settings}
              extensions={extensions}
            >
              <DirectionProvider locale={locale}>
                <ConditionalLayoutProvider>
                  {children}
                  <SettingsStatus />
                  <GlobalAuthDetector />
                </ConditionalLayoutProvider>
              </DirectionProvider>
            </Providers>
          </TranslationProvider>
        </body>
      </html>
    );
  } catch (error) {
    // Return a minimal fallback layout that won't cause additional errors
    // Note: In the error case, we can't load translations, so use hardcoded strings
    return (
      <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className="notranslate" translate="no">
        <body className="min-h-screen bg-background font-sans">
          <div className="flex h-screen w-full flex-col items-center justify-center space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t("application_error")}</h1>
              <p className="text-muted-foreground mt-2">
                {t("failed_to_initialize_the_application_please")}
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                {t("error")} {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </div>
        </body>
      </html>
    );
  }
}
