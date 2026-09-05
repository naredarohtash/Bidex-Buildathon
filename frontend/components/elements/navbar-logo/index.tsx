"use client";

import React from "react";
import Logo from "@/components/elements/logo";
import { Link } from "@/i18n/routing";
import { siteName } from "@/lib/siteInfo";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";

interface NavbarLogoProps {
  href?: string;
  className?: string;
  isInAdmin?: boolean;
}

const NavbarLogo = ({
  href,
  className,
  isInAdmin = false,
}: NavbarLogoProps) => {
  const { settings } = useConfigStore();
  const logoHref = href || (isInAdmin ? "/admin" : "/");

  // Get display setting, default to FULL_LOGO_ONLY
  const navbarLogoDisplay = settings?.navbarLogoDisplay || "FULL_LOGO_ONLY";

  /* Two modes, not three.

     SQUARE_WITH_NAME paired the icon with the site name typeset in HTML beside
     it — but the lockup artwork already contains "BIDEX" and "BINARY OPTIONS
     BROKER", so any mode that also printed the name showed the brand twice in
     a row in two different typefaces.

     It never actually rendered: the flag required `logoType === "icon"` while
     that same setting resolved logoType to "text", so the branch was
     unreachable. Dead code that encodes a design mistake is still worth
     deleting — the next person here would have "fixed" the condition. */
  const logoType = navbarLogoDisplay === "ICON_ONLY" ? "icon" : "text";

  return (
    <Link
      href={logoHref}
      aria-label={siteName}
      className={cn("flex items-center min-w-0", className)}
    >
      <Logo type={logoType} className="shrink-0" />
    </Link>
  );
};

export default NavbarLogo;
