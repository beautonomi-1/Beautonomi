"use client";
import { bookingProductLineLabel, collectBookingProductLines } from "@beautonomi/utils";

import { useTranslation } from "@beautonomi/i18n";

import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { ShoppingBag } from "lucide-react";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

interface BookingProductsSectionProps {
  appointment: Appointment;
}

export function BookingProductsSection({ appointment }: BookingProductsSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { t } = useTranslation();
  const lines = collectBookingProductLines(appointment);

  if (lines.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3 flex items-center gap-1.5">
        <ShoppingBag className="h-4 w-4" />
        {t("web.provider.bookings.detail.products.title")}
      </BookingSectionLabel>
      <ul className="space-y-2 text-sm">
        {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-2">
              <span className="truncate">
                {line.name === "Product"
                  ? t("web.provider.bookings.detail.products.fallback")
                  : bookingProductLineLabel(line)}
              </span>
              <span className="font-medium shrink-0">{formatMoney(line.totalPrice)}</span>
            </li>
          ))}
      </ul>
    </BookingSectionCard>
  );
}
