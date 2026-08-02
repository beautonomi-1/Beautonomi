"use client";

import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

type ServiceLine = {
  offering_name?: string;
  service_name?: string;
  duration_minutes?: number;
  price?: number;
  staff_name?: string;
  team_member_name?: string;
};

interface BookingServicesSectionProps {
  appointment: Appointment;
}

export function BookingServicesSection({ appointment }: BookingServicesSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const raw = appointment as unknown as Record<string, unknown>;
  const lines = (raw.services as ServiceLine[] | undefined) ?? [];

  if (lines.length === 0 && appointment.service_name) {
    return (
      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">Services</BookingSectionLabel>
        <BookingSummaryRow label={appointment.service_name} value={formatMoney(Number(appointment.price ?? 0))} />
        {appointment.team_member_name ? (
          <BookingSummaryRow label="Staff" value={appointment.team_member_name} />
        ) : null}
      </BookingSectionCard>
    );
  }

  if (lines.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Services</BookingSectionLabel>
      <ul className="space-y-3">
        {lines.map((line, index) => {
          const name = line.offering_name ?? line.service_name ?? "Service";
          const staff = line.staff_name ?? line.team_member_name;
          return (
            <li key={index} className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{name}</p>
                {line.duration_minutes != null ? (
                  <p className="text-xs text-gray-500">{line.duration_minutes} min</p>
                ) : null}
                {staff ? <p className="text-xs text-gray-500">{staff}</p> : null}
              </div>
              {line.price != null ? (
                <span className="font-medium shrink-0">{formatMoney(Number(line.price))}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </BookingSectionCard>
  );
}
