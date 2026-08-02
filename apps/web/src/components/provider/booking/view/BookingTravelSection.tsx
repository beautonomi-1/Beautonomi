"use client";

import { Home, MapPin } from "lucide-react";
import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

interface BookingTravelSectionProps {
  appointment: Appointment;
}

export function BookingTravelSection({ appointment }: BookingTravelSectionProps) {
  if (appointment.location_type !== "at_home") return null;

  const raw = appointment as unknown as Record<string, unknown>;
  const travelFee = Number(raw.travel_fee ?? raw.travel_fee_amount ?? 0);
  const line1 = String(raw.address_line1 ?? "");
  const city = String(raw.address_city ?? "");
  const state = String(raw.address_state ?? "");
  const postal = String(raw.address_postal_code ?? "");
  const { format: formatMoney } = useProviderMoneyFormat();

  const addressParts = [line1, city, state, postal].filter(Boolean);
  if (addressParts.length === 0 && travelFee <= 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <Home className="h-4 w-4" />
        At-home visit
      </BookingSectionLabel>
      {addressParts.length > 0 ? (
        <p className="text-sm text-gray-700 flex items-start gap-1.5 mb-2">
          <MapPin className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
          {addressParts.join(", ")}
        </p>
      ) : null}
      {travelFee > 0 ? <BookingSummaryRow label="Travel fee" value={formatMoney(travelFee)} /> : null}
    </BookingSectionCard>
  );
}
