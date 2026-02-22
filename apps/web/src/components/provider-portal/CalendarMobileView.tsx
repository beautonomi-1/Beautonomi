"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Appointment, TeamMember, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { cn } from "@/lib/utils";
import { 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  User,
  Phone,
  Mail,
  MoreVertical,
  Repeat,
  Users,
  Printer,
  CreditCard,
  Bell,
  Trash2,
  Edit,
  MapPin,
  MessageCircle,
  Check,
  X,
  LayoutGrid
} from "lucide-react";
import { 
  format, 
  isToday, 
  isSameDay, 
  startOfWeek, 
  addDays,
  getDay
} from "date-fns";
import { mapStatus, extractIconFlags } from "@/lib/scheduling/mangomintAdapter";
import { getStatusColors, getActiveIcons } from "@/lib/scheduling/visualMapping";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DirectionsLink } from "@/components/ui/directions-link";

interface CalendarMobileViewProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view?: "day" | "week";
  onDateChange: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, teamMemberId: string) => void;
  onAddAppointment: () => void;
  onFilterClick?: () => void;
  onViewChange?: (view: "day" | "week") => void;
  onCheckout?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: Appointment["status"]) => void;
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  availabilityBlocks?: AvailabilityBlockDisplay[];
  onViewWeekSchedule?: (staffMember: TeamMember) => void;
  onPrintDaySchedule?: (staffMember: TeamMember) => void;
  onEditWorkHours?: (staffMember: TeamMember) => void;
  onSetDayOff?: (staffMember: TeamMember) => void;
  selectedTeamMemberId?: string | null;
  onClearStaffFilter?: () => void;
}

// Layout modes for mobile calendar
type MobileLayoutMode = "single" | "columns";

// Service-based color mapping for visual variety (Mangomint-inspired)
const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  haircut: { bg: "bg-cyan-500", text: "text-white", border: "border-cyan-600" },
  color: { bg: "bg-amber-200", text: "text-amber-900", border: "border-amber-300" },
  highlight: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  facial: { bg: "bg-gray-300", text: "text-gray-800", border: "border-gray-400" },
  manicure: { bg: "bg-blue-200", text: "text-blue-900", border: "border-blue-300" },
  pedicure: { bg: "bg-blue-200", text: "text-blue-900", border: "border-blue-300" },
  massage: { bg: "bg-green-200", text: "text-green-900", border: "border-green-300" },
  waxing: { bg: "bg-pink-200", text: "text-pink-900", border: "border-pink-300" },
  makeup: { bg: "bg-purple-200", text: "text-purple-900", border: "border-purple-300" },
  balayage: { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-200" },
  default: { bg: "bg-cyan-500", text: "text-white", border: "border-cyan-600" },
};

// Status configuration - matches desktop view
const STATUS_CONFIG: Record<string, { 
  color: string; 
  bgColor: string; 
  borderColor: string;
  textColor: string;
  label: string 
}> = {
  booked: { 
    color: "bg-blue-500", 
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-700",
    label: "Confirmed" 
  },
  pending: { 
    color: "bg-amber-400", 
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    textColor: "text-amber-700",
    label: "Unconfirmed" 
  },
  started: { 
    color: "bg-pink-500", 
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    textColor: "text-pink-700",
    label: "In Service" 
  },
  completed: { 
    color: "bg-gray-400", 
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    textColor: "text-gray-700",
    label: "Completed" 
  },
  cancelled: { 
    color: "bg-red-500", 
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-700",
    label: "Cancelled" 
  },
  no_show: { 
    color: "bg-orange-500", 
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    textColor: "text-orange-700",
    label: "No Show" 
  },
};

// Show NEW badge only when: created within 24 hours AND status is still active (not completed/cancelled/no_show)
const isNewBooking = (createdDate: string, status?: string) => {
  const completedStatuses = ["completed", "cancelled", "no_show"];
  if (status && completedStatuses.includes(status)) return false;
  const created = new Date(createdDate);
  const now = new Date();
  const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
};

// Get color based on service name keywords
const _getServiceColor = (serviceName: string) => {
  const lowerName = serviceName.toLowerCase();
  for (const [keyword, colors] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(keyword)) return colors;
  }
  return SERVICE_COLORS.default;
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

  const dayOfWeek = getDay(date);
  const dayKey = DAY_NAMES[dayOfWeek];
  const dayHours = locationOperatingHours[dayKey];

  if (!dayHours || dayHours.closed) return true;

  const [openHour] = dayHours.open.split(":").map(Number);
  const [closeHour] = dayHours.close.split(":").map(Number);
  return hour < openHour || hour >= closeHour;
};

// Check if a time is outside staff working hours (staff-specific)
const isOutsideStaffHours = (
  date: Date,
  hour: number,
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null
): boolean => {
  if (!staffWorkingHours || Object.keys(staffWorkingHours).length === 0) return false;

  const dayOfWeek = getDay(date);
  const dayKey = DAY_NAMES[dayOfWeek];
  const dayHours = staffWorkingHours[dayKey];

  if (!dayHours || dayHours.closed) return true;

  const [openHour] = dayHours.open.split(":").map(Number);
  const [closeHour] = dayHours.close.split(":").map(Number);
  return hour < openHour || hour >= closeHour;
};

// Check if slot (date + hour) falls inside any availability block for this staff
const isSlotInAvailabilityBlock = (
  dateStr: string,
  hour: number,
  staffId: string,
  availabilityBlocks: AvailabilityBlockDisplay[]
): boolean => {
  const slotStart = hour * 60;
  const slotEnd = (hour + 1) * 60;
  return availabilityBlocks.some((b) => {
    if (b.date !== dateStr) return false;
    if (b.team_member_id != null && b.team_member_id !== staffId) return false;
    const [bStartH, bStartM] = b.start_time.split(":").map(Number);
    const [bEndH, bEndM] = b.end_time.split(":").map(Number);
    const blockStart = bStartH * 60 + bStartM;
    const blockEnd = bEndH * 60 + bEndM;
    return slotStart < blockEnd && slotEnd > blockStart;
  });
};

// Format time for display (12-hour format)
const formatTime12h = (time: string) => {
  const [hour, min] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${min.toString().padStart(2, "0")} ${period}`;
};

export function CalendarMobileView({
  appointments,
  teamMembers,
  selectedDate,
  view = "day",
  onDateChange,
  onAppointmentClick,
  onTimeSlotClick,
  onAddAppointment,
  onFilterClick,
  onViewChange,
  onCheckout: _onCheckout,
  onStatusChange: _onStatusChange,
  startHour = 8,
  endHour = 20,
  locationOperatingHours,
  availabilityBlocks = [],
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
  selectedTeamMemberId,
  onClearStaffFilter,
}: CalendarMobileViewProps) {
  const [selectedStaffIndex, setSelectedStaffIndex] = useState(0);
  const [layoutMode, setLayoutMode] = useState<MobileLayoutMode>("columns"); // Default to columns view like Mangomint
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLDivElement>(null);
  const dateSelectorRef = useRef<HTMLDivElement>(null);
  const _columnsScrollRef = useRef<HTMLDivElement>(null);
  
  // Touch handling for swipe navigation
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Reset staff index when team changes
  useEffect(() => {
    if (teamMembers.length > 0 && selectedStaffIndex >= teamMembers.length) {
      queueMicrotask(() => setSelectedStaffIndex(0));
    }
  }, [teamMembers.length, selectedStaffIndex]);

  // Scroll to current time on mount
  useEffect(() => {
    if (currentTimeRef.current && isToday(selectedDate)) {
      currentTimeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedDate]);

  const selectedStaff = teamMembers[selectedStaffIndex] || null;
  const timeSlots = generateTimeSlots(startHour, endHour);

  // Get dates for the scrollable date strip
  // For day view: show 2 weeks centered on selected date (14 days) for easy scrolling
  // For week view: show the 7 days of the current week
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: view === "week" ? 1 : 0 });
  const weekDates = view === "week" 
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : Array.from({ length: 14 }, (_, i) => addDays(selectedDate, i - 4)); // 4 days before, selected day, 9 days after
  
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  // Handle swipe navigation for date selector
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Only track if we have a start position
    if (touchStartX.current !== null) {
      touchEndX.current = e.targetTouches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) {
      touchStartX.current = null;
      touchEndX.current = null;
      return;
    }
    
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    // Only navigate if it's a clear swipe (not just scrolling)
    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // Swipe left - next day
        onDateChange(addDays(selectedDate, 1));
      } else {
        // Swipe right - previous day
        onDateChange(addDays(selectedDate, -1));
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };
  
  // Scroll to selected date when it changes
  useEffect(() => {
    if (dateSelectorRef.current && view === "day") {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const selectedButton = dateSelectorRef.current?.querySelector('[data-selected-date="true"]') as HTMLElement;
        if (selectedButton) {
          selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 100);
    }
  }, [selectedDate, view]);

  // Get appointments for a specific date/time/staff
  const _getAppointmentsForSlot = useCallback((
    date: Date,
    time: string,
    teamMemberId: string
  ): Appointment[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((apt) => {
      if (apt.scheduled_date !== dateStr || apt.team_member_id !== teamMemberId) {
        return false;
      }
      const [aptHour] = apt.scheduled_time.split(":").map(Number);
      const [slotHour] = time.split(":").map(Number);
      const endTime = aptHour + apt.duration_minutes / 60;
      return aptHour <= slotHour && slotHour < endTime;
    });
  }, [appointments]);

  // Count unique bookings for staff member on selected date (multi-service = one per service row)
  const toDateStr = (d: string) => d && d.length >= 10 ? d.slice(0, 10) : d || "";
  const getStaffAppointmentCount = (staffId: string) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const staffApts = appointments.filter(
      (apt) => apt.team_member_id === staffId && toDateStr(apt.scheduled_date || "") === dateStr
    );
    return new Set(staffApts.map((a) => (a as { booking_id?: string }).booking_id || a.id)).size;
  };

  // Handle appointment card click
  const handleAppointmentCardClick = (apt: Appointment) => {
    // Call the parent handler which will open the full AppointmentSidebar in Mangomint mode
    onAppointmentClick(apt);
  };

  // Current time indicator
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const showCurrentTime = isToday(selectedDate) && currentHour >= startHour && currentHour <= endHour;

  return (
    <div className="w-full bg-white relative box-border max-w-[100vw]">
      {/* Dark Header */}
      <div className="bg-[#1a1f3c] text-white w-full box-border">
        {/* Filter Banner - Show when single staff member is filtered */}
        {selectedTeamMemberId && selectedTeamMemberId !== "all" && onClearStaffFilter && (
          <div className="px-4 py-2.5 bg-blue-600 border-b border-blue-500 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <User className="w-4 h-4 flex-shrink-0 text-white" />
                <span className="text-sm font-semibold text-white truncate">
                  Viewing: {teamMembers.find(m => m.id === selectedTeamMemberId)?.name || "Staff Member"}
                </span>
              </div>
              <button
                onClick={onClearStaffFilter}
                className="text-sm font-bold text-white hover:text-blue-100 underline flex-shrink-0 px-2 py-1 rounded active:bg-blue-700/50"
              >
                Show All
              </button>
            </div>
          </div>
        )}
        {/* Month/Filters Row */}
        <div className="flex items-center justify-between px-4 py-3 w-full box-border">
          <button 
            onClick={onFilterClick}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
            aria-label="Open filters"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {/* Previous Month Button */}
            <button
              onClick={() => {
                const prevMonth = new Date(selectedDate);
                prevMonth.setMonth(prevMonth.getMonth() - 1);
                onDateChange(prevMonth);
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <h1 className="text-lg font-semibold min-w-[100px] text-center">
              {format(selectedDate, "MMMM yyyy")}
            </h1>
            
            {/* Next Month Button */}
            <button
              onClick={() => {
                const nextMonth = new Date(selectedDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                onDateChange(nextMonth);
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {onViewChange && (
              <div className="flex items-center border border-white/20 rounded-lg overflow-hidden ml-2">
                <button
                  onClick={() => onViewChange("day")}
                  className={cn(
                    "px-2 py-1 text-xs font-medium transition-colors",
                    view === "day" 
                      ? "bg-white/20 text-white" 
                      : "text-white/70 hover:bg-white/10"
                  )}
                >
                  Day
                </button>
                <button
                  onClick={() => onViewChange("week")}
                  className={cn(
                    "px-2 py-1 text-xs font-medium transition-colors",
                    view === "week" 
                      ? "bg-white/20 text-white" 
                      : "text-white/70 hover:bg-white/10"
                  )}
                >
                  Week
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddAppointment();
            }}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
            aria-label="Add appointment"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Date Selector */}
        <div className="px-2 pb-3 w-full box-border">
          <div 
            ref={dateSelectorRef}
            className={cn(
              "flex gap-1 overflow-x-auto scrollbar-hide pb-1",
              view === "day" ? "scroll-smooth" : "justify-around"
            )}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {weekDates.map((date, idx) => {
              const isSelected = isSameDay(date, selectedDate);
              const isTodayDate = isToday(date);
              const hasAppointments = appointments.some(
                (apt) => apt.scheduled_date === format(date, "yyyy-MM-dd")
              );
              const dayOfWeek = date.getDay();

              return (
                <button
                  key={`${format(date, "yyyy-MM-dd")}-${idx}`}
                  data-selected-date={isSelected}
                  onClick={() => {
                    onDateChange(date);
                  }}
                  className={cn(
                    "flex flex-col items-center py-1.5 px-2.5 rounded-xl transition-all min-w-[40px] flex-shrink-0 active:scale-95",
                    isSelected 
                      ? "bg-[#4fd1c5]" 
                      : isTodayDate
                        ? "ring-1 ring-[#4fd1c5]/50 hover:bg-white/10"
                        : "hover:bg-white/10"
                  )}
                >
                  <span className={cn(
                    "text-[10px] font-medium mb-0.5",
                    isSelected ? "text-[#1a1f3c]" : "text-gray-400"
                  )}>
                    {dayLabels[dayOfWeek]}
                  </span>
                  <span className={cn(
                    "text-base font-semibold",
                    isSelected ? "text-[#1a1f3c]" : "text-white"
                  )}>
                    {format(date, "d")}
                  </span>
                  {hasAppointments && !isSelected && (
                    <div className="w-1 h-1 bg-[#4fd1c5] rounded-full mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Layout Toggle & Staff Header */}
      {teamMembers.length > 0 && (
        <div className="bg-white border-b border-gray-200 w-full box-border shadow-sm z-20 relative">
          {/* Layout Toggle Row */}
          <div className="flex items-center justify-between px-3 py-2.5 w-full box-border">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#FF0077]" />
              Staff View
            </span>
            <div className="flex items-center p-1 bg-gray-100/80 rounded-lg border border-gray-200">
              <button
                onClick={() => setLayoutMode("columns")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                  layoutMode === "columns"
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                All
              </button>
              <button
                onClick={() => setLayoutMode("single")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                  layoutMode === "single"
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                <User className="w-3.5 h-3.5" />
                Single
              </button>
            </div>
          </div>

          {/* Staff Tabs - Only show in single mode */}
          {layoutMode === "single" && (
            <div className="px-4 py-3 overflow-x-auto scrollbar-hide w-full box-border">
              <div className="flex gap-2 min-w-0 pb-1">
                {teamMembers.map((member, idx) => {
                  const count = getStaffAppointmentCount(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedStaffIndex(idx)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all min-h-[48px]",
                        selectedStaffIndex === idx
                          ? "bg-[#1a1f3c] text-white shadow-lg"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      )}
                    >
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className={cn(
                          "text-xs font-medium",
                          selectedStaffIndex === idx 
                            ? "bg-[#4fd1c5] text-[#1a1f3c]" 
                            : "bg-gray-300 text-gray-600"
                        )}>
                          {member.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{member.name}</span>
                      {count > 0 && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          selectedStaffIndex === idx
                            ? "bg-[#4fd1c5] text-[#1a1f3c]"
                            : "bg-[#FF0077] text-white"
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time Grid - Different layouts based on mode */}
      {layoutMode === "columns" ? (
        // COLUMNS VIEW - All staff side by side with time grid
        // Uses pure CSS layout (no window.innerWidth) to avoid SSR hydration issues
        <div 
          ref={scrollContainerRef}
          className="relative bg-gray-50 pb-20"
        >
          {/* Flex layout: time column + staff columns fill available width */}
          <div className="flex w-full">
            {/* Time Column - Fixed width */}
            <div className="w-[52px] flex-shrink-0 bg-white border-r-2 border-gray-400">
              {/* Corner cell - sticky both top and left */}
              <div className="h-[48px] sticky top-0 z-50 bg-gray-100 border-b-2 border-gray-400 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
              </div>
              {/* Time labels */}
              {timeSlots.map((time, idx) => {
                const [hour] = time.split(":").map(Number);
                const period = hour >= 12 ? "PM" : "AM";
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                return (
                  <div key={time} className={cn("h-[60px] border-b-2 border-gray-300 flex items-start justify-center pt-1", idx % 2 === 1 ? "bg-gray-100/60" : "bg-white")}>
                    <span className="text-[10px] font-bold text-gray-700 whitespace-nowrap leading-tight">
                      {displayHour}{period}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Staff Columns - each gets equal share of remaining space, min 140px */}
            {teamMembers.map((member) => {
              const dateStr = format(selectedDate, "yyyy-MM-dd");
              const staffAppointments = appointments.filter(
                (apt) => apt.team_member_id === member.id && toDateStr(apt.scheduled_date || "") === dateStr
              );
              const uniqueBookingCount = new Set(
                staffAppointments.map((a) => (a as { booking_id?: string }).booking_id || a.id)
              ).size;

              return (
                <div key={member.id} className="flex-1 min-w-0 border-r-2 border-gray-300 last:border-r-0 relative bg-white">
                  {/* Staff Header - Sticky on top */}
                  <div className="h-[48px] sticky top-0 z-30 bg-[#1a1f3c] border-b-2 border-gray-400 px-2 py-1 flex items-center gap-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 flex-1 min-w-0 focus:outline-none">
                          <Avatar className="w-7 h-7 ring-1 ring-white/50 flex-shrink-0">
                            <AvatarImage src={member.avatar_url} />
                            <AvatarFallback className="bg-[#4fd1c5] text-[#1a1f3c] text-[10px] font-bold">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[11px] font-semibold text-white truncate leading-tight">
                              {member.name.split(" ")[0]}
                            </span>
                            <span className="text-[9px] text-[#4fd1c5] font-medium truncate">
                              {uniqueBookingCount} {uniqueBookingCount === 1 ? 'apt' : 'apts'}
                            </span>
                          </div>
                          <ChevronDown className="w-3 h-3 text-white/70 flex-shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
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
                  
                  {/* Time Slots with grid lines */}
                  <div className="relative bg-white">
                    {/* Current Time Red Line Indicator */}
                    {showCurrentTime && (
                      <div 
                        ref={currentTimeRef}
                        className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                        style={{
                          top: `${((currentHour - startHour) * 60) + (currentMinute / 60 * 60)}px`
                        }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-lg" />
                        <div className="h-[2px] w-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                      </div>
                    )}
                    
                    {timeSlots.map((time, slotIdx) => {
                      const slotHour = parseInt(time.split(":")[0]);
                      const slotAppointments = staffAppointments.filter((apt) => {
                        const aptHour = parseInt(apt.scheduled_time.split(":")[0]);
                        return aptHour === slotHour;
                      });
                      const hour = parseInt(time.split(":")[0]);
                      const isOutsideLocationHours = isOutsideOperatingHours(selectedDate, hour, locationOperatingHours);
                      const outsideStaffHours = isOutsideStaffHours(selectedDate, hour, member.working_hours ?? undefined);
                      const inAvailabilityBlock = isSlotInAvailabilityBlock(format(selectedDate, "yyyy-MM-dd"), hour, member.id, availabilityBlocks);
                      const isNonWorking = isOutsideLocationHours || outsideStaffHours || inAvailabilityBlock;
                      
                      return (
                        <div 
                          key={time} 
                          className={cn(
                            "h-[60px] border-b-2 border-gray-300 relative transition-colors group/slot",
                            slotIdx % 2 === 1 ? "bg-gray-100/60" : "bg-white",
                            isNonWorking 
                              ? "cursor-not-allowed opacity-30 bg-gray-200"
                              : "cursor-pointer hover:bg-blue-50/30"
                          )}
                          onClick={() => {
                            if (!isNonWorking) {
                              onTimeSlotClick(selectedDate, time, member.id);
                            }
                          }}
                        >
                          {isNonWorking && (
                            <div className="absolute inset-0 bg-gray-300/50 pointer-events-none z-10" />
                          )}
                          {/* Half-hour line */}
                          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-300 pointer-events-none" />
                          
                          {/* Hover indicator for empty slots */}
                          {slotAppointments.length === 0 && (
                            <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                              <Plus className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          
                          {slotAppointments.map((apt) => {
                            // Use proper status mapping and color system
                            const mangomintStatus = mapStatus(apt);
                            const statusColors = getStatusColors(mangomintStatus);
                            
                            // Use inline styles for hex colors (Tailwind doesn't support arbitrary hex in classes)
                            const colorStyle = {
                              backgroundColor: statusColors.bg,
                              borderLeftColor: statusColors.border,
                              color: statusColors.text,
                            };
                            const height = Math.max((apt.duration_minutes / 60) * 60, 32);
                            
                            // Get icon flags for tags
                            const flags = extractIconFlags(apt);
                            const activeIcons = getActiveIcons(flags);
                            
                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAppointmentCardClick(apt);
                                }}
                                    className={cn(
                                      "absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-pointer overflow-hidden",
                                      "transition-all shadow-sm active:scale-[0.98] hover:shadow-md",
                                      "border-l-[3px]"
                                    )}
                                    style={{
                                      ...colorStyle,
                                      height: `${height - 2}px`,
                                      minHeight: "28px",
                                    }}
                                  >
                                    <div className="flex flex-col h-full justify-between min-w-0">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[9px] font-bold uppercase tracking-wide opacity-90 truncate leading-tight">
                                          {apt.service_name}
                                        </p>
                                        <p className="text-[10px] font-bold truncate mt-0.5 leading-tight">
                                          {apt.client_name}
                                        </p>
                                      </div>
                                      {height > 40 && (
                                        <p className="text-[9px] font-semibold opacity-80 whitespace-nowrap">
                                          {formatTime12h(apt.scheduled_time)}
                                        </p>
                                      )}
                                    </div>
                                    
                                    {/* Status Badge */}
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "absolute top-1 right-1 text-[7px] px-1 py-0",
                                        "bg-white/90 backdrop-blur-sm border-0 font-semibold",
                                        statusColors.badgeClasses
                                      )}
                                    >
                                      {statusColors.label.toUpperCase()}
                                    </Badge>
                                    
                                    {/* Icon Flags - Show important indicators */}
                                    {activeIcons.slice(0, 1).map((icon, idx) => {
                                      const IconComponent = require("lucide-react")[icon.icon];
                                      if (!IconComponent) return null;
                                      return (
                                        <div
                                          key={idx}
                                          className={cn(
                                            "absolute bottom-1 left-1",
                                            "w-2.5 h-2.5 rounded-full bg-white/90 backdrop-blur-sm",
                                            "flex items-center justify-center",
                                            icon.colorClass
                                          )}
                                          title={icon.tooltip}
                                        >
                                          <IconComponent className="w-1.5 h-1.5" />
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
              );
            })}
          </div>
        </div>
      ) : (
        // SINGLE STAFF VIEW - Focused view
        <div 
          ref={scrollContainerRef}
          className="overflow-x-hidden relative w-full box-border px-3 bg-white pb-20"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {selectedStaff ? (
            <div className="relative">
              {/* Current Time Indicator */}
              {showCurrentTime && (
                <div 
                  ref={currentTimeRef}
                  className="absolute left-0 right-0 z-30 pointer-events-none"
                  style={{
                    top: `${((currentHour - startHour) * 80) + (currentMinute / 60 * 80)}px`
                  }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white shadow-lg" />
                    <div className="flex-1 h-[3px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  </div>
                </div>
              )}

              {/* Get all appointments for selected staff and date */}
              {timeSlots.map((time, _idx) => {
                // Filter appointments for this staff and date
                const staffAppointments = selectedStaff
                  ? appointments.filter((apt) => {
                      return apt.scheduled_date === format(selectedDate, "yyyy-MM-dd") && 
                             apt.team_member_id === selectedStaff.id;
                    })
                  : [];

                // Find appointments that start in this hour (matching the hour, not exact time)
                const [slotHour] = time.split(":").map(Number);
                const slotAppointments = staffAppointments.filter((apt) => {
                  const [aptHour] = apt.scheduled_time.split(":").map(Number);
                  return aptHour === slotHour;
                });

                const [hour] = time.split(":").map(Number);
                const period = hour >= 12 ? "PM" : "AM";
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

                const isOutsideLocationHours = isOutsideOperatingHours(selectedDate, hour, locationOperatingHours);
                const outsideStaffHours = selectedStaff ? isOutsideStaffHours(selectedDate, hour, selectedStaff.working_hours ?? undefined) : false;
                const inAvailabilityBlock = selectedStaff ? isSlotInAvailabilityBlock(format(selectedDate, "yyyy-MM-dd"), hour, selectedStaff.id, availabilityBlocks) : false;
                const isNonWorking = isOutsideLocationHours || outsideStaffHours || inAvailabilityBlock;

                return (
                  <div 
                    key={time} 
                    className={cn(
                      "flex border-b border-gray-200 min-h-[64px] sm:min-h-[80px] w-full box-border transition-colors relative",
                      isNonWorking 
                        ? "cursor-not-allowed opacity-30 bg-gray-200"
                        : "cursor-pointer hover:bg-gray-50"
                    )}
                  >
                    {isNonWorking && (
                      <div className="absolute inset-0 bg-gray-300/50 pointer-events-none z-10" />
                    )}
                    {/* Time Label */}
                    <div className="w-14 sm:w-16 flex-shrink-0 pt-2 sm:pt-2.5 pr-2 sm:pr-3 text-right border-r-2 border-gray-200">
                      <span className="text-xs sm:text-sm font-semibold text-gray-700">
                        {displayHour}{period}
                      </span>
                    </div>

                    {/* Appointment Area */}
                    <div 
                      className={cn(
                        "flex-1 relative min-h-[64px] sm:min-h-[80px] py-1.5 sm:py-2 pl-1.5 sm:pl-2 pr-0 min-w-0",
                        !isNonWorking && "cursor-pointer"
                      )}
                      onClick={() => {
                        if (!isNonWorking) {
                          onTimeSlotClick(selectedDate, time, selectedStaff.id);
                        }
                      }}
                    >
                      {slotAppointments.map((apt) => {
                        // Use proper status mapping and color system
                        const mangomintStatus = mapStatus(apt);
                        const statusColors = getStatusColors(mangomintStatus);
                        
                        // Use inline styles for hex colors (Tailwind doesn't support arbitrary hex in classes)
                        const colorStyle = {
                          backgroundColor: statusColors.bg,
                          borderLeftColor: statusColors.border,
                          color: statusColors.text,
                        };
                        
                        // Calculate height based on duration (using 64px per hour for mobile)
                        const slotHeight = 64; // Base slot height for mobile
                        const height = Math.max((apt.duration_minutes / 60) * slotHeight, 52);
                        
                        // Calculate top position based on minutes within the hour
                        const [_aptHour, aptMin] = apt.scheduled_time.split(":").map(Number);
                        const topOffset = (aptMin / 60) * slotHeight;
                        
                        return (
                          <div
                            key={apt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppointmentCardClick(apt);
                            }}
                                className={cn(
                                  "absolute left-0 right-0 rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer",
                                  "transition-all duration-200 shadow-md hover:shadow-lg active:shadow-xl",
                                  "border-l-[3px] sm:border-l-4 active:scale-[0.98]"
                                )}
                                style={{
                                  ...colorStyle,
                                  top: `${topOffset}px`,
                                  height: `${height}px`,
                                  minHeight: "52px",
                                }}
                              >
                                <div className="flex flex-col h-full justify-between">
                                  <div className="min-w-0">
                                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide opacity-90 truncate">
                                      {apt.service_name}
                                    </p>
                                    <p className="text-sm sm:text-base font-bold truncate mt-0.5 sm:mt-1">
                                      {apt.client_name}
                                    </p>
                                  </div>
                                  <p className="text-[10px] sm:text-xs font-medium opacity-80">
                                    {formatTime12h(apt.scheduled_time)} – {formatTime12h(
                                      (() => {
                                        const [h, m] = apt.scheduled_time.split(":").map(Number);
                                        const endMinutes = h * 60 + m + apt.duration_minutes;
                                        const endH = Math.floor(endMinutes / 60);
                                        const endM = endMinutes % 60;
                                        return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
                                      })()
                                    )}
                                  </p>
                                </div>
                                
                                {/* Status Badge - Show for all statuses */}
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "absolute top-1.5 sm:top-2 right-1.5 sm:right-2 text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5",
                                    "bg-white/90 backdrop-blur-sm border-0 font-semibold",
                                    statusColors.badgeClasses
                                  )}
                                >
                                  {statusColors.label.toUpperCase()}
                                </Badge>
                                
                                {/* Icon Flags - Show important indicators */}
                                {(() => {
                                  const flags = extractIconFlags(apt);
                                  const activeIcons = getActiveIcons(flags);
                                  return activeIcons.slice(0, 2).map((icon, idx) => {
                                    const IconComponent = require("lucide-react")[icon.icon];
                                    if (!IconComponent) return null;
                                    return (
                                      <div
                                        key={idx}
                                        className={cn(
                                          "absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2",
                                          "w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white/90 backdrop-blur-sm",
                                          "flex items-center justify-center",
                                          icon.colorClass
                                        )}
                                        title={icon.tooltip}
                                      >
                                        <IconComponent className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
              <CalendarIcon className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-center text-sm">
                {teamMembers.length === 0 
                  ? "No team members available. Add team members to see the calendar."
                  : "Select a team member to view their schedule"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Note: Appointment details are handled by the full AppointmentSidebar component */}
      {/* The parent component (calendar page) handles opening the sidebar via onAppointmentClick */}
      {/* FAB removed - using header "+" button instead to avoid duplicates */}
    </div>
  );
}

// Mobile Appointment Sheet Component - Full featured like desktop sidebar
function _MobileAppointmentSheet({
  appointment,
  onClose,
  onEdit,
  onCheckout,
  onStatusChange,
}: {
  appointment: Appointment;
  onClose: () => void;
  onEdit: () => void;
  onCheckout: () => void;
  onStatusChange: (status: Appointment["status"]) => void;
}) {
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState<Appointment>(appointment);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAppointment, setEditedAppointment] = useState<Partial<Appointment>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Update current appointment when prop changes
  useEffect(() => {
    setCurrentAppointment(appointment);
  }, [appointment]);
  
  const statusConfig = STATUS_CONFIG[currentAppointment.status] || STATUS_CONFIG.booked;
  const _isNew = isNewBooking(currentAppointment.created_date, currentAppointment.status);
  
  // Handle status change
  const handleStatusChange = async (newStatus: Appointment["status"]) => {
    setIsStatusDropdownOpen(false);
    try {
      const { providerApi } = await import("@/lib/provider-portal/api");
      const { toast: _toast } = await import("sonner");
      await providerApi.updateAppointment(currentAppointment.id, {
        status: newStatus,
        ...((currentAppointment as any).version !== undefined && { version: (currentAppointment as any).version }),
      });
      // Update local state immediately for instant feedback
      setCurrentAppointment({ ...currentAppointment, status: newStatus });
      // Call parent handler to refresh calendar
      onStatusChange(newStatus);
    } catch (error: any) {
      console.error("Failed to update status:", error);
      const { toast } = await import("sonner");
      const { FetchError } = await import("@/lib/http/fetcher");
      if (error instanceof FetchError && error.status === 409) {
        toast.error("This appointment was modified by another user. Please refresh and try again.");
      } else {
        toast.error(error?.message || "Failed to update status");
      }
    }
  };
  
  // Handle edit button - enable inline editing
  const handleEditClick = () => {
    setIsEditing(true);
    setEditedAppointment({
      service_name: currentAppointment.service_name,
      scheduled_date: currentAppointment.scheduled_date,
      scheduled_time: currentAppointment.scheduled_time,
      duration_minutes: currentAppointment.duration_minutes,
      price: currentAppointment.price,
      notes: currentAppointment.notes,
      team_member_id: currentAppointment.team_member_id,
    });
  };
  
  // Handle save inline edits
  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const { providerApi } = await import("@/lib/provider-portal/api");
      const { toast: _toast } = await import("sonner");
      await providerApi.updateAppointment(currentAppointment.id, {
        ...editedAppointment,
        ...((currentAppointment as any).version !== undefined && { version: (currentAppointment as any).version }),
      });
      setIsEditing(false);
      setEditedAppointment({});
      // Trigger refresh
      onEdit();
    } catch (error: any) {
      console.error("Failed to save appointment:", error);
      const { toast } = await import("sonner");
      const { FetchError } = await import("@/lib/http/fetcher");
      if (error instanceof FetchError && error.status === 409) {
        toast.error("This appointment was modified by another user. Please refresh and try again.");
      } else {
        toast.error(error?.message || "Failed to save changes");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate end time
  const _getEndTime = () => {
    const [hour, min] = currentAppointment.scheduled_time.split(":").map(Number);
    const endMinutes = hour * 60 + min + appointment.duration_minutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  };

  // Format duration
  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${minutes} min`;
  };

  // Handle print
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Appointment Details - ${currentAppointment.ref_number || 'Print'}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; max-width: 100%; margin: 0 auto; color: #1a1a1a; }
              .header { border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; margin-bottom: 30px; }
              h1 { font-size: 24px; margin: 0 0 5px 0; }
              .ref { color: #666; font-size: 14px; }
              .section { margin-bottom: 30px; }
              .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: 600; margin-bottom: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px; }
              .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
              .label { color: #666; }
              .value { font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Appointment Details</h1>
              <div class="ref">Reference: ${currentAppointment.ref_number || 'N/A'}</div>
            </div>
            
            <div class="section">
              <div class="section-title">Client</div>
              <div class="row"><span class="label">Name</span><span class="value">${currentAppointment.client_name}</span></div>
              <div class="row"><span class="label">Email</span><span class="value">${currentAppointment.client_email || '-'}</span></div>
              <div class="row"><span class="label">Phone</span><span class="value">${currentAppointment.client_phone || '-'}</span></div>
            </div>

            <div class="section">
              <div class="section-title">Service</div>
              <div class="row"><span class="label">Service</span><span class="value">${currentAppointment.service_name}</span></div>
              <div class="row"><span class="label">Staff</span><span class="value">${currentAppointment.team_member_name || 'Unassigned'}</span></div>
              <div class="row"><span class="label">Date</span><span class="value">${format(new Date(currentAppointment.scheduled_date), "EEEE, MMMM d, yyyy")}</span></div>
              <div class="row"><span class="label">Time</span><span class="value">${formatTime12h(currentAppointment.scheduled_time)} (${formatDuration(currentAppointment.duration_minutes)})</span></div>
            </div>

            <div class="section">
              <div class="section-title">Payment</div>
              <div class="row"><span class="label">Status</span><span class="value">${currentAppointment.status}</span></div>
              <div class="row"><span class="label">Total Amount</span><span class="value">R${(Number(currentAppointment.total_amount) || Number(currentAppointment.price) || 0).toFixed(2)}</span></div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sheet Header */}
      <SheetHeader className="px-4 pt-4 pb-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <SheetTitle className="text-base font-semibold">Appointment</SheetTitle>
          <div className="flex items-center gap-1">
            {isEditing && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                setIsEditing(false);
                setEditedAppointment({});
              }}>
                <X className="w-4 h-4 text-gray-500" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={isEditing ? handleSaveEdit : handleEditClick} disabled={isSaving}>
              {isEditing ? (
                isSaving ? (
                  <Clock className="w-4 h-4 text-gray-500 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 text-green-600" />
                )
              ) : (
                <Edit className="w-4 h-4 text-gray-500" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-red-600" onClick={() => handleStatusChange("cancelled")}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel / Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCheckout}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Checkout
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Repeat className="w-4 h-4 mr-2" />
                  Make Repeating
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Users className="w-4 h-4 mr-2" />
                  Add to Group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Bell className="w-4 h-4 mr-2" />
                  Resend Notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Status Change Options */}
                <DropdownMenuItem onClick={() => handleStatusChange("pending")}>
                  <div className="w-2 h-2 rounded-full bg-amber-200 mr-2" />
                  Unconfirmed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("booked")}>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                  Confirmed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("booked")}>
                  <div className="w-2 h-2 rounded-full bg-blue-300 mr-2" />
                  Waiting
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("started")}>
                  <div className="w-2 h-2 rounded-full bg-pink-400 mr-2" />
                  In Service
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetHeader>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Status Dropdown & Checkout - Prominent row */}
          <div className="flex items-center justify-between gap-3">
            <DropdownMenu open={isStatusDropdownOpen} onOpenChange={setIsStatusDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  statusConfig.bgColor,
                  statusConfig.borderColor
                )}>
                  <div className={cn("w-2.5 h-2.5 rounded-full", statusConfig.color)} />
                  <span className={cn("text-sm font-medium", statusConfig.textColor)}>
                    {statusConfig.label}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <DropdownMenuItem 
                    key={key}
                    onClick={() => handleStatusChange(key as Appointment["status"])}
                    className={cn(currentAppointment.status === key && "bg-gray-50")}
                  >
                    <div className={cn("w-2.5 h-2.5 rounded-full mr-2", config.color)} />
                    {config.label}
                    {currentAppointment.status === key && (
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Checkout Button (Primary Action) */}
            {currentAppointment.status === "completed" || currentAppointment.payment_status === "paid" ? (
              <Button 
                onClick={onCheckout}
                variant="outline"
                className="h-9 px-4 text-sm font-medium border-gray-300"
              >
                View Sale
              </Button>
            ) : (
              <Button 
                onClick={onCheckout}
                size="sm"
                className="h-9 px-4 bg-[#FF0077] hover:bg-[#D60565] text-white text-sm font-medium"
              >
                CHECKOUT
              </Button>
            )}
          </div>

          {/* Date/Time Row - Mangomint Style */}
          <div className="flex border-y border-gray-100 py-3 mt-1">
            <div className="flex-1 border-r border-gray-100 pr-4">
              <span className="text-xs text-gray-500 block mb-0.5 uppercase tracking-wide">On</span>
              <span className="text-sm font-medium text-gray-900">
                {format(new Date(currentAppointment.scheduled_date), "EEE, MMM d")}
              </span>
            </div>
            <div className="flex-1 pl-4">
              <span className="text-xs text-gray-500 block mb-0.5 uppercase tracking-wide">At</span>
              <span className="text-sm font-medium text-gray-900">
                {formatTime12h(currentAppointment.scheduled_time)}
              </span>
            </div>
          </div>

          {/* Client Card - Mangomint style */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12 ring-2 ring-white shadow-sm">
                <AvatarFallback 
                  className="text-white font-semibold text-sm"
                  style={{ background: `linear-gradient(135deg, #FF0077, #FF6B35)` }}
                >
                  {currentAppointment.client_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base text-gray-900 truncate">
                  {currentAppointment.client_name}
                </h3>
                {currentAppointment.client_since ? (
                  <p className="text-sm text-gray-500">
                    Client since {format(new Date(currentAppointment.client_since), "MMMM yyyy")}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">New client</p>
                )}
              </div>
            </div>

            {/* Phone, Email, Credit Card rows - Mangomint style */}
            <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
              {appointment.client_phone && (
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-16">Phone:</span>
                  <a 
                    href={`tel:${appointment.client_phone}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {appointment.client_phone}
                  </a>
                </div>
              )}
              {appointment.client_email && (
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-16">Email:</span>
                  <a 
                    href={`mailto:${appointment.client_email}`}
                    className="text-blue-600 hover:text-blue-800 truncate"
                  >
                    {appointment.client_email}
                  </a>
                </div>
              )}
              <div className="flex items-center text-sm">
                <span className="text-gray-500 w-16">Credit:</span>
                <button className="text-blue-600 hover:text-blue-800 font-medium">
                  Add Credit Card
                </button>
              </div>
            </div>
            
            {/* Contact Actions */}
            <div className="flex gap-2 mt-3">
              {appointment.client_phone && (
                <a 
                  href={`tel:${appointment.client_phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-lg border border-gray-200 hover:bg-[#FF0077] hover:border-[#FF0077] hover:text-white transition-colors text-sm font-medium text-gray-700"
                >
                  <Phone className="w-4 h-4" />
                  Call
                </a>
              )}
              {appointment.client_phone && (
                <a 
                  href={`sms:${appointment.client_phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-lg border border-gray-200 hover:bg-[#FF0077] hover:border-[#FF0077] hover:text-white transition-colors text-sm font-medium text-gray-700"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </a>
              )}
              {appointment.client_email && (
                <a 
                  href={`mailto:${appointment.client_email}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-lg border border-gray-200 hover:bg-[#FF0077] hover:border-[#FF0077] hover:text-white transition-colors text-sm font-medium text-gray-700"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </a>
              )}
            </div>
          </div>

          {/* Credit Card */}
          <div className="flex items-center gap-3 px-3 py-3 bg-white rounded-xl border border-gray-200">
            <CreditCard className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600 flex-1">Add Credit Card</span>
            <button className="text-sm font-medium text-[#FF0077] hover:text-[#D60565]">
              Add
            </button>
          </div>

          <Separator />

          {/* Service Details - Mangomint style */}
          <div className="space-y-3">
            {/* Service Header with Price */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-base text-gray-900">{currentAppointment.service_name}</h4>
                <div className="mt-1 space-y-0.5">
                  <p className="text-sm text-gray-500">
                    with <span className="text-gray-700 font-medium">{appointment.team_member_name || "Unassigned"}</span>
                  </p>
                  {appointment.service_customization ? (
                    <p className="text-sm text-gray-500">
                      request: <span className="text-gray-700">{appointment.service_customization}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">request: none</p>
                  )}
                  <p className="text-sm text-gray-500">
                    at {formatTime12h(currentAppointment.scheduled_time)} for {formatDuration(currentAppointment.duration_minutes)}
                  </p>
                  {appointment.location_type === "at_salon" && appointment.location_name && (
                    <p className="text-sm text-gray-500">
                      at <span className="text-gray-700">{appointment.location_name}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <span className="text-lg font-bold text-gray-900">
                  R{(Number(currentAppointment.original_price) || Number(currentAppointment.price) || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Pricing Breakdown (only show if there are discounts, tips, or fees) */}
            {(() => {
              const discountAmt = Number(currentAppointment.discount_amount) || 0;
              const tipAmt = Number(currentAppointment.tip_amount) || 0;
              const travelFee = Number(currentAppointment.travel_fee) || 0;
              const taxAmt = Number(currentAppointment.tax_amount) || 0;
              const originalPrice = Number(currentAppointment.original_price) || Number(currentAppointment.price) || 0;
              const totalAmt = Number(currentAppointment.total_amount) || Number(currentAppointment.price) || 0;
              
              // Only show breakdown if there are additional items beyond base price
              const hasBreakdown = discountAmt > 0 || tipAmt > 0 || travelFee > 0 || taxAmt > 0;
              
              if (!hasBreakdown) return null;
              
              return (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {/* Subtotal row */}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-700">R{originalPrice.toFixed(2)}</span>
                  </div>
                  
                  {/* Discount row */}
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">
                        Discount{currentAppointment.discount_code ? ` (${currentAppointment.discount_code})` : ""}
                      </span>
                      <span className="text-green-600">-R{discountAmt.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Travel Fee row */}
                  {travelFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Travel fee</span>
                      <span className="text-gray-700">R{travelFee.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Tax row */}
                  {taxAmt > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax</span>
                      <span className="text-gray-700">R{taxAmt.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Tip row */}
                  {tipAmt > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tip</span>
                      <span className="text-gray-700">R{tipAmt.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Total row */}
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">
                      R{(totalAmt + tipAmt).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}
            
            {/* Add Service/Addon button - Mangomint style */}
            <button 
              onClick={() => onEdit()}
              className="w-full py-2.5 px-4 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add service or product
            </button>
          </div>

          {/* At-Home Location */}
          {appointment.location_type === "at_home" && appointment.address_line1 && (
            <>
              <Separator />
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-blue-900">At-Home Service</p>
                    {appointment.current_stage && (
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded",
                        appointment.current_stage === "provider_on_way" && "bg-amber-100 text-amber-700",
                        appointment.current_stage === "provider_arrived" && "bg-green-100 text-green-700",
                        appointment.current_stage === "service_started" && "bg-pink-100 text-pink-700",
                        appointment.current_stage === "service_completed" && "bg-blue-100 text-blue-700"
                      )}>
                        {appointment.current_stage === "provider_on_way" && "On the way"}
                        {appointment.current_stage === "provider_arrived" && "Arrived"}
                        {appointment.current_stage === "service_started" && "In service"}
                        {appointment.current_stage === "service_completed" && "Completed"}
                        {appointment.current_stage === "confirmed" && "Confirmed"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    {appointment.address_line1}
                    {appointment.address_line2 && `, ${appointment.address_line2}`}
                    {appointment.address_city && `, ${appointment.address_city}`}
                    {appointment.address_postal_code && ` ${appointment.address_postal_code}`}
                  </p>
                  <DirectionsLink
                    destination={{
                      latitude: 0, // Note: Will use address for directions
                      longitude: 0,
                    }}
                    address={`${appointment.address_line1}, ${appointment.address_city || ""}`}
                    className="text-sm mt-2 inline-flex items-center gap-1"
                  >
                    Get Directions →
                  </DirectionsLink>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Booking Details - Clean Mangomint style */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Booking Details
            </h4>
            <div className="space-y-2 text-sm">
              {/* Booked on with booked by */}
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                <span>Booked on {format(new Date(currentAppointment.created_date), "EEE, MMM d 'at' h:mm a")}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600 ml-4">
                <span>by {currentAppointment.created_by || "Online Booking"}</span>
              </div>
              
              {/* Updated info - only show if actually updated and different from creation */}
              {currentAppointment.updated_date && 
               new Date(currentAppointment.updated_date).getTime() - new Date(currentAppointment.created_date).getTime() > 60000 && (
                <>
                  <div className="flex items-center gap-2 text-gray-600 mt-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                    <span>Updated on {format(new Date(currentAppointment.updated_date), "EEE, MMM d 'at' h:mm a")}</span>
                  </div>
                  {currentAppointment.updated_by_name && (
                    <div className="flex items-center gap-2 text-gray-600 ml-4">
                      <span>by {currentAppointment.updated_by_name}</span>
                    </div>
                  )}
                </>
              )}
              
              {/* In service indicator */}
              {appointment.status === "started" && (
                <div className="flex items-center gap-2 text-pink-600 mt-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse flex-shrink-0" />
                  <span className="font-medium">Currently in service</span>
                </div>
              )}
            </div>
            
            {/* Reference & Payment Status - Clean inline display */}
            {(currentAppointment.ref_number || currentAppointment.payment_status) && (
              <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                {currentAppointment.ref_number && (
                  <span>Ref: {currentAppointment.ref_number}</span>
                )}
                {currentAppointment.payment_status && currentAppointment.status !== "completed" && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                    currentAppointment.payment_status === "paid" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {currentAppointment.payment_status === "paid" ? "Paid" : "Payment pending"}
                  </span>
                )}
                {currentAppointment.status === "completed" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                    Completed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          {appointment.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Notes
                </h4>
                <p className="text-sm text-gray-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
                  {appointment.notes}
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t bg-white flex-shrink-0 space-y-3">
        {appointment.status === "completed" || appointment.payment_status === "paid" ? (
          <Button 
            onClick={onCheckout}
            variant="outline"
            className="w-full h-11 text-base font-semibold border-gray-300"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            View Sale
          </Button>
        ) : (
          <Button 
            onClick={onCheckout}
            className="w-full bg-[#FF0077] hover:bg-[#D60565] text-white h-11 text-base font-semibold"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Checkout
          </Button>
        )}
        <div className="flex gap-3">
          <Button 
            onClick={onEdit}
            variant="outline"
            className="flex-1 h-10 border-gray-300"
          >
            <Edit className="w-4 h-4 mr-1.5" />
            Edit
          </Button>
          <Button 
            onClick={handlePrint}
            variant="outline"
            className="flex-1 h-10 border-gray-300"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}
