"use client";

import React, { useState } from "react";
import { CheckSquare, Square, MoreVertical, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

interface BulkBookingActionsProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onBulkAction: (action: string, ids: string[]) => Promise<void>;
  totalCount: number;
  /**
   * P-class (audit 2026-04): IDs of all bookings currently visible in the
   * parent list. When provided, the "Select All" button selects every
   * visible booking instead of showing the legacy "requires all booking
   * IDs" info toast. Optional so existing callers don't break — but parents
   * SHOULD pass this to give users a real bulk-select affordance.
   */
  visibleIds?: string[];
}

export function BulkBookingActions({
  selectedIds,
  onSelectionChange,
  onBulkAction,
  totalCount,
  visibleIds,
}: BulkBookingActionsProps) {
  const { t } = useTranslation();
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; label: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedCount = selectedIds.size;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange(new Set());
      return;
    }
    if (visibleIds && visibleIds.length > 0) {
      onSelectionChange(new Set(visibleIds));
      return;
    }
    toast.info(t("web.provider.bookings.bulkActions.selectAllUnavailable"));
  };

  const handleBulkAction = async (action: string, label: string) => {
    if (selectedIds.size === 0) {
      toast.error(t("web.provider.bookings.bulkActions.selectAtLeastOne"));
      return;
    }

    setPendingAction({ action, label });
    setIsConfirmDialogOpen(true);
  };

  const confirmBulkAction = async () => {
    if (!pendingAction) return;

    try {
      setIsProcessing(true);
      await onBulkAction(pendingAction.action, Array.from(selectedIds));
      toast.success(
        t("web.provider.bookings.bulkActions.actionCompleted", {
          action: pendingAction.label,
          count: selectedIds.size,
        }),
      );
      onSelectionChange(new Set());
      setIsConfirmDialogOpen(false);
      setPendingAction(null);
    } catch {
      toast.error(
        t("web.provider.bookings.bulkActions.actionFailed", {
          action: pendingAction.label.toLowerCase(),
        }),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (totalCount === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg mb-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="flex items-center gap-2"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            <span className="text-sm">
              {isAllSelected
                ? t("web.provider.bookings.bulkActions.deselectAll")
                : t("web.provider.bookings.bulkActions.selectAll")}
            </span>
          </Button>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-sm">
              {t("web.provider.bookings.bulkActions.selected", { count: selectedCount })}
            </Badge>
          )}
        </div>

        {selectedCount > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4 me-2" />
                {t("web.provider.bookings.bulkActions.bulkActions", { count: selectedCount })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  handleBulkAction("confirm", t("web.provider.bookings.bulkActions.confirmSelected"))
                }
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                {t("web.provider.bookings.bulkActions.confirmSelected")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleBulkAction("cancel", t("web.provider.bookings.bulkActions.cancelSelected"))
                }
                className="flex items-center gap-2"
              >
                <XCircle className="w-4 h-4 text-red-600" />
                {t("web.provider.bookings.bulkActions.cancelSelected")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  handleBulkAction("complete", t("web.provider.bookings.bulkActions.markComplete"))
                }
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                {t("web.provider.bookings.bulkActions.markComplete")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  handleBulkAction("delete", t("web.provider.bookings.bulkActions.deleteSelected"))
                }
                className="flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                {t("web.provider.bookings.bulkActions.deleteSelected")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("web.provider.bookings.bulkActions.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("web.provider.bookings.bulkActions.confirmBody", {
                action: pendingAction?.label.toLowerCase() ?? "",
                count: selectedCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              {t("web.provider.common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              disabled={isProcessing}
              className={pendingAction?.action === "delete" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {isProcessing
                ? t("web.provider.bookings.bulkActions.processing")
                : t("web.provider.bookings.bulkActions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
