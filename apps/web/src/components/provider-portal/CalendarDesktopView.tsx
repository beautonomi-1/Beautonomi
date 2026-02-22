"use client";

import React, { useRef, useCallback, useEffect, useMemo, memo } from "react";
import type { Appointment, TeamMember, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { cn } from "@/lib/utils";
import { 
  isMangomintModeEnabled, 
  mapStatus, 
  AppointmentStatus 
} from "@/lib/scheduling/mangomintAdapter";
import { 
  getStatusColors, 
  getAppointmentVisualStyle,
} from "@/lib/scheduling/visualMapping";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import { 
  DraggableAppointment, 
  DroppableTimeSlot,
  DragGhostOverlay
} from "@/components/provider-portal/DragDropCalendar";
import { 
  Calendar as CalendarIcon, 
  ChevronDown,
  Ban,
  Coffee,
  Plus
} from "lucide-react";
import { 
  format, 
  isToday, 
  startOfWeek, 
  addDays,
  differenceInHours,
  getDay
} from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Union for calendar: time blocks (editable) and availability blocks (closed/break/maintenance). */
type CalendarBlock = (TimeBlock & { _source?: "time_block" }) | (AvailabilityBlockDisplay & { name?: string });

interface CalendarDesktopViewProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  timeBlocks?: TimeBlock[];
  availabilityBlocks?: AvailabilityBlockDisplay[];
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, teamMemberId: string) => void;
  onTimeBlockClick?: (timeBlock: TimeBlock) => void;
  onStaffFilterChange?: (staffIds: string[]) => void;
  onCheckout?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: Appointment["status"]) => void;
  onRefresh?: () => void;
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  onViewWeekSchedule?: (staffMember: TeamMember) => void;
  onPrintDaySchedule?: (staffMember: TeamMember) => void;
  onEditWorkHours?: (staffMember: TeamMember) => void;
  onSetDayOff?: (staffMember: TeamMember) => void;
}

// Mangomint-inspired service color palette
const SERVICE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  haircut: { bg: "#7dd3d8", border: "#5fc4c9", text: "#1a3a4a" },
  cut: { bg: "#7dd3d8", border: "#5fc4c9", text: "#1a3a4a" },
  color: { bg: "#f8d59f", border: "#e8c57a", text: "#6b5520" },
  highlight: { bg: "#ffe0b2", border: "#ffca80", text: "#6b4520" },
  balayage: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  process: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  double: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  single: { bg: "#c8e6c9", border: "#a5d6a7", text: "#2e5a2f" },
  facial: { bg: "#e0e0e0", border: "#bdbdbd", text: "#424242" },
  manicure: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  pedicure: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  nail: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  massage: { bg: "#c8e6c9", border: "#a5d6a7", text: "#2e5a2f" },
  wax: { bg: "#ffccbc", border: "#ffab91", text: "#5a3020" },
  brow: { bg: "#d7ccc8", border: "#bcaaa4", text: "#4e342e" },
  lash: { bg: "#d7ccc8", border: "#bcaaa4", text: "#4e342e" },
  correction: { bg: "#b3d1f2", border: "#81aee8", text: "#1a3a5a" },
  treatment: { bg: "#ce93d8", border: "#ba68c8", text: "#4a148c" },
  refresh: { bg: "#80deea", border: "#4dd0e1", text: "#006064" },
  signature: { bg: "#ffab91", border: "#ff8a65", text: "#bf360c" },
  conditioning: { bg: "#a5d6a7", border: "#81c784", text: "#1b5e20" },
  blowout: { bg: "#b0bec5", border: "#90a4ae", text: "#37474f" },
  default: { bg: "#e8e8e8", border: "#d0d0d0", text: "#424242" },
};

// Get color based on service name keywords
const getServiceColor = (serviceName: string) => {
  const lowerName = serviceName.toLowerCase();
  for (const [keyword, colors] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(keyword)) return colors;
  }
  return SERVICE_COLORS.default;
};

// Status configuration (legacy - used when Mangomint mode is disabled)
const _STATUS_CONFIG = {
  booked: { label: "Confirmed", color: "bg-emerald-500", textColor: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  pending: { label: "Pending", color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  started: { label: "In Service", color: "bg-pink-500", textColor: "text-pink-700", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
  completed: { label: "Completed", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  cancelled: { label: "Cancelled", color: "bg-gray-400", textColor: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
  no_show: { label: "No Show", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
};

// Get appointment colors based on mode and preferences
const getAppointmentColors = (
  apt: Appointment, 
  useMangomintMode: boolean, 
  colorBy: "status" | "service" | "team_member" = "status",
  showCanceled: boolean = true
): { bg: string; border: string; text: string; opacity?: number; hidden?: boolean } => {
  if (!useMangomintMode) {
    // Legacy color system based on service name
    const colors = getServiceColor(apt.service_name);
    // Override colors based on status (like Mangomint)
    if (apt.status === "completed") {
      return { bg: "#d1fae5", border: "#10b981", text: "#065f46" }; // Green
    } else if (apt.status === "started") {
      return { bg: "#fce7f3", border: "#ec4899", text: "#831843" }; // Pink
    } else if (apt.status === "cancelled") {
      return { bg: "#f3f4f6", border: "#9ca3af", text: "#4b5563", opacity: 0.6 }; // Gray
    } else if (apt.status === "pending") {
      return { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" }; // Amber
    }
    return colors;
  }
  
  // Mangomint mode: Use visual mapping
  const mangomintStatus = mapStatus(apt);
  
  // Check if canceled and should be hidden
  if (mangomintStatus === AppointmentStatus.CANCELED && !showCanceled) {
    return { bg: "transparent", border: "transparent", text: "transparent", hidden: true };
  }
  
  const visualStyle = getAppointmentVisualStyle(mangomintStatus, apt.service_name, {
    colorBy: colorBy === "team_member" ? "status" : colorBy,
    showCanceled,
  });
  
  return {
    bg: visualStyle.backgroundColor,
    border: visualStyle.borderColor,
    text: visualStyle.textColor,
    opacity: visualStyle.opacity,
    hidden: apt.status === "cancelled" && !showCanceled,
  };
};

// Generate time slots
const generateTimeSlots = (startHour: number, endHour: number) => {
  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
  }
  return slots;
};

// Day name to key mapping
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Check if a time is outside operating hours for a given date (location)
const isOutsideOperatingHours = (
  date: Date,
  hour: number,
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null
): boolean => {
  if (!locationOperatingHours) return false;

  const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, etc.
  const dayKey = DAY_NAMES[dayOfWeek];
  const dayHours = locationOperatingHours[dayKey];

  if (!dayHours || dayHours.closed) {
    return true; // Closed all day
  }

  const [openHour] = dayHours.open.split(":").map(Number);
  const [closeHour] = dayHours.close.split(":").map(Number);

  return hour < openHour || hour >= closeHour;
};

// Check if a time is outside staff working hours for a given date (staff-specific)
const isOutsideStaffHours = (
  date: Date,
  hour: number,
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null
): boolean => {
  if (!staffWorkingHours || Object.keys(staffWorkingHours).length === 0) return false;

  const dayOfWeek = getDay(date);
  const dayKey = DAY_NAMES[dayOfWeek];
  const dayHours = staffWorkingHours[dayKey];

  if (!dayHours || dayHours.closed) {
    return true; // Staff not working this day
  }

  const [openHour] = dayHours.open.split(":").map(Number);
  const [closeHour] = dayHours.close.split(":").map(Number);
  return hour < openHour || hour >= closeHour;
};

// Parse scheduled_time to hour and minute (24h). Handles "HH:mm", "HH:mm:ss", and edge cases.
const parseScheduledTime = (time: string | undefined): { hour: number; minute: number } => {
  const fallback = { hour: 9, minute: 0 };
  if (!time || typeof time !== "string") return fallback;
  const parts = time.trim().split(":").map((p) => parseInt(p, 10));
  const hour = Number.isFinite(parts[0]) ? Math.max(0, Math.min(23, parts[0])) : fallback.hour;
  const minute = Number.isFinite(parts[1]) ? Math.max(0, Math.min(59, parts[1])) : fallback.minute;
  return { hour, minute };
};

// Format time for display
const formatTime12h = (time: string) => {
  const { hour, minute } = parseScheduledTime(time);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
};

// Show NEW badge only when: created within 24 hours AND status is still active (not completed/cancelled/no_show)
const isNewBooking = (createdDate: string, status?: string) => {
  const completedStatuses = ["completed", "cancelled", "no_show"];
  if (status && completedStatuses.includes(status)) return false;
  const created = new Date(createdDate);
  const now = new Date();
  return differenceInHours(now, created) < 24;
};

function CalendarDesktopViewComponent({
  appointments,
  teamMembers,
  timeBlocks = [],
  availabilityBlocks = [],
  selectedDate,
  view,
  onAppointmentClick,
  onTimeSlotClick,
  onTimeBlockClick,
  onStaffFilterChange: _onStaffFilterChange,
  onCheckout: _onCheckout,
  onStatusChange: _onStatusChange,
  onRefresh: _onRefresh,
  startHour = 8,
  endHour = 20,
  locationOperatingHours,
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
}: CalendarDesktopViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLDivElement>(null);
  
  // Mangomint mode preferences
  const { preferences, isLoaded: _prefsLoaded } = useCalendarPreferences();
  const useMangomintMode = isMangomintModeEnabled();

  const timeSlots = generateTimeSlots(startHour, endHour);
  const HOUR_HEIGHT = 60; // Height of each hour slot in pixels
  const TIME_COLUMN_WIDTH = 70;

  // Get dates for the current view
  const getDatesForView = useCallback(() => {
    const dates: Date[] = [];
    const start = new Date(selectedDate);
    
    if (view === "day") {
      dates.push(new Date(start));
    } else if (view === "3-days") {
      for (let i = 0; i < 3; i++) {
        dates.push(addDays(start, i));
      }
    } else {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      for (let i = 0; i < 7; i++) {
        dates.push(addDays(weekStart, i));
      }
    }
    return dates;
  }, [selectedDate, view]);

  const dates = getDatesForView();

  // Memoize appointments and time blocks by staff and date for performance.
  // Use __unassigned__ for appointments with empty team_member_id so they show in an Unassigned column.
  const UNASSIGNED_ID = "__unassigned__";
  // Normalize date to yyyy-MM-dd (API may return ISO string like "2025-02-12T00:00:00.000Z")
  const toDateStr = (d: string) => d && d.length >= 10 ? d.slice(0, 10) : d;

  const appointmentsByStaffAndDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach(apt => {
      const staffKey = apt.team_member_id ? String(apt.team_member_id) : UNASSIGNED_ID;
      const dateStr = toDateStr(apt.scheduled_date || "");
      const key = `${staffKey}-${dateStr}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(apt);
    });
    return map;
  }, [appointments]);

  const timeBlocksByStaffAndDate = useMemo(() => {
    const map = new Map<string, TimeBlock[]>();
    timeBlocks.forEach(block => {
      const key = `${block.team_member_id ?? "__all__"}-${block.date}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(block);
    });
    return map;
  }, [timeBlocks]);

  // Availability blocks by staff and date (staff_id null = applies to all staff)
  const availabilityBlocksByStaffAndDate = useMemo(() => {
    const map = new Map<string, AvailabilityBlockDisplay[]>();
    availabilityBlocks.forEach(block => {
      const dateStr = block.date;
      if (block.team_member_id) {
        const key = `${block.team_member_id}-${dateStr}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(block);
      } else {
        // Applies to all staff: add to every team member we'll look up (we'll use __all__ key and merge in getter)
        const key = `__all__-${dateStr}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(block);
      }
    });
    return map;
  }, [availabilityBlocks]);

  // Get appointments for a specific staff member and date (optimized with memoized map)
  const getAppointmentsForStaffAndDate = useCallback((staffId: string, date: Date): Appointment[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${staffId}-${dateStr}`;
    return appointmentsByStaffAndDate.get(key) || [];
  }, [appointmentsByStaffAndDate]);

  // Get all blocks (time blocks + availability blocks) for a staff member and date
  const getBlocksForStaffAndDate = useCallback(
    (staffId: string, date: Date): CalendarBlock[] => {
      const dateStr = format(date, "yyyy-MM-dd");
      const time = timeBlocksByStaffAndDate.get(`${staffId}-${dateStr}`) || [];
      const staffAvail = availabilityBlocksByStaffAndDate.get(`${staffId}-${dateStr}`) || [];
      const allStaffAvail = availabilityBlocksByStaffAndDate.get(`__all__-${dateStr}`) || [];
      const availability = [...staffAvail, ...allStaffAvail];
      return [
        ...time.map((t) => ({ ...t, _source: "time_block" as const })),
        ...availability.map((a) => ({ ...a, name: a.reason || a.block_type })),
      ];
    },
    [timeBlocksByStaffAndDate, availabilityBlocksByStaffAndDate]
  );

  // For day view: include "Unassigned" column and any staff with appointments who aren't in teamMembers
  const displayMembersForDayView = useMemo(() => {
    if (view !== "day") return teamMembers;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const memberIds = new Set(teamMembers.map(m => m.id));
    const orphans: TeamMember[] = [];

    // Add Unassigned column if we have appointments with no team member
    const unassignedKey = `${UNASSIGNED_ID}-${dateStr}`;
    const unassignedAppts = appointmentsByStaffAndDate.get(unassignedKey) ?? [];
    const hasUnassigned = unassignedAppts.length > 0;
    const unassignedMember: TeamMember = {
      id: UNASSIGNED_ID,
      name: "Unassigned",
      role: "employee",
      email: "",
      mobile: "",
      is_active: true,
    };

    // Add columns for staff who have appointments but aren't in teamMembers (e.g. from other locations)
    appointmentsByStaffAndDate.forEach((apts, key) => {
      const parts = key.split("-");
      const aptDate = parts.length >= 3 ? parts.slice(-3).join("-") : ""; // yyyy-MM-dd
      const staffId = parts.length >= 3 ? parts.slice(0, -3).join("-") : key.split("-")[0] ?? "";
      if (staffId === UNASSIGNED_ID || !staffId || aptDate !== dateStr) return;
      if (memberIds.has(staffId)) return;
      const first = apts[0];
      orphans.push({
        id: staffId,
        name: first?.team_member_name || "Staff",
        role: "employee",
        email: "",
        mobile: "",
        is_active: true,
      });
      memberIds.add(staffId); // avoid duplicates
    });

    const result: TeamMember[] = [];
    if (hasUnassigned) result.push(unassignedMember);
    result.push(...teamMembers);
    result.push(...orphans);
    return result;
  }, [teamMembers, selectedDate, view, appointmentsByStaffAndDate]);

  // Get time blocks only (for places that need TimeBlock[] e.g. conflict checks). Includes blocks for this staff + blocks with no staff (all).
  const _getTimeBlocksForStaffAndDate = useCallback((staffId: string, date: Date): TimeBlock[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const staffKey = `${staffId}-${dateStr}`;
    const allKey = `__all__-${dateStr}`;
    return [...(timeBlocksByStaffAndDate.get(staffKey) || []), ...(timeBlocksByStaffAndDate.get(allKey) || [])];
  }, [timeBlocksByStaffAndDate]);

  // Handle appointment click - always use parent's callback
  const handleAppointmentClick = (apt: Appointment) => {
    if (onAppointmentClick) {
      onAppointmentClick(apt);
    }
  };

  // Current time indicator position
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const showCurrentTime = dates.some(d => isToday(d)) && currentHour >= startHour && currentHour <= endHour;
  const currentTimeTop = ((currentHour - startHour) * HOUR_HEIGHT) + ((currentMinute / 60) * HOUR_HEIGHT);

  // Scroll to show appointments and current time - prefer showing morning appointments
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl || !dates.some(d => isToday(d))) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    let earliestTop = Infinity;
    appointments.forEach((apt) => {
      if (toDateStr(apt.scheduled_date || "") !== dateStr) return;
      const { hour: h, minute: m } = parseScheduledTime(apt.scheduled_time);
      const top = ((h - startHour) * HOUR_HEIGHT) + ((m / 60) * HOUR_HEIGHT);
      if (top < earliestTop) earliestTop = top;
    });

    const scrollTarget = Math.min(
      earliestTop < Infinity ? Math.max(0, earliestTop - 40) : Infinity,
      showCurrentTime ? currentTimeTop - 60 : Infinity,
      scrollEl.scrollHeight
    );

    setTimeout(() => {
      if (scrollTarget < Infinity) {
        scrollEl.scrollTop = Math.max(0, scrollTarget);
      } else if (showCurrentTime && currentTimeRef.current) {
        currentTimeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  }, [dates, appointments, selectedDate, startHour, showCurrentTime, currentTimeTop]);

  // For day view, show all staff side by side
  const isMultiStaffView = view === "day";
  const _staffCount = teamMembers.length || 1;

  // Calculate appointment end time
  const getEndTime = (startTime: string, durationMinutes: number) => {
    const [hour, min] = startTime.split(":").map(Number);
    const endMinutes = hour * 60 + min + durationMinutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-1 h-full min-h-0 w-full max-w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden box-border">
      {/* Main Calendar Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Row - Staff columns */}
        <div className="flex border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white flex-shrink-0">
          {/* Time Column Header */}
          <div 
            className="flex-shrink-0 border-r border-gray-200" 
            style={{ width: `${TIME_COLUMN_WIDTH}px` }}
          />
          
          {/* Staff/Date Headers */}
          {isMultiStaffView ? (
            displayMembersForDayView.map((member, idx) => {
              const memberAppts = getAppointmentsForStaffAndDate(member.id, selectedDate);
              const visibleAppts = useMangomintMode && !preferences.showCanceled
                ? memberAppts.filter(apt => apt.status !== "cancelled")
                : memberAppts;
              // Count unique bookings (multi-service = one row per service; user expects booking count)
              const uniqueBookingCount = new Set(
                visibleAppts.map(a => (a as { booking_id?: string }).booking_id || a.id)
              ).size;
              const memberBlocks = getBlocksForStaffAndDate(member.id, selectedDate);
              const hasContent = visibleAppts.length > 0 || memberBlocks.length > 0;
              return (
                <div
                  key={member.id}
                  className={cn(
                    "border-r border-gray-200 last:border-r-0 py-3 px-2",
                    "flex flex-col items-center gap-1 transition-all",
                    // Match column width logic from grid below
                    hasContent 
                      ? "flex-[2] min-w-[180px] max-w-[400px]" 
                      : "flex-1 min-w-[120px] max-w-[200px]"
                  )}
                >
                  {/* Staff Avatar with dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity focus:outline-none group">
                        <div className="relative">
                          <Avatar className="w-10 h-10 ring-2 ring-white shadow-md">
                            <AvatarImage src={member.avatar_url} />
                            <AvatarFallback 
                              className="text-white text-sm font-bold"
                              style={{ 
                                background: `linear-gradient(135deg, ${getStaffColor(idx).from}, ${getStaffColor(idx).to})` 
                              }}
                            >
                              {member.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          {uniqueBookingCount > 0 && (
                            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#FF0077] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                              {uniqueBookingCount}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700 group-hover:text-[#FF0077] transition-colors flex items-center gap-0.5">
                          {member.name.split(" ")[0]}
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-48">
                      <DropdownMenuItem 
                        onClick={() => onViewWeekSchedule?.(member)}
                        disabled={!onViewWeekSchedule}
                      >
                        View Week Schedule
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onPrintDaySchedule?.(member)}
                        disabled={!onPrintDaySchedule}
                      >
                        Print Day Schedule
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onEditWorkHours?.(member)}
                        disabled={!onEditWorkHours}
                      >
                        Edit Work Hours
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onSetDayOff?.(member)}
                        disabled={!onSetDayOff}
                      >
                        Set Day Off
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          ) : (
            dates.map((date, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex-1 min-w-[90px] max-w-[200px] border-r border-gray-200 last:border-r-0 py-3 text-center",
                  isToday(date) && "bg-[#FF0077]/5"
                )}
              >
                <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">
                  {format(date, "EEE")}
                </p>
                <p className={cn(
                  "text-xl font-bold mt-0.5",
                  isToday(date) ? "text-[#FF0077]" : "text-gray-900"
                )}>
                  {format(date, "d")}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Scrollable Time Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto relative">
          <div className="flex min-h-full">
            {/* Time Column */}
            <div 
              className="flex-shrink-0 border-r-2 border-gray-200 bg-gray-50/80 sticky left-0 z-10"
              style={{ width: `${TIME_COLUMN_WIDTH}px` }}
            >
              {timeSlots.map((time) => (
                <div
                  key={time}
                  className="border-b border-gray-200 flex items-start justify-end pr-2 pt-0"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-xs font-medium text-gray-400 -translate-y-2">
                    {formatTime12h(time)}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid Content */}
            <div className="flex-1 flex relative">
              {/* Current Time Indicator */}
              {showCurrentTime && (
                <div 
                  ref={currentTimeRef}
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop}px` }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-md" />
                    <div className="flex-1 h-[2px] bg-red-500 shadow-sm" />
                  </div>
                </div>
              )}
              
              {/* Drag Ghost Overlay */}
              <DragGhostOverlay hourHeight={HOUR_HEIGHT} startHour={startHour} />

              {isMultiStaffView ? (
                // Day view: Staff columns - columns shrink more naturally when empty
                displayMembersForDayView.map((member, _memberIdx) => {
                  const staffAppointments = getAppointmentsForStaffAndDate(member.id, selectedDate);
                  const staffBlocks = getBlocksForStaffAndDate(member.id, selectedDate);
                  const hasContent = staffAppointments.length > 0 || staffBlocks.length > 0;
                  
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "border-r border-gray-200 last:border-r-0 relative transition-all",
                        // Columns with content get more space, empty columns can shrink
                        hasContent 
                          ? "flex-[2] min-w-[180px] max-w-[400px]" 
                          : "flex-1 min-w-[120px] max-w-[200px]"
                      )}
                    >
                      {/* Time slot backgrounds with working hours shading */}
                      {timeSlots.map((time) => {
                        const hour = parseInt(time.split(":")[0]);
                        const isOutsideLocationHours = isOutsideOperatingHours(selectedDate, hour, locationOperatingHours);
                        const outsideStaffHours = isOutsideStaffHours(selectedDate, hour, member.working_hours ?? undefined);
                        const workStart = useMangomintMode ? (preferences.workdayStartHour ?? 8) : 8;
                        const workEnd = useMangomintMode ? (preferences.workdayEndHour ?? 20) : 20;
                        const isNonWorking = isOutsideLocationHours || outsideStaffHours || (hour < workStart || hour >= workEnd);
                        const isHighContrast = useMangomintMode && preferences.highContrast;
                        
                        return (
                          <DroppableTimeSlot
                            key={time}
                            date={format(selectedDate, "yyyy-MM-dd")}
                            time={time}
                            staffId={member.id}
                            className={cn(
                              "border-b border-gray-200 transition-colors relative group/slot",
                              isNonWorking 
                                ? "cursor-not-allowed opacity-30 bg-gray-200"
                                : "cursor-pointer hover:bg-gray-50/70"
                            )}
                          >
                            <div
                              className="relative"
                              style={{ 
                                height: `${HOUR_HEIGHT}px`,
                                backgroundColor: isNonWorking 
                                  ? (isHighContrast ? '#374151' : '#e5e7eb')
                                  : undefined,
                              }}
                              onClick={() => {
                                if (!isNonWorking) {
                                  onTimeSlotClick(selectedDate, time, member.id);
                                }
                              }}
                            >
                              {!isNonWorking && (
                                <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                                  <Plus className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              {isNonWorking && (
                                <div className="absolute inset-0 bg-gray-300/40 pointer-events-none" />
                              )}
                            </div>
                          </DroppableTimeSlot>
                        );
                      })}

                      {/* Time Blocks + Availability Blocks (closed/break/maintenance) - non-bookable */}
                      {staffBlocks.map((block) => {
                        const [hour, min] = block.start_time.split(":").map(Number);
                        const [endHourNum, endMinNum] = block.end_time.split(":").map(Number);
                        const durationMinutes = (endHourNum * 60 + endMinNum) - (hour * 60 + min);
                        const top = ((hour - startHour) * HOUR_HEIGHT) + ((min / 60) * HOUR_HEIGHT);
                        const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 28);

                        const isAvailabilityBlock = "_source" in block && block._source === "availability_block";
                        const blockTypeName = isAvailabilityBlock
                          ? (block.block_type ?? "")
                          : (block.blocked_time_type_name ?? (block as { blocked_time_type?: { name?: string } }).blocked_time_type?.name ?? "");
                        const isBreak = blockTypeName.toLowerCase().includes("break");
                        const isLunch = blockTypeName.toLowerCase().includes("lunch");
                        const isMeeting = blockTypeName.toLowerCase().includes("meeting");
                        const isUnavailable = isAvailabilityBlock && (block as AvailabilityBlockDisplay).block_type === "unavailable";
                        const isMaintenance = isAvailabilityBlock && (block as AvailabilityBlockDisplay).block_type === "maintenance";

                        const blockColors = useMangomintMode ? {
                          bg: isUnavailable ? "#E5E7EB" : isBreak || isLunch ? "#FEF3C7" : isMaintenance ? "#DBEAFE" : isMeeting ? "#DBEAFE" : "#E5E7EB",
                          border: isUnavailable ? "#9CA3AF" : isBreak || isLunch ? "#F59E0B" : isMaintenance ? "#3B82F6" : isMeeting ? "#3B82F6" : "#9CA3AF",
                          text: isUnavailable ? "#4B5563" : isBreak || isLunch ? "#92400E" : isMaintenance ? "#1E40AF" : isMeeting ? "#1E40AF" : "#4B5563",
                        } : {
                          bg: "#f0f0f0",
                          border: "#9ca3af",
                          text: "#6b7280",
                        };

                        const label = "name" in block ? (block.name || blockTypeName || "Blocked") : (blockTypeName || "Blocked");

                        return (
                          <div
                            key={`block-${block.id}`}
                            className={cn(
                              "absolute left-1 right-1 rounded-md px-2 py-1 transition-opacity",
                              !isAvailabilityBlock && "cursor-pointer hover:opacity-90"
                            )}
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              minHeight: "28px",
                              backgroundColor: blockColors.bg,
                              backgroundImage: useMangomintMode
                                ? undefined
                                : "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 6px)",
                              borderLeft: `3px solid ${blockColors.border}`,
                            }}
                            onClick={() => !isAvailabilityBlock && onTimeBlockClick?.(block as TimeBlock)}
                          >
                            <div className="flex items-center gap-1">
                              {isBreak || isLunch ? (
                                <Coffee className="w-3 h-3 shrink-0" style={{ color: blockColors.text }} />
                              ) : (
                                <Ban className="w-3 h-3 shrink-0" style={{ color: blockColors.text }} />
                              )}
                              <span
                                className="text-xs font-medium truncate"
                                style={{ color: blockColors.text }}
                              >
                                {label}
                              </span>
                            </div>
                            {height > 40 && (
                              <p className="text-[10px] mt-0.5 opacity-70" style={{ color: blockColors.text }}>
                                {block.start_time} - {block.end_time}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {/* Appointments */}
                      {staffAppointments
                        .filter(apt => {
                          // Filter out canceled appointments if preference is set
                          if (useMangomintMode && apt.status === "cancelled" && !preferences.showCanceled) {
                            return false;
                          }
                          return true;
                        })
                        .map((apt) => {
                        const { hour, minute: min } = parseScheduledTime(apt.scheduled_time);
                        const top = ((hour - startHour) * HOUR_HEIGHT) + ((min / 60) * HOUR_HEIGHT);
                        const height = Math.max((apt.duration_minutes / 60) * HOUR_HEIGHT, 36);
                        
                        // Use Mangomint color system when enabled
                        const colors = getAppointmentColors(
                          apt, 
                          useMangomintMode, 
                          preferences.colorBy,
                          preferences.showCanceled
                        );
                        if (colors.hidden) return null;

                        const endTime = getEndTime(apt.scheduled_time || "09:00", apt.duration_minutes);
                        const isNew = isNewBooking(apt.created_date, apt.status);
                        const isCanceled = apt.status === "cancelled";

                        return (
                          <DraggableAppointment
                            key={apt.id}
                            appointment={apt}
                            className={cn(
                              "absolute left-1 right-1 rounded-md z-10",
                              "transition-all duration-150 hover:shadow-lg hover:z-30 hover:scale-[1.02]",
                              "overflow-hidden group",
                              isCanceled && useMangomintMode && "opacity-50"
                            )}
                            style={{ position: "absolute", top: `${top}px` }}
                          >
                            <div
                              style={{
                                position: 'relative',
                                height: `${height}px`,
                                minHeight: "36px",
                                backgroundColor: colors.bg,
                                borderLeft: `4px solid ${colors.border}`,
                                opacity: colors.opacity,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAppointmentClick(apt);
                              }}
                            >
                                <div className="px-2 py-1 h-full flex flex-col">
                                  {/* Status / NEW badges - top right */}
                                  <div className="absolute top-1 right-1 flex items-center gap-1 flex-wrap justify-end max-w-full">
                                    {isNew && (
                                      <span 
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                        style={{ backgroundColor: colors.border, color: "#fff" }}
                                      >
                                        NEW
                                      </span>
                                    )}
                                    {apt.status !== "booked" && (() => {
                                      const mangomintStatus = mapStatus(apt);
                                      const statusConfig = getStatusColors(mangomintStatus);
                                      return (
                                        <span 
                                          className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0", statusConfig.badgeClasses)}
                                        >
                                          {statusConfig.label.toUpperCase()}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  
                                  {height >= 48 ? (
                                    <>
                                      <p 
                                        className="text-[10px] font-bold uppercase tracking-wide leading-tight truncate"
                                        style={{ color: colors.text }}
                                      >
                                        {apt.service_name}
                                      </p>
                                      <p 
                                        className="text-sm font-bold truncate leading-tight"
                                        style={{ color: colors.text }}
                                      >
                                        {apt.client_name}
                                      </p>
                                      <p 
                                        className="text-[10px] opacity-70 mt-auto"
                                        style={{ color: colors.text }}
                                      >
                                        {formatTime12h(apt.scheduled_time)} - {formatTime12h(endTime)}
                                        {preferences.showPrices && (apt.price != null || (apt as any).total_amount != null) && (
                                          <span className="ml-1 font-semibold">
                                            · R{((apt as any).total_amount ?? apt.price ?? 0).toFixed(0)}
                                          </span>
                                        )}
                                      </p>
                                    </>
                                  ) : (
                                    <div className="flex items-center h-full">
                                      <span 
                                        className="text-xs font-bold truncate"
                                        style={{ color: colors.text }}
                                      >
                                        {apt.client_name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                            </div>
                          </DraggableAppointment>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                // Week view: Date columns
                dates.map((date, dateIdx) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const dateAppointments = appointments.filter(apt => toDateStr(apt.scheduled_date || "") === dateStr);
                  const dateTimeBlocks = timeBlocks.filter(block => block.date === dateStr);
                  const dateAvailabilityBlocks = availabilityBlocks.filter(b => b.date === dateStr);
                  const dateBlocks: CalendarBlock[] = [
                    ...dateTimeBlocks.map((t) => ({ ...t, _source: "time_block" as const })),
                    ...dateAvailabilityBlocks.map((a) => ({ ...a, name: a.reason || a.block_type })),
                  ];

                  return (
                    <div
                      key={dateIdx}
                      className={cn(
                        "flex-1 min-w-[90px] max-w-[200px] border-r border-gray-200 last:border-r-0 relative",
                        isToday(date) && "bg-[#FF0077]/3"
                      )}
                    >
                      {/* Time slot backgrounds */}
                      {timeSlots.map((time) => {
                        const hour = parseInt(time.split(":")[0]);
                        const isOutsideLocationHours = isOutsideOperatingHours(date, hour, locationOperatingHours);
                        const workStart = useMangomintMode ? (preferences.workdayStartHour ?? 8) : 8;
                        const workEnd = useMangomintMode ? (preferences.workdayEndHour ?? 20) : 20;
                        const isNonWorking = isOutsideLocationHours || (hour < workStart || hour >= workEnd);
                        const isHighContrast = useMangomintMode && preferences.highContrast;
                        const staffId = teamMembers[0]?.id || "";
                        
                        return (
                          <DroppableTimeSlot
                            key={time}
                            date={dateStr}
                            time={time}
                            staffId={staffId}
                            className={cn(
                              "border-b border-gray-200 transition-colors relative group/slot",
                              isNonWorking 
                                ? "cursor-not-allowed opacity-30 bg-gray-200"
                                : "cursor-pointer hover:bg-gray-50/50"
                            )}
                          >
                            <div
                              className="relative"
                              style={{ 
                                height: `${HOUR_HEIGHT}px`,
                                backgroundColor: isNonWorking 
                                  ? (isHighContrast ? '#374151' : '#e5e7eb')
                                  : undefined,
                              }}
                              onClick={() => {
                                if (!isNonWorking) {
                                  onTimeSlotClick(date, time, staffId);
                                }
                              }}
                            >
                              {!isNonWorking && (
                                <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                                  <Plus className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              {isNonWorking && (
                                <div className="absolute inset-0 bg-gray-300/40 pointer-events-none" />
                              )}
                            </div>
                          </DroppableTimeSlot>
                        );
                      })}

                      {/* Time + Availability blocks (non-bookable) in week view */}
                      {dateBlocks.map((block) => {
                        const [hour, min] = block.start_time.split(":").map(Number);
                        const [endHourNum, endMinNum] = block.end_time.split(":").map(Number);
                        const durationMinutes = (endHourNum * 60 + endMinNum) - (hour * 60 + min);
                        const top = ((hour - startHour) * HOUR_HEIGHT) + ((min / 60) * HOUR_HEIGHT);
                        const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 24);
                        const isAvailabilityBlock = "_source" in block && block._source === "availability_block";
                        const blockTypeName = isAvailabilityBlock ? (block.block_type ?? "") : (block.blocked_time_type_name ?? "");
                        const isBreak = blockTypeName.toLowerCase().includes("break");
                        const isUnavailable = isAvailabilityBlock && (block as AvailabilityBlockDisplay).block_type === "unavailable";
                        const blockColors = isUnavailable ? { bg: "#E5E7EB", border: "#9CA3AF", text: "#4B5563" } : isBreak ? { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" } : { bg: "#f0f0f0", border: "#9ca3af", text: "#6b7280" };
                        const label = "name" in block ? (block.name || blockTypeName || "Blocked") : (blockTypeName || "Blocked");
                        return (
                          <div
                            key={`block-${block.id}`}
                            className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 z-[5]"
                            style={{ top: `${top}px`, height: `${height}px`, minHeight: "24px", backgroundColor: blockColors.bg, borderLeft: `3px solid ${blockColors.border}` }}
                          >
                            <span className="text-[10px] font-medium truncate block" style={{ color: blockColors.text }}>{label}</span>
                          </div>
                        );
                      })}

                      {/* Appointments */}
                      {dateAppointments
                        .filter(apt => {
                          // Filter out canceled appointments if preference is set
                          if (useMangomintMode && apt.status === "cancelled" && !preferences.showCanceled) {
                            return false;
                          }
                          return true;
                        })
                        .map((apt) => {
                        const { hour, minute: min } = parseScheduledTime(apt.scheduled_time);
                        const top = ((hour - startHour) * HOUR_HEIGHT) + ((min / 60) * HOUR_HEIGHT);
                        const height = Math.max((apt.duration_minutes / 60) * HOUR_HEIGHT, 24);
                        
                        // Use Mangomint color system when enabled
                        const colors = getAppointmentColors(
                          apt, 
                          useMangomintMode, 
                          preferences.colorBy,
                          preferences.showCanceled
                        );
                        if (colors.hidden) return null;
                        const isCanceled = apt.status === "cancelled";

                        return (
                          <DraggableAppointment
                            key={apt.id}
                            appointment={apt}
                            className={cn(
                              "absolute left-0.5 right-0.5 rounded px-1 py-0.5 hover:shadow-md hover:z-10 transition-all z-10",
                              isCanceled && useMangomintMode && "opacity-50"
                            )}
                            style={{ top: `${top}px` }}
                          >
                            <div
                              style={{
                                position: 'relative',
                                height: `${height}px`,
                                minHeight: "24px",
                                backgroundColor: colors.bg,
                                borderLeft: `3px solid ${colors.border}`,
                                opacity: colors.opacity,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAppointmentClick(apt);
                              }}
                            >
                              {apt.status !== "booked" && (() => {
                                const mangomintStatus = mapStatus(apt);
                                const statusConfig = getStatusColors(mangomintStatus);
                                return (
                                  <span 
                                    className={cn("absolute top-0.5 right-0.5 text-[8px] font-semibold px-1 py-0 rounded", statusConfig.badgeClasses)}
                                  >
                                    {statusConfig.label}
                                  </span>
                                );
                              })()}
                              <p 
                                className={cn(
                                  "text-[10px] font-bold truncate",
                                  isCanceled && useMangomintMode && "line-through"
                                )}
                                style={{ color: colors.text }}
                              >
                                {apt.client_name}
                              </p>
                            </div>
                          </DraggableAppointment>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Note: Sidebar is now handled by the parent component's AppointmentSidebar from components/appointments */}

      {/* Empty State - hide when we have columns to show (e.g. Unassigned with appointments) */}
      {displayMembersForDayView.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <div className="text-center p-8">
            <CalendarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Team Members</h3>
            <p className="text-gray-500 text-sm max-w-sm">
              Add team members in Settings → Team to start scheduling appointments.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const CalendarDesktopView = memo(CalendarDesktopViewComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Re-render if critical props changed
  if (
    prevProps.appointments.length !== nextProps.appointments.length ||
    prevProps.teamMembers.length !== nextProps.teamMembers.length ||
    prevProps.timeBlocks?.length !== nextProps.timeBlocks?.length ||
    prevProps.selectedDate.getTime() !== nextProps.selectedDate.getTime() ||
    prevProps.view !== nextProps.view ||
    prevProps.startHour !== nextProps.startHour ||
    prevProps.endHour !== nextProps.endHour
  ) {
    return false; // Props changed, re-render
  }
  // Also re-render if appointment IDs or dates changed (handles cache refresh)
  const prevIds = prevProps.appointments.map(a => `${a.id}-${a.scheduled_date}-${a.scheduled_time}`).join(",");
  const nextIds = nextProps.appointments.map(a => `${a.id}-${a.scheduled_date}-${a.scheduled_time}`).join(",");
  if (prevIds !== nextIds) return false;
  return true; // Props are the same, skip re-render
});

CalendarDesktopView.displayName = 'CalendarDesktopView';

// Staff color gradients
function getStaffColor(index: number) {
  const colors = [
    { from: "#FF0077", to: "#FF6B35" }, // Pink to orange
    { from: "#7C3AED", to: "#A855F7" }, // Purple
    { from: "#0891B2", to: "#06B6D4" }, // Cyan
    { from: "#059669", to: "#10B981" }, // Green
    { from: "#D946EF", to: "#F472B6" }, // Magenta
    { from: "#F59E0B", to: "#FBBF24" }, // Amber
    { from: "#6366F1", to: "#818CF8" }, // Indigo
    { from: "#EC4899", to: "#F472B6" }, // Pink
  ];
  return colors[index % colors.length];
}
