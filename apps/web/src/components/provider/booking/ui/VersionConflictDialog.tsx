"use client";
import { useTranslation } from "@beautonomi/i18n";

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
  message,
  onReload,
  onDismiss,
}: VersionConflictDialogProps) {
  const { t } = useTranslation();
  const description = message ?? t("provider.mobile.screens.bookingDetail.conflictReloadBody");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("web.versionConflict.title")}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onDismiss?.();
            }}
          >
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onReload?.();
              onOpenChange(false);
            }}
          >
            {t("web.versionConflict.reload")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
