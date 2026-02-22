"use client";

import React from "react";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, AlertCircle, Calendar as CalendarIcon, User } from "lucide-react";
import { format, isToday, parseISO } from "date-fns";

interface CalendarListProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  onAppointmentClick?: (appointment: Appointment) => void;
  onTimeSlotClick?: (date: Date, time: string, teamMemberId: string) => void;
  startHour?: number;
  endHour?: number;
}

// Appointment status colors and icons (Mangomint-inspired)
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

export function CalendarList({
  appointments,
  teamMembers,
  selectedDate,
  view,
  onAppointmentClick,
  onTimeSlotClick,
  startHour: _startHour = 8,
  endHour: _endHour = 20,
}: CalendarListProps) {
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

  // Group appointments by date and team member
  const groupedAppointments = dates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dateAppointments = appointments.filter(
      (apt) => apt.scheduled_date === dateStr
    );

    const byTeamMember = teamMembers.map((member) => {
      const memberAppointments = dateAppointments
        .filter((apt) => apt.team_member_id === member.id)
        .sort((a, b) => {
          const [aHour, aMin] = a.scheduled_time.split(":").map(Number);
          const [bHour, bMin] = b.scheduled_time.split(":").map(Number);
          return aHour * 60 + aMin - (bHour * 60 + bMin);
        });

      return {
        member,
        appointments: memberAppointments,
      };
    });

    return {
      date,
      dateStr,
      byTeamMember,
    };
  });

  const formatTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${min.toString().padStart(2, "0")} ${period}`;
  };

  return (
    <div className="space-y-4 w-full overflow-x-hidden">
      {groupedAppointments.map(({ date, dateStr, byTeamMember }) => {
        const hasAppointments = byTeamMember.some(
          (group) => group.appointments.length > 0
        );

        return (
          <div key={dateStr} className="w-full">
            {/* Date Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 py-3 px-4 mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {isToday(date)
                      ? "Today"
                      : format(date, "EEEE, MMMM d")}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {format(date, "yyyy")}
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  {byTeamMember.reduce(
                    (sum, group) => sum + group.appointments.length,
                    0
                  )}{" "}
                  appointment
                  {byTeamMember.reduce(
                    (sum, group) => sum + group.appointments.length,
                    0
                  ) !== 1
                    ? "s"
                    : ""}
                </div>
              </div>
            </div>

            {/* Appointments List */}
            {!hasAppointments ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">No appointments scheduled</p>
                <button
                  onClick={() => {
                    const defaultTime = "09:00";
                    const defaultMemberId = teamMembers[0]?.id || "";
                    onTimeSlotClick?.(date, defaultTime, defaultMemberId);
                  }}
                  className="mt-2 text-sm text-[#FF0077] hover:underline"
                >
                  Add appointment
                </button>
              </div>
            ) : (
              <div className="space-y-3 px-4">
                {byTeamMember.map(({ member, appointments: memberAppts }) => {
                  if (memberAppts.length === 0) return null;

                  return (
                    <div key={member.id} className="space-y-2">
                      {/* Team Member Header */}
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-[#FF0077]" />
                        </div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {member.name}
                        </h4>
                        <span className="text-xs text-gray-500">
                          ({memberAppts.length})
                        </span>
                      </div>

                      {/* Appointments for this team member */}
                      <div className="space-y-2 ml-10">
                        {memberAppts.map((apt) => {
                          const style = getAppointmentStyle(apt.status);
                          const StatusIcon = style.icon;
                          const [_startHour, _startMin] = apt.scheduled_time
                            .split(":")
                            .map(Number);
                          const endTime = new Date(
                            parseISO(`${apt.scheduled_date}T${apt.scheduled_time}`)
                          );
                          endTime.setMinutes(
                            endTime.getMinutes() + apt.duration_minutes
                          );
                          const endTimeStr = format(endTime, "h:mm a");

                          return (
                            <button
                              key={apt.id}
                              onClick={() => onAppointmentClick?.(apt)}
                              className={cn(
                                "w-full text-left rounded-lg p-3 border-2 transition-all",
                                "active:scale-[0.98] touch-manipulation",
                                "min-h-[80px] flex flex-col gap-1.5",
                                style.bg,
                                style.border,
                                style.text,
                                "shadow-sm hover:shadow-md"
                              )}
                            >
                              {/* Time and Status */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <StatusIcon className="w-4 h-4 flex-shrink-0" />
                                  <span className="text-sm font-semibold">
                                    {formatTime(apt.scheduled_time)} - {endTimeStr}
                                  </span>
                                </div>
                                <span className="text-xs opacity-90 capitalize">
                                  {apt.status.replace("_", " ")}
                                </span>
                              </div>

                              {/* Client Name */}
                              <div className="font-medium text-base">
                                {apt.client_name}
                              </div>

                              {/* Service Name */}
                              <div className="text-sm opacity-90">
                                {apt.service_name}
                              </div>

                              {/* Duration */}
                              <div className="text-xs opacity-75">
                                {apt.duration_minutes} minutes
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Add Appointment Button */}
                <button
                  onClick={() => {
                    const defaultTime = "09:00";
                    const defaultMemberId = teamMembers[0]?.id || "";
                    onTimeSlotClick?.(date, defaultTime, defaultMemberId);
                  }}
                  className="w-full mt-4 py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-[#FF0077] hover:text-[#FF0077] transition-colors touch-manipulation min-h-[44px]"
                >
                  + Add Appointment
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
