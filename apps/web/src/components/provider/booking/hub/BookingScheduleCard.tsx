"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingStatusChip } from "../ui/BookingStatusChip";
import { BookingActionButton } from "../ui/BookingActionButton";
import { MIN_TAP } from "../tokens";
import type { ProviderBookingAction } from "@/lib/provider-booking/action-policy";
import { Money } from "@/components/provider-portal/Money";

export interface HubScheduleBooking {
  id: string;
  booking_number?: string | null;
  status: string;
  scheduled_at: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  total_amount?: number | null;
  payment_status?: string | null;
  services?: { offering_name?: string; service_name?: string; name?: string }[];
}

interface BookingScheduleCardProps {
  booking: HubScheduleBooking;
  isNextUpcoming?: boolean;
  pending?: boolean;
  primaryAction?: ProviderBookingAction | null;
  onOpen: (booking: HubScheduleBooking) => void;
  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;
}

function serviceLabel(booking: HubScheduleBooking): string {
  const services = booking.services ?? [];
  if (services.length === 0) return "Booking";
  const first = services[0]?.offering_name ?? services[0]?.service_name ?? services[0]?.name ?? "Service";
  return services.length > 1 ? `${first} +${services.length - 1}` : first;
}

function formatTime(scheduledAt: string | null): string {
  if (!scheduledAt) return "—";
  const d = new Date(scheduledAt);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function BookingScheduleCard({
  booking,
  isNextUpcoming,
  pending,
  primaryAction,
  onOpen,
  onPrimaryAction,
}: BookingScheduleCardProps) {
  const customer = booking.customer_name?.trim() || "Customer";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm transition-shadow",
        isNextUpcoming && "ring-2 ring-primary/30 border-primary/20",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(booking)}
        className={cn("w-full text-left touch-manipulation", MIN_TAP)}
        data-schedule-card={booking.id}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-center min-w-[52px]">
            <p className="text-xs font-medium text-gray-500 uppercase">{formatTime(booking.scheduled_at)}</p>
            {booking.booking_number ? (
              <p className="text-[10px] text-gray-400 mt-0.5">#{booking.booking_number}</p>
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 truncate">{customer}</p>
              <BookingStatusChip status={booking.status} />
            </div>
            <p className="text-sm text-gray-600 mt-0.5 truncate">{serviceLabel(booking)}</p>
            {booking.total_amount != null && booking.total_amount > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                <Money amount={booking.total_amount} />
              </p>
            ) : null}
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
        </div>
      </button>

      {primaryAction && onPrimaryAction ? (
        <div className="mt-3 pt-3 border-t">
          <BookingActionButton
            size="sm"
            disabled={pending}
            onClick={() => onPrimaryAction(booking, primaryAction)}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              primaryAction.label
            )}
          </BookingActionButton>
        </div>
      ) : null}
    </div>
  );
}
