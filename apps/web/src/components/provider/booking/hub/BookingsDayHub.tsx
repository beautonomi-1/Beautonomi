"use client";

import { useMemo, useState, useEffect } from "react";
import { format, addDays, isSameDay, startOfDay, parseISO, isValid } from "date-fns";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/http/fetcher";
import { openCreateMode } from "@/stores/appointment-sidebar-store";
import type { ProviderBookingAction } from "@/lib/provider-booking/action-policy";
import {
  BookingEmptyState,
  BookingSectionCard,
} from "../ui";
import { BookingScheduleCard, type HubScheduleBooking } from "./BookingScheduleCard";
import { BookingsQuickActions } from "./BookingsQuickActions";
import { useBookingsHubStats } from "./useBookingsHubStats";
import { BookingsOverviewTab } from "./BookingsOverviewTab";
import { WaitlistQuickBookSheet } from "./WaitlistQuickBookSheet";
import { BOOKING_BG, MIN_TAP } from "../tokens";
import { useTranslation } from "@beautonomi/i18n";
import { anyEligibleForRunningBehindNotify } from "@beautonomi/provider-booking";
import { isTodayInTz, resolveTz } from "@/lib/dates/provider-tz";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type HubTab = "day" | "overview";

export interface BookingsDayHubStats {
  count: number;
  revenue: number;
  pendingCount: number;
  inProgressCount: number;
  waitingRoomCount?: number;
}

type TimeBlockItem = {
  id: string;
  name?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
};

interface BookingsDayHubProps {
  className?: string;
  bookings: HubScheduleBooking[];
  stats?: BookingsDayHubStats;
  statsRange?: "today" | "week" | "month" | "all";
  locationId?: string;
  pendingActionIds?: Set<string>;
  onOpenBooking: (booking: HubScheduleBooking) => void;
  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;
  getPrimaryAction?: (booking: HubScheduleBooking) => ProviderBookingAction | null;
  onNewGroupBooking?: () => void;
  onBookingsRefresh?: () => void;
  stalePendingCount?: number;
  openCloseOutQueue?: boolean;
  canEditAppointments?: boolean;
  /** Salon IANA timezone — running-behind banner uses business "today", not browser local. */
  providerTimezone?: string | null;
}

function bookingOnDate(booking: HubScheduleBooking, day: Date): boolean {
  if (!booking.scheduled_at) return false;
  const d = parseISO(booking.scheduled_at);
  return isValid(d) && isSameDay(d, day);
}

function blockOnDate(block: TimeBlockItem, day: Date): boolean {
  if (!block.date) return false;
  const d = parseISO(`${block.date}T12:00:00`);
  return isValid(d) && isSameDay(d, day);
}

function sortByTime(a: HubScheduleBooking, b: HubScheduleBooking): number {
  const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
  const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
  return ta - tb;
}

export function BookingsDayHub({
  className,
  bookings,
  stats: statsProp,
  statsRange = "today",
  locationId,
  pendingActionIds,
  onOpenBooking,
  onPrimaryAction,
  getPrimaryAction,
  onNewGroupBooking,
  onBookingsRefresh,
  stalePendingCount = 0,
  openCloseOutQueue = false,
  canEditAppointments = true,
  providerTimezone = null,
}: BookingsDayHubProps) {
  const { t } = useTranslation();
  const businessTz = resolveTz(providerTimezone);
  const [tab, setTab] = useState<HubTab>(openCloseOutQueue ? "overview" : "day");
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockItem[]>([]);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [behindBusy, setBehindBusy] = useState(false);
  const [runningBehindOpen, setRunningBehindOpen] = useState(false);

  useEffect(() => {
    if (openCloseOutQueue) setTab("overview");
  }, [openCloseOutQueue]);

  const { stats: apiStats } = useBookingsHubStats(statsRange, locationId);
  const stats = statsProp ?? (apiStats
    ? {
        count: apiStats.appointment_count,
        revenue: apiStats.booked_gmv,
        pendingCount: apiStats.pending_count,
        inProgressCount: apiStats.in_progress_count,
      }
    : undefined);

  const dateStrip = useMemo(() => {
    const start = addDays(startOfDay(new Date()), -3);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const dayBookings = useMemo(
    () => bookings.filter((b) => bookingOnDate(b, selectedDate)).sort(sortByTime),
    [bookings, selectedDate],
  );

  const dayBlocks = useMemo(
    () => timeBlocks.filter((b) => blockOnDate(b, selectedDate)),
    [timeBlocks, selectedDate],
  );

  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ date_from: dateStr, date_to: dateStr });
        if (locationId) params.set("location_id", locationId);
        const res = await fetcher.get<{ data?: TimeBlockItem[] }>(
          `/api/provider/time-blocks?${params}`,
        );
        if (cancelled) return;
        setTimeBlocks(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!cancelled) setTimeBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, locationId]);

  const nextUpcomingId = useMemo(() => {
    const now = Date.now();
    const upcoming = dayBookings.find((b) => {
      if (!b.scheduled_at) return false;
      const t = new Date(b.scheduled_at).getTime();
      return t >= now && !["completed", "cancelled", "canceled", "no_show"].includes((b.status || "").toLowerCase());
    });
    return upcoming?.id ?? null;
  }, [dayBookings]);

  const showRunningBehindBanner =
    isTodayInTz(selectedDate, businessTz) &&
    canEditAppointments &&
    anyEligibleForRunningBehindNotify(
      dayBookings.map((b) => ({
        status: b.status,
        scheduled_at: b.scheduled_at ?? undefined,
      })),
    );

  const notifyRunningBehind = async (delayMinutes: number) => {
    setBehindBusy(true);
    try {
      const res = await fetcher.post<{ data?: { notified?: number } }>(
        "/api/provider/bookings/running-behind",
        {
          delay_minutes: delayMinutes,
          location_id: locationId,
        },
      );
      setRunningBehindOpen(false);
      toast.success(
        t("web.provider.bookings.dayHub.runningBehindNotify", {
          count: res.data?.notified ?? 0,
        }),
      );
    } catch {
      toast.error(t("web.provider.bookings.dayHub.runningBehindFailed"));
    } finally {
      setBehindBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col", className)} style={{ backgroundColor: BOOKING_BG }}>
      <div className="flex gap-1 p-1 mx-4 mt-4 rounded-xl bg-white border">
        {(["day", "overview"] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold capitalize touch-manipulation",
              MIN_TAP,
              tab === tabId ? "bg-gray-900 text-white" : "text-gray-600",
            )}
          >
            {tabId === "day"
              ? t("web.provider.bookings.dayHub.tabDay")
              : t("web.provider.bookings.dayHub.tabOverview")}
          </button>
        ))}
      </div>

      {tab === "day" ? (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 py-4 snap-x">
            {dateStrip.map((day) => {
              const selected = isSameDay(day, selectedDate);
              const count = bookings.filter((b) => bookingOnDate(b, day)).length;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex flex-col items-center min-w-[56px] rounded-xl border px-3 py-2 snap-start touch-manipulation relative",
                    MIN_TAP,
                    selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700",
                  )}
                >
                  <span className="text-[10px] uppercase font-medium">{format(day, "EEE")}</span>
                  <span className="text-lg font-bold leading-tight">{format(day, "d")}</span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        "absolute -top-1 -end-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                        selected ? "bg-white text-gray-900" : "bg-primary text-white",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <BookingsQuickActions
            selectedDate={selectedDate}
            waitingRoomCount={stats?.waitingRoomCount}
            onWaitlistQuickBook={() => setWaitlistOpen(true)}
          />

          {showRunningBehindBanner ? (
            <div className="mx-4 mb-3">
              <button
                type="button"
                disabled={behindBusy}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 touch-manipulation disabled:opacity-60"
                onClick={() => setRunningBehindOpen(true)}
              >
                {behindBusy
                  ? t("web.provider.bookings.dayHub.runningBehindBusy")
                  : t("web.provider.bookings.dayHub.runningBehindAction")}
              </button>
            </div>
          ) : null}

          <Dialog open={runningBehindOpen} onOpenChange={(open) => !behindBusy && setRunningBehindOpen(open)}>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>{t("web.provider.bookings.dayHub.runningBehindTitle")}</DialogTitle>
                <DialogDescription>{t("web.provider.bookings.dayHub.runningBehindBody")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  disabled={behindBusy}
                  className="min-h-[44px] rounded-xl"
                  onClick={() => void notifyRunningBehind(15)}
                >
                  {t("web.provider.bookings.dayHub.delay15")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={behindBusy}
                  className="min-h-[44px] rounded-xl"
                  onClick={() => void notifyRunningBehind(30)}
                >
                  {t("web.provider.bookings.dayHub.delay30")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {(stats?.waitingRoomCount ?? 0) > 0 ? (
            <div className="mx-4 mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {t("web.provider.bookings.dayHub.waitingRoom", { count: stats!.waitingRoomCount })}
            </div>
          ) : null}

          <div className="px-4 pb-6 space-y-3">
            <BookingSectionCard padding="sm">
              <p className="text-sm font-medium text-gray-900">
                {format(selectedDate, "EEEE, MMMM d")}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {dayBlocks.length > 0
                  ? t("web.provider.bookings.dayHub.appointmentsSummary", {
                      appointments: t("web.provider.bookings.dayHub.appointmentsOnly", {
                        count: dayBookings.length,
                      }),
                      blocks: t("web.provider.bookings.dayHub.blocksOnly", { count: dayBlocks.length }),
                    })
                  : t("web.provider.bookings.dayHub.appointmentsOnly", { count: dayBookings.length })}
              </p>
            </BookingSectionCard>

            {dayBlocks.map((block) => (
              <BookingSectionCard key={block.id} padding="sm" className="border-dashed bg-gray-50">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  {t("web.provider.bookings.dayHub.blockedTime")}
                </p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">
                  {block.name ?? t("web.provider.bookings.dayHub.unavailable")}
                </p>
                {block.start_time ? (
                  <p className="text-xs text-gray-500 mt-1">
                    {block.start_time}
                    {block.end_time ? ` – ${block.end_time}` : ""}
                  </p>
                ) : null}
              </BookingSectionCard>
            ))}

            {dayBookings.length === 0 && dayBlocks.length === 0 ? (
              <BookingEmptyState
                title={t("web.provider.bookings.dayHub.emptyTitle")}
                description={t("web.provider.bookings.dayHub.emptyDescription")}
                actionLabel={t("web.provider.bookings.dayHub.newBooking")}
                onAction={() => {
                  const dateStr = format(selectedDate, "yyyy-MM-dd");
                  openCreateMode({ staffId: "", date: dateStr, startTime: "09:00" });
                }}
              />
            ) : (
              dayBookings.map((booking) => (
                <BookingScheduleCard
                  key={booking.id}
                  booking={booking}
                  isNextUpcoming={booking.id === nextUpcomingId}
                  pending={pendingActionIds?.has(booking.id)}
                  primaryAction={getPrimaryAction?.(booking) ?? null}
                  onOpen={onOpenBooking}
                  onPrimaryAction={onPrimaryAction}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <BookingsOverviewTab
          bookings={bookings}
          statsRange={statsRange}
          locationId={locationId}
          stalePendingCount={stalePendingCount}
          onReviewStalePending={() => {
            setTab("overview");
          }}
          onOpenBooking={onOpenBooking}
          getPrimaryAction={getPrimaryAction}
          onPrimaryAction={onPrimaryAction}
          pendingActionIds={pendingActionIds}
          openCloseOutQueue={openCloseOutQueue}
        />
      )}

      <WaitlistQuickBookSheet
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        date={format(selectedDate, "yyyy-MM-dd")}
        onSuccess={onBookingsRefresh}
      />
    </div>
  );
}
