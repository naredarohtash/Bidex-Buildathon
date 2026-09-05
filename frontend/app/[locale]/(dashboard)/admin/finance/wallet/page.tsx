"use client";
import { useCallback, useState } from "react";
import DataTable from "@/components/blocks/data-table";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Wallet, IndianRupee } from "lucide-react";
import { useColumns } from "./columns";
import { useAnalytics } from "./analytics";
import { useTranslations } from "next-intl";
import { useUserStore } from "@/store/user";
import { AdjustBalanceDialog } from "./adjust-balance-dialog";

export default function WalletPage() {
  const t = useTranslations("dashboard_admin");
  const columns = useColumns();
  const analytics = useAnalytics();
  const { hasPermission } = useUserStore();

  /* Adjusting a balance was reachable only by editing the database by hand:
     the endpoint existed and did the right thing, but nothing ever called it.
     Gated on the same permission the endpoint enforces, so the menu entry does
     not appear for an admin the server would refuse anyway. */
  const canAdjust = hasPermission("edit.wallet");
  const [selected, setSelected] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const renderActionButtons = useCallback(
    (row: any) => {
      if (!canAdjust) return null;
      return (
        <DropdownMenuItem
          onClick={() => {
            setSelected(row);
            setDialogOpen(true);
          }}
          className="cursor-pointer text-foreground"
        >
          <IndianRupee className="mr-2 h-4 w-4" />
          Adjust Balance
        </DropdownMenuItem>
      );
    },
    [canAdjust]
  );

  return (
    <>
      <DataTable
        apiEndpoint="/api/admin/finance/wallet"
        model="wallet"
        permissions={{
          access: "access.wallet",
          view: "view.wallet",
          create: "create.wallet",
          edit: "edit.wallet",
          delete: "delete.wallet"}}
        pageSize={12}
        canCreate={false}
        canEdit={false}
        canDelete={false}
        canView={true}
        isParanoid={true}
        title={t("wallet_management")}
        description={t("manage_user_wallets_and_balances")}
        itemTitle="Wallet"
        columns={columns}
        analytics={analytics}
        extraRowActions={renderActionButtons}
        design={{
          animation: "orbs",
          icon: Wallet}}
      />

      <AdjustBalanceDialog
        wallet={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        // The table reads its rows from the server, so a reload is what shows
        // the new figure rather than a locally patched one that could drift.
        onDone={() => window.location.reload()}
      />
    </>
  );
}
