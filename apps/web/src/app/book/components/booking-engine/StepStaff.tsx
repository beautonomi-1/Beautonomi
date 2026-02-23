"use client";

import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingData, StaffOption } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepStaffProps {
  data: BookingData;
  staff: StaffOption[];
  onSelectStaff: (staff: StaffOption | null) => void;
  onNext: () => void;
}

export function StepStaff({ data, staff, onSelectStaff, onNext }: StepStaffProps) {
  const noPreference: StaffOption = {
    id: "any",
    name: "No preference",
    role: "Anyone available",
  };
  const selectedId = data.selectedStaff?.id ?? null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Who would you like?</h2>
        <p className="mt-1 text-sm text-gray-500">Choose your preferred specialist or leave it to us</p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSelectStaff(noPreference)}
          className={cn(
            "w-full text-left rounded-3xl border-2 px-4 py-3 transition-all touch-manipulation active:scale-[0.99] flex items-center gap-3",
            selectedId === "any"
              ? "border-[#EC4899] bg-[#EC4899]/10"
              : "border-gray-200 bg-white hover:border-gray-300"
          )}
        >
          <div className="h-12 w-12 rounded-2xl bg-gray-200 flex items-center justify-center shrink-0">
            <User className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <span className="font-medium text-gray-900">{noPreference.name}</span>
            <p className="text-sm text-gray-500">{noPreference.role}</p>
          </div>
        </button>

        {staff.map((s, i) => {
          const isSelected = selectedId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStaff(s)}
              className={cn(
                "w-full text-left rounded-3xl border-2 px-4 py-3 transition-all touch-manipulation active:scale-[0.99] flex items-center gap-3",
                isSelected ? "border-[#EC4899] bg-[#EC4899]/10" : "border-gray-200 bg-white hover:border-gray-300"
              )}
              style={{ animationDelay: `${(i + 1) * 50}ms` }}
            >
              <div className="h-12 w-12 rounded-2xl bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                {s.avatar_url ? (
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-6 w-6 text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-900 block">{s.name}</span>
                <p className="text-sm text-gray-500">{s.role}</p>
                {s.rating != null && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    ★ {Number(s.rating).toFixed(1)} rating
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        className={cn(
          "w-full rounded-2xl h-12 font-medium text-white transition-all touch-manipulation active:scale-[0.98]",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        Continue
      </button>
    </div>
  );
}
