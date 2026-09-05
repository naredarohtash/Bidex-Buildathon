// lib/menu.ts

export const adminMenu: MenuItem[] = [
  {
    key: "admin-dashboard",
    title: "Dashboard",
    href: "/admin",
    permission: "access.admin",
    icon: "solar:home-angle-line-duotone",
    description:
      "Comprehensive administrative overview with real-time analytics, system health monitoring, and quick access to critical management functions.",
  },
  {
    key: "admin-user-management",
    title: "Users",
    href: "/admin/crm",
    icon: "solar:users-group-two-rounded-bold-duotone",
    description:
      "Complete user lifecycle management including registration, verification, role assignment, and customer relationship tools for comprehensive user administration.",
    permission: [
      "access.user",
      "access.role",
      "access.permission",
      "access.kyc.application",
      "access.kyc.level",
      "access.support.ticket",
    ],
    child: [
      {
        key: "admin-users",
        title: "Users",
        icon: "ph:users-duotone",
        href: "/admin/crm/user",
        description:
          "Comprehensive user database with advanced filtering, bulk operations, profile management, and detailed activity tracking.",
        permission: "access.user",
      },
      {
        key: "admin-roles-permissions",
        title: "Roles & Permissions",
        icon: "ph:shield-check-duotone",
        description:
          "Advanced access control system for defining user roles, managing permissions, and implementing security policies across the platform.",
        permission: ["access.role", "access.permission"],
        child: [
          {
            key: "admin-roles",
            title: "User Roles",
            href: "/admin/crm/role",
            permission: "access.role",
            icon: "ph:shield-check-duotone",
            description:
              "Create and manage user roles with customizable permission sets and hierarchical access control structures.",
          },
          {
            key: "admin-permissions",
            title: "Permissions",
            href: "/admin/crm/permission",
            permission: "access.permission",
            icon: "ph:key-duotone",
            description:
              "Granular permission management for fine-tuned access control across all system functions and features.",
          },
        ],
      },
      {
        key: "admin-compliance",
        title: "Compliance & Verification",
        icon: "ph:certificate-duotone",
        description:
          "Regulatory compliance tools including KYC processing, document verification, and identity management for legal adherence.",
        permission: ["access.kyc.application", "access.kyc.level"],
        child: [
          {
            key: "admin-kyc-applications",
            title: "KYC Applications",
            href: "/admin/crm/kyc/application",
            permission: "access.kyc.application",
            icon: "ph:identification-card-duotone",
            description:
              "Review and process Know Your Customer applications with document verification, risk assessment, and approval workflows.",
          },
          {
            key: "admin-kyc-levels",
            title: "Verification Levels",
            href: "/admin/crm/kyc/level",
            permission: "access.kyc.level",
            icon: "ph:ranking-duotone",
            description:
              "Configure verification tiers with customizable requirements, limits, and access privileges for different user categories.",
          },
        ],
      },
      {
        key: "admin-support",
        title: "Customer Support",
        icon: "ph:headset-duotone",
        href: "/admin/crm/support",
        permission: "access.support.ticket",
        description:
          "Integrated support ticket system with priority management, response tracking, and customer satisfaction monitoring.",
      },
      {
        key: "admin-api-management",
        title: "API Management",
        icon: "carbon:api",
        href: "/admin/api/key",
        permission: "access.api.key",
        description:
          "API key lifecycle management with usage monitoring, rate limiting, and security controls for third-party integrations.",
      },
    ],
  },
  {
    key: "admin-financial-operations",
    title: "Finance",
    href: "/admin/finance",
    icon: "solar:dollar-minimalistic-bold-duotone",
    description:
      "Comprehensive financial management suite covering revenue analytics, currency management, payment processing, and transaction oversight.",
    permission: [
      "access.admin.profit",
      "access.fiat.currency",
      "access.spot.currency",
      "access.deposit.gateway",
      "access.deposit.method",
      "access.deposit",
      "access.exchange",
      "access.investment.plan",
      "access.investment.duration",
      "access.investment",
      "access.binary.order",
      "access.exchange.order",
      "access.ecosystem.order",
      "access.futures.order",
      "access.transaction",
      "access.transfer",
      "access.wallet",
      "access.withdraw.method",
      "access.withdraw",
    ],
    child: [
      {
        key: "admin-analytics",
        title: "Revenue Analytics",
        icon: "ph:chart-line-up-duotone",
        href: "/admin/finance/profit",
        permission: "access.admin.profit",
        description:
          "Advanced financial analytics with profit tracking, revenue streams analysis, and comprehensive business intelligence dashboards.",
      },
      
      {
        key: "admin-payment-systems",
        title: "Deposits & Withdrawals",
        icon: "ph:credit-card-duotone",
        description:
          "Approve payouts, configure the deposit provider, and run bonus campaigns.",
        permission: ["access.deposit.gateway", "access.deposit.method", "access.deposit"],
        child: [
          /* The two screens the new deposit system is actually operated from.
             They were built and reachable by URL but never added here, so the
             only way to find them was to already know they existed — which for
             an approval queue means pending withdrawals sit unnoticed. Listed
             first because they are worked daily; the gateway and method screens
             below are configured once and then left alone. */
          {
            key: "admin-payment-provider",
            title: "Crypto Deposits",
            href: "/admin/finance/provider",
            permission: "access.deposit",
            icon: "ph:plugs-connected-duotone",
            description:
              "Connect the payment provider that issues a deposit address per user and credits automatically.",
          },
          {
            key: "admin-finance-requests",
            title: "Pending Requests",
            href: "/admin/finance/request",
            permission: "access.deposit",
            icon: "ph:hourglass-medium-duotone",
            description:
              "Approve bank and UPI payouts and credit deposits that could not be confirmed automatically.",
          },
          {
            key: "admin-deposit-bonuses",
            title: "Deposit Bonuses",
            href: "/admin/finance/bonus",
            permission: "access.deposit",
            icon: "ph:gift-duotone",
            description:
              "Create bonus codes with limits on value, minimum deposit, uses per person and expiry, and see what each has paid out.",
          },
          {
            key: "admin-withdrawal-records",
            title: "Withdrawal Records",
            href: "/admin/finance/withdraw/log",
            permission: "access.withdraw",
            icon: "ph:upload-simple-duotone",
            description:
              "Every withdrawal that has been paid out, with status and payout reference.",
          },
        ],
      },
      
          {
            key: "admin-binary-trading",
            title: "Binary Options",
            icon: "humbleicons:exchange-vertical",
        href: "/admin/finance/binary",
            description:
              "Binary options trading system with market setup and settings configuration.",
            permission: ["access.binary.market", "access.binary.duration"],
            child: [
              {
                key: "admin-binary-markets",
                title: "Binary Markets",
                href: "/admin/finance/binary/market",
                permission: "access.binary.market",
                icon: "ri:exchange-2-line",
                description:
                  "Configure binary options markets with asset pairs and trading parameters.",
              },
              {
                key: "admin-binary-settings",
                title: "Binary Settings",
                href: "/admin/finance/binary/settings",
                permission: "access.binary.duration",
                icon: "ph:gear-duotone",
                description:
                  "Configure trading durations, payouts, order types, and risk management.",
          },
        ],
      },
      
      {
        key: "admin-transaction-management",
        title: "Transaction Management",
        icon: "solar:transfer-horizontal-bold-duotone",
        description:
          "Complete transaction oversight with detailed logging, reconciliation, and transfer management capabilities.",
        permission: ["access.transaction", "access.transfer", "access.wallet"],
        child: [
          {
            key: "admin-transaction-logs",
            title: "Transaction Logs",
            href: "/admin/finance/transaction",
            permission: "access.transaction",
            icon: "solar:clipboard-list-bold-duotone",
            description:
              "Comprehensive transaction history with advanced filtering, export capabilities, and audit trails.",
          },
          
          {
            key: "admin-wallet-management",
            title: "Wallet Management",
            href: "/admin/finance/wallet",
            permission: "access.wallet",
            icon: "ph:wallet-duotone",
            description:
              "Multi-currency wallet administration with balance monitoring, security controls, and backup management.",
          },
        ],
      },
      
    ],
  },
  {
    key: "admin-content-management",
    title: "Content",
    href: "/admin/content",
    icon: "solar:document-text-bold-duotone",
    description: "Comprehensive content management system for media assets and dynamic website content.",
    permission: ["access.content.media", "access.content.slider"],
    child: [
      {
        key: "admin-media-library",
        title: "Media Library",
        icon: "ph:image-duotone",
        href: "/admin/content/media",
        permission: "access.content.media",
        description:
          "Centralized media management with cloud storage, image optimization, and CDN integration for optimal performance.",
      },
      {
        key: "admin-homepage-sliders",
        title: "Homepage Sliders",
        icon: "solar:slider-vertical-bold-duotone",
        href: "/admin/content/slider",
        permission: "access.content.slider",
        description:
          "Dynamic homepage content management with responsive sliders, call-to-action buttons, and A/B testing capabilities.",
      },
    ],
  },
  {
    key: "admin-system-administration",
    title: "System",
    href: "/admin/system",
    icon: "solar:settings-bold-duotone",
    description:
      "Complete system administration suite for platform configuration, monitoring, and maintenance operations.",
    permission: [
      "access.system.announcement",
      "access.cron",
      "access.extension",
      "access.notification.template",
      "access.settings",
      "access.system.update",
    ],
    child: [
      {
        key: "admin-platform-settings",
        title: "Platform Settings",
        href: "/admin/system/settings",
        icon: "ph:gear-duotone",
        permission: "access.settings",
        description:
          "Core platform configuration including branding, localization, security policies, and feature toggles.",
      },
      {
        key: "admin-system-updates",
        title: "System Updates",
        href: "/admin/system/update",
        icon: "ph:download-duotone",
        permission: "access.system.update",
        description:
          "Automated system updates with rollback capabilities, security patches, and feature deployment management.",
      },
      {
        key: "admin-communication",
        title: "Communication Tools",
        icon: "ph:chat-circle-duotone",
        description:
          "Platform communication management including notifications, announcements, and user messaging systems.",
        permission: ["access.notification.template", "access.system.announcement", "access.notification.settings"],
        child: [
          {
            key: "admin-notification-service",
            title: "Notification Service",
            href: "/admin/system/notification",
            permission: "access.notification.settings",
            icon: "ph:bell-ringing-duotone",
            description:
              "Multi-channel notification service with real-time monitoring, health checks, and testing tools for IN_APP, EMAIL, SMS, and PUSH notifications.",
          },
          {
            key: "admin-notification-templates",
            title: "Notification Templates",
            href: "/admin/system/notification/template",
            permission: "access.notification.template",
            icon: "ph:bell-duotone",
            description:
              "Customizable notification templates with multi-channel delivery and personalization variables.",
          },
          {
            key: "admin-system-announcements",
            title: "System Announcements",
            href: "/admin/system/announcement",
            permission: "access.system.announcement",
            icon: "ph:megaphone-duotone",
            description:
              "Platform-wide announcement system with scheduling, targeting, and engagement tracking capabilities.",
          },
        ],
      },
      {
        key: "admin-monitoring",
        title: "System Monitoring",
        icon: "ph:monitor-duotone",
        description:
          "Comprehensive system monitoring with logging, performance metrics, and automated task management.",
        permission: "access.cron",
        child: [
          {
            key: "admin-scheduled-tasks",
            title: "Scheduled Tasks",
            href: "/admin/system/cron",
            permission: "access.cron",
            icon: "ph:calendar-duotone",
            description:
              "Automated task scheduler with job monitoring, failure handling, and performance optimization.",
          },
        ],
      },
      {
        key: "admin-appearance",
        title: "Appearance & Design",
        icon: "solar:palette-bold-duotone",
        description:
          "Customize your website appearance and design with advanced visual tools.",
        permission: "access.admin",
        child: [
          {
            key: "admin-design-builder",
            title: "Page Builder",
            href: "/admin/builder",
            icon: "solar:widget-4-bold-duotone",
            permission: "access.admin",
            settingConditions: { landingPageType: "CUSTOM" },
            description:
              "Advanced visual page builder with drag-and-drop interface, responsive design tools, and brand customization options.",
          },
          {
            key: "admin-design-default-editor",
            title: "Default Pages",
            href: "/admin/default-editor",
            icon: "solar:code-bold-duotone",
            permission: "access.admin",
            settingConditions: { landingPageType: "DEFAULT" },
            description:
              "Edit default frontend pages including home, legal pages, and layouts with code editor interface.",
          },
        ],
      },
    ],
  },
];

/* Three entries, no icons, one destination each.

   It was four — Trading, Markets, Deposit, Help — and three of those are things
   you do *after* you have an account, sitting in the one piece of navigation a
   first-time visitor reads. Deposit in particular asks a stranger for money
   before the product has said what it is. They are all still reachable from the
   places that own them: the terminal, the account panel, the footer.

   What is left is the product and the two questions a visitor actually has.

   No `icon` on any of them. The icons were Solar duotone glyphs picked per item
   — a chart, a graph, a wallet, a question mark — which is decoration standing
   in for hierarchy, and at nav size they read as a row of similar-looking
   smudges. Three words do the job, and every serious broker's nav is words. */
export const userMenu: MenuItem[] = [
  {
    key: "user-trading",
    /* Overwritten to "Demo Trading" for a signed-out visitor by getMenu below.
       Same destination either way: the terminal hands a guest a 30-minute demo
       session, so the label is describing what they will actually get rather
       than advertising something they cannot reach. */
    title: "Trading",
    href: "/terminal",
    description: "Trade binary options with live charts, risk controls and fast execution.",
  },
  {
    key: "user-why",
    title: "Why Us",
    /* A page, not an anchor. These pointed at homepage sections, and the
       homepage is the hero and nothing else now — the anchors resolved to
       empty space. Both are CMS-backed pages on the same mechanism as Terms
       and Privacy, so the copy is written in the admin rather than shipped in
       the bundle. */
    href: "/why-us",
    description: "What this platform does differently.",
  },
  {
    key: "user-about",
    title: "About Us",
    href: "/about",
    description: "Who runs this platform.",
  },
];

function isItemVisible(
  item: MenuItem,
  user: any,
  checkPermission: (permissions?: string | string[]) => boolean,
  hasExtension: (name: string) => boolean,
  getSetting: (key: string) => string | null,
  isAdminMenu: boolean = false
): boolean {
  const hasPermission =
    item.auth === false
      ? !user
      : item.permission
        ? user !== null && checkPermission(item.permission)
        : true;

  const hasRequiredExtension = !item.extension || hasExtension(item.extension);
  const hasRequiredSetting =
    !item.settings || item.settings.every((s) => {
      const value = getSetting(s);
      // Handle both string "true" and boolean true (settings are converted to booleans in the store)
      if (value === "true" || value === "1") return true;
      if (typeof value === 'boolean') return value === true;
      return false;
    });
  const hasRequiredSettingConditions =
    !item.settingConditions ||
    Object.entries(item.settingConditions).every(
      ([key, value]) => getSetting(key) === value
    );
  const isEnvValid = !item.env || item.env === "true";

  // For admin menu, show extensions even if not enabled (they'll be marked as disabled)
  // This allows admins to see what extensions are available but not enabled
  if (isAdminMenu && item.extension) {
    return (
      hasPermission &&
      hasRequiredSetting &&
      hasRequiredSettingConditions &&
      isEnvValid
    );
  }

  // For regular user menu, hide items that require extensions that are not installed/enabled
  // This ensures users don't see menu items for features they can't access
  return (
    hasPermission &&
    hasRequiredExtension &&
    hasRequiredSetting &&
    hasRequiredSettingConditions &&
    isEnvValid
  );
}

function filterChildItems(
  items: MenuItem[] | undefined,
  user: any,
  checkPermission: (permissions?: string | string[]) => boolean,
  hasExtension: (name: string) => boolean,
  getSetting: (key: string) => string | null,
  isAdminMenu: boolean = false
): MenuItem[] | undefined {
  if (!items) return undefined;

  const filtered = items
    .map((item) =>
      filterMenuItem(item, user, checkPermission, hasExtension, getSetting, isAdminMenu)
    )
    .filter((item): item is MenuItem => !!item);

  return filtered.length > 0 ? filtered : undefined;
}

function filterMegaMenuItems(
  megaMenu: MenuItem[] | undefined,
  user: any,
  checkPermission: (permissions?: string | string[]) => boolean,
  hasExtension: (name: string) => boolean,
  getSetting: (key: string) => string | null,
  isAdminMenu: boolean = false
): MenuItem[] | undefined {
  if (!megaMenu) return undefined;

  const filtered = megaMenu
    .map((item) =>
      filterMenuItem(item, user, checkPermission, hasExtension, getSetting, isAdminMenu)
    )
    .filter((item): item is MenuItem => !!item);

  return filtered.length > 0 ? filtered : undefined;
}

function filterMenuItem(
  item: MenuItem,
  user: any,
  checkPermission: (permissions?: string | string[]) => boolean,
  hasExtension: (name: string) => boolean,
  getSetting: (key: string) => string | null,
  isAdminMenu: boolean = false
): MenuItem | null {
  const filteredChild = filterChildItems(
    item.child,
    user,
    checkPermission,
    hasExtension,
    getSetting,
    isAdminMenu
  );

  const filteredMegaMenu = filterMegaMenuItems(
    item.megaMenu,
    user,
    checkPermission,
    hasExtension,
    getSetting,
    isAdminMenu
  );

  const updatedItem = {
    ...item,
    child: filteredChild,
    megaMenu: filteredMegaMenu,
    // Add disabled state for admin menu extensions
    disabled: isAdminMenu && item.extension && !hasExtension(item.extension) ? true : false,
  };

  if (
    !isItemVisible(updatedItem, user, checkPermission, hasExtension, getSetting, isAdminMenu)
  ) {
    return null;
  }

  // For user menu: Hide parent items that have children but no visible children after filtering
  // This ensures menu items like "Marketplace" are hidden when all child extensions are disabled
  if (!isAdminMenu && item.child && !filteredChild) {
    return null;
  }

  return updatedItem;
}

export function getMenu({
  user,
  settings,
  extensions,
  activeMenuType = "user",
}: GetFilteredMenuOptions): MenuItem[] {
  /* A signed-out visitor clicking "Trading" gets the guest demo, so the nav says
     so. Naming it here rather than in the header keeps the menu's wording in the
     menu, and keeps the header from special-casing one item's title. */
  const publicMenu: MenuItem[] = userMenu.map((item) =>
    item.key === "user-trading" && !user
      /* A different key, not just a different title. Nav titles are resolved
         through the i18n manifest by key — `user-trading` has a generated
         entry that says "Trading", and it wins over whatever title the object
         carries. `user-demo-trading` has no entry, and the translator falls
         back to `title` when a key does not resolve, which is the path this
         wants. */
      ? { ...item, key: "user-demo-trading", title: "Demo Trading" }
      : item
  );

  const menu = activeMenuType === "admin" ? adminMenu : publicMenu;
  const isAdminMenu = activeMenuType === "admin";
  const userPermissions = user?.role?.permissions ?? [];

  const checkPermission = (permissions?: string | string[]) => {
    if (user?.role?.name === "Super Admin") return true;
    if (!permissions) return true;
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    if (perms.length === 0) return true;
    
    // Convert permission objects to permission names for comparison
    const userPermissionNames = userPermissions.map((p: any) => 
      typeof p === 'string' ? p : p.name
    );
    
    return perms.every((perm) => userPermissionNames.includes(perm));
  };

  const hasExtension = (name: string) => {
    if (!extensions) return false;
    const hasExt = extensions.includes(name);
    
    return hasExt;
  };

  const getSetting = (key: string) => {
    if (!settings) return null;
    return settings[key] || null;
  };

  const filteredMenu = menu
    .map((item) =>
      filterMenuItem(item, user, checkPermission, hasExtension, getSetting, isAdminMenu)
    )
    .filter((item): item is MenuItem => !!item);

  // Debug logging for final filtered menu in admin
  if (isAdminMenu && typeof window !== 'undefined') {
    const extensionItems = filteredMenu.find(item => item.key === "admin-platform-extensions");
  }

  return filteredMenu;
}
