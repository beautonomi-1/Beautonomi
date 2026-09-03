"use client";

import { useEffect, useState } from "react";
import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

type ServiceLine = {
  id?: string;
  offering_id?: string;
  service_id?: string;
  offering_name?: string;
  service_name?: string;
  duration_minutes?: number;
  price?: number;
  staff_id?: string | null;
  staff_name?: string;
  team_member_name?: string;
};

type StaffOption = { id: string; name: string };

interface BookingServicesSectionProps {
  appointment: Appointment;
  bookingId?: string;
  canReassign?: boolean;
  onReassigned?: () => void;
}

export function BookingServicesSection({
  appointment,
  bookingId,
  canReassign = false,
  onReassigned,
}: BookingServicesSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const raw = appointment as unknown as Record<string, unknown>;
  const lines = (raw.services as ServiceLine[] | undefined) ?? [];
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReassign || !bookingId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetcher.get<{ data: Array<{ id: string; name?: string; is_active?: boolean }> }>(
          "/api/provider/staff",
        );
        const rows = Array.isArray(res.data) ? res.data : [];
        if (!cancelled) {
          setStaff(
            rows
              .filter((row) => row.is_active !== false)
              .map((row) => ({ id: row.id, name: row.name?.trim() || "Staff" })),
          );
        }
      } catch {
        if (!cancelled) setStaff([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canReassign, bookingId]);

  async function reassignLine(lineId: string, staffId: string | null) {
    if (!bookingId) return;
    setSavingId(lineId);
    setError(null);
    try {
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
        staff_id: staffId,
        booking_service_id: lineId,
      });
      onReassigned?.();
    } catch (err) {
      const fetchErr = err as FetchError;
      if (fetchErr?.status === 409) {
        setError("This booking changed, reload");
        onReassigned?.();
        return;
      }
      setError(fetchErr?.message || "This booking changed, reload");
    } finally {
      setSavingId(null);
    }
  }

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
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      <ul className="space-y-3">
        {lines.map((line, index) => {
          const name = line.offering_name ?? line.service_name ?? "Service";
          const staffLabel = line.staff_name ?? line.team_member_name;
          const lineId = typeof line.id === "string" && line.id.length > 0 ? line.id : null;
          return (
            <li
              key={lineId ?? `${name}-${index}`}
              className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{name}</p>
                {line.duration_minutes != null ? (
                  <p className="text-xs text-gray-500">{line.duration_minutes} min</p>
                ) : null}
                {canReassign && bookingId && lineId ? (
                  <select
                    className="mt-1.5 w-full max-w-[220px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                    value={line.staff_id ?? ""}
                    disabled={savingId === lineId}
                    aria-label={`Reassign staff for ${name}`}
                    onChange={(e) => {
                      const next = e.target.value;
                      void reassignLine(lineId, next.length > 0 ? next : null);
                    }}
                  >
                    <option value="">Unassigned</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                    {line.staff_id && !staff.some((member) => member.id === line.staff_id) ? (
                      <option value={line.staff_id}>{staffLabel || "Current staff"}</option>
                    ) : null}
                  </select>
                ) : staffLabel ? (
                  <p className="text-xs text-gray-500">{staffLabel}</p>
                ) : null}
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
