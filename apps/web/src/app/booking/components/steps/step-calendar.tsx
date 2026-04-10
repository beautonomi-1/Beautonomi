"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, X, CheckCircle2, Sun, Cloud, Moon, Sparkles } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatDate, formatTime } from "@/lib/utils";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { useTranslation } from "@beautonomi/i18n";
import AddToWaitlistButton from "@/components/booking/AddToWaitlistButton";
import { coerceSelectedDate } from "@beautonomi/utils";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";
import {
  availabilityRouteDurationMinutes,
  slicesFromBookingCart,
} from "@/lib/booking-slot-math/blocked-window-minutes";

const BOOKING_MAX_ADVANCE_DAYS = 90;
const STRIP_DAYS = 21;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function isSlotTimeStillSelectable(timeStr: string, day: Date): boolean {
  const now = new Date();
  const ds = startOfLocalDay(day).getTime();
  const ts = startOfLocalDay(now).getTime();
  if (ds < ts) return false;
  if (ds > ts) return true;
  return slotTimeOnSelectedDay(timeStr, day).getTime() > now.getTime();
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
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

/** Skeleton pill for loading state */
function SlotSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-full bg-gray-100 animate-pulse"
          style={{ width: `${64 + (i % 3) * 8}px`, animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

const PERIOD_CONFIG = {
  morning:   { Icon: Sun,   label: "Morning",   gradient: "from-amber-400 to-orange-400" },
  afternoon: { Icon: Cloud, label: "Afternoon",  gradient: "from-sky-400 to-blue-500" },
  evening:   { Icon: Moon,  label: "Evening",    gradient: "from-indigo-500 to-purple-600" },
} as const;

export default function StepCalendar({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug: _providerSlug,
}: StepCalendarProps) {
  const searchParams = useSearchParams();
  const excludeHoldId = searchParams.get("hold_id")?.trim() || undefined;

  const [selectedDate, setSelectedDate] = useState<Date | null>(() =>
    coerceSelectedDate(bookingState.selectedDate)
  );
  const stripScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedDate(coerceSelectedDate(bookingState.selectedDate));
  }, [bookingState.selectedDate]);

  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const availableCount = useMemo(
    () => selectableSlots.filter((s) => s.available).length,
    [selectableSlots]
  );

  useEffect(() => {
    if (!selectedDay || !bookingState.selectedTimeSlot || !availability?.slots) return;
    const row = availability.slots.find((s) => s.time === bookingState.selectedTimeSlot);
    if (!row) return;
    if (isSlotTimeStillSelectable(row.time, selectedDay)) return;
    updateBookingState({ selectedTimeSlot: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, bookingState.selectedTimeSlot, availability?.date]);

  const totalDuration = useMemo(() => {
    const slices = slicesFromBookingCart(
      bookingState.selectedServices,
      bookingState.selectedAddons
    );
    return availabilityRouteDurationMinutes(slices);
  }, [bookingState.selectedServices, bookingState.selectedAddons]);

  const travelBuffer = getTravelBuffer(bookingState.mode, bookingState.address?.travelTimeMinutes);

  const loadAvailability = useCallback(async () => {
    const day = coerceSelectedDate(selectedDate);
    if (!day) return;
    try {
      setIsLoading(true);
      const staffId = bookingState.selectedServices[0]?.staffId;
      const dateStr = formatLocalDateYYYYMMDD(day);
      const mode = bookingState.mode || "salon";
      const holdParam = excludeHoldId ? `&excludeHoldId=${encodeURIComponent(excludeHoldId)}` : "";
      const providerParam = bookingState.providerId
          ? `&providerId=${encodeURIComponent(bookingState.providerId)}`
          : "";
      const locationParam =
        bookingState.selectedLocationId
          ? `&locationId=${encodeURIComponent(bookingState.selectedLocationId)}`
          : "";
      const response = await fetcher.get<{ data: AvailabilityData }>(
        `/api/availability?staffId=${staffId || "any"}&date=${dateStr}&mode=${mode}&duration=${totalDuration}&travelBuffer=${travelBuffer}${holdParam}${providerParam}${locationParam}`,
        { staleTimeMs: 0 }
      );
      setAvailability(response.data);
    } catch (error) {
      toast.error(error instanceof FetchError ? error.message : "Failed to load availability");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, bookingState.selectedServices, bookingState.mode, travelBuffer, totalDuration, excludeHoldId, bookingState.providerId, bookingState.selectedLocationId]);

  useEffect(() => {
    if (selectedDate) loadAvailability();
  }, [selectedDate, loadAvailability]);

  useEffect(() => {
    if (!selectedDate) return;
    const handleFocus = () => loadAvailability();
    window.addEventListener("focus", handleFocus);

    let unsubscribe: (() => void) | null = null;
    const setupRealtime = async () => {
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client");
        const { subscribeToBookings } = await import("@/lib/websocket/supabase-realtime");
        const supabase = getSupabaseClient();
        if (bookingState.providerId) {
          unsubscribe = subscribeToBookings(supabase, bookingState.providerId, (event) => {
            if (
              event.type === "booking_created" ||
              event.type === "booking_cancelled" ||
              event.type === "booking_services_changed" ||
              event.type === "availability_changed"
            ) {
              loadAvailability();
            }
          });
        }
      } catch {
        const interval = setInterval(() => loadAvailability(), 30000);
        return () => clearInterval(interval);
      }
    };
    setupRealtime();
    return () => {
      window.removeEventListener("focus", handleFocus);
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

  // Auto-scroll date strip so selected date is centred
  useEffect(() => {
    if (!stripScrollRef.current || !selectedDay) return;
    const strip = stripScrollRef.current;
    const btn = strip.querySelector<HTMLElement>("[data-selected-date='true']");
    if (!btn) return;
    const btnLeft = btn.offsetLeft;
    const btnWidth = btn.offsetWidth;
    const stripWidth = strip.clientWidth;
    strip.scrollTo({ left: btnLeft - stripWidth / 2 + btnWidth / 2, behavior: "smooth" });
  }, [selectedDay]);

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
    <div className="px-4 py-6 space-y-7">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {t("booking.selectDateTime")}
          </h2>
        </div>
        <p className="text-sm text-gray-500 ml-10">
          Choose a date and time that works for you
        </p>
        {totalDuration > 0 && (
          <div className="ml-10 mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
            <Clock className="w-3 h-3" />
            {formatDuration(totalDuration)} appointment
          </div>
        )}
        {bookingState.mode === "mobile" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-2.5 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3"
          >
            <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-900">House Call</p>
              <p className="text-xs text-blue-600 mt-0.5">
                A {travelBuffer}-minute travel buffer is included around your appointment
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Date Strip ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Select a date
          </h3>
          <button
            type="button"
            onClick={() => {
              const base = selectedDay ?? today;
              setMonthViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
              setShowMonthCalendar(true);
            }}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors rounded-lg px-2 py-1.5 hover:bg-primary/6 min-h-[36px]"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Full month
          </button>
        </div>

        <div
          ref={stripScrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1 snap-x snap-mandatory"
        >
          {stripDates.map((date) => {
            const isSelected = selectedDay?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            const isPast = startOfLocalDay(date).getTime() < today.getTime() && !isToday;
            const afterLast = startOfLocalDay(date).getTime() > startOfLocalDay(lastSelectableDay).getTime();
            const disabled = isPast || afterLast;

            return (
              <motion.button
                key={date.toISOString()}
                data-selected-date={isSelected ? "true" : undefined}
                onClick={() => !disabled && handleDateSelect(date)}
                disabled={disabled}
                whileTap={!disabled ? { scale: 0.95 } : undefined}
                className={`snap-start shrink-0 flex flex-col items-center justify-center w-[72px] py-3 rounded-2xl border-2 transition-all duration-200 select-none ${
                  isSelected
                    ? "border-primary bg-primary text-white shadow-lg shadow-primary/30"
                    : disabled
                      ? "border-transparent bg-gray-50 opacity-35 cursor-not-allowed"
                      : isToday
                        ? "border-primary/30 bg-primary/5 hover:border-primary/60"
                        : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm"
                }`}
                aria-label={`Select ${formatDate(date)}`}
                aria-pressed={isSelected}
              >
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                    isSelected ? "text-white/70" : isToday ? "text-primary" : "text-gray-400"
                  }`}
                >
                  {isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span
                  className={`text-xl font-bold leading-none ${
                    isSelected ? "text-white" : "text-gray-900"
                  }`}
                >
                  {date.getDate()}
                </span>
                <span
                  className={`text-[10px] mt-0.5 ${
                    isSelected ? "text-white/70" : "text-gray-400"
                  }`}
                >
                  {date.toLocaleDateString("en-US", { month: "short" })}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Month Calendar Modal ── */}
      <AnimatePresence>
        {showMonthCalendar && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMonthCalendar(false)}
          >
            <motion.div
              className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <button
                  type="button"
                  onClick={() => canPrevMonth && setMonthViewDate((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
                  disabled={!canPrevMonth}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-bold text-gray-900 text-base">
                  {MONTHS[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={() => canNextMonth && setMonthViewDate((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
                  disabled={!canNextMonth}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Weekday labels */}
              <div className="grid grid-cols-7 px-4 pb-2">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[11px] font-semibold text-gray-400 py-1">
                    {w}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 px-4 pb-5 gap-y-1">
                {monthDays.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const dayStart = startOfLocalDay(d);
                  const outOfRange =
                    dayStart.getTime() < today.getTime() ||
                    dayStart.getTime() > startOfLocalDay(lastSelectableDay).getTime();
                  const isSelected = selectedDay?.toDateString() === d.toDateString();
                  const isTodayCell = d.toDateString() === today.toDateString();
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => {
                        if (outOfRange) return;
                        handleDateSelect(d);
                        setShowMonthCalendar(false);
                      }}
                      className={`relative mx-auto w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-all ${
                        outOfRange
                          ? "opacity-25 cursor-not-allowed text-gray-400"
                          : isSelected
                            ? "bg-primary text-white shadow-md shadow-primary/40"
                            : isTodayCell
                              ? "bg-primary/10 text-primary font-bold"
                              : "hover:bg-gray-100 text-gray-900"
                      }`}
                    >
                      {d.getDate()}
                      {isTodayCell && !isSelected && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => setShowMonthCalendar(false)}
                  className="w-full py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Time Slots ── */}
      <AnimatePresence mode="wait">
        {selectedDay && (
          <motion.div
            key={selectedDay.toDateString()}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                {!isLoading && availability && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {availableCount === 0
                      ? "No slots available"
                      : `${availableCount} slot${availableCount !== 1 ? "s" : ""} available`}
                  </p>
                )}
              </div>
              {/* Legend */}
              {!isLoading && availableCount > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    Open
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-300" />
                    Taken
                  </span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-5">
                {["Morning", "Afternoon"].map((label) => (
                  <div key={label}>
                    <div className="h-4 w-20 rounded-full bg-gray-100 animate-pulse mb-3" />
                    <SlotSkeleton />
                  </div>
                ))}
              </div>
            ) : selectableSlots.length > 0 ? (
              <div className="space-y-6">
                {(["morning", "afternoon", "evening"] as const).map((period) => {
                  const { Icon, label, gradient } = PERIOD_CONFIG[period];
                  const groupSlots = selectableSlots.filter((s) => slotTimePeriod(s.time) === period);
                  if (groupSlots.length === 0) return null;
                  const groupAvailCount = groupSlots.filter((s) => s.available).length;

                  return (
                    <motion.div
                      key={period}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: period === "morning" ? 0 : period === "afternoon" ? 0.06 : 0.12 }}
                    >
                      {/* Period header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                          <Icon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</span>
                        <span className="ml-auto text-xs text-gray-400 font-medium">
                          {groupAvailCount} open
                        </span>
                      </div>

                      {/* Slot pills */}
                      <div className="flex flex-wrap gap-2">
                        {groupSlots.map((slot) => {
                          const isSelected = bookingState.selectedTimeSlot === slot.time;
                          const isUnavailable = !slot.available;

                          return (
                            <motion.button
                              key={slot.time}
                              onClick={() => !isUnavailable && handleTimeSelect(slot.time)}
                              disabled={isUnavailable}
                              whileTap={!isUnavailable ? { scale: 0.92 } : undefined}
                              title={isUnavailable && slot.reason ? slot.reason : undefined}
                              aria-label={isUnavailable ? `${formatTime(slot.time)} — unavailable` : `Select ${formatTime(slot.time)}`}
                              aria-pressed={isSelected}
                              className={`relative h-10 px-4 rounded-full text-sm font-semibold border transition-all duration-150 select-none ${
                                isSelected
                                  ? "bg-primary border-primary text-white shadow-lg shadow-primary/35 scale-105"
                                  : isUnavailable
                                    ? "border-red-200 bg-red-50/60 text-red-300 cursor-not-allowed line-through text-xs"
                                    : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100 hover:border-green-400 hover:shadow-sm"
                              }`}
                            >
                              {formatTime(slot.time)}
                              {isSelected && (
                                <motion.span
                                  layoutId="slot-check"
                                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary fill-primary" />
                                </motion.span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              /* Empty state */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <CalendarDays className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-semibold text-gray-700">No slots for this day</p>
                <p className="text-sm text-gray-400 mt-1 max-w-[200px]">
                  Try another date or join the waitlist to be notified.
                </p>
                {bookingState.providerId && bookingState.selectedServices.length > 0 && (
                  <div className="mt-5">
                    <AddToWaitlistButton
                      providerId={bookingState.providerId}
                      serviceId={bookingState.selectedServices[0]?.id}
                      staffId={bookingState.selectedServices[0]?.staffId}
                      preferredDate={selectedDay}
                      onSuccess={() => toast.success("Added to waitlist! We'll notify you when slots open up.")}
                      variant="outline"
                      size="default"
                      className="mx-auto"
                    />
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Selection confirmation banner ── */}
      <AnimatePresence>
        {bookingState.selectedTimeSlot && selectedDay && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="rounded-2xl overflow-hidden border border-primary/20"
          >
            <div className="bg-gradient-to-r from-primary/8 to-primary/4 px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  {" · "}
                  {formatTime(bookingState.selectedTimeSlot)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDuration(totalDuration)} · Tap &quot;Next&quot; to continue
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
