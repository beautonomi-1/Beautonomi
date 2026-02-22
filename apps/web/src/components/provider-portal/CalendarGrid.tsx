"use client";

import React from "react";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, AlertCircle, Calendar as CalendarIcon } from "lucide-react";

interface CalendarGridProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  onAppointmentClick?: (appointment: Appointment) => void;
  onTimeSlotClick?: (date: Date, time: string, teamMemberId: string) => void;
  startHour?: number;
  endHour?: number;
}

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return `${hour}:00`;
});

// Appointment status colors and icons (Mangomint-inspired)
const getAppointmentStyle = (status: Appointment["status"]) => {
  switch (status) {
    case "booked":
      return {
        bg: "bg-blue-500",
        hover: "hover:bg-blue-600",
        border: "border-blue-600",
        text: "text-white",
        icon: CalendarIcon,
      };
    case "started":
      return {
        bg: "bg-green-500",
        hover: "hover:bg-green-600",
        border: "border-green-600",
        text: "text-white",
        icon: Clock,
      };
    case "completed":
      return {
        bg: "bg-gray-500",
        hover: "hover:bg-gray-600",
        border: "border-gray-600",
        text: "text-white",
        icon: CheckCircle2,
      };
    case "cancelled":
      return {
        bg: "bg-red-500",
        hover: "hover:bg-red-600",
        border: "border-red-600",
        text: "text-white",
        icon: XCircle,
      };
    case "no_show":
      return {
        bg: "bg-orange-500",
        hover: "hover:bg-orange-600",
        border: "border-orange-600",
        text: "text-white",
        icon: AlertCircle,
      };
    default:
      return {
        bg: "bg-[#FF0077]",
        hover: "hover:bg-[#D60565]",
        border: "border-[#FF0077]/20",
        text: "text-white",
        icon: CalendarIcon,
      };
  }
};

export function CalendarGrid({
  appointments,
  teamMembers,
  selectedDate,
  view,
  onAppointmentClick,
  onTimeSlotClick,
  startHour = 8,
  endHour = 20,
}: CalendarGridProps) {
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
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
      const monday = new Date(start.setDate(diff));
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push(date);
      }
    }
    return dates;
  };

  const getAppointmentsForSlot = (
    date: Date,
    time: string,
    teamMemberId: string
  ): Appointment[] => {
    const dateStr = date.toISOString().split("T")[0];
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

  const dates = getDatesForView();
  const visibleTimeSlots = TIME_SLOTS.slice(startHour, endHour + 1);

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm w-full max-w-full">
      {/* Desktop: Grid view with horizontal scroll only when needed */}
      <div className="overflow-x-auto w-full">
        <div className="min-w-max">
          {/* Header with dates */}
          <div className="grid border-b bg-gray-50" style={{ gridTemplateColumns: `80px repeat(${dates.length}, 1fr)` }}>
            <div className="p-2 sm:p-2 border-r font-medium text-sm text-gray-600"></div>
            {dates.map((date, idx) => (
              <div key={idx} className="p-2 sm:p-2 border-r last:border-r-0 text-center">
                <div className="text-xs text-gray-500">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div className="text-sm font-semibold">
                  {date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                </div>
              </div>
            ))}
          </div>

      {/* Team members rows */}
      {teamMembers.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          No team members. Add team members to see the calendar.
        </div>
      ) : (
        teamMembers.map((member) => (
          <div key={member.id} className="border-b last:border-b-0">
            {/* Team member header */}
            <div className="grid border-b bg-gray-50" style={{ gridTemplateColumns: `80px repeat(${dates.length}, 1fr)` }}>
              <div className="p-2 sm:p-3 border-r font-medium text-sm flex items-center">
                {member.name}
              </div>
              {dates.map((_, idx) => (
                <div key={idx} className="border-r last:border-r-0"></div>
              ))}
            </div>

            {/* Time slots grid */}
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${dates.length}, 1fr)` }}>
              {/* Time column - Mobile optimized */}
              <div className="border-r bg-gray-50/50">
                {visibleTimeSlots.map((time) => (
                  <div
                    key={time}
                    className="h-16 border-b text-xs sm:text-sm text-gray-600 px-2 sm:px-3 py-1 flex items-center font-medium"
                  >
                    <span className="hidden sm:inline">{time}</span>
                    <span className="sm:hidden">{time.split(":")[0]}</span>
                  </div>
                ))}
              </div>

              {/* Date columns */}
              {dates.map((date, dateIdx) => (
                <div key={dateIdx} className="border-r last:border-r-0 relative">
                  {visibleTimeSlots.map((time) => {
                    const slotAppointments = getAppointmentsForSlot(
                      date,
                      time,
                      member.id
                    );
                    const isFirstSlot = slotAppointments.length > 0 && 
                      slotAppointments[0].scheduled_time === time;

                    return (
                      <div
                        key={time}
                        className="h-16 border-b relative cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => onTimeSlotClick?.(date, time, member.id)}
                      >
                        {isFirstSlot && slotAppointments.map((apt) => {
                          const [_hour, min] = apt.scheduled_time.split(":").map(Number);
                          const topOffset = (min / 60) * 64; // 64px per hour
                          const height = (apt.duration_minutes / 60) * 64;
                          const style = getAppointmentStyle(apt.status);
                          const StatusIcon = style.icon;

                          return (
                            <div
                              key={apt.id}
                              className={cn(
                                "absolute left-0.5 sm:left-1 right-0.5 sm:right-1 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs cursor-pointer z-10",
                                "transition-all duration-200 shadow-sm",
                                style.bg,
                                style.hover,
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
                              title={`${apt.client_name} - ${apt.service_name} (${apt.status})`}
                            >
                              {height >= 32 ? (
                                <>
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <StatusIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                                    <div className="font-medium truncate text-[10px] sm:text-xs flex-1">
                                      {apt.client_name}
                                    </div>
                                  </div>
                                  <div className="text-[9px] sm:text-[10px] opacity-90 truncate pl-3.5 sm:pl-4">
                                    {apt.service_name}
                                  </div>
                                  <div className="text-[9px] sm:text-[10px] opacity-75 pl-3.5 sm:pl-4">
                                    {apt.scheduled_time} ({apt.duration_minutes}min)
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-1 truncate">
                                  <StatusIcon className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate text-[10px] sm:text-xs font-medium">
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
              ))}
            </div>
          </div>
        ))
      )}
        </div>
      </div>
    </div>
  );
}
