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
    // Parent didn't pass the visible booking IDs — fall back to the legacy
    // advisory toast so behaviour is unchanged for callers that haven't
    // migrated. Any caller wanting real bulk-select should pass `visibleIds`.
    toast.info("Select all is unavailable until the bookings list supplies IDs.");
  };

  const handleBulkAction = async (action: string, label: string) => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one booking");
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
      toast.success(`${pendingAction.label} completed for ${selectedIds.size} booking(s)`);
      onSelectionChange(new Set());
      setIsConfirmDialogOpen(false);
      setPendingAction(null);
    } catch {
      toast.error(`Failed to ${pendingAction.label.toLowerCase()}`);
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
              {isAllSelected ? "Deselect All" : "Select All"}
            </span>
          </Button>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-sm">
              {selectedCount} selected
            </Badge>
          )}
        </div>

        {selectedCount > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4 mr-2" />
                Bulk Actions ({selectedCount})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleBulkAction("confirm", "Confirm")}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Confirm Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleBulkAction("cancel", "Cancel")}
                className="flex items-center gap-2"
              >
                <XCircle className="w-4 h-4 text-red-600" />
                Cancel Selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleBulkAction("complete", "Mark Complete")}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Mark Complete
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleBulkAction("delete", "Delete")}
                className="flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingAction?.label.toLowerCase()} {selectedCount} booking(s)?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              disabled={isProcessing}
              className={pendingAction?.action === "delete" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {isProcessing ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
