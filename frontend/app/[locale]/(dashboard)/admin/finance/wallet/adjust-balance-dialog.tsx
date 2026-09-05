"use client";

/**
 * Adjust a wallet's balance from the admin panel.
 *
 * The backend has always been able to do this — POST
 * /api/admin/finance/wallet/{id}/balance, guarded by the `edit.wallet`
 * permission — but nothing in the UI ever called it, so the only way to correct
 * a balance was to edit the database by hand. That skips the ledger entirely:
 * no transaction row, no audit trail, and a wallet that no longer agrees with
 * its own history.
 *
 * Going through the endpoint means the adjustment runs through walletService
 * with an idempotency key, is recorded as an ADMIN_ADJUSTMENT transaction, and
 * emails the account holder — the same treatment any other movement of their
 * money gets.
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, TriangleAlert } from "lucide-react";
import { $fetch } from "@/lib/api";
import { toast } from "sonner";

type AdjustmentType = "ADD" | "SUBTRACT";

interface AdjustBalanceDialogProps {
  wallet: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function AdjustBalanceDialog({
  wallet, open, onOpenChange, onDone,
}: AdjustBalanceDialogProps) {
  const [type, setType] = useState<AdjustmentType>("ADD");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const current = Number(wallet?.balance ?? 0);
  const parsed = Number(amount);
  const isValidAmount = amount !== "" && Number.isFinite(parsed) && parsed > 0;

  // Shown before submitting, so the operator sees the outcome rather than
  // working it out in their head.
  const projected = isValidAmount
    ? type === "ADD" ? current + parsed : current - parsed
    : current;

  const wouldGoNegative = type === "SUBTRACT" && isValidAmount && projected < 0;

  const reset = () => { setType("ADD"); setAmount(""); setSubmitting(false); };

  const close = (next: boolean) => {
    if (submitting) return;      // don't let a click outside abandon a request
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!wallet?.id || !isValidAmount || wouldGoNegative) return;
    setSubmitting(true);
    try {
      const { error } = await $fetch({
        url: `/api/admin/finance/wallet/${wallet.id}/balance`,
        method: "POST",
        /* `id` is sent in the body as well as the path. The endpoint's schema
           lists it in the body's `required` array while defining only `type`
           and `amount` in `properties` — the id actually arrives as a path
           parameter, and the handler reads it from there. Nothing had ever
           called this route, so the mistake was never exercised; validation
           rejects the request with "Id is required" without it. Sending it
           satisfies the schema and the handler ignores it, which beats editing
           a vendor file that has no source. */
        body: { id: wallet.id, type, amount: parsed },
      });
      if (error) {
        toast.error(typeof error === "string" ? error : "Failed to update the balance");
        setSubmitting(false);
        return;
      }
      toast.success(
        `${type === "ADD" ? "Added" : "Subtracted"} ${parsed} ${wallet.currency ?? ""} ${
          type === "ADD" ? "to" : "from"
        } the wallet`
      );
      reset();
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update the balance");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Adjust wallet balance</DialogTitle>
          <DialogDescription>
            {wallet
              ? `${wallet.currency ?? ""} ${wallet.type ?? ""} wallet${
                  wallet.user?.email ? ` — ${wallet.user.email}` : ""
                }`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className="font-medium">
              {current} {wallet?.currency ?? ""}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-type">Action</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
              <SelectTrigger id="adjust-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADD">Add to balance</SelectItem>
                <SelectItem value="SUBTRACT">Subtract from balance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-amount">Amount</Label>
            <Input
              id="adjust-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {isValidAmount && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Balance after</span>
              <span className="font-semibold">
                {projected} {wallet?.currency ?? ""}
              </span>
            </div>
          )}

          {wouldGoNegative && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                That would take the balance below zero. Reduce the amount.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            Recorded as an admin adjustment against this wallet and the account
            holder is notified by email.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValidAmount || wouldGoNegative || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {type === "ADD" ? "Add funds" : "Subtract funds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
