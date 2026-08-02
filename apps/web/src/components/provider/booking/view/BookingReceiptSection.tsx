"use client";

import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface BookingReceiptSectionProps {
  bookingId: string;
  clientEmail?: string | null;
}

export function BookingReceiptSection({ bookingId, clientEmail }: BookingReceiptSectionProps) {
  const emailReceipt = async () => {
    try {
      await providerApi.sendReceiptEmail(bookingId);
      toast.success("Receipt emailed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not email receipt");
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Receipt</BookingSectionLabel>
      <div className="flex flex-wrap gap-2">
        <ShareReceiptButton kind="provider-booking" subjectId={bookingId} />
        <BookingActionButton size="sm" fullWidth={false} variant="outline" onClick={() => void emailReceipt()}>
          Email receipt
        </BookingActionButton>
        <a
          href={`/api/provider/bookings/${bookingId}/receipt/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-xl border px-3 min-h-[44px] text-sm font-semibold"
        >
          Download PDF
        </a>
      </div>
      {clientEmail ? (
        <p className="text-xs text-gray-500 mt-2">Sends to {clientEmail}</p>
      ) : null}
    </BookingSectionCard>
  );
}
