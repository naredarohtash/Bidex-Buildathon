"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  TrendingUp,
  BarChart3,
  Globe,
  Coins,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn, PAGE_CONTAINER } from "@/lib/utils";
import Image from "next/image";
import Logo from "@/components/elements/logo";
import { useTheme } from "next-themes";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "BIDEX";
/* The fallback described a different product: "the most trusted cryptocurrency
   platform with advanced trading tools and secure storage" — a custodial
   exchange, which this is not. The logo two inches away reads BINARY OPTIONS
   BROKER. It also opened with a superlative nobody can stand behind.

   NOTE: the deployed site does not use this fallback — NEXT_PUBLIC_SITE_DESCRIPTION
   is set in the server's .env and currently reads "BIDEX is a cryptocurrency
   exchange platform, where you can trade Bitcoin, Ethereum, Litecoin, and other
   cryptocurrencies", which is wrong in the same way and cannot be fixed from
   here. That value needs changing on the box. */
const siteDescription =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
  "Binary options on currencies, crypto, commodities and stocks.";

// Social link interface matching the settings configuration
interface SocialLink {
  id: string;
  name: string;
  url: string;
  icon: string;
}

interface FooterLink {
  name: string;
  href: string;
  icon?: React.ElementType;
}

interface FooterSection {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  links: FooterLink[];
}

export function SiteFooter() {
  const t = useTranslations("common");
  const tComponents = useTranslations("components");
  const { extensions, settings, settingsFetched } = useSettings();
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark" || resolvedTheme === "navy";

  const hasExtension = (name: string) => extensions?.includes(name) ?? false;
  const getSetting = (key: string) => {
    if (!settings) return false;
    const value = settings[key];
    return value === true || value === "true";
  };

  const isSpotEnabled = getSetting("spotWallets");
  const isEcosystemEnabled = hasExtension("ecosystem");
  const showSpotTrading = isSpotEnabled || isEcosystemEnabled;

  // Get social links from customSocialLinks setting
  const socialLinks = useMemo(() => {
    if (!settings) return [];
    const customLinks = settings.customSocialLinks;
    if (!customLinks) return [];

    try {
      const parsed: SocialLink[] = typeof customLinks === 'string'
        ? JSON.parse(customLinks)
        : customLinks;

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((link) => link.url && link.url.trim() !== "")
        .map((link) => ({
          id: link.id,
          label: link.name,
          href: link.url,
          icon: link.icon || "/img/social/globe.svg",
        }));
    } catch {
      return [];
    }
  }, [settings]);

  const footerSections = useMemo<FooterSection[]>(() => {
    const sections: FooterSection[] = [];

    // Trading Section
    const tradingLinks: FooterLink[] = [
      { name: "Binary Options", href: "/terminal" },
      { name: "Markets", href: "/market" },
    ];

    sections.push({
      title: "Trading",
      icon: BarChart3,
      iconColor: "text-blue-500 dark:text-blue-400",
      links: tradingLinks,
    });

    // Resources Section
    const resourceLinks: FooterLink[] = [
      { name: "API Documentation", href: "/api-docs" },
      { name: "Help Center", href: "/support" },
    ];
    if (hasExtension("knowledge_base")) {
      resourceLinks.push({ name: "FAQ", href: "/faq" });
    }

    sections.push({
      title: "Resources",
      icon: BookOpen,
      iconColor: "text-amber-500 dark:text-amber-400",
      links: resourceLinks,
    });

    // Company Section
    sections.push({
      title: "Company",
      icon: Globe,
      iconColor: "text-purple-500 dark:text-purple-400",
      links: [
        { name: "About", href: "/about" },
        { name: "Contact", href: "/contact" },
        { name: "KYC Verification", href: "/user/kyc" },
      ],
    });

    return sections;
  }, [extensions, settings]);

  if (!settingsFetched) {
    return (
      <footer className="bg-muted/30 py-12 border-t">
        <div className={PAGE_CONTAINER}>
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-32 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn(
      "relative border-t transition-colors duration-500 overflow-hidden",
      isDark
        ? "bg-[#030712] border-gray-900 text-gray-400"
        : "bg-slate-50 border-slate-200 text-slate-500"
    )}>
      {/* Background ambient neon glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {isDark ? (
          <>
            <div className="absolute bottom-[-100px] right-[-100px] w-[350px] h-[350px] rounded-full bg-emerald-500/5 blur-[80px]" />
            <div className="absolute top-[-100px] left-[-100px] w-[350px] h-[350px] rounded-full bg-blue-500/5 blur-[80px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff01_1px,transparent_1px),linear-gradient(to_bottom,#ffffff01_1px,transparent_1px)] bg-[size:4rem_4rem]" />
          </>
        ) : (
          <>
            <div className="absolute bottom-[-100px] right-[-100px] w-[350px] h-[350px] rounded-full bg-emerald-500/3 blur-[90px] opacity-40" />
            <div className="absolute top-[-100px] left-[-100px] w-[350px] h-[350px] rounded-full bg-indigo-500/3 blur-[90px] opacity-40" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000002_1px,transparent_1px),linear-gradient(to_bottom,#00000002_1px,transparent_1px)] bg-[size:4rem_4rem]" />
          </>
        )}
      </div>

      <div className="relative z-10">
        {/* Newsletter Drawer / Upper Grid */}
        {/* A newsletter form stood here. Its submit handler was:

              toast.success("Subscribed successfully!")

            and nothing else — no request, no list, no address stored anywhere.
            It told every visitor who used it that something had happened when
            nothing had. A form that lies is worse than no form; when there is a
            mailing list to join, this can come back wired to it. */}
                {/* Main Grid */}
        <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
          <div className={cn(
            "grid grid-cols-1 lg:grid-cols-12 gap-12 pb-12 border-b",
            isDark ? "border-gray-900/60" : "border-slate-200/60"
          )}>
            {/* Left side: Brand Logo, Desc, and social links */}
            <div className="lg:col-span-4 space-y-6">
              <div>
                <div className="mb-4 select-none">
                  <Logo type="text" className="h-8 lg:h-9 w-auto max-w-[150px] lg:max-w-[170px]" />
                </div>
                <p className={cn("text-xs leading-relaxed max-w-xs", isDark ? "text-gray-500" : "text-slate-500")}>
                  {siteDescription}
                </p>
              </div>

              {/* Social Links */}
              {socialLinks.length > 0 && (
                <div className="space-y-3">
                  <div className={cn(
                    "text-[10px] font-bold uppercase tracking-wider select-none",
                    isDark ? "text-gray-600" : "text-slate-400"
                  )}>Connect with us</div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {socialLinks.map((social) => (
                      <a
                        key={social.id}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        title={social.label}
                        className={cn(
                          "w-9 h-9 flex items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5",
                          isDark
                            ? "bg-gray-950/60 hover:bg-[#10b981]/10 hover:text-emerald-400 border-gray-800 text-gray-500"
                            : "bg-white hover:bg-slate-100 hover:text-slate-900 border-slate-200 text-slate-500"
                        )}
                      >
                        <Image
                          src={social.icon}
                          alt={social.label}
                          width={18}
                          height={18}
                          className="dark:invert opacity-60 hover:opacity-100 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Links Grid */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
              {footerSections.map((section) => (
                <div key={section.title}>
                  {/* No icon. Each heading carried a different coloured glyph —
                      a blue chart, an amber book, a purple globe, all rendered
                      emerald anyway by a hardcoded class that ignored the colour
                      beside it. Three words, same as the nav. */}
                  <h4 className={cn(
                    "font-bold text-xs uppercase tracking-wider mb-5 select-none",
                    isDark ? "text-white" : "text-slate-900"
                  )}>
                    {section.title}
                  </h4>
                  <ul className="space-y-3.5">
                    {section.links.map((link) => {
                      /* The "LIVE" and "NEW" chips are gone. Neither tracked
                         anything — "LIVE" was hardcoded to the Binary Options
                         row and "NEW" to FAQ, so they said the same thing for
                         ever, which is the opposite of what a badge is for. */
                      return (
                        <li key={link.name} className="flex items-center gap-2 group">
                          <Link
                            href={link.href}
                            className={cn(
                              "text-xs transition-colors duration-250 inline-block font-medium",
                              isDark
                                ? "text-gray-500 hover:text-white"
                                : "text-slate-555 hover:text-slate-900"
                            )}
                          >
                            {link.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* A statistics bar stood here: "<90ms Avg" execution speed,
              "PCI-DSS Vaults" storage security, "Zero Overheads"
              transaction fee and "200+ Countries" coverage.

              Not one of them is sourced anywhere in this codebase, and two
              are not the kind of thing to assert loosely: PCI-DSS is a
              compliance certification, and a fee claim is a term of
              business. On a broker's footer these read as regulatory
              statements. They come back when there is something real
              behind them, phrased by whoever can stand behind it. */}
        </div>

        {/* Bottom Bar */}
        <div className={cn(
          "py-6",
          isDark ? "bg-[#02050b]/40" : "bg-slate-100/40"
        )}>
          <div className={PAGE_CONTAINER}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className={cn("text-xs text-center sm:text-left", isDark ? "text-gray-600" : "text-slate-400")}>
                © {new Date().getFullYear()} {siteName}. {tComponents("all_rights_reserved")}.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                {[
                  { name: "Privacy", href: "/privacy" },
                  { name: "Terms", href: "/terms" },
                ].map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={cn(
                      "text-xs transition-colors",
                      isDark ? "text-gray-500 hover:text-white" : "text-slate-400 hover:text-slate-905"
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
