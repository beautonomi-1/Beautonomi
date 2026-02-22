"use client";

import React from "react";
import { Input } from "@/components/ui/input";

export interface OperatingHours {
  [key: string]: { open: string; close: string; closed: boolean };
}

interface OperatingHoursEditorProps {
  hours: OperatingHours;
  onChange: (hours: OperatingHours) => void;
  className?: string;
}

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export function OperatingHoursEditor({
  hours,
  onChange,
  className = "",
}: OperatingHoursEditorProps) {
  const updateHours = (
    day: string,
    field: "open" | "close" | "closed",
    value: string | boolean
  ) => {
    const updatedHours = {
      ...hours,
      [day]: {
        ...(hours[day] || { open: "09:00", close: "18:00", closed: false }),
        [field]: value,
      },
    };
    onChange(updatedHours);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {DAYS.map((day) => {
        const dayHours = hours[day.key] || {
          open: "09:00",
          close: "18:00",
          closed: false,
        };
        return (
          <div
            key={day.key}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg"
          >
            <div className="w-full sm:w-24 font-medium text-sm sm:text-base">
              {day.label}
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!dayHours.closed}
                onChange={(e) =>
                  updateHours(day.key, "closed", !e.target.checked)
                }
                className="w-4 h-4"
              />
              <span className="text-sm">Open</span>
            </label>
            {!dayHours.closed && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Input
                  type="time"
                  value={dayHours.open || "09:00"}
                  onChange={(e) => updateHours(day.key, "open", e.target.value)}
                  className="w-full sm:w-32 text-sm sm:text-base"
                />
                <span className="text-sm sm:text-base">to</span>
                <Input
                  type="time"
                  value={dayHours.close || "18:00"}
                  onChange={(e) =>
                    updateHours(day.key, "close", e.target.value)
                  }
                  className="w-full sm:w-32 text-sm sm:text-base"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
