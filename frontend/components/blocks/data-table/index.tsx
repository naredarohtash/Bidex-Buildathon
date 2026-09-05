"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTableStore } from "./store";
import { getSortableFields } from "./utils/sorting";
import { DataTableProps } from "./types/table";

// Import sub-components
import { TableHeader } from "./header";
import { TableToolbar } from "./toolbar";
import { TableContent } from "./content";
import { TablePagination } from "./pagination";
import { NoAccessState } from "./states/no-access-state";
import { Analytics } from "./analytics";
import { CreateView, EditView } from "./views";
import { FormDialog } from "./views/form-dialog";
import { useTranslations } from "next-intl";

export default function DataTable({
  model,
  modelConfig,
  apiEndpoint,
  userAnalytics = false,
  permissions,
  pageSize = 10,
  canCreate = false,
  createDialog,
  createLink,
  canEdit = false,
  editCondition,
  editLink,
  canDelete = false,
  canView = false,
  viewLink,
  isParanoid = true,
  title = "",
  itemTitle = "",
  description,
  columns,
  formConfig,
  viewContent,
  analytics,
  expandedButtons,
  extraTopButtons,
  extraRowActions,
  dialogSize,
  db = "mysql",
  keyspace = null,
  design,
  hero,
  alertContent,
  formMode = "page",
}: DataTableProps) {
  // Move useTranslations to the top level
  const t = useTranslations("common");

  const {
    setModel,
    setModelConfig,
    setApiEndpoint,
    setUserAnalytics,
    reset,
    setPageSize,
    setTableConfig,
    setColumns,
    initializePermissions,
    hasAccessPermission,
    initialized,
    analyticsTab,
    setAnalyticsTab,
    setAnalyticsConfig,
    resetAnalyticsData,
    resetAnalyticsTab,
    setAvailableSortingOptions,
    setDb,
    setKeyspace,
    currentView,
    resetView,
    setDesignConfig,
  } = useTableStore();

  // Get the refresh function from the store.
  const refresh = useTableStore.getState().fetchData;

  // Check if hero design is enabled (support both design and legacy hero)
  const isHero = Boolean(design || hero);
  const designConfig = design || hero;

  const initRef = React.useRef<{ apiEndpoint: string; model: string } | null>(null);

  useEffect(() => {
    const isNewEndpointOrModel =
      !initRef.current ||
      initRef.current.apiEndpoint !== apiEndpoint ||
      initRef.current.model !== model;

    if (isNewEndpointOrModel) {
      initRef.current = { apiEndpoint, model };
      resetAnalyticsTab();
      resetView();
      reset();
      setModel(model);
      setModelConfig(modelConfig);
      setApiEndpoint(apiEndpoint);
      setUserAnalytics(userAnalytics);
      setDb(db);
      setKeyspace(keyspace);
      setPageSize(pageSize, false);
      setColumns(columns);
      setAvailableSortingOptions(getSortableFields(columns, t));
      setTableConfig({
        pageSize,
        title,
        itemTitle,
        description,
        canCreate,
        createLink,
        canEdit,
        editLink,
        canDelete,
        canView,
        viewLink,
        isParanoid,
        expandedButtons,
        extraTopButtons,
        editCondition,
        extraRowActions,
      });
      if (analytics) {
        setAnalyticsConfig(analytics);
        resetAnalyticsData();
      }
      const normalizedDesignConfig = designConfig
        ? typeof designConfig === "boolean"
          ? {}
          : designConfig
        : null;
      setDesignConfig(normalizedDesignConfig);
      initializePermissions(permissions);
    } else {
      // Endpoint/model unchanged: only update columns without resetting data
      setColumns(columns);
      setAvailableSortingOptions(getSortableFields(columns, t));
    }
  }, [
    model,
    apiEndpoint,
    columns,
    t,
    resetAnalyticsTab,
    resetView,
    reset,
    setModel,
    setModelConfig,
    setApiEndpoint,
    setUserAnalytics,
    setDb,
    setKeyspace,
    setPageSize,
    setColumns,
    setAvailableSortingOptions,
    setTableConfig,
    setAnalyticsConfig,
    resetAnalyticsData,
    setDesignConfig,
    initializePermissions,
    permissions,
    pageSize,
    title,
    itemTitle,
    description,
    canCreate,
    createLink,
    canEdit,
    editLink,
    canDelete,
    canView,
    viewLink,
    isParanoid,
    expandedButtons,
    extraTopButtons,
    editCondition,
    extraRowActions,
    analytics,
    designConfig,
    userAnalytics,
    db,
    keyspace,
    modelConfig,
  ]);

  // Separate effect to update only the tableConfig when dynamic props change
  // This prevents full reset/refetch when only UI components change
  useEffect(() => {
    setTableConfig({
      pageSize,
      title,
      itemTitle,
      description,
      canCreate,
      createLink,
      canEdit,
      editLink,
      canDelete,
      canView,
      viewLink,
      isParanoid,
      expandedButtons,
      extraTopButtons,
      editCondition,
      extraRowActions,
    });
  }, [extraRowActions, editCondition, expandedButtons, extraTopButtons, setTableConfig, pageSize, title, itemTitle, description, canCreate, createLink, canEdit, editLink, canDelete, canView, viewLink, isParanoid]);

  // Handle analytics tab change
  const handleAnalyticsTabChange = useCallback(
    (tab: "overview" | "analytics") => {
      setAnalyticsTab(tab);
    },
    [setAnalyticsTab]
  );

  /* In dialog mode the table never gives up its place: the form opens over it
     (see views/form-dialog), so every branch below that would swap the table
     out for a form is skipped and the overview keeps rendering underneath. */
  const formInDialog = formMode === "dialog";
  const isFormView = currentView === "create" || currentView === "edit";
  const showFormInline = isFormView && !formInDialog;

  // Render the main content area based on current view (overview, analytics, create, edit)
  const renderMainContent = useCallback(() => {
    // Create view - replaces table content area
    if (showFormInline && currentView === "create") {
      return <CreateView columns={columns} title={itemTitle} formConfig={formConfig} />;
    }

    // Edit view - replaces table content area
    if (showFormInline && currentView === "edit") {
      return <EditView columns={columns} title={itemTitle} formConfig={formConfig} />;
    }

    // Analytics view
    if (analytics && analyticsTab === "analytics") {
      return <Analytics />;
    }

    // Default: Overview (table) view
    return (
      <>
        <TableToolbar columns={columns} />
        <TableContent viewContent={viewContent} columns={columns} />
        <TablePagination />
      </>
    );
  }, [currentView, showFormInline, analytics, analyticsTab, columns, viewContent, itemTitle, formConfig]);

  // Memoize the main table block
  const tableContent = useMemo(() => {
    // Hero layout - full page with integrated analytics tabs
    // Now also handles create/edit views with animated header transitions
    if (isHero) {
      return (
        <div className="min-h-screen">
          <TableHeader
            title={title}
            itemTitle={itemTitle}
            description={description}
            createDialog={createDialog}
            dialogSize={
              dialogSize === "xs"
                ? "sm"
                : dialogSize === "full"
                  ? "7xl"
                  : dialogSize
            }
            extraTopButtons={extraTopButtons}
            refresh={refresh}
            design={designConfig}
            formConfig={formConfig}
            hasAnalytics={Boolean(analytics)}
            analyticsTab={analyticsTab}
            onAnalyticsTabChange={handleAnalyticsTabChange}
            /* The hero swaps its own title and buttons for the form's when a
               form view is open. In dialog mode the form has its own frame and
               its own Save, so the hero must go on being the table's header —
               otherwise there are two Save buttons for one form, one of them
               behind the dialog. */
            currentView={formInDialog ? "overview" : currentView}
          />
          
          {/* Content area with proper container */}
          <div className="container mx-auto py-8">
            <div className="space-y-4">
              {/* Alert content below hero, only in overview mode */}
              {!showFormInline && alertContent}
              {showFormInline ? (
                currentView === "create" ? (
                  <CreateView columns={columns} title={itemTitle} formConfig={formConfig} hasHero />
                ) : (
                  <EditView columns={columns} title={itemTitle} formConfig={formConfig} hasHero />
                )
              ) : (
                renderMainContent()
              )}
            </div>
          </div>
        </div>
      );
    }

    // Non-premium layout: Create/Edit views render directly
    if (showFormInline) {
      return currentView === "create" ? (
        <CreateView columns={columns} title={itemTitle} formConfig={formConfig} />
      ) : (
        <EditView columns={columns} title={itemTitle} formConfig={formConfig} />
      );
    }

    // Default layout
    return (
      <div className="space-y-4">
        <TableHeader
          title={title}
          itemTitle={itemTitle}
          description={description}
          createDialog={createDialog}
          dialogSize={
            dialogSize === "xs"
              ? "sm"
              : dialogSize === "full"
                ? "7xl"
                : dialogSize
          }
          extraTopButtons={extraTopButtons}
          refresh={refresh}
          design={designConfig}
          formConfig={formConfig}
        />
        {/* Alert content below header */}
        {alertContent}
        {analytics && (
          <Tabs
            value={analyticsTab}
            onValueChange={(value) =>
              setAnalyticsTab(value as "overview" | "analytics")
            }
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
              <TabsTrigger value="analytics">{t("analytics")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {renderMainContent()}
      </div>
    );
  }, [
    title,
    itemTitle,
    description,
    columns,
    formConfig,
    viewContent,
    analyticsTab,
    setAnalyticsTab,
    handleAnalyticsTabChange,
    analytics,
    extraTopButtons,
    refresh,
    designConfig,
    isHero,
    t,
    createDialog,
    dialogSize,
    currentView,
    showFormInline,
    formInDialog,
    renderMainContent,
    alertContent,
  ]);

  if (!initialized) {
    return null;
  }

  if (!hasAccessPermission) {
    return <NoAccessState title={title}>{tableContent}</NoAccessState>;
  }

  /* The form as a dialog over the table it was opened from — see
     views/form-dialog for why some tables want that and most do not. It renders
     nothing at all unless a form view is open. */
  if (formInDialog) {
    return (
      <>
        {tableContent}
        <FormDialog columns={columns} itemTitle={itemTitle} formConfig={formConfig} />
      </>
    );
  }

  return tableContent;
}
