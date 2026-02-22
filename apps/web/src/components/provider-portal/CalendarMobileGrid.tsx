"use client";

import React, { useState, useEffect } from "react";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, AlertCircle, Calendar as CalendarIcon } from "lucide-react";
import { format, isToday, isSameDay, startOfWeek, addDays } from "date-fns";

interface CalendarMobileGridProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  onAppointmentClick?: (appointment: Appointment) => void;
  onTimeSlotClick?: (date: Date, time: string, teamMemberId: string) => void;
  onDateChange?: (date: Date) => void;
  startHour?: number;
  endHour?: number;
}

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return `${hour}:00`;
});

// Appointment status colors (Mangomint-inspired)
const getAppointmentStyle = (status: Appointment["status"]) => {
  switch (status) {
    case "booked":
      return {
        bg: "bg-blue-500",
        border: "border-blue-600",
        text: "text-white",
        icon: CalendarIcon,
      };
    case "started":
      return {
        bg: "bg-green-500",
        border: "border-green-600",
        text: "text-white",
        icon: Clock,
      };
    case "completed":
      return {
        bg: "bg-gray-500",
        border: "border-gray-600",
        text: "text-white",
        icon: CheckCircle2,
      };
    case "cancelled":
      return {
        bg: "bg-red-500",
        border: "border-red-600",
        text: "text-white",
        icon: XCircle,
      };
    case "no_show":
      return {
        bg: "bg-orange-500",
        border: "border-orange-600",
        text: "text-white",
        icon: AlertCircle,
      };
    default:
      return {
        bg: "bg-[#FF0077]",
        border: "border-[#FF0077]/20",
        text: "text-white",
        icon: CalendarIcon,
      };
  }
};

export function CalendarMobileGrid({
  appointments,
  teamMembers,
  selectedDate,
  view,
  onAppointmentClick,
  onTimeSlotClick,
  onDateChange,
  startHour = 8,
  endHour = 20,
}: CalendarMobileGridProps) {
  const [selectedStaffIndex, setSelectedStaffIndex] = useState(0);
  
  // Reset selectedStaffIndex when teamMembers changes
  useEffect(() => {
    if (teamMembers.length > 0 && selectedStaffIndex >= teamMembers.length) {
      queueMicrotask(() => setSelectedStaffIndex(0));
    }
  }, [teamMembers.length, selectedStaffIndex]);
  
  const selectedStaff = teamMembers.length > 0 ? teamMembers[selectedStaffIndex] : null;

  const getDatesForView = () => {
    const dates: Date[] = [];
    const start = new Date(selectedDate);
    
    if (view === "day") {
      dates.push(new Date(start));
    } else if (view === "3-days") {
      for (let i = 0; i < 3; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(date);
      }
    } else {
      // Week view - start from Monday
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(start.setDate(diff));
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push(date);
      }
    }
    return dates;
  };

  const dates = getDatesForView();
  const visibleTimeSlots = TIME_SLOTS.slice(startHour, endHour + 1);

  // Get appointments for a specific date, time, and team member
  const getAppointmentsForSlot = (
    date: Date,
    time: string,
    teamMemberId: string
  ): Appointment[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((apt) => {
      if (apt.scheduled_date !== dateStr || apt.team_member_id !== teamMemberId) {
        return false;
      }
      const [aptHour, _aptMin] = apt.scheduled_time.split(":").map(Number);
      const [slotHour] = time.split(":").map(Number);
      const endTime = aptHour + apt.duration_minutes / 60;
      return aptHour <= slotHour && slotHour < endTime;
    });
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${min.toString().padStart(2, "0")} ${period}`;
  };

  // Date selector bar (Mangomint style)
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="w-full overflow-x-hidden bg-white">
      {/* Date Selector Bar - Mangomint Style */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {weekDates.map((date, idx) => {
            const isSelected = isSameDay(date, selectedDate);
            const isTodayDate = isToday(date);
            
            return (
              <button
                key={idx}
                onClick={() => onDateChange?.(date)}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[48px] py-2 px-2 rounded-lg transition-all touch-manipulation",
                  isSelected
                    ? "bg-blue-100 text-blue-700"
                    : isTodayDate
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                <span className="text-[10px] font-medium uppercase text-gray-500">
                  {format(date, "EEE").charAt(0)}
                </span>
                <span className={cn(
                  "text-sm font-semibold mt-0.5",
                  isSelected && "text-blue-700",
                  isTodayDate && !isSelected && "text-gray-900"
                )}>
                  {format(date, "d")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Staff Member Selector - Swipeable */}
      {teamMembers.length > 0 && (
        <div className="sticky top-[57px] z-10 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {teamMembers.map((member, idx) => (
              <button
                key={member.id}
                onClick={() => setSelectedStaffIndex(idx)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all touch-manipulation min-h-[44px]",
                  selectedStaffIndex === idx
                    ? "bg-[#FF0077] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                <span className="text-sm font-medium">{member.name}</span>
                {appointments.filter(
                  (apt) =>
                    apt.team_member_id === member.id &&
                    dates.some((date) => apt.scheduled_date === format(date, "yyyy-MM-dd"))
                ).length > 0 && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    selectedStaffIndex === idx
                      ? "bg-white/20 text-white"
                      : "bg-[#FF0077] text-white"
                  )}>
                    {appointments.filter(
                      (apt) =>
                        apt.team_member_id === member.id &&
                        dates.some((date) => apt.scheduled_date === format(date, "yyyy-MM-dd"))
                    ).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Grid - Single Staff Member View */}
      {teamMembers.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p className="text-sm mb-2">No team members available</p>
          <p className="text-xs text-gray-400">
            Add team members in Settings → Team to see the calendar
          </p>
        </div>
      ) : !selectedStaff ? (
        <div className="p-8 text-center text-gray-500">
          <p className="text-sm">Select a team member above</p>
        </div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          <div className="flex">
            {/* Time Column */}
            <div className="sticky left-0 z-10 bg-white border-r border-gray-200 min-w-[60px]">
            {visibleTimeSlots.map((time) => {
              const [hour] = time.split(":").map(Number);
              const period = hour >= 12 ? "PM" : "AM";
              const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
              
              return (
                <div
                  key={time}
                  className="h-16 border-b border-gray-100 flex items-start justify-end pr-2 pt-1"
                >
                  <span className="text-xs text-gray-500 font-medium">
                    {displayHour} {period}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Date Columns - Single Column for Day View, Multiple for Week */}
          <div className="flex-1">
            {dates.map((date, dateIdx) => {
              const _dateStr = format(date, "yyyy-MM-dd");
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <div key={dateIdx} className="border-r border-gray-200 last:border-r-0 min-w-[200px]">
                  {/* Date Header */}
                  <div className={cn(
                    "h-12 border-b border-gray-200 flex items-center justify-center",
                    isSelected && "bg-blue-50"
                  )}>
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-600">
                        {format(date, "EEE")}
                      </div>
                      <div className={cn(
                        "text-sm font-semibold",
                        isSelected && "text-blue-700"
                      )}>
                        {format(date, "MMM d")}
                      </div>
                    </div>
                  </div>

                  {/* Time Slots */}
                  {visibleTimeSlots.map((time) => {
                    const slotAppointments = selectedStaff
                      ? getAppointmentsForSlot(date, time, selectedStaff.id)
                      : [];
                    const isFirstSlot = slotAppointments.length > 0 && 
                      slotAppointments[0].scheduled_time === time;

                    return (
                      <div
                        key={time}
                        className="h-16 border-b border-gray-100 relative cursor-pointer hover:bg-gray-50/50 transition-colors"
                        onClick={() => {
                          if (selectedStaff) {
                            onTimeSlotClick?.(date, time, selectedStaff.id);
                          }
                        }}
                      >
                        {isFirstSlot && slotAppointments.map((apt) => {
                          const [_hour, min] = apt.scheduled_time.split(":").map(Number);
                          const topOffset = (min / 60) * 64;
                          const height = (apt.duration_minutes / 60) * 64;
                          const style = getAppointmentStyle(apt.status);
                          const StatusIcon = style.icon;

                          return (
                            <div
                              key={apt.id}
                              className={cn(
                                "absolute left-1 right-1 rounded px-2 py-1 text-xs cursor-pointer z-10",
                                "transition-all duration-200 shadow-sm",
                                style.bg,
                                style.border,
                                style.text,
                                "border border-opacity-30",
                                height < 32 && "flex items-center gap-1"
                              )}
                              style={{
                                top: `${topOffset}px`,
                                height: `${Math.max(height, 24)}px`,
                                minHeight: "24px",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAppointmentClick?.(apt);
                              }}
                            >
                              {height >= 40 ? (
                                <>
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <StatusIcon className="w-3 h-3 flex-shrink-0" />
                                    <div className="font-semibold truncate text-[11px] flex-1">
                                      {apt.client_name}
                                    </div>
                                  </div>
                                  <div className="text-[10px] opacity-90 truncate pl-4">
                                    {apt.service_name}
                                  </div>
                                  <div className="text-[9px] opacity-75 pl-4">
                                    {formatTime(apt.scheduled_time)} ({apt.duration_minutes}min)
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-1 truncate">
                                  <StatusIcon className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate text-[11px] font-semibold">
                                    {apt.client_name}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
