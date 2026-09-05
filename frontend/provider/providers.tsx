"use client";

// Providers.tsx
import { useEffect } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { useUserStore } from "@/store/user";
import { useConfigStore } from "@/store/config";
import { useThemeStore } from "@/store";
import { WebSocketProvider } from "./websocket.provider";
import { ExtensionChecker } from "@/lib/extensions";
import FloatingChatProvider from "@/components/global/floating-chat-provider";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import applyGoogleTranslateDOMPatch from "@/utils/applyGoogleTranslateDOMPatch";
import { LazyMotionProvider } from "@/components/motion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface ProvidersProps {
  children: React.ReactNode;
  profile: any;
  settings: any;
  extensions: any;
}

const ConfigInitializer = ({
  profile,
  settings,
  extensions,
}: Omit<ProvidersProps, "children">) => {
  const setUser = useUserStore((state) => state.setUser);
  const setAuthStatus = useUserStore((state) => state.setAuthStatus);
  const { setSettings, setExtensions, setSettingsFetched, setSettingsError } =
    useConfigStore();

  // Use the settings sync hook for optimistic updates
  useSettingsSync();

  /* A missing profile is not the same as being signed out.
     `profile` is fetched on the server while the page renders. If the backend
     is restarting at that moment it cannot answer, SSR passes null, and this
     used to call setUser(null) — which is what the whole app reads as "signed
     out". The cookies were still valid the entire time; nobody had been logged
     out, the page just could not ask.
     So when SSR came back empty, ask again from the browser before believing
     it. Raw fetch rather than $fetch because the status code is the whole
     point: 401 means genuinely signed out, anything else means try again. */
  useEffect(() => {
    if (profile) {
      setUser(profile);
      return;
    }

    let cancelled = false;

    (async () => {
      const delays = [400, 1200, 2500];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/user/profile", {
            credentials: "include",
            headers: { accept: "application/json" },
          });
          if (cancelled) return;

          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data && !cancelled) setUser(data);
            return;
          }
          if (res.status === 401 || res.status === 403) {
            /* A real answer: this session is not signed in. This is the only
               place, besides the logout action, that is entitled to say so —
               see `authStatus` in the store. Everything downstream waits for
               it rather than reading an empty profile as a guest. */
            if (!cancelled) {
              setUser(null);
              setAuthStatus("guest");
            }
            return;
          }
        } catch {
          /* unreachable — fall through and retry */
        }
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      // Still nothing after ~4s. Leave the user as-is rather than asserting a
      // logout we were never actually told about.
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, setUser, setAuthStatus]);

  useEffect(() => {
    // Only mark as fetched if we actually have settings data
    if (settings && Object.keys(settings).length > 0) {
      setSettings(settings);
      setExtensions(extensions || []);

      // Initialize extension checker with available extensions
      if (extensions && extensions.length > 0) {
        ExtensionChecker.getInstance().initialize(extensions);
      }
    } else {
      // If settings are empty, don't mark as fetched so it will retry
      setSettingsFetched(false);
      setSettingsError(null);
    }
    // `profile` is deliberately not a dependency here — the settings effect no
    // longer touches it, and re-running this whenever the profile changes only
    // churns the extension checker.
  }, [
    settings,
    extensions,
    setSettings,
    setExtensions,
    setSettingsFetched,
    setSettingsError,
  ]);

  return null;
};

// Add error handler component and DOM patches
function GlobalErrorHandler() {
  useEffect(() => {
    // Apply DOM patches for Google Translate and other third-party tools
    // This prevents "removeChild" errors during locale changes
    applyGoogleTranslateDOMPatch();

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      // Prevent the default browser behavior which might crash the app
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error("Global error:", event.error);
    };

    // Add global error listeners
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}

// Font and radius utilities hook
export const useFontClasses = () => {
  const { radius } = useThemeStore();

  return {
    className: `${geistSans.variable} ${geistMono.variable} antialiased`,
    style: { "--radius": `${radius}rem` } as React.CSSProperties,
  };
};

const Providers = ({
  children,
  profile,
  settings,
  extensions,
}: ProvidersProps) => {
  // Get default theme from settings, fallback to environment variable, then 'system' as last fallback
  const defaultTheme = (
    settings?.siteTheme ||
    process.env.NEXT_PUBLIC_DEFAULT_THEME ||
    "system"
  ) as "light" | "dark" | "system";

  return (
    <ThemeProvider
      attribute="class"
      enableSystem={defaultTheme === "system"}
      defaultTheme={defaultTheme}
      disableTransitionOnChange={true}
      themes={["light", "dark", "navy"]}
      value={{
        light: "light",
        dark: "dark",
        navy: "navy",
      }}
    >
      <LazyMotionProvider features="full">
        <ConfigInitializer
          profile={profile}
          settings={settings}
          extensions={extensions}
        />
        {profile?.id ? (
          <WebSocketProvider userId={profile.id}>
            <div className={cn("h-full")}>{children}</div>
            <FloatingChatProvider />
          </WebSocketProvider>
        ) : (
          <>
            <div className={cn("h-full")}>{children}</div>
            <FloatingChatProvider />
          </>
        )}
        <Toaster />
        <GlobalErrorHandler />
      </LazyMotionProvider>
    </ThemeProvider>
  );
};

export default Providers;
