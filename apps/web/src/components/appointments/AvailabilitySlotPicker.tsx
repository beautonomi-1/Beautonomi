"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { fetcher } from "@/lib/http/fetcher";
import {
  Calendar as CalendarIcon,
  Clock,
  Sun,
  Cloud,
  Moon,
  Loader2,
} from "lucide-react";

const STRIP_DAYS = 21;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slotPeriod(timeStr: string): "morning" | "afternoon" | "evening" {
  const h = parseInt(timeStr.split(":")[0] || "12", 10);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function isSlotStillSelectable(timeStr: string, day: Date): boolean {
  const now = new Date();
  const ds = startOfLocalDay(day).getTime();
  const ts = startOfLocalDay(now).getTime();
  if (ds < ts) return false;
  if (ds > ts) return true;
  const parts = timeStr.split(":");
  const slotDate = new Date(day);
  slotDate.setHours(parseInt(parts[0] || "0", 10), parseInt(parts[1] || "0", 10), 0, 0);
  return slotDate.getTime() > now.getTime();
}

interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailabilitySlotPickerProps {
  staffId: string;
  locationId: string;
  providerId?: string;
  duration: number;
  selectedDate: string;
  selectedTime: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  mode?: "salon" | "mobile";
}

const PERIOD_CONFIG = {
  morning: { Icon: Sun, label: "Morning", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  afternoon: { Icon: Cloud, label: "Afternoon", bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  evening: { Icon: Moon, label: "Evening", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
} as const;

export function AvailabilitySlotPicker({
  staffId,
  locationId,
  providerId,
  duration,
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeChange,
  mode = "salon",
}: AvailabilitySlotPickerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const stripDates = useMemo(() => {
    const dates: Date[] = [];
    for (let i = 0; i < STRIP_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [today]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(selectedDate + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }, [selectedDate]);

  const fetchSlots = useCallback(async () => {
    if (!selectedDate || duration < 1) {
      setSlots([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        staffId: staffId || "any",
        date: selectedDate,
        mode,
        duration: String(duration),
        travelBuffer: "0",
      });
      if (providerId) params.set("providerId", providerId);
      if (locationId) params.set("locationId", locationId);

      const res = await fetcher.get<{ data: { date: string; slots: TimeSlot[] } }>(
        `/api/availability?${params.toString()}`,
        { staleTimeMs: 0 }
      );
      setSlots(res.data?.slots || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load slots");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, staffId, locationId, providerId, duration, mode]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Auto-scroll strip to selected date
  useEffect(() => {
    if (!stripRef.current || !selectedDay) return;
    const btn = stripRef.current.querySelector<HTMLElement>("[data-strip-selected='true']");
    if (!btn) return;
    stripRef.current.scrollTo({
      left: btn.offsetLeft - stripRef.current.clientWidth / 2 + btn.offsetWidth / 2,
      behavior: "smooth",
    });
  }, [selectedDay]);

  const selectableSlots = useMemo(() => {
    if (!slots.length || !selectedDay) return [];
    return slots.filter((s) => isSlotStillSelectable(s.time, selectedDay));
  }, [slots, selectedDay]);

  const availableCount = useMemo(
    () => selectableSlots.filter((s) => s.available).length,
    [selectableSlots]
  );

  return (
    <div className="space-y-3">
      {/* Date Strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-gray-500 font-medium">Select Date</label>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-[10px] text-primary hover:text-primary/80 font-medium"
          >
            {showManual ? "Use slot picker" : "Enter manually"}
          </button>
        </div>

        {showManual ? (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => onTimeChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        ) : (
          <>
            <div
              ref={stripRef}
              className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-0.5 px-0.5"
            >
              {stripDates.map((date) => {
                const dateStr = toYYYYMMDD(date);
                const isSelected = selectedDate === dateStr;
                const isToday = date.toDateString() === today.toDateString();
                const isPast = startOfLocalDay(date).getTime() < today.getTime() && !isToday;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    data-strip-selected={isSelected ? "true" : undefined}
                    disabled={isPast}
                    onClick={() => {
                      onDateChange(dateStr);
                      onTimeChange("");
                    }}
                    className={cn(
                      "shrink-0 flex flex-col items-center justify-center w-[52px] py-2 rounded-xl border transition-all select-none",
                      isSelected
                        ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                        : isPast
                          ? "border-transparent bg-gray-50 opacity-30 cursor-not-allowed"
                          : isToday
                            ? "border-primary/30 bg-primary/5 hover:border-primary/50"
                            : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm"
                    )}
                  >
                    <span className={cn(
                      "text-[9px] font-semibold uppercase tracking-wide",
                      isSelected ? "text-white/70" : isToday ? "text-primary" : "text-gray-400"
                    )}>
                      {isToday ? "Today" : WEEKDAYS_SHORT[date.getDay()]}
                    </span>
                    <span className={cn(
                      "text-base font-bold leading-none",
                      isSelected ? "text-white" : "text-gray-900"
                    )}>
                      {date.getDate()}
                    </span>
                    <span className={cn(
                      "text-[9px] mt-0.5",
                      isSelected ? "text-white/70" : "text-gray-400"
                    )}>
                      {date.toLocaleDateString("en-US", { month: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Time Slots */}
            {selectedDate && (
              <div className="mt-3">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-xs">Loading availability...</span>
                  </div>
                ) : error ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-red-500">{error}</p>
                    <button
                      type="button"
                      onClick={fetchSlots}
                      className="mt-1 text-xs text-primary hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : selectableSlots.length === 0 ? (
                  <div className="py-4 text-center">
                    <CalendarIcon className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 font-medium">No available slots</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Try another date or use manual entry</p>
                    <button
                      type="button"
                      onClick={() => setShowManual(true)}
                      className="mt-2 text-[10px] text-primary hover:underline font-medium"
                    >
                      Enter time manually
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {availableCount} slot{availableCount !== 1 ? "s" : ""} available
                      </span>
                      {selectedTime && (
                        <span className="text-[10px] text-primary font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(selectedTime)}
                        </span>
                      )}
                    </div>
                    {(["morning", "afternoon", "evening"] as const).map((period) => {
                      const cfg = PERIOD_CONFIG[period];
                      const periodSlots = selectableSlots.filter(
                        (s) => slotPeriod(s.time) === period
                      );
                      if (periodSlots.length === 0) return null;
                      const openCount = periodSlots.filter((s) => s.available).length;

                      return (
                        <div key={period}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <cfg.Icon className={cn("w-3 h-3", cfg.text)} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              {cfg.label}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-auto">
                              {openCount} open
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {periodSlots.map((slot) => {
                              const isSelected = selectedTime === slot.time;
                              const unavailable = !slot.available;
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={unavailable}
                                  onClick={() => !unavailable && onTimeChange(slot.time)}
                                  title={unavailable && slot.reason ? slot.reason : undefined}
                                  className={cn(
                                    "h-8 px-2.5 rounded-lg text-xs font-medium border transition-all select-none",
                                    isSelected
                                      ? "bg-primary border-primary text-white shadow-md shadow-primary/25"
                                      : unavailable
                                        ? "border-red-100 bg-red-50/50 text-red-300 cursor-not-allowed line-through text-[10px]"
                                        : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100 hover:border-green-300"
                                  )}
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
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
