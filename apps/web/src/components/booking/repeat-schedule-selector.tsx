"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export type RepeatFrequency = "none" | "weekly" | "monthly" | "yearly";
export type RepeatEndType = "never" | "after" | "on_date";

export interface RepeatSchedule {
  frequency: RepeatFrequency;
  interval: number; // Every X weeks/months/years
  endType: RepeatEndType;
  endAfterCount?: number; // Number of occurrences
  endDate?: Date; // End on specific date
  daysOfWeek?: number[]; // For weekly: [0=Sunday, 1=Monday, etc.]
}

interface RepeatScheduleSelectorProps {
  value: RepeatSchedule;
  onChange: (schedule: RepeatSchedule) => void;
  startDate: Date;
}

export default function RepeatScheduleSelector({
  value,
  onChange,
  startDate,
}: RepeatScheduleSelectorProps) {
  const [localSchedule, setLocalSchedule] = useState<RepeatSchedule>(value);

  const updateSchedule = (updates: Partial<RepeatSchedule>) => {
    const newSchedule = { ...localSchedule, ...updates };
    setLocalSchedule(newSchedule);
    onChange(newSchedule);
  };

  const handleFrequencyChange = (frequency: RepeatFrequency) => {
    const newSchedule: RepeatSchedule = {
      ...localSchedule,
      frequency,
      interval: 1,
      endType: "never",
    };

    if (frequency === "weekly") {
      // Default to the day of week of start date
      const dayOfWeek = startDate.getDay();
      newSchedule.daysOfWeek = [dayOfWeek];
    } else {
      delete newSchedule.daysOfWeek;
    }

    setLocalSchedule(newSchedule);
    onChange(newSchedule);
  };

  const toggleDayOfWeek = (day: number) => {
    const currentDays = localSchedule.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();
    
    updateSchedule({ daysOfWeek: newDays });
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4">
      <div>
        <Label>Repeat Schedule</Label>
        <Select
          value={localSchedule.frequency}
          onValueChange={handleFrequencyChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select repeat frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Repeat</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {localSchedule.frequency !== "none" && (
        <>
          <div>
            <Label>Repeat Every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="52"
                value={localSchedule.interval}
                onChange={(e) =>
                  updateSchedule({ interval: parseInt(e.target.value) || 1 })
                }
                className="w-20"
              />
              <span className="text-sm text-gray-600">
                {localSchedule.frequency === "weekly" && "week(s)"}
                {localSchedule.frequency === "monthly" && "month(s)"}
                {localSchedule.frequency === "yearly" && "year(s)"}
              </span>
            </div>
          </div>

          {localSchedule.frequency === "weekly" && (
            <div>
              <Label>Days of Week</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {dayNames.map((day, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant={
                      localSchedule.daysOfWeek?.includes(index)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => toggleDayOfWeek(index)}
                    className={
                      localSchedule.daysOfWeek?.includes(index)
                        ? "bg-[#FF0077] hover:bg-[#E6006A]"
                        : ""
                    }
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>End Repeat</Label>
            <Select
              value={localSchedule.endType}
              onValueChange={(value: RepeatEndType) =>
                updateSchedule({ endType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="after">After X occurrences</SelectItem>
                <SelectItem value="on_date">On specific date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {localSchedule.endType === "after" && (
            <div>
              <Label>Number of Occurrences</Label>
              <Input
                type="number"
                min="2"
                max="100"
                value={localSchedule.endAfterCount || 2}
                onChange={(e) =>
                  updateSchedule({
                    endAfterCount: parseInt(e.target.value) || 2,
                  })
                }
              />
            </div>
          )}

          {localSchedule.endType === "on_date" && (
            <div>
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {localSchedule.endDate ? (
                      format(localSchedule.endDate, "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={localSchedule.endDate}
                    onSelect={(date) => {
                      if (date && date > startDate) {
                        updateSchedule({ endDate: date });
                      }
                    }}
                    disabled={(date) => date <= startDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Summary:</strong> This booking will repeat every{" "}
              {localSchedule.interval}{" "}
              {localSchedule.frequency === "weekly" && "week(s)"}
              {localSchedule.frequency === "monthly" && "month(s)"}
              {localSchedule.frequency === "yearly" && "year(s)"}
              {localSchedule.endType === "never" && " indefinitely"}
              {localSchedule.endType === "after" &&
                ` for ${localSchedule.endAfterCount} occurrence(s)`}
              {localSchedule.endType === "on_date" &&
                localSchedule.endDate &&
                ` until ${format(localSchedule.endDate, "PPP")}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
