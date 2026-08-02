"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
import { ChevronDown, Clock, Loader2, Moon, Sun, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { fetcher } from "@/lib/http/fetcher";
import {
  buildAvailableSlotsUrl,
  buildDateOptions,
  DEFAULT_BOOKING_DATE_RANGE_DAYS,
  formatRelativeDateLabel,
  groupSlotsByPeriod,
  normalizeSlotRows,
  type BookingSlotPeriod,
  type BookingSlotRow,
} from "@beautonomi/provider-booking";
import { BookingBottomSheet, BookingSectionLabel } from "../ui";

const PERIOD_ICONS: Record<BookingSlotPeriod, typeof Sun> = {
  morning: Sun,
  afternoon: Cloud,
  evening: Moon,
};

const SCHEDULING_HINT =
  "Add a service or product first so we can calculate duration and show available times.";

export interface ProviderBookingDateTimePickerProps {
  date: string;
  startTime: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  durationMinutes: number;
  locationId?: string;
  serviceIds?: string[];
  staffIds?: string[];
  mode?: "salon" | "mobile";
  travelBufferMinutes?: number;
  needsServiceFirst?: boolean;
  excludeBookingId?: string;
}

function parseDateValue(value: string): Date {
  if (!value) return startOfDay(new Date());
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? startOfDay(new Date()) : d;
}

export function ProviderBookingDateTimePicker({
  date,
  startTime,
  onDateChange,
  onTimeChange,
  durationMinutes,
  locationId = "",
  serviceIds = [],
  staffIds = [],
  mode = "salon",
  travelBufferMinutes = 0,
  needsServiceFirst = false,
  excludeBookingId,
}: ProviderBookingDateTimePickerProps) {
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<BookingSlotPeriod | null>(null);
  const [rows, setRows] = useState<BookingSlotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedDate, setDebouncedDate] = useState(date);

  const selectedDate = useMemo(() => parseDateValue(date || format(new Date(), "yyyy-MM-dd")), [date]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const dateOptions = useMemo(
    () => buildDateOptions(DEFAULT_BOOKING_DATE_RANGE_DAYS, today),
    [today],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDate(date), 280);
    return () => window.clearTimeout(timer);
  }, [date]);

  const slotQueryEnabled =
    !needsServiceFirst && Boolean(debouncedDate) && durationMinutes > 0;

  const fetchSlots = useCallback(async () => {
    if (!slotQueryEnabled) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = buildAvailableSlotsUrl({
        date: debouncedDate,
        duration_minutes: durationMinutes,
        staff_ids: staffIds.filter(Boolean).join(",") || undefined,
        location_id: locationId || undefined,
        service_ids: serviceIds.filter(Boolean).join(",") || undefined,
        mode: mode === "mobile" ? "mobile" : "salon",
        travel_buffer: mode === "mobile" ? travelBufferMinutes : 0,
        exclude_booking_id: excludeBookingId,
      });
      const res = await fetcher.get<{
        data?: { slot_grid?: BookingSlotRow[]; slots?: string[]; provider_timezone?: string };
      }>(url, { staleTimeMs: 0 });
      const payload = (res as { data?: typeof res }).data ?? res;
      setRows(normalizeSlotRows(payload as { slot_grid?: BookingSlotRow[]; slots?: string[] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load available times");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    slotQueryEnabled,
    debouncedDate,
    durationMinutes,
    staffIds,
    locationId,
    serviceIds,
    mode,
    travelBufferMinutes,
    excludeBookingId,
  ]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const availableTimes = useMemo(
    () => rows.filter((r) => r.available).map((r) => r.time),
    [rows],
  );

  useEffect(() => {
    if (!availableTimes.length || needsServiceFirst) return;
    if (startTime && availableTimes.includes(startTime)) return;
    if (startTime) {
      const idx = availableTimes.findIndex((t) => t >= startTime);
      onTimeChange(idx >= 0 ? availableTimes[idx]! : availableTimes[0]!);
    } else {
      onTimeChange(availableTimes[0]!);
    }
  }, [availableTimes, needsServiceFirst, startTime, onTimeChange]);

  const grouped = useMemo(() => groupSlotsByPeriod(rows), [rows]);
  const filteredGroups = useMemo(() => {
    if (!periodFilter) return grouped;
    return grouped.filter((g) => g.period === periodFilter);
  }, [grouped, periodFilter]);

  const periodTabs = useMemo(
    () =>
      grouped.map((g) => ({
        period: g.period,
        label: g.label,
        openCount: g.rows.filter((r) => r.available).length,
      })),
    [grouped],
  );

  const handleSelectDate = (d: Date) => {
    onDateChange(format(d, "yyyy-MM-dd"));
    setPeriodFilter(null);
  };

  const handleSelectTime = (time: string) => {
    onTimeChange(time);
    setTimeSheetOpen(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <BookingSectionLabel className="mb-2">Date</BookingSectionLabel>
        {needsServiceFirst ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-2">
            {SCHEDULING_HINT}
          </p>
        ) : null}
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {dateOptions.map((d) => {
            const isActive = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const relative = formatRelativeDateLabel(d, today);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => handleSelectDate(d)}
                className={cn(
                  "flex flex-col items-center min-w-[64px] rounded-2xl px-3 py-2.5 snap-start touch-manipulation border",
                  isActive
                    ? "bg-gray-900 border-gray-900 text-white"
                    : isToday
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-gray-200 bg-white",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500",
                  )}
                >
                  {relative}
                </span>
                <span className={cn("text-base font-bold", isActive ? "text-white" : "text-gray-900")}>
                  {format(d, "d")}
                </span>
                <span
                  className={cn(
                    "text-[10px]",
                    isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500",
                  )}
                >
                  {format(d, "MMM")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <BookingSectionLabel className="mb-2">Time</BookingSectionLabel>
        {needsServiceFirst ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-2">
            {SCHEDULING_HINT}
          </p>
        ) : null}
        <button
          type="button"
          disabled={needsServiceFirst}
          onClick={() => setTimeSheetOpen(true)}
          className={cn(
            "w-full flex items-center justify-between rounded-xl border px-4 py-3 touch-manipulation min-h-[48px]",
            startTime && !needsServiceFirst
              ? "border-emerald-300 bg-emerald-50"
              : "border-gray-200 bg-gray-50",
            needsServiceFirst && "opacity-60 cursor-not-allowed",
          )}
        >
          <span className="flex items-center gap-2">
            <Clock className={cn("h-4 w-4", startTime ? "text-emerald-700" : "text-gray-400")} />
            <span
              className={cn(
                "text-base",
                startTime && !needsServiceFirst ? "font-semibold text-emerald-800" : "text-gray-400",
              )}
            >
              {startTime ? formatTime(startTime) : "Select time slot"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      <BookingBottomSheet
        open={timeSheetOpen}
        onOpenChange={setTimeSheetOpen}
        mode="create"
        title="Select time"
      >
        <div className="pb-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading available times…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 py-4">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No time slots for this date. Try another day or adjust services.
            </p>
          ) : (
            <>
              {periodTabs.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
                  {periodTabs.map((p) => {
                    const Icon = PERIOD_ICONS[p.period];
                    const isActive = periodFilter === p.period;
                    return (
                      <button
                        key={p.period}
                        type="button"
                        onClick={() => setPeriodFilter(isActive ? null : p.period)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shrink-0",
                          isActive
                            ? "bg-gray-900 border-gray-900 text-gray-200"
                            : "border-gray-200 bg-gray-50 text-gray-600",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {p.label}
                        {p.openCount > 0 ? (
                          <span
                            className={cn(
                              "ml-0.5 rounded-full px-1.5 text-[10px] font-bold",
                              isActive ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700",
                            )}
                          >
                            {p.openCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-4">
                {filteredGroups.map((group) => (
                  <div key={group.period}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.rows.map((row) => {
                        const isActive = startTime === row.time;
                        const unavailable = !row.available;
                        return (
                          <button
                            key={row.time}
                            type="button"
                            disabled={unavailable}
                            title={unavailable ? row.reason : undefined}
                            onClick={() => handleSelectTime(row.time)}
                            className={cn(
                              "min-w-[72px] rounded-xl border px-3 py-2 text-sm font-semibold touch-manipulation",
                              isActive
                                ? "bg-gray-900 border-gray-900 text-white"
                                : unavailable
                                  ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                                  : "border-gray-200 bg-white text-gray-800 hover:border-emerald-300",
                            )}
                          >
                            {formatTime(row.time)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </BookingBottomSheet>
    </div>
  );
}
