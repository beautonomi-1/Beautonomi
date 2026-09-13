"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import { clearBeautonomiHoldClientMarkers } from "@/lib/booking/clear-hold-client-markers";
import { BookingEmbedBridge } from "@/components/booking/BookingEmbedBridge";
import { isBookingEmbedEnabled } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

export default function OnDemandResultPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const embed = isBookingEmbedEnabled(searchParams);

  useEffect(() => {
    clearBeautonomiHoldClientMarkers();
  }, []);
  const status = searchParams.get("status") ?? "expired";
  const onDemandConfig = useModuleConfig("on_demand");
  const uiCopy = (onDemandConfig?.ui_copy ?? {}) as Record<string, string>;

  const isAccepted = status === "accepted";
  const title = isAccepted
    ? (uiCopy.accepted_title ?? t("web.book.onDemand.result.acceptedTitle"))
    : status === "declined"
      ? (uiCopy.declined_title ?? t("web.book.onDemand.result.declinedTitle"))
      : status === "cancelled"
        ? t("web.book.onDemand.result.cancelledTitle")
        : (uiCopy.expired_title ?? t("web.book.onDemand.result.expiredTitle"));
  const subtitle = isAccepted
    ? (uiCopy.accepted_subtitle ?? t("web.book.onDemand.result.acceptedSubtitle"))
    : status === "declined"
      ? (uiCopy.declined_subtitle ?? t("web.book.onDemand.result.declinedSubtitle"))
      : status === "cancelled"
        ? t("web.book.onDemand.result.cancelledSubtitle")
        : (uiCopy.expired_subtitle ?? t("web.book.onDemand.result.expiredSubtitle"));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 max-w-md mx-auto">
      <BookingEmbedBridge active={embed} />
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
          isAccepted ? "bg-green-100" : "bg-gray-100"
        }`}
      >
        {isAccepted ? (
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        ) : (
          <Clock className="h-12 w-12 text-gray-500" />
        )}
      </div>
      <h1 className="text-xl font-semibold text-gray-900 text-center">{title}</h1>
      <p className="text-gray-600 text-center mt-2">{subtitle}</p>

      {!embed ? (
        <div className="flex flex-col gap-3 w-full mt-8">
          <Button asChild>
            <Link href="/account-settings/bookings">{t("web.book.onDemand.result.viewMyBookings")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">{t("web.book.onDemand.result.backToHome")}</Link>
          </Button>
        </div>
      ) : (
        <p className="text-gray-500 text-sm text-center mt-8">
          {t("web.book.onDemand.result.embedCloseHint")}
        </p>
      )}
    </div>
  );
}
