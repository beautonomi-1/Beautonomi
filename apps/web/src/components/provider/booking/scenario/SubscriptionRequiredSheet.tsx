"use client";

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
  title = "Subscription required",
  description = "Upgrade your plan to use this feature.",
}: SubscriptionRequiredSheetProps) {
  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
        Not now
      </BookingActionButton>
      <Link href="/provider/subscription" className="inline-flex w-full sm:w-auto">
        <BookingActionButton className="w-full">View plans</BookingActionButton>
      </Link>
    </div>
  );

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="view"
      title={title}
      footer={footer}
    >
      <BookingSectionCard className="text-center py-6">
        <div className="flex justify-center mb-3">
          <Sparkles className="h-10 w-10 text-amber-500" />
        </div>
        <p className="text-sm text-gray-600">{description}</p>
      </BookingSectionCard>
    </BookingBottomSheet>
  );
}
