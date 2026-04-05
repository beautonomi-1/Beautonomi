"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, X } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatDate, formatTime } from "@/lib/utils";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { useTranslation } from "@beautonomi/i18n";
import AddToWaitlistButton from "@/components/booking/AddToWaitlistButton";
import { coerceSelectedDate } from "@beautonomi/utils";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";

/** Aligns with typical online booking settings when this step has no provider settings prop. */
const BOOKING_MAX_ADVANCE_DAYS = 90;
const STRIP_DAYS = 21;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function slotTimePeriod(timeStr: string): "morning" | "afternoon" | "evening" {
  const m = /^(\d{1,2})/.exec(timeStr.trim());
  const hour = m ? parseInt(m[1], 10) : 12;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function slotTimeOnSelectedDay(timeStr: string, day: Date): Date {
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0] || "0", 10);
  const min = parseInt(parts[1] || "0", 10);
  const d = new Date(day);
  d.setHours(h, min, 0, 0);
  return d;
}

/** Hide / block times that already passed when the selected day is today. */
function isSlotTimeStillSelectable(timeStr: string, day: Date): boolean {
  const now = new Date();
  const ds = startOfLocalDay(day).getTime();
  const ts = startOfLocalDay(now).getTime();
  if (ds < ts) return false;
  if (ds > ts) return true;
  return slotTimeOnSelectedDay(timeStr, day).getTime() > now.getTime();
}

interface StepCalendarProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailabilityData {
  date: string;
  slots: TimeSlot[];
}

export default function StepCalendar({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug: _providerSlug,
}: StepCalendarProps) {
  const searchParams = useSearchParams();
  /** Own hold from `/book/continue?hold_id=` — exclude from “blocked” so checkout can still see the slot. */
  const excludeHoldId = searchParams.get("hold_id")?.trim() || undefined;

  const [selectedDate, setSelectedDate] = useState<Date | null>(() =>
    coerceSelectedDate(bookingState.selectedDate)
  );

  useEffect(() => {
    setSelectedDate(coerceSelectedDate(bookingState.selectedDate));
  }, [bookingState.selectedDate]);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [_availableDates, _setAvailableDates] = useState<Date[]>([]);
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const { t } = useTranslation();

  const today = startOfLocalDay(new Date());
  const lastSelectableDay = new Date(today);
  lastSelectableDay.setDate(today.getDate() + BOOKING_MAX_ADVANCE_DAYS - 1);
  const minViewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxViewMonth = new Date(lastSelectableDay.getFullYear(), lastSelectableDay.getMonth(), 1);
  const canPrevMonth = startOfLocalDay(monthViewDate).getTime() > startOfLocalDay(minViewMonth).getTime();
  const canNextMonth = startOfLocalDay(monthViewDate).getTime() < startOfLocalDay(maxViewMonth).getTime();

  const selectedDay = coerceSelectedDate(selectedDate);

  const selectableSlots = useMemo(() => {
    if (!availability?.slots?.length || !selectedDay) return [];
    return availability.slots.filter((s) => isSlotTimeStillSelectable(s.time, selectedDay));
  }, [availability, selectedDay]);

  useEffect(() => {
    if (!selectedDay || !bookingState.selectedTimeSlot || !availability?.slots) return;
    const row = availability.slots.find((s) => s.time === bookingState.selectedTimeSlot);
    if (!row) return;
    if (isSlotTimeStillSelectable(row.time, selectedDay)) return;
    updateBookingState({ selectedTimeSlot: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, bookingState.selectedTimeSlot, availability?.date]);

  // Calculate total duration including travel buffer for mobile
  const totalDuration = bookingState.selectedServices.reduce(
    (sum, service) => sum + service.duration,
    0
  ) + bookingState.selectedAddons.reduce((sum, addon) => sum + addon.duration, 0);

  // Use actual travel time if available, otherwise use configured default
  const travelBuffer = getTravelBuffer(bookingState.mode, bookingState.address?.travelTimeMinutes);

  const loadAvailability = useCallback(async () => {
    const day = coerceSelectedDate(selectedDate);
    if (!day) return;

    try {
      setIsLoading(true);
      const staffId = bookingState.selectedServices[0]?.staffId;
      const dateStr = formatLocalDateYYYYMMDD(day);
      const mode = bookingState.mode || "salon";

      const holdParam = excludeHoldId
        ? `&excludeHoldId=${encodeURIComponent(excludeHoldId)}`
        : "";

      const response = await fetcher.get<{ data: AvailabilityData }>(
        `/api/availability?staffId=${staffId || "any"}&date=${dateStr}&mode=${mode}&duration=${totalDuration}&travelBuffer=${travelBuffer}${holdParam}`,
        { staleTimeMs: 0 }
      );

      setAvailability(response.data);
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to load availability"
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedDate,
    bookingState.selectedServices,
    bookingState.mode,
    travelBuffer,
    totalDuration,
    excludeHoldId,
  ]);

  useEffect(() => {
    if (selectedDate) {
      loadAvailability();
    }
  }, [selectedDate, loadAvailability]);

  // Use Supabase Realtime for instant updates instead of polling
  useEffect(() => {
    if (!selectedDate) return;

    // Refresh on window focus (user might have booked in another tab)
    const handleFocus = () => {
      loadAvailability();
    };
    window.addEventListener('focus', handleFocus);

    // Try to use Supabase Realtime for real-time updates
    let unsubscribe: (() => void) | null = null;
    
    const setupRealtime = async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        const { subscribeToBookings } = await import('@/lib/websocket/supabase-realtime');
        const supabase = getSupabaseClient();
        
        if (bookingState.providerId) {
          unsubscribe = subscribeToBookings(
            supabase,
            bookingState.providerId,
            (event) => {
              // Refresh availability when bookings or booking_services change
              if (
                event.type === 'booking_created' ||
                event.type === 'booking_cancelled' ||
                event.type === 'booking_services_changed' ||
                event.type === 'availability_changed'
              ) {
                loadAvailability();
              }
            }
          );
        }
      } catch (error) {
        console.warn('Realtime subscription failed, falling back to polling:', error);
        // Fallback to polling if Realtime fails
        const interval = setInterval(() => {
          loadAvailability();
        }, 30000);
        return () => clearInterval(interval);
      }
    };

    setupRealtime();

    return () => {
      window.removeEventListener('focus', handleFocus);
      if (unsubscribe) unsubscribe();
    };
  }, [selectedDate, bookingState.selectedServices, bookingState.mode, bookingState.providerId, loadAvailability]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    updateBookingState({ selectedDate: date, selectedTimeSlot: null });
  };

  const handleTimeSelect = (time: string) => {
    updateBookingState({ selectedTimeSlot: time });
  };

  const stripCount = Math.min(BOOKING_MAX_ADVANCE_DAYS, STRIP_DAYS);
  const stripDates: Date[] = [];
  for (let i = 0; i < stripCount; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    stripDates.push(date);
  }

  const year = monthViewDate.getFullYear();
  const month = monthViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthDays: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) monthDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(new Date(year, month, d));

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {t("booking.selectDateTime")}
        </h2>
        <p className="text-gray-600">
          {t("booking.selectDate")}
        </p>
        {bookingState.mode === "mobile" && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                House Call Service
              </p>
              <p className="text-xs text-blue-700 mt-1">
                A 30-minute travel buffer is included before and after your appointment
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Date Selection */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {t("booking.selectDate")}
          </h3>
          <button
            type="button"
            onClick={() => {
              const base = selectedDay ?? today;
              setMonthViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
              setShowMonthCalendar(true);
            }}
            className="text-xs flex items-center gap-1 text-primary font-medium min-h-[44px] px-1"
          >
            <Calendar className="h-3.5 w-3.5" />
            Full month
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {stripDates.map((date) => {
            const isSelected =
              selectedDay?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            const isPast = startOfLocalDay(date).getTime() < today.getTime() && !isToday;
            const afterLast =
              startOfLocalDay(date).getTime() > startOfLocalDay(lastSelectableDay).getTime();
            const disabled = isPast || afterLast;

            return (
              <button
                key={date.toISOString()}
                onClick={() => !disabled && handleDateSelect(date)}
                disabled={disabled}
                className={`flex-shrink-0 w-20 p-3 rounded-lg border-2 transition-all touch-target ${
                  isSelected
                    ? "border-primary bg-pink-50"
                    : disabled
                      ? "border-gray-100 bg-gray-50 opacity-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                aria-label={`Select ${formatDate(date)}`}
              >
                <div className="text-xs text-gray-600 mb-1">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isSelected ? "text-primary" : "text-gray-900"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="text-xs text-gray-500">
                  {date.toLocaleDateString("en-US", { month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showMonthCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowMonthCalendar(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 shadow-xl bg-white border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-4">
              <button
                type="button"
                onClick={() => setShowMonthCalendar(false)}
                className="absolute right-0 top-0 p-2 rounded-full text-gray-500"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center justify-center gap-3 pr-10">
                <button
                  type="button"
                  onClick={() => setMonthViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  disabled={!canPrevMonth}
                  className="p-2 rounded-full disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="font-semibold min-w-[10rem] text-center text-gray-900">
                  {MONTHS[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={() => setMonthViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  disabled={!canNextMonth}
                  className="p-2 rounded-full disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-xs py-1 text-gray-500">
                  {w}
                </div>
              ))}
              {monthDays.map((d, i) => (
                <div key={i} className="flex items-center justify-center">
                  {d ? (
                    (() => {
                      const dayStart = startOfLocalDay(d);
                      const beforeToday = dayStart.getTime() < today.getTime();
                      const afterLast = dayStart.getTime() > startOfLocalDay(lastSelectableDay).getTime();
                      const outOfRange = beforeToday || afterLast;
                      const isSelected = selectedDay?.toDateString() === d.toDateString();
                      const isTodayCell = d.toDateString() === today.toDateString();
                      return (
                        <button
                          type="button"
                          disabled={outOfRange}
                          onClick={() => {
                            if (outOfRange) return;
                            handleDateSelect(d);
                            setShowMonthCalendar(false);
                          }}
                          className={`w-10 h-10 rounded-xl text-sm font-medium ${
                            outOfRange
                              ? "opacity-35 cursor-not-allowed text-gray-400"
                              : isSelected
                                ? "bg-primary text-white"
                                : isTodayCell
                                  ? "bg-gray-200 text-gray-900"
                                  : "hover:bg-black/5 text-gray-900"
                          }`}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })()
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Time Slots */}
      {selectedDay && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Available Times
          </h3>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Loading availability...
            </div>
          ) : availability && selectableSlots.length > 0 ? (
            <div className="space-y-5">
              {(
                [
                  { label: t("booking.morning"), key: "morning" as const },
                  { label: t("booking.afternoon"), key: "afternoon" as const },
                  { label: t("booking.evening"), key: "evening" as const },
                ] as const
              ).map(({ label, key }) => {
                const groupSlots = selectableSlots.filter((s) => slotTimePeriod(s.time) === key);
                if (groupSlots.length === 0) return null;
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {groupSlots.map((slot) => {
                        const isSelected = bookingState.selectedTimeSlot === slot.time;
                        const isUnavailable = !slot.available;

                        return (
                          <button
                            key={slot.time}
                            onClick={() => !isUnavailable && handleTimeSelect(slot.time)}
                            disabled={isUnavailable}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all touch-target ${
                              isSelected
                                ? "border-primary bg-pink-50 text-primary"
                                : isUnavailable
                                  ? "border-gray-100 bg-gray-50 text-gray-400 opacity-50"
                                  : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                            }`}
                            aria-label={`Select ${formatTime(slot.time)}`}
                            title={slot.reason}
                          >
                            {formatTime(slot.time)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div>
                <p className="text-gray-500">No available slots for this date</p>
                <p className="text-sm mt-1 text-gray-400">Please select another date</p>
              </div>
              {bookingState.providerId && bookingState.selectedServices.length > 0 && (
                <div className="pt-4">
                  <AddToWaitlistButton
                    providerId={bookingState.providerId}
                    serviceId={bookingState.selectedServices[0]?.id}
                    staffId={bookingState.selectedServices[0]?.staffId}
                    preferredDate={selectedDay}
                    onSuccess={() => {
                      toast.success("Added to waitlist! We'll notify you when slots become available.");
                    }}
                    variant="outline"
                    size="default"
                    className="mx-auto"
                  />
                </div>
              )}
            </div>
          )}

          {bookingState.selectedTimeSlot && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-green-50 border border-green-200 rounded-lg"
            >
              <p className="text-sm font-medium text-green-900">
                Selected: {formatDate(selectedDay)} at{" "}
                {formatTime(bookingState.selectedTimeSlot)}
              </p>
              {bookingState.mode === "mobile" && (
                <p className="text-xs text-green-700 mt-1">
                  Service duration: {totalDuration} min (includes travel time)
                </p>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
