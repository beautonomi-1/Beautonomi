"use client";

import { useMemo, useState } from "react";
import {
  BOOKINGS_TO_REVIEW_STATUS,
  buildStatsReconciliationLine,
  statusFilterForStatsTile,
  type BookingsStatsRange,
  type BookingsStatsTileKey,
} from "@beautonomi/provider-booking";
import type { ProviderBookingAction } from "@/lib/provider-booking/action-policy";
import { Input } from "@/components/ui/input";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel } from "../ui";
import { BookingScheduleCard, type HubScheduleBooking } from "./BookingScheduleCard";
import { useBookingsHubStats } from "./useBookingsHubStats";

const STATUS_CHIPS = [
  { id: "", label: "All" },
  { id: BOOKINGS_TO_REVIEW_STATUS, label: "To review" },
  { id: "pending_payment", label: "Pending payment" },
  { id: "confirmed", label: "Confirmed" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "no_show", label: "No-show" },
];

interface BookingsOverviewTabProps {
  bookings: HubScheduleBooking[];
  statsRange: BookingsStatsRange;
  locationId?: string;
  stalePendingCount?: number;
  onReviewStalePending?: () => void;
  onOpenBooking: (booking: HubScheduleBooking) => void;
  getPrimaryAction?: (booking: HubScheduleBooking) => ProviderBookingAction | null;
  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;
  pendingActionIds?: Set<string>;
}

export function BookingsOverviewTab({
  bookings,
  statsRange,
  locationId,
  stalePendingCount = 0,
  onReviewStalePending,
  onOpenBooking,
  getPrimaryAction,
  onPrimaryAction,
  pendingActionIds,
}: BookingsOverviewTabProps) {
  const { stats: apiStats } = useBookingsHubStats(statsRange, locationId);
  const { format: formatMoney } = useProviderMoneyFormat();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"scheduled_at" | "booked_at">("scheduled_at");
  const [activeTile, setActiveTile] = useState<BookingsStatsTileKey | null>(null);

  const tiles: Array<{ key: BookingsStatsTileKey; label: string; value: string }> = [
    {
      key: "appointments",
      label: "Appointments",
      value: String(apiStats?.appointment_count ?? 0),
    },
    { key: "pending", label: "Pending", value: String(apiStats?.pending_count ?? 0) },
    { key: "confirmed", label: "Confirmed", value: String(apiStats?.confirmed_count ?? 0) },
    { key: "active", label: "In progress", value: String(apiStats?.in_progress_count ?? 0) },
    { key: "completed", label: "Completed", value: String(apiStats?.completed_count ?? 0) },
    {
      key: "earned",
      label: "Booked GMV",
      value: apiStats?.booked_gmv != null ? formatMoney(apiStats.booked_gmv) : "—",
    },
  ];

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (statusFilter) {
      const statuses = statusFilter.split(",");
      list = list.filter((b) => statuses.includes((b.status || "").toLowerCase()));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => {
        const client = (b.customer_name || "").toLowerCase();
        const services = (b.services ?? [])
          .map((s) => (s.offering_name ?? s.service_name ?? s.name ?? "").toLowerCase())
          .join(" ");
        return client.includes(q) || services.includes(q);
      });
    }
    return list.sort((a, b) => {
      const ta =
        sortBy === "booked_at"
          ? a.created_at
            ? new Date(a.created_at).getTime()
            : 0
          : a.scheduled_at
            ? new Date(a.scheduled_at).getTime()
            : 0;
      const tb =
        sortBy === "booked_at"
          ? b.created_at
            ? new Date(b.created_at).getTime()
            : 0
          : b.scheduled_at
            ? new Date(b.scheduled_at).getTime()
            : 0;
      return ta - tb;
    });
  }, [bookings, statusFilter, search, sortBy]);

  const handleTileClick = (key: BookingsStatsTileKey) => {
    setActiveTile(key);
    setStatusFilter(statusFilterForStatsTile(key));
  };

  return (
    <div className="px-4 pb-6 space-y-4">
      {stalePendingCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            setStatusFilter(BOOKINGS_TO_REVIEW_STATUS);
            setActiveTile("pending");
            onReviewStalePending?.();
          }}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 touch-manipulation min-h-[44px]"
        >
          <span className="font-semibold">{stalePendingCount} pending</span> need attention — tap to
          review
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTileClick(t.key)}
            className={`rounded-xl border bg-white p-3 text-left touch-manipulation min-h-[72px] ${
              activeTile === t.key ? "border-gray-900 ring-1 ring-gray-900" : ""
            }`}
          >
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{t.label}</p>
            <p className="text-xl font-bold text-gray-900 truncate">{t.value}</p>
          </button>
        ))}
      </div>

      {apiStats ? (
        <p className="text-xs text-gray-500">
          {buildStatsReconciliationLine({
            pending_count: apiStats.pending_count,
            confirmed_count: apiStats.confirmed_count ?? 0,
            in_progress_count: apiStats.in_progress_count,
            completed_count: apiStats.completed_count ?? 0,
            cancelled_count: apiStats.cancelled_count ?? 0,
            no_show_count: apiStats.no_show_count ?? 0,
          })}
          {apiStats.recognized_revenue > 0 ? (
            <span className="block mt-1">
              Recognized revenue: {formatMoney(apiStats.recognized_revenue)}
            </span>
          ) : null}
        </p>
      ) : null}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search client or service"
        className="rounded-xl min-h-[44px]"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSortBy("scheduled_at")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${
            sortBy === "scheduled_at" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"
          }`}
        >
          By appointment time
        </button>
        <button
          type="button"
          onClick={() => setSortBy("booked_at")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${
            sortBy === "booked_at" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"
          }`}
        >
          By booked time
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.id || "all"}
            type="button"
            onClick={() => {
              setStatusFilter(chip.id);
              setActiveTile(null);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${
              statusFilter === chip.id ? "bg-gray-900 text-white" : "bg-white border text-gray-700"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <BookingSectionCard className="p-0 overflow-hidden">
        <BookingSectionLabel className="px-4 pt-4 pb-2">
          Bookings ({filtered.length})
        </BookingSectionLabel>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 pb-4">No bookings match this filter.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((b) => (
              <BookingScheduleCard
                key={b.id}
                booking={b}
                pending={pendingActionIds?.has(b.id)}
                primaryAction={getPrimaryAction?.(b) ?? null}
                onOpen={() => onOpenBooking(b)}
                onPrimaryAction={(booking, action) => onPrimaryAction?.(booking, action)}
              />
            ))}
          </div>
        )}
      </BookingSectionCard>
    </div>
  );
}
