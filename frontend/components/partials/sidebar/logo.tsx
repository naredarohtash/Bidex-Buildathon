import Logo from "@/components/elements/logo";
import { useSidebar } from "@/store";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";
import React, { useState, useEffect } from "react";

const SidebarLogo = ({
  hovered,
  isMobile = false,
}: {
  hovered?: boolean;
  isMobile?: boolean;
}) => {
  const { collapsed } = useSidebar();
  const { settings, settingsFetched } = useConfigStore();
  const [mounted, setMounted] = useState(false);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get cached logo display setting from localStorage on initial load
  const getCachedLogoSetting = () => {
    if (typeof window === 'undefined') return "FULL_LOGO_ONLY";
    try {
      const cached = localStorage.getItem('bidex-config-store');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.state?.settings?.navbarLogoDisplay || "FULL_LOGO_ONLY";
      }
    } catch (error) {
      console.warn('Failed to parse cached logo settings:', error);
    }
    return "FULL_LOGO_ONLY";
  };

  // Use cached setting initially, then update when fresh data arrives
  const cachedSetting = getCachedLogoSetting();
  const navbarLogoDisplay = mounted ?
    (settingsFetched ? settings?.navbarLogoDisplay || "FULL_LOGO_ONLY" : cachedSetting) :
    cachedSetting;

  /* Two modes, matching NavbarLogo — see the note there. The lockup artwork
     already reads "BIDEX / BINARY OPTIONS BROKER", so printing the site name
     beside it showed the brand twice in two different typefaces. That branch
     was unreachable anyway (it wanted logoType "icon" from a setting that
     resolves to "text"), so nothing on screen changes by removing it. */
  const logoType = navbarLogoDisplay === "ICON_ONLY" ? "icon" : "text";

  /* Sized to match the header. The lockup is a 4.5:1 strip and 140px wide put
     its second line at about 4px tall — in the file, invisible on screen. */
  const getLogoClassName = () =>
    logoType === "icon"
      ? "h-7 w-7 lg:h-8 lg:w-8"
      : "h-9 lg:h-10 w-auto max-w-[180px] lg:max-w-[210px]";

  return (
    <div className="px-4 py-4">
      <div className="flex items-center">
        <div className="flex flex-1 items-center gap-x-3 min-w-0">
          <Logo
            type={logoType}
            className={cn(
              getLogoClassName(),
              "object-contain flex-shrink-0"
            )}
          />
        </div>
      </div>
    </div>
  );
};

export default SidebarLogo;
