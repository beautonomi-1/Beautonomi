"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingActionButton } from "./BookingActionButton";
import { EDIT_ACCENT } from "../tokens";
import { useTranslation } from "@beautonomi/i18n";

const DRAFT_BANNER_BG = "#FFF7ED";
const DRAFT_BANNER_TEXT = EDIT_ACCENT;

interface BookingDraftBannerProps {
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

export function BookingDraftBanner({ onRestore, onDiscard, className }: BookingDraftBannerProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn("rounded-xl border p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
      style={{ backgroundColor: DRAFT_BANNER_BG, borderColor: DRAFT_BANNER_TEXT }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <RotateCcw className="h-4 w-4 shrink-0 mt-0.5" style={{ color: DRAFT_BANNER_TEXT }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: DRAFT_BANNER_TEXT }}>
            {t("web.provider.bookings.draftBanner.title")}
          </p>
          <p className="text-xs text-gray-600">{t("web.provider.bookings.draftBanner.body")}</p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <BookingActionButton variant="outline" fullWidth={false} size="sm" onClick={onDiscard}>
          {t("web.provider.bookings.draftBanner.discard")}
        </BookingActionButton>
        <BookingActionButton fullWidth={false} size="sm" onClick={onRestore}>
          {t("web.provider.bookings.draftBanner.restore")}
        </BookingActionButton>
      </div>
    </div>
  );
}
