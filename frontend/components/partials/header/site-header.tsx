"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, PAGE_CONTAINER } from "@/lib/utils";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { useUserStore } from "@/store/user";
import { useConfigStore } from "@/store/config";
import { useSidebar } from "@/store";
import { useTheme } from "next-themes";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Icon } from "@iconify/react";
import {
  Moon, Sun, Search, Command, ChevronDown, ChevronLeft, Sparkles,
  User, Settings, Menu, Wallet
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getMenu } from "@/config/menu";
import { useSettings } from "@/hooks/use-settings";
import { useMenuTranslations } from "@/components/partials/menu-translator";
import { AuthHeaderControls } from "@/components/auth/auth-header-controls";
import { NotificationBell } from "./notification-bell";
import NavbarLogo from "@/components/elements/navbar-logo";
import { WalletPopover } from "./wallet-popover";

import MegaDropdown from "./mega-dropdown";
import CommandPalette from "./command-palette";
import MobileMenu from "./mobile-menu";
import { CartoonAvatar } from "./cartoon-avatar";

// Color schema utilities
import { NAV_COLOR_SCHEMAS, getColorHex, getGradientStyle, type NavColorSchema } from "@/lib/nav-color-schema";

export interface SiteHeaderProps {
  /**
   * Header variant - auto-detected from pathname if not provided
   * - "admin": Full admin navigation with command palette, mega dropdowns
   * - "user": Standard user navigation
   * - "extension": Extension pages with back button and custom menu
   */
  variant?: "admin" | "user" | "extension";

  /** Menu type or custom menu items */
  menu?: "user" | "admin" | MenuItem[];

  /** Custom controls to show on the right side */
  rightControls?: React.ReactNode;

  /** Custom admin path for extension toggle (e.g., "/admin/copy-trading") */
  adminPath?: string;

  /** Custom user path for extension toggle (e.g., "/staking") - used in admin areas */
  userPath?: string;

  /** Color schema for themed navigation */
  colorSchema?: NavColorSchema;

  /** Show back button (auto-enabled for extension variant) */
  showBackButton?: boolean;

  /** Custom back button href */
  backButtonHref?: string;

  /** Additional class names */
  className?: string;

  /**
   * Translation namespace for menu items
   * - For main admin/user menus: "menu" (default)
   * - For extensions: e.g., "ext_p2p" or "ext_admin_p2p"
   */
  translationNamespace?: string;

  /**
   * Translation key prefix for navigation items within the namespace
   * - For main menus: "" (default, keys like "admin.dashboard.title")
   * - For extensions: "nav" (keys like "nav.home.title")
   */
  translationNavPrefix?: string;
}

export default function SiteHeader({
  variant,
  menu,
  rightControls,
  adminPath,
  userPath,
  colorSchema,
  showBackButton,
  backButtonHref,
  className,
  translationNamespace = "menu",
  translationNavPrefix = "",
}: SiteHeaderProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { user, hasPermission } = useUserStore();
  const authStatus = useUserStore((state) => state.authStatus);

  /* `!!user` is not "is somebody signed in".
     The profile request 401s for a signed-out visitor and leaves a hollow user
     object behind — truthy, with no email — which is the same object that once
     rendered "undefined undefined" in the account panel. Testing it here meant
     a signed-out visitor got the signed-in header: a wallet button, a
     notification bell and an avatar, and no way to log in, on the same page
     whose hero was correctly offering them "Create an Account". The two halves
     of one screen disagreed about who was looking at it.

     `signedIn` is the rule the rest of the app uses (lib/guest/use-guest-gate). */
  const signedIn = !!user?.email;
  const { settings } = useConfigStore();
  const { settings: hookSettings, extensions, settingsFetched } = useSettings();
  const { getTitle, getDescription } = useMenuTranslations(translationNamespace, translationNavPrefix);
  const { mobileMenu, setMobileMenu } = useSidebar();

  // State
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Media queries
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isLargeDesktop = useMediaQuery("(min-width: 1536px)");

  // Computed values
  const isDark = mounted ? (resolvedTheme === "dark" || resolvedTheme === "navy") : false;
  const layoutSwitcherEnabled = settings?.layoutSwitcher === true || settings?.layoutSwitcher === "true";

  // Get effective color schema
  const schema = colorSchema || NAV_COLOR_SCHEMAS.default;
  const primaryColor = getColorHex(schema.primary, isDark);
  const secondaryColor = schema.secondary ? getColorHex(schema.secondary, isDark) : primaryColor;
  const gradientStyle = getGradientStyle(schema, isDark);

  // Auto-detect variant from pathname
  const isInAdminArea = pathname.startsWith("/admin");
  const effectiveVariant = variant || (isInAdminArea ? "admin" : "user");
  const isAdmin = effectiveVariant === "admin";
  const isExtension = effectiveVariant === "extension";
  const isCustomMenu = Array.isArray(menu);

  // Determine menu type
  const menuType = menu || (isAdmin ? "admin" : "user");

  // Calculate paths
  const defaultBackHref = isInAdminArea ? "/admin" : "/";
  const effectiveBackHref = backButtonHref || defaultBackHref;
  const shouldShowBackButton = showBackButton ?? (isExtension && isCustomMenu && isInAdminArea);

  // User/Admin toggle path
  const userEquivalentPath = React.useMemo(() => {
    if (!isInAdminArea) {
      return adminPath || "/admin";
    }

    // If explicit userPath is provided (used by extensions), use it
    if (userPath) {
      return userPath;
    }

    // For non-extension admin pages, always go to home
    // Extensions handle their own userPath in their layouts
    return "/";
  }, [isInAdminArea, userPath, adminPath]);

  // Mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Note: Theme is controlled by ThemeProvider in providers.tsx
  // When layoutSwitcher is disabled, the defaultTheme is already set in ThemeProvider
  // We don't need to force it here as it would override the user's stored preference on every mount

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Command palette keyboard shortcut (admin only)
  useEffect(() => {
    if (!isAdmin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        setActiveMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdmin]);

  // Get menu items
  const menuItems = React.useMemo(() => {
    if (!settingsFetched) return [];

    if (isCustomMenu) {
      return menu as MenuItem[];
    }

    return getMenu({
      /* The real one, or none — but only once we know which.
      
         getMenu names the first entry "Demo Trading" for a visitor without an
         account. The profile is resolved after mount, so on the first render
         of a signed-in session this was null and the nav told a paying
         customer they were on a demo. While the answer is still outstanding
         the menu is built as though signed in, which keeps the neutral word:
         a guest reads "Trading" for a few hundred milliseconds before it
         sharpens to "Demo Trading", and nobody with an account is ever told
         they do not have one. */
      user: user?.email ? user : authStatus === "unknown" ? ({} as any) : null,
      settings: hookSettings,
      extensions,
      activeMenuType: menuType as "user" | "admin",
    });
  }, [user, authStatus, hookSettings, extensions, settingsFetched, menu, menuType, isCustomMenu]);

  // Check if menu item is active
  const isActiveMenu = useCallback((item: MenuItem): boolean => {
    // For Dashboard or Home items, or items with exact=true, only mark active if exactly on that path
    // This prevents /forex from being active when on /forex/plan
    const key = item.key || "";
    const isHomeOrDashboard = key === "admin-dashboard" ||
                              key === "home" ||
                              key === "dashboard" ||
                              key.includes("-home") ||
                              key.includes("-dashboard");

    if (isHomeOrDashboard || item.exact) {
      // Exact match only for home/dashboard items or items with exact=true
      return pathname === item.href || pathname === item.href + "/";
    }

    // For items without href or with #, check children only
    if (!item.href || item.href === "#") {
      const checkChildren = (children: MenuItem[] | undefined): boolean => {
        if (!children) return false;
        return children.some(child => {
          if (pathname === child.href) return true;
          // Respect exact flag for children too
          if (child.exact) return false;
          if (child.href && child.href !== "#" && pathname.startsWith(child.href + "/")) return true;
          return checkChildren(child.child) || checkChildren(child.megaMenu);
        });
      };
      return checkChildren(item.child) || checkChildren(item.megaMenu);
    }

    // For regular items, check exact match or prefix match
    if (pathname === item.href) return true;
    if (pathname.startsWith(item.href + "/")) return true;

    // Also check children for parent items
    const checkChildren = (children: MenuItem[] | undefined): boolean => {
      if (!children) return false;
      return children.some(child => {
        if (pathname === child.href) return true;
        // Respect exact flag for children too
        if (child.exact) return false;
        if (child.href && child.href !== "#" && pathname.startsWith(child.href + "/")) return true;
        return checkChildren(child.child) || checkChildren(child.megaMenu);
      });
    };

    return checkChildren(item.child) || checkChildren(item.megaMenu);
  }, [pathname]);

  // Handle menu hover with delay (admin only)
  const handleMenuEnter = useCallback((key: string) => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
    }
    setActiveMenu(key);
  }, []);

  const handleMenuLeave = useCallback(() => {
    menuTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  }, []);

  // Mobile menu toggle
  const toggleMobileMenu = () => {
    setMobileMenu(!mobileMenu);
  };

  if (!mounted) return null;

  // Render Admin Header
  if (isAdmin) {
    return (
      <>
        <motion.header
          ref={headerRef}
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
            isScrolled
              ? isDark
                ? "bg-zinc-950/80 backdrop-blur-2xl border-b border-white/[0.08] shadow-2xl shadow-black/30"
                : "bg-white/80 backdrop-blur-2xl border-b border-black/[0.08] shadow-2xl shadow-zinc-300/30"
              : isDark
                ? "bg-transparent backdrop-blur-md"
                : "bg-transparent backdrop-blur-md",
            className
          )}
        >
          {/* Glassmorphism gradient overlay - works with any background */}
          <div className={cn(
            "absolute inset-0 transition-opacity duration-500",
            isScrolled
              ? "opacity-100"
              : "opacity-60",
            isDark
              ? "bg-gradient-to-r from-zinc-950/40 via-zinc-900/30 to-zinc-950/40"
              : "bg-gradient-to-r from-white/40 via-white/20 to-white/40"
          )} />

          {/* Subtle noise texture for depth */}
          <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

          {/* Premium animated gradient line at top - uses color schema */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background: colorSchema
                ? `linear-gradient(to right, transparent, ${primaryColor}99, ${secondaryColor}99, transparent)`
                : `linear-gradient(to right, transparent, hsl(var(--primary) / 0.6), transparent)`
            }}
          />

          {/* Bottom glow line */}
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500",
              isScrolled ? "opacity-100" : "opacity-0"
            )}
            style={{
              background: colorSchema
                ? `linear-gradient(to right, transparent, ${primaryColor}30, transparent)`
                : isDark
                  ? "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)"
                  : "linear-gradient(to right, transparent, rgba(0,0,0,0.05), transparent)"
            }}
          />

          <div className={cn("relative z-10", PAGE_CONTAINER)}>
            <div className="flex items-center justify-between h-16">
              {/* Left Section: Mobile Menu + Logo */}
              <div className="flex items-center gap-4">
                {!isDesktop && (
                  <button
                    onClick={toggleMobileMenu}
                    className={cn(
                      "p-2 rounded-lg transition-colors cursor-pointer",
                      isDark
                        ? "hover:bg-zinc-800 text-zinc-400"
                        : "hover:bg-zinc-100 text-zinc-600"
                    )}
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}

                <div className="hidden min-[560px]:block">
                  <NavbarLogo href="/admin" isInAdmin={true} />
                </div>

                {/* Desktop Navigation */}
                {isDesktop && (
                  <nav className="flex items-center ml-6">
                    <div className="flex items-center gap-0.5">
                      {menuItems.map((item) => {
                        const isActive = isActiveMenu(item);
                        const hasDropdown = !!((item.child && item.child.length > 0) ||
                                           (item.megaMenu && item.megaMenu.length > 0));
                        const isDashboard = item.key === "admin-dashboard";

                        return (
                          <div
                            key={item.key}
                            className="relative"
                            onMouseEnter={() => hasDropdown && handleMenuEnter(item.key)}
                            onMouseLeave={handleMenuLeave}
                          >
                            <NavItem
                              item={item}
                              isActive={isActive}
                              hasDropdown={hasDropdown}
                              isOpen={activeMenu === item.key}
                              getTitle={getTitle}
                              isDark={isDark}
                              iconOnly={isDashboard}
                              compact={!isLargeDesktop}
                              colorSchema={colorSchema}
                              primaryColor={primaryColor}
                              secondaryColor={secondaryColor}
                              gradientStyle={gradientStyle}
                            />

                            {/* Dropdown */}
                            <AnimatePresence>
                              {hasDropdown && activeMenu === item.key && (
                                <MegaDropdown
                                  item={item}
                                  onClose={() => setActiveMenu(null)}
                                  isDark={isDark}
                                  getTitle={getTitle}
                                  colorSchema={colorSchema}
                                  primaryColor={primaryColor}
                                  secondaryColor={secondaryColor}
                                  gradientStyle={gradientStyle}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </nav>
                )}
              </div>

              {/* Right Section: Search + Controls */}
              <div className="flex items-center gap-2">
                {/* Custom Right Controls */}
                {rightControls}

                {/* Command Palette Trigger */}
                {isDesktop && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setCommandPaletteOpen(true)}
                    className={cn(
                      "flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-sm transition-all duration-200 cursor-pointer",
                      "border",
                      isDark
                        ? "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/50"
                        : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
                    )}
                  >
                    <Search className="w-4 h-4" />
                    <kbd className={cn(
                      "hidden xl:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium",
                      isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500"
                    )}>
                      <Command className="w-2.5 h-2.5" />K
                    </kbd>
                  </motion.button>
                )}

                {/* User/Admin Toggle */}
                {hasPermission("access.admin") && (
                  <Link href={userEquivalentPath}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "hidden sm:flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                        "border",
                        isDark
                          ? "text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50"
                          : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <User className="w-4 h-4" />
                      <span>{t("user")}</span>
                    </motion.button>
                  </Link>
                )}

                {/* Admin header keeps a theme control of its own — it is a
                    workspace, not a shop window, and there is no profile menu
                    here to fold it into. Same swatches as everywhere else. */}
                {layoutSwitcherEnabled && (
                  <ThemeSwatches theme={theme} setTheme={setTheme} isDark={isDark} />
                )}

                {/* Wallet Button */}
                {signedIn && (
                  <WalletPopover isDark={isDark}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 cursor-pointer",
                        "border",
                        isDark
                          ? "text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50"
                          : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <Wallet className="w-4 h-4" />
                    </motion.button>
                  </WalletPopover>
                )}

                {/* Notifications */}
                {signedIn && <NotificationBell />}

                {/* Profile Button / Auth Controls */}
                {signedIn ? (
                  <ProfileButton user={user} isDark={isDark} />
                ) : (
                  <AuthHeaderControls />
                )}
              </div>
            </div>
          </div>

        </motion.header>

        {/* Command Palette */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          menuItems={menuItems}
          isDark={isDark}
          getTitle={getTitle}
        />

        {/* Mobile Menu */}
        {!isDesktop && (
          <MobileMenu
            menuItems={menuItems}
            isDark={isDark}
            getTitle={getTitle}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            userPath={userEquivalentPath}
          />
        )}
      </>
    );
  }

  // Render User/Extension Header - Same premium design as admin
  return (
    <>
      <motion.header
        ref={headerRef}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
          isScrolled
            ? isDark
              ? "bg-zinc-950/80 backdrop-blur-2xl border-b border-white/[0.08] shadow-2xl shadow-black/30"
              : "bg-white/80 backdrop-blur-2xl border-b border-black/[0.08] shadow-2xl shadow-zinc-300/30"
            : isDark
              ? "bg-transparent backdrop-blur-md"
              : "bg-transparent backdrop-blur-md",
          className
        )}
      >
        {/* Glassmorphism gradient overlay - works with any background */}
        <div className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isScrolled
            ? "opacity-100"
            : "opacity-60",
          isDark
            ? "bg-gradient-to-r from-zinc-950/40 via-zinc-900/30 to-zinc-950/40"
            : "bg-gradient-to-r from-white/40 via-white/20 to-white/40"
        )} />

        {/* Subtle noise texture for depth */}
        <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

        {/* Premium animated gradient line at top - uses color schema */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: colorSchema
              ? `linear-gradient(to right, transparent, ${primaryColor}99, ${secondaryColor}99, transparent)`
              : `linear-gradient(to right, transparent, hsl(var(--primary) / 0.6), transparent)`
          }}
        />

        {/* Bottom glow line */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500",
            isScrolled ? "opacity-100" : "opacity-0"
          )}
          style={{
            background: colorSchema
              ? `linear-gradient(to right, transparent, ${primaryColor}30, transparent)`
              : isDark
                ? "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)"
                : "linear-gradient(to right, transparent, rgba(0,0,0,0.05), transparent)"
          }}
        />

        <div className={cn("relative z-10", PAGE_CONTAINER)}>
          {/* Three columns, and the middle one is centred on the row rather than
              packed after the logo.

              Flexing it as a third sibling would centre it in the space *left
              over* by the logo and the controls, which are different widths — so
              it would sit visibly off-centre, and move whenever either side
              changed (a longer name in the profile button, a wallet icon
              appearing). Absolute centring is measured against the row, so it is
              actually in the middle and stays there. `pointer-events-none` on
              the row would swallow clicks, so the nav re-enables its own. */}
          <div className="relative flex items-center justify-between h-16">
            {/* Left Section: Mobile Menu + Logo */}
            <div className="flex items-center gap-4">
              {!isDesktop && (
                <button
                  onClick={toggleMobileMenu}
                  className={cn(
                    "p-2 rounded-lg transition-colors cursor-pointer",
                    isDark
                      ? "hover:bg-zinc-800 text-zinc-400"
                      : "hover:bg-zinc-100 text-zinc-600"
                  )}
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              {shouldShowBackButton ? (
                <div className="flex items-center gap-3">
                  <Link
                    href={effectiveBackHref}
                    className={cn(
                      "flex items-center p-2 rounded-lg transition-colors cursor-pointer",
                      isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                    )}
                  >
                    <ChevronLeft className={cn(
                      "h-5 w-5",
                      isDark ? "text-zinc-400" : "text-zinc-600"
                    )} />
                  </Link>
                  <div className="hidden min-[560px]:block">
                    <NavbarLogo href="/" isInAdmin={isInAdminArea} />
                  </div>
                </div>
              ) : (
                <div className="hidden min-[560px]:block">
                  <NavbarLogo href="/" isInAdmin={false} />
                </div>
              )}

              {/* Desktop Navigation — see the centring note on the row below. */}
              {isDesktop && (
                <nav className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center">
                  <div className="flex items-center gap-1">
                    {menuItems.map((item) => {
                      const isActive = isActiveMenu(item);
                      const hasDropdown = !!((item.child && item.child.length > 0) ||
                                         (item.megaMenu && item.megaMenu.length > 0));

                      return (
                        <div
                          key={item.key}
                          className="relative"
                          onMouseEnter={() => hasDropdown && handleMenuEnter(item.key)}
                          onMouseLeave={handleMenuLeave}
                        >
                          <NavItem
                            item={item}
                            isActive={isActive}
                            hasDropdown={hasDropdown}
                            isOpen={activeMenu === item.key}
                            getTitle={getTitle}
                            isDark={isDark}
                            iconOnly={false}
                            compact={!isLargeDesktop}
                            colorSchema={colorSchema}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                            gradientStyle={gradientStyle}
                          />

                          {/* Dropdown */}
                          <AnimatePresence>
                            {hasDropdown && activeMenu === item.key && (
                              <MegaDropdown
                                item={item}
                                onClose={() => setActiveMenu(null)}
                                isDark={isDark}
                                getTitle={getTitle}
                                colorSchema={colorSchema}
                                primaryColor={primaryColor}
                                secondaryColor={secondaryColor}
                                gradientStyle={gradientStyle}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </nav>
              )}
            </div>

            {/* Right Section: Controls */}
            <div className="flex items-center gap-2">
              {/* Custom Right Controls */}
              {rightControls}

              {/* Admin Toggle */}
              {hasPermission("access.admin") && (
                <Link href={userEquivalentPath}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "hidden sm:flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                      "border",
                      isDark
                        ? "text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50"
                        : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                    )}
                  >
                    {isInAdminArea ? (
                      <>
                        <User className="w-4 h-4" />
                        <span>{t("user")}</span>
                      </>
                    ) : (
                      <>
                        <Settings className="w-4 h-4" />
                        <span>{t("admin")}</span>
                      </>
                    )}
                  </motion.button>
                </Link>
              )}

              {/* The theme control used to be an icon button here, cycling
                  light -> dark -> navy one click at a time with a different
                  glyph each press: a control you have to operate to discover
                  what it does, and press twice to undo. It is a row of three
                  swatches now, each painted in the theme it selects, and for a
                  signed-in user it lives in the profile menu instead — the
                  header should carry what you need while trading, and the
                  theme is set once. */}
              {layoutSwitcherEnabled && !signedIn && (
                <ThemeSwatches theme={theme} setTheme={setTheme} isDark={isDark} />
              )}

              {/* Wallet Button */}
              {signedIn && (
                <WalletPopover isDark={isDark}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 cursor-pointer",
                      "border",
                      isDark
                        ? "text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50"
                        : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                    )}
                  >
                    <Wallet className="w-4 h-4" />
                  </motion.button>
                </WalletPopover>
              )}

              {/* Notifications */}
              {signedIn && <NotificationBell />}

              {/* Profile Button / Auth Controls */}
              {signedIn ? (
                <ProfileButton user={user} isDark={isDark} />
              ) : (
                <AuthHeaderControls />
              )}
            </div>
          </div>
        </div>

      </motion.header>

      {/* Mobile Menu */}
      {!isDesktop && (
        <MobileMenu
          menuItems={menuItems}
          isDark={isDark}
          getTitle={getTitle}
          onOpenCommandPalette={() => {}}
          userPath={userEquivalentPath}
        />
      )}
    </>
  );
}

// Theme Toggle Component
interface ThemeToggleProps {
  isDark: boolean;
  theme: string | undefined;
  setTheme: (theme: string) => void;
}

/**
 * The three themes, each swatch painted in the theme it selects.
 *
 * This was one button that cycled light -> dark -> navy, showing a different
 * icon per state: a control you operate to find out what it does, and press
 * twice to undo one press. Three swatches say what they are without a legend,
 * and every one of them is one click from every other.
 *
 * The values are the real `--background` of each theme, so the control is a
 * preview rather than an illustration of one.
 */
function ThemeSwatches({ theme, setTheme, isDark }: ThemeToggleProps) {
  const options = [
    { id: "light", label: "Light", swatch: "#ffffff", ring: "#d4d4d8" },
    { id: "dark", label: "Dark", swatch: "#09090b", ring: "#3f3f46" },
    { id: "navy", label: "Navy", swatch: "#0b111e", ring: "#1e3a6b" },
  ] as const;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "flex items-center gap-1 rounded-lg border p-1",
        isDark ? "border-zinc-800" : "border-zinc-200"
      )}
    >
      {options.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.id)}
            className={cn(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors",
              selected
                ? isDark ? "bg-white/10" : "bg-black/[0.06]"
                : isDark ? "hover:bg-white/5" : "hover:bg-black/[0.03]"
            )}
          >
            <span
              className="h-3 w-3 rounded-full border"
              style={{
                backgroundColor: option.swatch,
                borderColor: option.ring,
                boxShadow: selected ? `0 0 0 2px ${option.ring}` : undefined,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// Nav Item Component with Color Schema Support
interface NavItemProps {
  item: MenuItem;
  isActive: boolean;
  hasDropdown: boolean;
  isOpen: boolean;
  getTitle: (item: MenuItem) => string;
  isDark: boolean;
  iconOnly?: boolean;
  compact?: boolean;
  colorSchema?: NavColorSchema;
  primaryColor?: string;
  secondaryColor?: string;
  gradientStyle?: string;
}

function NavItem({
  item,
  isActive,
  hasDropdown,
  isOpen,
  getTitle,
  isDark,
  iconOnly,
  compact,
  colorSchema,
  primaryColor,
  secondaryColor,
  gradientStyle
}: NavItemProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Get background classes - use hex colors for text when colorSchema is provided
  const bgClasses = colorSchema
    ? isActive
      ? `${colorSchema.bgActive || ''}`
      : `${colorSchema.bgHover || ''}`
    : isActive
      ? isDark
        ? "bg-white/10"
        : "bg-zinc-900/5"
      : isDark
        ? "hover:bg-white/5"
        : "hover:bg-zinc-900/5";

  // Get text color - use inline style for colorSchema to ensure it applies
  const textStyle = colorSchema && primaryColor
    ? isActive
      ? { color: primaryColor }
      : undefined
    : undefined;

  const defaultTextClass = isActive
    ? isDark
      ? "text-white"
      : "text-zinc-900"
    : isDark
      ? "text-zinc-400 hover:text-white"
      : "text-zinc-600 hover:text-zinc-900";

  const content = (
    <motion.div
      className={cn(
        "relative flex items-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer group",
        iconOnly ? "p-2.5" : compact ? "px-2.5 py-2" : "px-3 py-2",
        bgClasses,
        !colorSchema && defaultTextClass
      )}
      style={textStyle}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => iconOnly && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Icon */}
      {item.icon && (
        <Icon
          icon={item.icon}
          className={cn(
            "w-[18px] h-[18px] transition-colors duration-200 shrink-0",
            colorSchema && isActive && "drop-shadow-sm"
          )}
          style={colorSchema && isActive && primaryColor ? { color: primaryColor } : undefined}
        />
      )}

      {/* Title */}
      {!iconOnly && (
        <span className={cn("whitespace-nowrap", colorSchema && isActive && "font-semibold")}>
          {getTitle(item)}
        </span>
      )}

      {/* Dropdown Indicator */}
      {hasDropdown && !iconOnly && (
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown
            className="w-3 h-3 transition-colors"
            style={colorSchema && isOpen && primaryColor ? { color: primaryColor } : undefined}
          />
        </motion.div>
      )}

      {/* Active Indicator */}
      {isActive && (
        <motion.div
          layoutId={colorSchema ? `nav-indicator-${colorSchema.primary}` : "nav-indicator"}
          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
          style={{
            background: colorSchema && gradientStyle
              ? gradientStyle
              : "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)), hsl(var(--primary) / 0.5))",
            boxShadow: colorSchema ? `0 0 8px ${primaryColor}` : "0 0 8px hsl(var(--primary) / 0.5)"
          }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}

      {/* Tooltip for icon-only items */}
      <AnimatePresence>
        {iconOnly && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap z-50",
              "shadow-lg border",
              isDark
                ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                : "bg-white border-zinc-200 text-zinc-700"
            )}
          >
            {getTitle(item)}
            <div
              className={cn(
                "absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t",
                isDark
                  ? "bg-zinc-800 border-zinc-700"
                  : "bg-white border-zinc-200"
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (hasDropdown) {
    return content;
  }

  return (
    <Link href={item.href || "#"}>
      {content}
    </Link>
  );
}

// Profile Button Component
interface ProfileButtonProps {
  user: any;
  isDark: boolean;
}

function ProfileButton({ user, isDark }: ProfileButtonProps) {
  const t = useTranslations("components");
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { logout } = useUserStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    // Unconditional — see profile-info.tsx. A failed server call must not leave
    // the user signed in.
    await logout();
    router.push("/");
    setIsOpen(false);
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    if (user?.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  // A real avatar is set and is not the generic server placeholder
  const hasRealAvatar =
    !!user?.avatar &&
    user.avatar !== "/user/placeholder.svg" &&
    !user.avatar.includes("placeholder");

  // Seed for deterministic cartoon avatar
  const avatarSeed = user?.email || user?.id || "default";

  /* Same rule as the header that renders this — a hollow user is not a user. */
  if (!user?.email) {
    return <AuthHeaderControls />;
  }

  const menuItems = [
    { name: "Profile", icon: "ph:user-circle-duotone", href: "/user/profile" },
    { name: "API Management", icon: "carbon:api", href: "/user/profile?tab=api" },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 overflow-hidden cursor-pointer",
          "border",
          isDark
            ? "border-zinc-800 hover:border-zinc-700"
            : "border-zinc-200 hover:border-zinc-300"
        )}
      >
        {hasRealAvatar ? (
          <img
            src={user.avatar}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <CartoonAvatar seed={avatarSeed} size={40} className="w-full h-full" />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full right-0 mt-2 w-64 rounded-xl overflow-hidden z-50",
              "border shadow-xl",
              isDark
                ? "bg-zinc-900 border-zinc-800"
                : "bg-white border-zinc-200"
            )}
          >
            {/* User Info Header */}
            <div className={cn(
              "px-4 py-3 border-b flex flex-col gap-0.5 select-none",
              isDark ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-150 bg-zinc-50/50"
            )}>
              <div className={cn("font-bold text-sm truncate", isDark ? "text-white" : "text-zinc-900")}>
                {user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.email.split("@")[0]}
              </div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold uppercase text-emerald-500 tracking-wider">Account Active</span>
              </div>
            </div>

            {/* Theme, where a signed-in user changes it. */}
            <div className={cn(
              "flex items-center justify-between gap-3 px-4 py-3 border-b",
              isDark ? "border-zinc-800" : "border-zinc-200"
            )}>
              <span className={cn(
                "text-[12.5px] font-medium",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
                Theme
              </span>
              <ThemeSwatches theme={theme} setTheme={setTheme} isDark={isDark} />
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                    isDark
                      ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                  )}
                >
                  <Icon icon={item.icon} className="w-4 h-4" />
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Logout */}
            <div className={cn(
              "border-t py-2",
              isDark ? "border-zinc-800" : "border-zinc-200"
            )}>
              <button
                onClick={handleSignOut}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors",
                  isDark
                    ? "text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                    : "text-zinc-600 hover:text-red-600 hover:bg-zinc-50"
                )}
              >
                <Icon icon="ph:lock-duotone" className="w-4 h-4" />
                {t("logout")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Named export for backward compatibility
export { SiteHeader };
