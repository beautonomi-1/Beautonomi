"use client";

import { useTranslation } from "@beautonomi/i18n";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BookingBottomSheet, BookingActionButton, BookingSectionCard } from "../ui";

interface SubscriptionRequiredSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

export function SubscriptionRequiredSheet({
  open,
  onOpenChange,
  title,
  description,
}: SubscriptionRequiredSheetProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("web.provider.portal.appointmentDialog.subscriptionRequired");
  const resolvedDescription = description ?? t("web.provider.bookings.detail.subscription.requiredBody");
  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
        {t("common.storeReview.notNow")}
      </BookingActionButton>
      <Link href="/provider/subscription" className="inline-flex w-full sm:w-auto">
        <BookingActionButton className="w-full">{t("web.provider.portal.appointmentDialog.viewPlans")}</BookingActionButton>
      </Link>
    </div>
  );

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="view"
      title={resolvedTitle}
      footer={footer}
    >
      <BookingSectionCard className="text-center py-6">
        <div className="flex justify-center mb-3">
          <Sparkles className="h-10 w-10 text-amber-500" />
        </div>
<p className="text-sm text-gray-600">{resolvedDescription}</p>
      </BookingSectionCard>
    </BookingBottomSheet>
  );
}
