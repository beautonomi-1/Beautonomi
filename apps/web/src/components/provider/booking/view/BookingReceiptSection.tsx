"use client";

import { useTranslation } from "@beautonomi/i18n";

import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface BookingReceiptSectionProps {
  bookingId: string;
  clientEmail?: string | null;
}

export function BookingReceiptSection({ bookingId, clientEmail }: BookingReceiptSectionProps) {
  const { t } = useTranslation();
  const emailReceipt = async () => {
    try {
      await providerApi.sendReceiptEmail(bookingId);
      toast.success(t("web.provider.bookings.detail.receipt.titleEmailed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("web.provider.bookings.detail.receipt.titleEmailFailed"));
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">{t("web.provider.bookings.detail.receipt.title")}</BookingSectionLabel>
      <div className="flex flex-wrap gap-2">
        <ShareReceiptButton kind="provider-booking" subjectId={bookingId} />
        <BookingActionButton size="sm" fullWidth={false} variant="outline" onClick={() => void emailReceipt()}>
          {t("web.provider.bookings.detail.receipt.emailReceipt")}
        </BookingActionButton>
        <a
          href={`/api/provider/bookings/${bookingId}/receipt/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-xl border px-3 min-h-[44px] text-sm font-semibold"
        >
          {t("web.provider.bookings.detail.receipt.downloadPdf")}
        </a>
      </div>
      {clientEmail ? (
<p className="text-xs text-gray-500 mt-2">{t("web.provider.bookings.detail.receipt.sendsTo", { email: clientEmail })}</p>
      ) : null}
    </BookingSectionCard>
  );
}
