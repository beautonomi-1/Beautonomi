"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { openProductOrderView } from "@/stores/appointment-sidebar-store";
import { useProviderBookingMobileShell } from "../hooks/useProviderBookingMobileShell";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface BookingProductFulfillmentBlockProps {
  bookingId: string;
}

export function BookingProductFulfillmentBlock({ bookingId }: BookingProductFulfillmentBlockProps) {
  const mobileShell = useProviderBookingMobileShell();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetcher.get<{ data?: Array<{ id: string; status?: string }> }>(
          `/api/provider/product-orders?booking_id=${encodeURIComponent(bookingId)}&limit=1`,
        );
        const row = res?.data?.[0];
        if (!cancelled && row?.id) {
          setOrderId(row.id);
          setStatus(row.status ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (!orderId) return null;

  return (
    <BookingSectionCard className="border-amber-200 bg-amber-50">
      <BookingSectionLabel className="mb-1 flex items-center gap-1.5 text-amber-900">
        <Package className="h-4 w-4" />
        Product pickup
      </BookingSectionLabel>
      <p className="text-sm text-amber-950">
        Linked product order{status ? ` · ${status.replace(/_/g, " ")}` : ""}
      </p>
      {mobileShell ? (
        <BookingActionButton
          className="mt-2"
          size="sm"
          fullWidth={false}
          variant="outline"
          onClick={() => openProductOrderView(orderId)}
        >
          Fulfill order
        </BookingActionButton>
      ) : (
        <a
          href={`/provider/ecommerce/orders?order=${orderId}`}
          className="text-xs font-semibold text-amber-900 underline mt-2 inline-block"
        >
          Fulfill order
        </a>
      )}
    </BookingSectionCard>
  );
}
