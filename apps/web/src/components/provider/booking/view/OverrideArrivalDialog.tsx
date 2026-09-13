"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BookingActionButton } from "../ui";

interface OverrideArrivalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onConfirm: (reasonText: string) => void;
}

export function OverrideArrivalDialog({
  open,
  onOpenChange,
  saving = false,
  onConfirm,
}: OverrideArrivalDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.overrideArrival.title")}</DialogTitle>
          <DialogDescription>
            {t("web.overrideArrival.description")}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("web.overrideArrival.placeholder")}
          rows={4}
          className="rounded-xl min-h-[88px]"
          autoFocus
        />
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton
            disabled={saving || !reason.trim()}
            onClick={handleConfirm}
          >
            {saving ? t("web.overrideArrival.saving") : t("web.overrideArrival.verifyManually")}
          </BookingActionButton>
          <BookingActionButton
            variant="outline"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            {t("common.cancel")}
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
