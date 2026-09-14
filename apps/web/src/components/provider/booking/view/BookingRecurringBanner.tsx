"use client";

import { useTranslation } from "@beautonomi/i18n";

import Link from "next/link";
import { Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getBookingRecurringDisplayDetails } from "@beautonomi/provider-booking";
import type { Appointment } from "@/lib/provider-portal/types";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return format(parseISO(value.length > 10 ? value : `${value}T00:00:00`), "MMM d, yyyy");
  } catch {
    return value;
  }
}

export function BookingRecurringBanner({ appointment }: { appointment: Appointment }) {
  const { t } = useTranslation();
  const details = getBookingRecurringDisplayDetails(appointment as unknown as Record<string, unknown>);
  if (!details) return null;

  const start = formatDate(details.startDate);
  const end = formatDate(details.endDate);
  const last = formatDate(details.lastBookingDate);
  const seriesHref = details.seriesId
    ? `/provider/recurring-appointments?series_id=${encodeURIComponent(details.seriesId)}`
    : "/provider/recurring-appointments";

  return (
    <BookingSectionCard className="border-blue-200 bg-blue-50">
      <BookingSectionLabel className="mb-1 flex items-center gap-1.5 text-blue-900">
        <Repeat className="h-4 w-4" />
        {t("provider.mobile.screens.bookingDetail.repeatingSeries")}
        {details.status ? (
          <span className="ms-auto text-[10px] font-semibold uppercase tracking-wide text-blue-800">
            {details.status}
          </span>
        ) : null}
      </BookingSectionLabel>
      <p className="text-sm font-medium text-blue-900">{details.label}</p>
      <div className="mt-2 space-y-0.5 text-xs text-blue-800">
        {start ? <p>{t("web.provider.bookings.detail.recurring.startedOn", { date: start })}</p> : null}
        {details.occurrences ? <p>{t("web.provider.bookings.detail.recurring.visitsPlanned", { count: details.occurrences })}</p> : null}
        {end ? <p>{t("web.provider.bookings.detail.recurring.untilDate", { date: end })}</p> : null}
        {last ? <p>{t("web.provider.bookings.detail.recurring.lastGenerated", { date: last })}</p> : null}
      </div>
      <Link
        href={seriesHref}
        className="text-xs font-semibold text-blue-800 underline mt-2 inline-block touch-manipulation min-h-[36px] flex items-center"
      >
        {t("provider.mobile.screens.bookingDetail.manageSeries")}
      </Link>
    </BookingSectionCard>
  );
}
