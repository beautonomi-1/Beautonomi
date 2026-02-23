"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingData } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface StepScheduleProps {
  data: BookingData;
  slots: Array<{ start: string; end: string; staff_id?: string }>;
  loadingSlots: boolean;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onSelectSlot: (slot: { start: string; end: string; staff_id?: string }) => void;
  onNextAvailable: () => void;
  onNext: () => void;
  maxAdvanceDays: number;
}

export function StepSchedule({
  data,
  slots,
  loadingSlots,
  selectedDate,
  onSelectDate,
  onSelectSlot,
  onNextAvailable,
  onNext,
  maxAdvanceDays,
}: StepScheduleProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < Math.min(maxAdvanceDays, 42); i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const formatDay = (d: Date) => d.getDate().toString();
  const formatSlot = (start: string) =>
    new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasSelection = data.selectedDate != null && data.selectedSlot != null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">When works for you?</h2>
        <p className="mt-1 text-sm text-gray-500">Pick a date and time</p>
      </div>

      <button
        type="button"
        onClick={onNextAvailable}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed border-[#EC4899] py-3 font-medium transition-all touch-manipulation active:scale-[0.98] flex items-center justify-center gap-2",
          MIN_TAP
        )}
        style={{ color: "#EC4899" }}
      >
        Next available
      </button>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Date</p>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-xs text-gray-500 py-1">
              {w}
            </div>
          ))}
          {days.slice(0, 35).map((d) => {
            const isSelected =
              selectedDate?.toDateString() === d.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelectDate(d)}
                className={cn(
                  "aspect-square rounded-xl text-sm font-medium transition-all touch-manipulation flex items-center justify-center",
                  isSelected
                    ? "bg-[#EC4899] text-white"
                    : isToday
                    ? "bg-gray-200 text-gray-900"
                    : "hover:bg-gray-100 text-gray-700"
                )}
              >
                {formatDay(d)}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Time</p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center rounded-2xl bg-gray-50">
              No slots available this day. Try another date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot, i) => {
                const isSelected =
                  data.selectedSlot?.start === slot.start;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectSlot(slot)}
                    className={cn(
                      "rounded-2xl py-3 text-sm font-medium transition-all touch-manipulation active:scale-[0.98]",
                      MIN_TAP,
                      isSelected
                        ? "bg-[#EC4899] text-white"
                        : "bg-white border-2 border-gray-200 hover:border-[#EC4899]/50 text-gray-900"
                    )}
                  >
                    {formatSlot(slot.start)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!hasSelection}
        className={cn(
          "w-full rounded-2xl h-12 font-medium text-white transition-all touch-manipulation active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        Continue
      </button>
    </div>
  );
}
