"use client";

import type { Appointment } from "@/lib/provider-portal/types";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export function BookingCustomOfferBlock({ appointment }: { appointment: Appointment }) {
  const raw = appointment as unknown as Record<string, unknown>;
  const offer = raw.custom_offer as { request?: { description?: string }; notes?: string } | undefined;
  if (!offer && !raw.custom_offer_id) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">Custom offer</BookingSectionLabel>
      {offer?.request?.description ? (
        <p className="text-sm text-gray-700">{offer.request.description}</p>
      ) : null}
      {offer?.notes ? <p className="text-xs text-gray-500 mt-1">{offer.notes}</p> : null}
    </BookingSectionCard>
  );
}
