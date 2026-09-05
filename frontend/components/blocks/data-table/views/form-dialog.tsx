"use client";

/**
 * The create and edit forms, in a dialog instead of over the whole page.
 *
 * Opt-in, per table, through DataTable's `formMode="dialog"`. Everything else
 * in the admin keeps the full-page form it has always had; nothing here
 * changes unless a page asks for it.
 *
 * ── Why a dialog is the right shape for some of these forms ───────────────
 *
 * The page form replaces the table entirely: the list you were reading is
 * gone, the row you clicked is gone with it, and coming back means the table
 * re-mounting and fetching again. For a form of four or five fields that is a
 * lot of ceremony to change somebody's city — and it reads as having navigated
 * somewhere, while the address bar says you never left.
 *
 * A dialog keeps the list behind it, so "which user am I editing?" is answered
 * by the row still visible underneath, and closing it puts you back exactly
 * where you were with the table still loaded.
 *
 * ── How it reuses the page form rather than copying it ────────────────────
 *
 * `CreateView`/`EditView` are rendered with `hasHero`, which is the existing
 * flag for "somebody else is drawing my header and buttons": ViewForm then
 * renders only the field groups — no sticky bar, no `min-h-screen`, no page
 * container — and publishes `{ isDirty, isSubmitting, onSubmit, onCancel }` to
 * the table store. The hero header reads exactly that to drive its own Save
 * button; this footer reads the same thing. So there is one form, one submit
 * path and one dirty state, drawn in two frames.
 *
 * Closing is routed through the form's own `onCancel` rather than straight to
 * the store, because that is what raises the "discard unsaved changes?"
 * confirmation. Escape and the backdrop go the same way — a dialog you can
 * dismiss with a stray click is a dialog that loses work.
 */

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTableStore } from "../store";
import { CreateView, EditView } from "./index";
import type { FormConfig } from "../types/table";

export const FormDialog = memo(function FormDialog({
  columns,
  itemTitle,
  formConfig,
}: {
  columns: ColumnDefinition[];
  itemTitle: string;
  formConfig?: FormConfig;
}) {
  const t = useTranslations("common");
  const currentView = useTableStore((s) => s.currentView);
  const permissions = useTableStore((s) => s.permissions);
  const formState = useTableStore((s) => s.formState);

  const isEdit = currentView === "edit";
  const open = isEdit || currentView === "create";
  if (!open) return null;

  const config = isEdit ? formConfig?.edit : formConfig?.create;
  const title =
    config?.title || `${isEdit ? t("edit") : t("create")} ${itemTitle}`;
  const description = config?.description;
  const allowed = isEdit ? permissions.edit : permissions.create;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        /* Only ever a close. The form owns what closing means — it may want to
           ask first — so this defers to it and does nothing if the form has
           not registered itself yet. */
        if (!next) formState.onCancel?.();
      }}
    >
      <DialogContent
        size="4xl"
        hideCloseButton
        className="flex max-h-[88vh] flex-col gap-0 p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-0.5 text-sm">
                  {description}
                </DialogDescription>
              )}
            </div>
            {/* Same warning the page form shows, in the one place a dialog has
                room for it. */}
            {formState.isDirty && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-xs text-warning sm:flex">
                <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                {t("unsaved_changes")}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* The fields scroll; the header and the buttons do not. A Save button
            below the fold of its own dialog is a Save nobody finds. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {/* `confirmOnCancel={false}`: the dialog says "unsaved changes" in
              its own header, and a confirmation over it would be a second
              popup asking about the first. */}
          {isEdit ? (
            <EditView
              columns={columns}
              title={itemTitle}
              formConfig={formConfig}
              hasHero
              confirmOnCancel={false}
            />
          ) : (
            <CreateView
              columns={columns}
              title={itemTitle}
              formConfig={formConfig}
              hasHero
              confirmOnCancel={false}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => formState.onCancel?.()}
          >
            <X className="mr-1.5 h-4 w-4" />
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => formState.onSubmit?.()}
            disabled={formState.isSubmitting || !allowed}
          >
            {formState.isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {t("saving")}...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                {isEdit ? t("save_changes") : t("create")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default FormDialog;
