"use client";

import {
  Shield,
  User,
  DollarSign,
  ClipboardList,
  CalendarIcon,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

// Component for rendering ECO wallet addresses
const EcoAddresses = ({ value, row }: { value: any; row?: any }) => {
  const t = useTranslations("common");

  // 1) Check if we have a row
  if (!row) {
    return <>{t("no_row_data")}</>;
  }

  // 2) If the wallet type isn't ECO
  if (row.type !== "ECO") {
    return <>N/A</>;
  }

  // 3) If the address field is null/undefined
  if (!value) {
    return <>{t("no_addresses")}</>;
  }

  // 4) Try to parse the address JSON
  let parsed: Record<string, any>;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    return <span className="text-red-500">{t("invalid_address_json")}</span>;
  }
  const chains = Object.keys(parsed);
  if (!chains.length) {
    return <>{t("no_addresses")}</>;
  }

  // 5) Render chain info
  return (
    <div className="space-y-2 text-sm">
      {chains.map((chain) => {
        const chainData = parsed[chain];
        const address = chainData?.address;
        const network = chainData?.network;
        const balance = chainData?.balance ?? 0;
        return (
          <div
            key={chain}
            className="rounded-md bg-muted/10 p-2 border border-muted"
          >
            <div className="font-bold">{chain}</div>
            {address && (
              <div>
                {t("address")}
                {address}
              </div>
            )}
            {network && (
              <div>
                {t("network")}
                {network}
              </div>
            )}
            <div>
              {t("balance")}
              {balance}
            </div>
          </div>
        );
      })}
    </div>
  );
};

function renderEcoAddresses(value: any, row?: any) {
  return <EcoAddresses value={value} row={row} />;
}

export function useColumns(): ColumnDefinition[] {
  const tCommon = useTranslations("common");
  const tDashboardAdmin = useTranslations("dashboard_admin");
  return [
    {
      key: "id",
      title: tCommon("id"),
      type: "text",
      icon: Shield,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tCommon("unique_wallet_identifier"),
      priority: 3,
      expandedOnly: true,
    },
    {
      key: "user",
      title: tCommon("user"),
      type: "compound",
      icon: User,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tDashboardAdmin("user_associated_with_this_wallet"),
      render: {
        type: "compound",
        config: {
          image: {
            key: "avatar",
            fallback: "/img/placeholder.svg",
            type: "image",
            title: tCommon("avatar"),
            description: tCommon("user_avatar"),
          },
          primary: {
            key: ["firstName", "lastName"],
            title: [tCommon("first_name"), tCommon("last_name")],
            description: [tDashboardAdmin("user_first_name"), tDashboardAdmin("user_last_name")],
            icon: User,
          },
          secondary: {
            key: "email",
            title: tCommon("email"),
            icon: ClipboardList,
          },
        },
      },
      priority: 1,
    },
    {
      key: "type",
      title: tCommon("type"),
      type: "select",
      icon: Wallet,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tDashboardAdmin("type_of_wallet_fiat_for_fiat"),
      render: {
        type: "badge",
        config: {
          withDot: true,
          variant: (value: string) => {
            switch (value.toUpperCase()) {
              case "FIAT":
                return "success";
              case "SPOT":
                return "primary";
              case "ECO":
                return "info";
              case "FUTURES":
                return "warning";
              default:
                return "default";
            }
          },
        },
      },
      /* One option, because the platform has one wallet.

         Bidex trades a single currency out of a single wallet. The other four
         types belong to modules it does not run — eco, futures, copy trading —
         and offering them here was not a capability, it was four ways to put a
         trader's money somewhere the terminal would not look for it. That is
         exactly what happened: a balance credited to a FIAT/USDT wallet read as
         zero on the terminal while the order engine would have spent it.

         The column still RENDERS whatever type a row actually has, so anything
         already sitting on another type stays visible and correctable rather
         than being quietly relabelled. This only removes them as choices.

         The type could not be removed outright. Every finance and wallet route —
         the list, the type/currency lookup, the balance endpoint, deposits,
         withdrawals, transfers — ships as compiled, integrity-checked JS with no
         source in this repo (1,261 compiled routes against 38 sources), and the
         wallet model's ENUM cannot be narrowed while that compiled code still
         writes the other values: narrowing it would fail their validation and
         break deposits rather than tidy them. Making the type stop mattering is
         the reachable version of the same goal. */
      options: [
        {
          value: "SPOT",
          label: tCommon("spot"),
        },
      ],
      priority: 1,
    },
    {
      key: "currency",
      title: tCommon("currency"),
      type: "text",
      icon: DollarSign,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tDashboardAdmin("currency_symbol_for_this_wallet_e_g_btc_usd_eth"),
      priority: 1,
    },
    {
      key: "balance",
      title: tCommon("balance"),
      type: "number",
      icon: DollarSign,
      sortable: true,
      searchable: false,
      filterable: true,
      condition: (values) => !["ECO", "FUTURES"].includes(values.type),
      description: tDashboardAdmin("available_balance_in_this_wallet"),
      priority: 1,
    },
    {
      key: "inOrder",
      title: tCommon("in_order"),
      type: "number",
      icon: DollarSign,
      sortable: true,
      searchable: false,
      filterable: true,
      condition: (values) => !["ECO", "FUTURES"].includes(values.type),
      description: tDashboardAdmin("amount_currently_locked_in_open_orders"),
      priority: 2,
    },
    {
      key: "address",
      title: tCommon("address"),
      type: "custom",
      icon: ClipboardList,
      sortable: false,
      searchable: false,
      filterable: false,
      description: tDashboardAdmin("blockchain_addresses_associated_with_this_wallet"),
      render: {
        type: "custom",
        render: (value: any, row: any) => renderEcoAddresses(value, row),
      },
      priority: 2,
      expandedOnly: true,
    },
    {
      key: "status",
      title: tCommon("status"),
      type: "boolean",
      icon: Shield,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tDashboardAdmin("whether_this_wallet_is_active_and_usable"),
      priority: 1,
    },
    {
      key: "createdAt",
      title: tCommon("created_at"),
      type: "date",
      icon: CalendarIcon,
      sortable: true,
      searchable: true,
      filterable: true,
      description: tDashboardAdmin("date_when_the_wallet_was_created"),
      render: {
        type: "date",
        format: "PPP",
      },
      priority: 3,
      expandedOnly: true,
    },
  ];
}
