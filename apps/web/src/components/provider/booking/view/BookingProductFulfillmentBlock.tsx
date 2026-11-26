"use client";

import { BookingDetailProductOrders } from "../BookingDetailProductOrders";
import { BookingSectionCard } from "../ui";

interface BookingProductFulfillmentBlockProps {
  bookingId: string;
  hasLineItems: boolean;
  onUpdated?: () => void;
}

/** Product handover actions above Complete in the calendar sheet (all open orders). */
export function BookingProductFulfillmentBlock({
  bookingId,
  hasLineItems,
}: BookingProductFulfillmentBlockProps) {
  if (!hasLineItems) return null;
  return (
    <BookingSectionCard id="booking-product-fulfillment" className="border-amber-200 bg-amber-50">
      <BookingDetailProductOrders bookingId={bookingId} hasLineItems={hasLineItems} />
    </BookingSectionCard>
  );
}