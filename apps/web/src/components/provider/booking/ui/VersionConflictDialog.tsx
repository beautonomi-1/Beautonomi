"use client";

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

interface VersionConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
  onReload?: () => void;
  onDismiss?: () => void;
}

export function VersionConflictDialog({
  open,
  onOpenChange,
  message = "This booking changed, reload",
  onReload,
  onDismiss,
}: VersionConflictDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Booking changed</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onDismiss?.();
            }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onReload?.();
              onOpenChange(false);
            }}
          >
            Reload booking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
