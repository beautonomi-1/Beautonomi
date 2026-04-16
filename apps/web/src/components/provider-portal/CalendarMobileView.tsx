"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Appointment, TeamMember, AvailabilityBlockDisplay, TimeBlock } from "@/lib/provider-portal/types";
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
  LayoutGrid,
  Building2,
  PersonStanding,
  Home,
  Sparkles,
  StickyNote,
  Crown,
  FileWarning,
  Camera,
  Wrench,
  RefreshCw,
} from "lucide-react";
import {
  format,
  isSameDay,
  startOfWeek,
  addDays,
  subDays,
  getDay,
} from "date-fns";
import { mapStatus, extractIconFlags, isMangomintModeEnabled } from "@/lib/scheduling/mangomintAdapter";
import { getStatusColors, getActiveIcons } from "@/lib/scheduling/visualMapping";
import { nowInTz, isTodayInTz, resolveTz } from "@/lib/dates/provider-tz";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, PersonStanding, Home, Sparkles, StickyNote, Repeat, Crown,
  FileWarning, Camera, MessageCircle, Users, Wrench, Clock, Bell, MapPin,
  Phone, Mail, CreditCard, Edit, Trash2, Check, X, Printer,
};
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOptionalDragDrop, DraggableAppointment, DroppableTimeSlot } from "@/components/provider-portal/DragDropCalendar";
import { MangomintStatusLegend } from "@/components/calendar/MangomintStatusLegend";
import {
  getFirstHourAnyStaffAvailable,
  getAppointmentColors,
  getEndTime,
  toDateStr,
  type CalendarBlock,
} from "@/components/provider-portal/calendar/utils";
import { STAFF_DAY_COLUMN_LAYOUT, UNASSIGNED_ID } from "@/components/provider-portal/calendar/constants";
import { TimeBlockElement } from "@/components/provider-portal/calendar/TimeBlockElement";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";

const MOBILE_COLUMN_HEADER_PX = 48;
const MOBILE_HOUR_PX_COLUMNS = 60;
const MOBILE_HOUR_PX_SINGLE = 64;

export type CalendarMobileGridView = "day" | "3-days" | "week";

interface CalendarMobileViewProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view?: CalendarMobileGridView;
  onDateChange: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, teamMemberId: string) => void;
  onAddAppointment: () => void;
  onFilterClick?: () => void;
  onViewChange?: (view: CalendarMobileGridView) => void;
  onCheckout?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: Appointment["status"]) => void;
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  availabilityBlocks?: AvailabilityBlockDisplay[];
  /** Provider-wide (`team_member_id` null) and per-staff blocks; merged per column like desktop. */
  timeBlocks?: TimeBlock[];
  onTimeBlockClick?: (block: TimeBlock) => void;
  onViewWeekSchedule?: (staffMember: TeamMember) => void;
  onPrintDaySchedule?: (staffMember: TeamMember) => void;
  onEditWorkHours?: (staffMember: TeamMember) => void;
  onSetDayOff?: (staffMember: TeamMember) => void;
  selectedTeamMemberId?: string | null;
  onClearStaffFilter?: () => void;
  /** IANA timezone for the provider business (e.g. "Africa/Johannesburg"). */
  businessTimezone?: string;
  /** Same as desktop: refresh data (e.g. pull-to-refresh companion). */
  onRefresh?: () => void;
}

/** Matches desktop `BookingBlock` / `getAppointmentColors` for mobile cards. */
function getMobileBookingVisuals(
  apt: Appointment,
  useMangomintMode: boolean,
  colorBy: "status" | "service" | "team_member",
  showCanceled: boolean,
): { colorStyle: React.CSSProperties; colors: ReturnType<typeof getAppointmentColors> } | null {
  const colors = getAppointmentColors(apt, useMangomintMode, colorBy, showCanceled);
  if (colors.hidden) return null;
  return {
    colors,
    colorStyle: {
      backgroundColor: colors.bg,
      borderLeftColor: colors.border,
      color: colors.text,
      opacity: colors.opacity ?? 1,
    },
  };
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

const parseHourRange = (
  open?: string,
  close?: string
): { openHour: number; closeHour: number } | null => {
  const { hour: openHour } = parseTimeParts(open);
  const { hour: closeHour } = parseTimeParts(close);
  if (!Number.isFinite(openHour) || !Number.isFinite(closeHour)) return null;
  return { openHour, closeHour };
};

const resolveDayHours = (
  dayHours: unknown
): { open?: string; close?: string; closed: boolean } | null => {
  if (!dayHours || typeof dayHours !== "object") return null;
  const raw = dayHours as Record<string, unknown>;
  const closedFlag = raw.closed === true || raw.is_open === false;
  const open =
    typeof raw.open === "string"
      ? raw.open
      : typeof raw.open_time === "string"
        ? raw.open_time
        : undefined;
  const close =
    typeof raw.close === "string"
      ? raw.close
      : typeof raw.close_time === "string"
        ? raw.close_time
        : undefined;
  return { open, close, closed: closedFlag };
};

const parseTimeParts = (time?: string): { hour: number; minute: number } => {
  if (typeof time !== "string") return { hour: 0, minute: 0 };
  const [hourRaw, minuteRaw] = time.split(":").map(Number);
  return {
    hour: Number.isFinite(hourRaw) ? hourRaw : 0,
    minute: Number.isFinite(minuteRaw) ? minuteRaw : 0,
  };
};

const timeToMinutesMobile = (t?: string): number => {
  const { hour, minute } = parseTimeParts(t);
  return hour * 60 + minute;
};

const isOutsideOperatingHours = (
  date: Date,
  hour: number,
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null
): boolean => {
  if (!locationOperatingHours) return false;
  const dayKey = DAY_NAMES[getDay(date)];
  const resolved = resolveDayHours(locationOperatingHours[dayKey]);
  if (!resolved) return false;
  if (resolved.closed) return true;
  const openMin = timeToMinutesMobile(resolved.open);
  const closeMin = timeToMinutesMobile(resolved.close);
  if (openMin === closeMin) return false;
  const slotMin = hour * 60;
  return slotMin < openMin || slotMin >= closeMin;
};

const isOutsideStaffHours = (
  date: Date,
  hour: number,
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null
): boolean => {
  if (!staffWorkingHours || Object.keys(staffWorkingHours).length === 0) return false;
  const dayKey = DAY_NAMES[getDay(date)];
  const resolved = resolveDayHours(staffWorkingHours[dayKey]);
  if (!resolved) return false;
  if (resolved.closed) return true;
  const openMin = timeToMinutesMobile(resolved.open);
  const closeMin = timeToMinutesMobile(resolved.close);
  if (openMin === closeMin) return false;
  const slotMin = hour * 60;
  return slotMin < openMin || slotMin >= closeMin;
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
    const { hour: bStartH, minute: bStartM } = parseTimeParts(b.start_time);
    const { hour: bEndH, minute: bEndM } = parseTimeParts(b.end_time);
    const blockStart = bStartH * 60 + bStartM;
    const blockEnd = bEndH * 60 + bEndM;
    return slotStart < blockEnd && slotEnd > blockStart;
  });
};

// Format time for display (12-hour format)
const formatTime12h = (time: string) => {
  const { hour, minute: min } = parseTimeParts(time);
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
  onCheckout,
  onStatusChange,
  startHour = 8,
  endHour = 20,
  locationOperatingHours,
  availabilityBlocks = [],
  timeBlocks = [],
  onTimeBlockClick,
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
  selectedTeamMemberId,
  onClearStaffFilter,
  businessTimezone,
  onRefresh,
}: CalendarMobileViewProps) {
  const [selectedStaffIndex, setSelectedStaffIndex] = useState(0);
  const [layoutMode, setLayoutMode] = useState<MobileLayoutMode>("columns"); // Default to columns view like Mangomint
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragDrop = useOptionalDragDrop();
  const currentTimeRef = useRef<HTMLDivElement>(null);
  const dateSelectorRef = useRef<HTMLDivElement>(null);
  const _columnsScrollRef = useRef<HTMLDivElement>(null);
  
  // Touch handling for swipe navigation
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Reset staff index when team changes (staffForDayGrid length applied in a later effect)
  useEffect(() => {
    if (teamMembers.length > 0 && selectedStaffIndex >= teamMembers.length) {
      queueMicrotask(() => setSelectedStaffIndex(0));
    }
  }, [teamMembers.length, selectedStaffIndex]);

  // Listen for external "scroll to now" requests (e.g. from the floating Now button)
  useEffect(() => {
    const handler = () => {
      currentTimeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("calendar-scroll-to-now", handler);
    return () => window.removeEventListener("calendar-scroll-to-now", handler);
  }, []);

  const timeSlots = generateTimeSlots(startHour, endHour);
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const weekStartMon = useMemo(
    () => startOfWeek(selectedDate, { weekStartsOn: 1 }),
    [selectedDate],
  );
  /** Days shown in the time grid for week / 3-day (matches desktop). */
  const visibleDays = useMemo(() => {
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => addDays(weekStartMon, i));
    }
    if (view === "3-days") {
      return Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
    }
    return [selectedDate];
  }, [view, selectedDate, weekStartMon]);

  const isMultiDayGrid = view === "week" || view === "3-days";

  const useMangomintMode = isMangomintModeEnabled();
  const { preferences } = useCalendarPreferences();
  const workStart = useMangomintMode ? (preferences.workdayStartHour ?? 0) : 0;
  const workEnd = useMangomintMode ? (preferences.workdayEndHour ?? 23) : 23;
  const highContrast = useMangomintMode && !!preferences.highContrast;

  const timeBlocksByStaffAndDate = useMemo(() => {
    const map = new Map<string, TimeBlock[]>();
    for (const block of timeBlocks) {
      const key = `${block.team_member_id ?? "__all__"}-${block.date}`;
      const list = map.get(key);
      if (list) list.push(block);
      else map.set(key, [block]);
    }
    return map;
  }, [timeBlocks]);

  const availabilityBlocksByStaffAndDate = useMemo(() => {
    const map = new Map<string, AvailabilityBlockDisplay[]>();
    for (const block of availabilityBlocks) {
      const dateStr = block.date;
      const key = block.team_member_id ? `${block.team_member_id}-${dateStr}` : `__all__-${dateStr}`;
      const list = map.get(key);
      if (list) list.push(block);
      else map.set(key, [block]);
    }
    return map;
  }, [availabilityBlocks]);

  const getBlocksForStaff = useCallback(
    (staffId: string, date: Date): CalendarBlock[] => {
      const dateStr = format(date, "yyyy-MM-dd");
      const tbStaff = timeBlocksByStaffAndDate.get(`${staffId}-${dateStr}`) || [];
      const tbAll = timeBlocksByStaffAndDate.get(`__all__-${dateStr}`) || [];
      const tb = [...tbStaff, ...tbAll];
      const sa = availabilityBlocksByStaffAndDate.get(`${staffId}-${dateStr}`) || [];
      const aa = availabilityBlocksByStaffAndDate.get(`__all__-${dateStr}`) || [];
      return [
        ...tb.map((t) => ({ ...t, _source: "time_block" as const })),
        ...[...sa, ...aa].map((a) => ({
          ...a,
          name:
            a._source === "staff_unavailability"
              ? (a.reason?.trim() || "Time off")
              : (a.reason || a.block_type),
        })),
      ];
    },
    [timeBlocksByStaffAndDate, availabilityBlocksByStaffAndDate],
  );

  /** Week / 3-day: one column per day — show provider-wide + every staff member's blocks (like all columns stacked). */
  const getBlocksForDayColumn = useCallback(
    (day: Date): CalendarBlock[] => {
      const dateStr = format(day, "yyyy-MM-dd");
      const tbAll = timeBlocksByStaffAndDate.get(`__all__-${dateStr}`) || [];
      const tbStaff = teamMembers.flatMap(
        (m) => timeBlocksByStaffAndDate.get(`${m.id}-${dateStr}`) || [],
      );
      const tb = [...tbAll, ...tbStaff];
      const aa = availabilityBlocksByStaffAndDate.get(`__all__-${dateStr}`) || [];
      const sa = teamMembers.flatMap(
        (m) => availabilityBlocksByStaffAndDate.get(`${m.id}-${dateStr}`) || [],
      );
      return [
        ...tb.map((t) => ({ ...t, _source: "time_block" as const })),
        ...[...sa, ...aa].map((a) => ({
          ...a,
          name:
            a._source === "staff_unavailability"
              ? (a.reason?.trim() || "Time off")
              : (a.reason || a.block_type),
        })),
      ];
    },
    [timeBlocksByStaffAndDate, availabilityBlocksByStaffAndDate, teamMembers],
  );

  // Date strip: day = 14-day scroll; week / 3-day = the same days as the grid
  const weekDates =
    view === "week" || view === "3-days"
      ? visibleDays
      : Array.from({ length: 14 }, (_, i) => addDays(selectedDate, i - 4));
  
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

    const step =
      view === "week" ? 7 : view === "3-days" ? 3 : 1;
    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        onDateChange(addDays(selectedDate, step));
      } else {
        onDateChange(subDays(selectedDate, step));
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };
  
  useEffect(() => {
    if (!dateSelectorRef.current) return;
    setTimeout(() => {
      const selectedButton = dateSelectorRef.current?.querySelector(
        '[data-selected-date="true"]',
      ) as HTMLElement;
      if (selectedButton) {
        selectedButton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }, 100);
  }, [selectedDate, view]);

  // Get appointments for a specific date/time/staff
  const _getAppointmentsForSlot = useCallback((
    date: Date,
    time: string,
    teamMemberId: string
  ): Appointment[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((apt) => {
      const aptStaff = apt.team_member_id ? String(apt.team_member_id) : UNASSIGNED_ID;
      if (apt.scheduled_date !== dateStr || aptStaff !== teamMemberId) {
        return false;
      }
      const { hour: aptHour, minute: aptMinute } = parseTimeParts(apt.scheduled_time);
      const { hour: slotHour } = parseTimeParts(time);
      const aptStartMinutes = aptHour * 60 + aptMinute;
      const slotMinutes = slotHour * 60;
      const aptEndMinutes = aptStartMinutes + Math.max(0, apt.duration_minutes || 0);
      return aptStartMinutes <= slotMinutes && slotMinutes < aptEndMinutes;
    });
  }, [appointments]);

  const appointmentsByStaffDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const apt of appointments) {
      const staffKey = apt.team_member_id ? String(apt.team_member_id) : UNASSIGNED_ID;
      const dateKey = toDateStr(apt.scheduled_date || "");
      const key = `${staffKey}-${dateKey}`;
      const existing = map.get(key);
      if (existing) {
        existing.push(apt);
      } else {
        map.set(key, [apt]);
      }
    }
    return map;
  }, [appointments]);

  /** Day view: Unassigned column + orphan staff (matches desktop `CalendarGrid`). */
  const displayMembers = useMemo(() => {
    if (view !== "day") return teamMembers;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const memberIds = new Set(teamMembers.map((m) => m.id));
    const orphans: TeamMember[] = [];
    const hasUnassigned =
      (appointmentsByStaffDate.get(`${UNASSIGNED_ID}-${dateStr}`) ?? []).length > 0;

    appointmentsByStaffDate.forEach((apts, key) => {
      const parts = key.split("-");
      const aptDate = parts.length >= 3 ? parts.slice(-3).join("-") : "";
      const staffId = parts.length >= 3 ? parts.slice(0, -3).join("-") : parts[0] ?? "";
      if (staffId === UNASSIGNED_ID || !staffId || aptDate !== dateStr) return;
      if (memberIds.has(staffId)) return;
      orphans.push({
        id: staffId,
        name: apts[0]?.team_member_name || "Staff",
        role: "employee",
        email: "",
        mobile: "",
        is_active: true,
      });
      memberIds.add(staffId);
    });

    const result: TeamMember[] = [];
    if (hasUnassigned) {
      result.push({
        id: UNASSIGNED_ID,
        name: "Unassigned",
        role: "employee",
        email: "",
        mobile: "",
        is_active: true,
      });
    }
    result.push(...teamMembers, ...orphans);
    return result;
  }, [teamMembers, selectedDate, view, appointmentsByStaffDate]);

  const staffForDayGrid = view === "day" ? displayMembers : teamMembers;

  const defaultStaffIdForSlot = useMemo(() => {
    const first = teamMembers.find((m) => m.id !== UNASSIGNED_ID);
    return first?.id ?? teamMembers[0]?.id ?? "";
  }, [teamMembers]);

  const selectedStaff = staffForDayGrid[selectedStaffIndex] || null;

  useEffect(() => {
    if (staffForDayGrid.length > 0 && selectedStaffIndex >= staffForDayGrid.length) {
      queueMicrotask(() => setSelectedStaffIndex(0));
    }
  }, [staffForDayGrid.length, selectedStaffIndex]);

  const getStaffAppointmentCount = (staffId: string) => {
    const staffApts = appointmentsByStaffDate.get(`${staffId}-${selectedDateStr}`) || [];
    return new Set(staffApts.map((a) => (a as { booking_id?: string }).booking_id || a.id)).size;
  };

  // Handle appointment card click
  const handleAppointmentCardClick = (apt: Appointment) => {
    // Call the parent handler which will open the full AppointmentSidebar in Mangomint mode
    onAppointmentClick(apt);
  };

  const tz = resolveTz(businessTimezone);
  const [currentTime, setCurrentTime] = useState(() => nowInTz(tz));
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(nowInTz(tz)), 60_000);
    return () => clearInterval(id);
  }, [tz]);
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const showCurrentTime = isTodayInTz(selectedDate, tz) && currentHour >= startHour && currentHour <= endHour;

  // Scroll to first bookable hour / appointments / now (columns/single use different row heights)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const tzScroll = resolveTz(businessTimezone);
    const now = nowInTz(tzScroll);
    const ch = now.getHours();
    const cm = now.getMinutes();
    const viewingToday = isMultiDayGrid
      ? visibleDays.some((d) => isTodayInTz(d, tzScroll))
      : isTodayInTz(selectedDate, tzScroll);
    const showNowLine = viewingToday && ch >= startHour && ch <= endHour;

    const staffPool =
      view === "day"
        ? staffForDayGrid.filter((m) => m.id !== UNASSIGNED_ID)
        : teamMembers.filter((m) => m.id !== UNASSIGNED_ID);
    const poolForFirstHour =
      staffPool.length > 0 ? staffPool : view === "day" ? staffForDayGrid : teamMembers;

    const firstStaffHour = getFirstHourAnyStaffAvailable(
      selectedDate,
      startHour,
      endHour,
      poolForFirstHour,
      locationOperatingHours,
    );

    const scrollDateKeys = isMultiDayGrid
      ? visibleDays.map((d) => format(d, "yyyy-MM-dd"))
      : [selectedDateStr];

    let minApptOfs = Infinity;
    for (const apt of appointments) {
      const d = (apt.scheduled_date || "").slice(0, 10);
      if (!scrollDateKeys.includes(d)) continue;
      const { hour: ah, minute: am } = parseTimeParts(apt.scheduled_time);
      const useColMetrics = layoutMode === "columns" || isMultiDayGrid;
      if (useColMetrics) {
        const top =
          MOBILE_COLUMN_HEADER_PX +
          (ah - startHour) * MOBILE_HOUR_PX_COLUMNS +
          (am / 60) * MOBILE_HOUR_PX_COLUMNS;
        if (top < minApptOfs) minApptOfs = top;
      } else {
        const top =
          (ah - startHour) * MOBILE_HOUR_PX_SINGLE + (am / 60) * MOBILE_HOUR_PX_SINGLE;
        if (top < minApptOfs) minApptOfs = top;
      }
    }

    const firstWorkCols =
      MOBILE_COLUMN_HEADER_PX + (firstStaffHour - startHour) * MOBILE_HOUR_PX_COLUMNS;
    const firstWorkSingle = (firstStaffHour - startHour) * MOBILE_HOUR_PX_SINGLE;
    const firstWorkTop =
      layoutMode === "columns" || isMultiDayGrid ? firstWorkCols : firstWorkSingle;

    const nowTopCols =
      MOBILE_COLUMN_HEADER_PX +
      (ch - startHour) * MOBILE_HOUR_PX_COLUMNS +
      (cm / 60) * MOBILE_HOUR_PX_COLUMNS;
    const nowTopSingle =
      (ch - startHour) * MOBILE_HOUR_PX_SINGLE + (cm / 60) * MOBILE_HOUR_PX_SINGLE;
    const nowTop = layoutMode === "columns" || isMultiDayGrid ? nowTopCols : nowTopSingle;

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);

    let target: number;
    if (viewingToday && showNowLine && preferences.scrollToNow) {
      const apptOrNow =
        minApptOfs < Infinity ? Math.min(minApptOfs, nowTop) : nowTop;
      target = Math.min(maxScroll, Math.max(firstWorkTop - 12, apptOrNow - 48));
    } else if (minApptOfs < Infinity) {
      target = Math.min(maxScroll, Math.min(firstWorkTop - 12, minApptOfs - 32));
    } else {
      target = Math.min(maxScroll, Math.max(0, firstWorkTop - 12));
    }

    requestAnimationFrame(() => {
      el.scrollTop = target;
    });
  }, [
    selectedDate,
    selectedDateStr,
    appointments,
    layoutMode,
    startHour,
    endHour,
    locationOperatingHours,
    staffForDayGrid,
    teamMembers,
    businessTimezone,
    isMultiDayGrid,
    visibleDays,
    view,
    preferences.scrollToNow,
  ]);

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
              <div className="flex items-center border border-white/20 rounded-lg overflow-hidden ml-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onViewChange("day")}
                  aria-pressed={view === "day"}
                  className={cn(
                    "px-1.5 py-1 text-[10px] sm:text-xs font-medium transition-colors",
                    view === "day"
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10",
                  )}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("3-days")}
                  aria-pressed={view === "3-days"}
                  className={cn(
                    "px-1.5 py-1 text-[10px] sm:text-xs font-medium transition-colors border-l border-white/15",
                    view === "3-days"
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10",
                  )}
                >
                  3d
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("week")}
                  aria-pressed={view === "week"}
                  className={cn(
                    "px-1.5 py-1 text-[10px] sm:text-xs font-medium transition-colors border-l border-white/15",
                    view === "week"
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10",
                  )}
                >
                  Wk
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <MangomintStatusLegend
              variant="popover"
              showKinds={false}
              showBlocks={false}
              compact
              className="text-white hover:bg-white/10 rounded-lg p-2"
            />
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh()}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
                aria-label="Refresh schedule"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            )}
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
        </div>

        {/* Scrollable Date Selector */}
        <div className="px-2 pb-3 w-full box-border">
          <div 
            ref={dateSelectorRef}
            className={cn(
              "flex gap-1 overflow-x-auto scrollbar-hide pb-1",
              view === "day" ? "scroll-smooth" : "justify-center sm:justify-around",
            )}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {weekDates.map((date, idx) => {
              const isSelected = isSameDay(date, selectedDate);
              const isTodayDate = isTodayInTz(date, tz);
              const hasAppointments = appointments.some(
                (apt) => apt.scheduled_date === format(date, "yyyy-MM-dd")
              );
              const dayOfWeek = date.getDay();

              return (
                <button
                  key={`${format(date, "yyyy-MM-dd")}-${idx}`}
                  data-selected-date={isSelected}
                  aria-label={format(date, "EEEE, MMMM d")}
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

      {/* Layout Toggle & Staff Header — day grid only (week/3-day use combined columns) */}
      {staffForDayGrid.length > 0 && !isMultiDayGrid && (
        <div className="bg-white border-b border-gray-200 w-full box-border shadow-sm z-20 relative">
          {/* Layout Toggle Row */}
          <div className="flex items-center justify-between px-3 py-2.5 w-full box-border">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              Staff View
            </span>
            <div className="flex items-center p-1 bg-gray-100/80 rounded-lg border border-gray-200">
              <button
                onClick={() => setLayoutMode("columns")}
                aria-pressed={layoutMode === "columns"}
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
                aria-pressed={layoutMode === "single"}
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
                {staffForDayGrid.map((member, idx) => {
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
                            : "bg-primary text-white"
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

      {/* Time Grid — week / 3-day: one column per day (all staff), matches desktop multi-day */}
      {isMultiDayGrid ? (
        <div
          ref={scrollContainerRef}
          className="relative bg-gray-50 pb-20 overflow-x-auto"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex w-full min-w-min">
            <div className="w-[52px] flex-shrink-0 bg-white border-r-2 border-gray-400">
              <div className="h-[48px] sticky top-0 z-50 bg-gray-100 border-b-2 border-gray-400 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
              </div>
              {timeSlots.map((time, idx) => {
                const { hour } = parseTimeParts(time);
                const period = hour >= 12 ? "PM" : "AM";
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                return (
                  <div
                    key={time}
                    className={cn(
                      "h-[60px] border-b-2 border-gray-300 flex items-start justify-center pt-1",
                      idx % 2 === 1 ? "bg-gray-100/60" : "bg-white",
                    )}
                  >
                    <span className="text-[10px] font-bold text-gray-700 whitespace-nowrap leading-tight">
                      {displayHour}
                      {period}
                    </span>
                  </div>
                );
              })}
            </div>

            {visibleDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayApts = appointments.filter((apt) => {
                const d = (apt.scheduled_date || "").slice(0, 10);
                return d === dateStr;
              });
              const isTodayCol = isTodayInTz(day, tz);
              const colW = view === "week" ? "min-w-[92px] w-[13.5vw] max-w-[140px]" : "min-w-[108px] w-[30vw] max-w-[160px]";

              return (
                <div key={dateStr} className={cn("flex-shrink-0 border-r-2 border-gray-300 last:border-r-0 relative bg-white", colW)}>
                  <button
                    type="button"
                    onClick={() => onDateChange(day)}
                    className={cn(
                      "h-[48px] sticky top-0 z-30 w-full border-b-2 border-gray-400 px-1 py-1 flex flex-col items-center justify-center",
                      isTodayCol ? "bg-teal-500/20" : "bg-[#1a1f3c]",
                    )}
                  >
                    <span className={cn("text-[9px] font-semibold uppercase", isTodayCol ? "text-gray-700" : "text-white/80")}>
                      {format(day, "EEE")}
                    </span>
                    <span className={cn("text-xs font-bold", isTodayCol ? "text-indigo-700" : "text-white")}>
                      {format(day, "d MMM")}
                    </span>
                    <span className={cn("text-[8px] font-medium", isTodayCol ? "text-gray-600" : "text-[#4fd1c5]")}>
                      {dayApts.length} appt{dayApts.length !== 1 ? "s" : ""}
                    </span>
                  </button>

                  <div className="relative bg-white">
                    {(() => {
                      const dayBlocks = getBlocksForDayColumn(day);
                      if (dayBlocks.length === 0) return null;
                      return (
                        <div
                          className="absolute inset-x-0 top-0 z-[15] pointer-events-none"
                          style={{ height: `${timeSlots.length * MOBILE_HOUR_PX_COLUMNS}px` }}
                        >
                          {dayBlocks.map((block) => (
                            <div
                              key={`${block.id}-${block.start_time}-${block.end_time}-${"team_member_id" in block ? (block.team_member_id ?? "all") : "av"}`}
                              className="pointer-events-auto"
                            >
                              <TimeBlockElement
                                block={block}
                                startHour={startHour}
                                useMangomintMode={useMangomintMode}
                                onTimeBlockClick={onTimeBlockClick}
                                variant="week"
                                pixelsPerHour={MOBILE_HOUR_PX_COLUMNS}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {isTodayCol &&
                      isTodayInTz(day, tz) &&
                      currentHour >= startHour &&
                      currentHour <= endHour &&
                      (() => {
                        const top =
                          MOBILE_COLUMN_HEADER_PX +
                          (currentHour - startHour) * MOBILE_HOUR_PX_COLUMNS +
                          (currentMinute / 60) * MOBILE_HOUR_PX_COLUMNS;
                        return (
                          <div
                            ref={currentTimeRef}
                            className="absolute left-0 right-0 z-[60] pointer-events-none flex items-center"
                            style={{ top: `${top}px` }}
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-lg" />
                            <div className="h-[2px] w-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                          </div>
                        );
                      })()}

                    {timeSlots.map((time, slotIdx) => {
                      const { hour: slotHour } = parseTimeParts(time);
                      const slotAppointments = dayApts.filter((apt) => {
                        const { hour: aptHour } = parseTimeParts(apt.scheduled_time);
                        return aptHour === slotHour;
                      });
                      const { hour } = parseTimeParts(time);
                      // Check if any team member is working this hour — if so,
                      // don't mark the slot as "Closed" even if the location is
                      // nominally outside operating hours for this day.
                      const anyStaffWorking = teamMembers.some(
                        (m) => m.working_hours && !isOutsideStaffHours(day, hour, m.working_hours),
                      );
                      const isOutside =
                        isOutsideOperatingHours(day, hour, locationOperatingHours) && !anyStaffWorking;
                      const slotHcStyle: React.CSSProperties | undefined =
                        isOutside && highContrast
                          ? {
                              backgroundImage:
                                "repeating-linear-gradient(135deg, #1f2937 0px, #1f2937 6px, #374151 6px, #374151 12px)",
                            }
                          : undefined;
                      const slotClassName = cn(
                        "h-[60px] border-b-2 border-gray-300 relative z-10 transition-colors group/slot",
                        slotIdx % 2 === 1 && !isOutside ? "bg-gray-100/60" : !isOutside ? "bg-white" : null,
                        isOutside
                          ? cn(
                              "cursor-not-allowed border-l-[5px] border-l-amber-500",
                              !highContrast &&
                                "bg-[repeating-linear-gradient(135deg,#f3f4f6_0px,#f3f4f6_6px,#e5e7eb_6px,#e5e7eb_12px)]",
                              highContrast && "bg-gray-900/25",
                            )
                          : "cursor-pointer hover:bg-blue-50/30",
                      );
                      const staffForDrop = defaultStaffIdForSlot;

                      const slotInner = (
                        <div
                          className="relative z-10"
                          role="button"
                          tabIndex={isOutside ? -1 : 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isOutside && defaultStaffIdForSlot) {
                              onTimeSlotClick(day, time, defaultStaffIdForSlot);
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !isOutside && defaultStaffIdForSlot) {
                              e.preventDefault();
                              e.stopPropagation();
                              onTimeSlotClick(day, time, defaultStaffIdForSlot);
                            }
                          }}
                        >
                          {isOutside && (
                            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                              <span className="text-[8px] font-bold uppercase text-amber-900/80 bg-white/90 px-1 py-0.5 rounded border border-amber-300">
                                Closed
                              </span>
                            </div>
                          )}
                          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-300 pointer-events-none" />
                          {slotAppointments.length === 0 && !isOutside && (
                            <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                              <Plus className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          {slotAppointments.map((apt) => {
                            const visuals = getMobileBookingVisuals(
                              apt,
                              useMangomintMode,
                              preferences.colorBy,
                              preferences.showCanceled,
                            );
                            if (!visuals) return null;
                            const { colorStyle, colors: aptColors } = visuals;
                            const statusColors = getStatusColors(mapStatus(apt));
                            const minH = preferences.compactMode ? 24 : 26;
                            const height = Math.max(
                              (apt.duration_minutes / 60) * 60,
                              preferences.compactMode ? 28 : 32,
                            );
                            const rawFlags = extractIconFlags(apt);
                            const activeIcons = preferences.showAppointmentIcons
                              ? getActiveIcons(rawFlags)
                              : [];
                            const canDrag =
                              dragDrop &&
                              apt.status !== "completed" &&
                              apt.status !== "cancelled" &&
                              Boolean(apt.team_member_id);
                            const cardContent = (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAppointmentCardClick(apt);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleAppointmentCardClick(apt);
                                  }
                                }}
                                className={cn(
                                  "absolute left-0.5 right-0.5 z-[20] rounded-md px-1 py-0.5 cursor-pointer overflow-hidden",
                                  "transition-all shadow-sm active:scale-[0.98] hover:shadow-md border-l-[3px]",
                                  apt.status === "cancelled" && useMangomintMode && "opacity-50",
                                )}
                                style={{
                                  ...colorStyle,
                                  height: `${height - 2}px`,
                                  minHeight: `${minH}px`,
                                }}
                              >
                                <p
                                  className={cn(
                                    "text-[8px] font-bold uppercase opacity-90 truncate leading-tight",
                                    apt.status === "cancelled" && useMangomintMode && "line-through",
                                  )}
                                  style={{ color: aptColors.text }}
                                >
                                  {apt.service_name}
                                </p>
                                <p
                                  className={cn(
                                    "text-[9px] font-bold truncate leading-tight",
                                    apt.status === "cancelled" && useMangomintMode && "line-through",
                                  )}
                                  style={{ color: aptColors.text }}
                                >
                                  {apt.client_name}
                                </p>
                                <p className="text-[8px] truncate opacity-90" style={{ color: aptColors.text }}>
                                  {apt.team_member_name || "Staff"}
                                </p>
                                {height > 36 && (
                                  <p className="text-[8px] font-semibold opacity-80" style={{ color: aptColors.text }}>
                                    {formatTime12h(apt.scheduled_time)}
                                    {preferences.showPrices &&
                                      (apt.price != null || (apt as { total_amount?: number }).total_amount != null) && (
                                        <span className="ml-0.5 font-semibold">
                                          · R
                                          {(
                                            (apt as { total_amount?: number }).total_amount ??
                                            apt.price ??
                                            0
                                          ).toFixed(0)}
                                        </span>
                                      )}
                                  </p>
                                )}
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "absolute top-0.5 right-0.5 text-[6px] px-0.5 py-0 bg-white/90 border-0 font-semibold",
                                    statusColors.badgeClasses,
                                  )}
                                >
                                  {statusColors.label.toUpperCase()}
                                </Badge>
                                {activeIcons.slice(0, 1).map((icon, idx) => {
                                  const IconComponent = ICON_MAP[icon.icon];
                                  if (!IconComponent) return null;
                                  return (
                                    <div
                                      key={idx}
                                      className="absolute bottom-0.5 left-0.5 w-2 h-2 rounded-full bg-white/90 flex items-center justify-center"
                                    >
                                      <IconComponent className="w-1 h-1" />
                                    </div>
                                  );
                                })}
                                {onCheckout &&
                                  apt.status !== "completed" &&
                                  apt.status !== "cancelled" &&
                                  height > 40 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onCheckout(apt);
                                      }}
                                      className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded bg-white/80 flex items-center justify-center"
                                      title="Checkout"
                                    >
                                      <CreditCard className="w-2.5 h-2.5 text-gray-600" />
                                    </button>
                                  )}
                                {onStatusChange && apt.status === "booked" && height > 40 &&
                                  (apt.location_type !== "at_home" || apt.current_stage === "provider_arrived" || apt.arrival_otp_verified || apt.qr_code_verified) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onStatusChange(apt, "started");
                                    }}
                                    className="absolute bottom-0.5 right-5 w-4 h-4 rounded bg-white/80 flex items-center justify-center"
                                    title="Start"
                                  >
                                    <Check className="w-2.5 h-2.5 text-gray-700" />
                                  </button>
                                )}
                              </div>
                            );
                            return canDrag && apt.team_member_id ? (
                              <DraggableAppointment
                                key={apt.id}
                                appointment={apt}
                                className="absolute left-0.5 right-0.5 z-10 rounded-md border-l-[3px] overflow-hidden"
                                style={{
                                  ...colorStyle,
                                  height: `${height - 2}px`,
                                  minHeight: `${minH}px`,
                                }}
                                enableKeyboardNav={false}
                              >
                                {cardContent}
                              </DraggableAppointment>
                            ) : (
                              <React.Fragment key={apt.id}>{cardContent}</React.Fragment>
                            );
                          })}
                        </div>
                      );

                      return dragDrop && staffForDrop.length > 0 ? (
                        <DroppableTimeSlot
                          key={`${dateStr}-${time}`}
                          date={dateStr}
                          time={time}
                          staffId={staffForDrop}
                          className={slotClassName}
                          style={slotHcStyle}
                        >
                          {slotInner}
                        </DroppableTimeSlot>
                      ) : (
                        <div
                          key={`${dateStr}-${time}`}
                          className={slotClassName}
                          style={slotHcStyle}
                        >
                          {slotInner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : layoutMode === "columns" ? (
        // COLUMNS VIEW - fixed-width staff columns + horizontal scroll (matches desktop CalendarGrid)
        <div
          ref={scrollContainerRef}
          className="relative bg-gray-50 pb-20 overflow-x-auto overflow-y-auto min-h-0 touch-pan-x touch-pan-y"
        >
          <div className="flex min-w-max">
            {/* Time column — stays visible while scrolling staff (sticky left) */}
            <div className="sticky left-0 z-[45] w-[52px] flex-shrink-0 bg-white border-r-2 border-gray-400 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.08)]">
              <div className="h-[48px] sticky top-0 z-50 bg-gray-100 border-b-2 border-gray-400 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
              </div>
              {/* Time labels */}
              {timeSlots.map((time, idx) => {
                const { hour } = parseTimeParts(time);
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

            {staffForDayGrid.map((member) => {
              const dateStr = selectedDateStr;
              const staffAppointments = appointmentsByStaffDate.get(`${member.id}-${dateStr}`) || [];
              const uniqueBookingCount = new Set(
                staffAppointments.map((a) => (a as { booking_id?: string }).booking_id || a.id)
              ).size;

              return (
                <div
                  key={member.id}
                  className={cn(
                    STAFF_DAY_COLUMN_LAYOUT,
                    "border-r-2 border-gray-300 last:border-r-0 relative bg-white",
                  )}
                >
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
                    {(() => {
                      const staffBlocks = getBlocksForStaff(member.id, selectedDate);
                      if (staffBlocks.length === 0) return null;
                      return (
                        <div
                          className="absolute inset-x-0 top-0 z-[15] pointer-events-none"
                          style={{ height: `${timeSlots.length * MOBILE_HOUR_PX_COLUMNS}px` }}
                        >
                          {staffBlocks.map((block) => (
                            <div
                              key={`${block.id}-${block.start_time}-${block.end_time}-${"team_member_id" in block ? (block.team_member_id ?? "all") : "av"}`}
                              className="pointer-events-auto"
                            >
                              <TimeBlockElement
                                block={block}
                                startHour={startHour}
                                useMangomintMode={useMangomintMode}
                                onTimeBlockClick={onTimeBlockClick}
                                variant="week"
                                pixelsPerHour={MOBILE_HOUR_PX_COLUMNS}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Current Time Red Line Indicator */}
                    {showCurrentTime && (
                      <div 
                        ref={currentTimeRef}
                        className="absolute left-0 right-0 z-[60] pointer-events-none flex items-center"
                        style={{
                          top: `${MOBILE_COLUMN_HEADER_PX + ((currentHour - startHour) * MOBILE_HOUR_PX_COLUMNS) + (currentMinute / 60) * MOBILE_HOUR_PX_COLUMNS}px`,
                        }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-lg" />
                        <div className="h-[2px] w-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                      </div>
                    )}
                    
                    {timeSlots.map((time, slotIdx) => {
                      const { hour: slotHour } = parseTimeParts(time);
                      const slotAppointments = staffAppointments.filter((apt) => {
                        const { hour: aptHour } = parseTimeParts(apt.scheduled_time);
                        return aptHour === slotHour;
                      });
                      const { hour } = parseTimeParts(time);
                      const isOutsideLocationHours = isOutsideOperatingHours(selectedDate, hour, locationOperatingHours);
                      const outsideStaffHours = isOutsideStaffHours(selectedDate, hour, member.working_hours ?? undefined);
                      const inAvailabilityBlock = isSlotInAvailabilityBlock(format(selectedDate, "yyyy-MM-dd"), hour, member.id, availabilityBlocks);
                      const staffIsWorking = !outsideStaffHours;
                      const businessClosed = isOutsideLocationHours && !staffIsWorking;
                      const staffOff = !businessClosed && (outsideStaffHours || inAvailabilityBlock);
                      const isNonWorking = businessClosed;
                      const slotHcStyle: React.CSSProperties | undefined =
                        isNonWorking && highContrast
                          ? {
                              backgroundImage:
                                "repeating-linear-gradient(135deg, #1f2937 0px, #1f2937 6px, #374151 6px, #374151 12px)",
                            }
                          : undefined;
                      const slotClassName = cn(
                        "h-[60px] border-b-2 border-gray-300 relative z-10 transition-colors group/slot",
                        slotIdx % 2 === 1 && !isNonWorking && !staffOff ? "bg-gray-100/60" : !isNonWorking && !staffOff ? "bg-white" : null,
                        isNonWorking
                          ? cn(
                              "cursor-not-allowed border-l-[5px] border-l-amber-500",
                              !highContrast &&
                                "bg-[repeating-linear-gradient(135deg,#f3f4f6_0px,#f3f4f6_6px,#e5e7eb_6px,#e5e7eb_12px)]",
                              highContrast && "bg-gray-900/25",
                            )
                          : staffOff
                            ? "cursor-pointer border-l-[3px] border-l-gray-300 bg-[repeating-linear-gradient(135deg,#f9f9f9_0px,#f9f9f9_6px,#f0f0f0_6px,#f0f0f0_12px)]"
                            : "cursor-pointer hover:bg-blue-50/30"
                      );
                      const slotContent = (
                        <>
                          {isNonWorking && (
                            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-900/80 bg-white/90 px-1 py-0.5 rounded border border-amber-300 shadow-sm">
                                Closed
                              </span>
                            </div>
                          )}
                          {staffOff && !isNonWorking && slotAppointments.length === 0 && (
                            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                              <span className="text-[8px] font-medium uppercase tracking-wide text-gray-400 bg-white/80 px-1 py-0.5 rounded">
                                Off
                              </span>
                            </div>
                          )}
                          {/* Half-hour line */}
                          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-300 pointer-events-none" />
                          
                          {/* Hover indicator for empty slots */}
                          {slotAppointments.length === 0 && !staffOff && (
                            <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                              <Plus className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          
                          {slotAppointments.map((apt) => {
                            const visuals = getMobileBookingVisuals(
                              apt,
                              useMangomintMode,
                              preferences.colorBy,
                              preferences.showCanceled,
                            );
                            if (!visuals) return null;
                            const { colorStyle, colors: aptColors } = visuals;
                            const statusColors = getStatusColors(mapStatus(apt));
                            const minH = preferences.compactMode ? 26 : 28;
                            const height = Math.max(
                              (apt.duration_minutes / 60) * 60,
                              preferences.compactMode ? 30 : 32,
                            );
                            const rawFlags = extractIconFlags(apt);
                            const activeIcons = preferences.showAppointmentIcons
                              ? getActiveIcons(rawFlags)
                              : [];
                            const canDrag =
                              dragDrop &&
                              apt.status !== "completed" &&
                              apt.status !== "cancelled" &&
                              Boolean(apt.team_member_id);
                            const cardContent = (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAppointmentCardClick(apt);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleAppointmentCardClick(apt);
                                  }
                                }}
                                className={cn(
                                  "absolute left-0.5 right-0.5 z-[20] rounded-md px-1.5 py-1 cursor-pointer overflow-hidden",
                                  "transition-all shadow-sm active:scale-[0.98] hover:shadow-md",
                                  "border-l-[3px]",
                                  apt.status === "cancelled" && useMangomintMode && "opacity-50",
                                )}
                                style={{
                                  ...colorStyle,
                                  height: `${height - 2}px`,
                                  minHeight: `${minH}px`,
                                }}
                              >
                                <div className="flex flex-col h-full justify-between min-w-0">
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={cn(
                                        "text-[9px] font-bold uppercase tracking-wide opacity-90 truncate leading-tight",
                                        apt.status === "cancelled" && useMangomintMode && "line-through",
                                      )}
                                      style={{ color: aptColors.text }}
                                    >
                                      {apt.service_name}
                                    </p>
                                    <p
                                      className={cn(
                                        "text-[10px] font-bold truncate mt-0.5 leading-tight",
                                        apt.status === "cancelled" && useMangomintMode && "line-through",
                                      )}
                                      style={{ color: aptColors.text }}
                                    >
                                      {apt.client_name}
                                    </p>
                                  </div>
                                  {height > 40 && (
                                    <p
                                      className="text-[9px] font-semibold opacity-80 whitespace-nowrap"
                                      style={{ color: aptColors.text }}
                                    >
                                      {formatTime12h(apt.scheduled_time)}
                                      {preferences.showPrices &&
                                        (apt.price != null || (apt as { total_amount?: number }).total_amount != null) && (
                                          <span className="ml-0.5 font-semibold">
                                            · R
                                            {(
                                              (apt as { total_amount?: number }).total_amount ??
                                              apt.price ??
                                              0
                                            ).toFixed(0)}
                                          </span>
                                        )}
                                    </p>
                                  )}
                                </div>

                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "absolute top-1 right-1 text-[7px] px-1 py-0",
                                    "bg-white/90 backdrop-blur-sm border-0 font-semibold",
                                    statusColors.badgeClasses,
                                  )}
                                >
                                  {statusColors.label.toUpperCase()}
                                </Badge>

                                {activeIcons.slice(0, 1).map((icon, idx) => {
                                  const IconComponent = ICON_MAP[icon.icon];
                                  if (!IconComponent) return null;
                                  return (
                                    <div
                                      key={idx}
                                      className={cn(
                                        "absolute bottom-1 left-1",
                                        "w-2.5 h-2.5 rounded-full bg-white/90 backdrop-blur-sm",
                                        "flex items-center justify-center",
                                        icon.colorClass,
                                      )}
                                      title={icon.tooltip}
                                    >
                                      <IconComponent className="w-1.5 h-1.5" />
                                    </div>
                                  );
                                })}

                                {onCheckout &&
                                  apt.status !== "completed" &&
                                  apt.status !== "cancelled" &&
                                  height > 45 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onCheckout(apt);
                                      }}
                                      className="absolute bottom-1 right-1 w-4 h-4 rounded bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity"
                                      title="Checkout"
                                    >
                                      <CreditCard className="w-2.5 h-2.5 text-gray-600" />
                                    </button>
                                  )}
                              </div>
                            );
                            return canDrag ? (
                              <DraggableAppointment
                                key={apt.id}
                                appointment={apt}
                                className={cn(
                                  "absolute left-0.5 right-0.5 z-[20] rounded-md px-1.5 py-1 cursor-pointer overflow-hidden",
                                  "transition-all shadow-sm active:scale-[0.98] hover:shadow-md",
                                  "border-l-[3px]",
                                )}
                                style={{
                                  ...colorStyle,
                                  height: `${height - 2}px`,
                                  minHeight: `${minH}px`,
                                }}
                                enableKeyboardNav={false}
                              >
                                {cardContent}
                              </DraggableAppointment>
                            ) : (
                              <React.Fragment key={apt.id}>{cardContent}</React.Fragment>
                            );
                          })}
                        </>
                      );
                      const slotInner = (
                        <div
                          className="relative z-10"
                          role="button"
                          tabIndex={isNonWorking ? -1 : 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isNonWorking) {
                              onTimeSlotClick(selectedDate, time, member.id);
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !isNonWorking) {
                              e.preventDefault();
                              e.stopPropagation();
                              onTimeSlotClick(selectedDate, time, member.id);
                            }
                          }}
                        >
                          {slotContent}
                        </div>
                      );
                      return dragDrop ? (
                        <DroppableTimeSlot
                          key={time}
                          date={dateStr}
                          time={time}
                          staffId={member.id}
                          className={slotClassName}
                          style={slotHcStyle}
                        >
                          {slotInner}
                        </DroppableTimeSlot>
                      ) : (
                        <div key={time} className={slotClassName} style={slotHcStyle}>
                          {slotInner}
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
                  className="absolute left-0 right-0 z-[60] pointer-events-none"
                  style={{
                    top: `${((currentHour - startHour) * MOBILE_HOUR_PX_SINGLE) + (currentMinute / 60) * MOBILE_HOUR_PX_SINGLE}px`,
                  }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white shadow-lg" />
                    <div className="flex-1 h-[3px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  </div>
                </div>
              )}

              {(() => {
                const singleBlocks = getBlocksForStaff(selectedStaff.id, selectedDate);
                if (singleBlocks.length === 0) return null;
                return (
                  <div
                    className="absolute left-[58px] sm:left-[66px] right-0 top-0 z-[15] pointer-events-none"
                    style={{ height: `${timeSlots.length * MOBILE_HOUR_PX_SINGLE}px` }}
                  >
                    {singleBlocks.map((block) => (
                      <div
                        key={`${block.id}-${block.start_time}-${block.end_time}-${"team_member_id" in block ? (block.team_member_id ?? "all") : "av"}`}
                        className="pointer-events-auto"
                      >
                        <TimeBlockElement
                          block={block}
                          startHour={startHour}
                          useMangomintMode={useMangomintMode}
                          onTimeBlockClick={onTimeBlockClick}
                          variant="day"
                          pixelsPerHour={MOBILE_HOUR_PX_SINGLE}
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Get all appointments for selected staff and date */}
              {timeSlots.map((time, _idx) => {
                // Filter appointments for this staff and date
                const staffAppointments = selectedStaff
                  ? (appointmentsByStaffDate.get(`${selectedStaff.id}-${selectedDateStr}`) || [])
                  : [];

                // Find appointments that start in this hour (matching the hour, not exact time)
                const { hour: slotHour } = parseTimeParts(time);
                const slotAppointments = staffAppointments.filter((apt) => {
                  const { hour: aptHour } = parseTimeParts(apt.scheduled_time);
                  return aptHour === slotHour;
                });
                const { hour } = parseTimeParts(time);
                const period = hour >= 12 ? "PM" : "AM";
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

                const isOutsideLocationHours = isOutsideOperatingHours(selectedDate, hour, locationOperatingHours);
                const outsideStaffHours = selectedStaff
                  ? isOutsideStaffHours(selectedDate, hour, selectedStaff.working_hours ?? undefined)
                  : false;
                const inAvailabilityBlock = selectedStaff
                  ? isSlotInAvailabilityBlock(
                      format(selectedDate, "yyyy-MM-dd"),
                      hour,
                      selectedStaff.id,
                      availabilityBlocks,
                    )
                  : false;
                const staffIsWorking = selectedStaff ? !outsideStaffHours : false;
                const businessClosed = isOutsideLocationHours && !staffIsWorking;
                const staffOff = !businessClosed && (outsideStaffHours || inAvailabilityBlock);
                const isNonWorking = businessClosed;
                const dateStr = selectedDateStr;
                const rowHcStyle: React.CSSProperties | undefined =
                  isNonWorking && highContrast
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(135deg, #1f2937 0px, #1f2937 6px, #374151 6px, #374151 12px)",
                      }
                    : undefined;
                const rowClassName = cn(
                  "flex border-b border-gray-200 w-full box-border transition-colors relative z-10",
                  preferences.compactMode ? "min-h-[56px] sm:min-h-[72px]" : "min-h-[64px] sm:min-h-[80px]",
                  isNonWorking
                    ? cn(
                        "cursor-not-allowed border-l-[5px] border-l-amber-500",
                        !highContrast &&
                          "bg-[repeating-linear-gradient(135deg,#f3f4f6_0px,#f3f4f6_6px,#e5e7eb_6px,#e5e7eb_12px)]",
                        highContrast && "bg-gray-900/20",
                      )
                    : staffOff
                      ? "cursor-pointer border-l-[3px] border-l-gray-300 bg-[repeating-linear-gradient(135deg,#f9f9f9_0px,#f9f9f9_6px,#f0f0f0_6px,#f0f0f0_12px)]"
                      : "cursor-pointer hover:bg-gray-50",
                );
                const rowContent = (
                  <>
                    {isNonWorking && (
                      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900/80 bg-white/90 px-1.5 py-0.5 rounded border border-amber-300 shadow-sm">
                          Closed
                        </span>
                      </div>
                    )}
                    {staffOff && !isNonWorking && (
                      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                        <span className="text-[8px] font-medium uppercase tracking-wide text-gray-400 bg-white/80 px-1 py-0.5 rounded">
                          Off
                        </span>
                      </div>
                    )}
                    {/* Time Label */}
                    <div className="w-14 sm:w-16 flex-shrink-0 pt-2 sm:pt-2.5 pr-2 sm:pr-3 text-right border-r-2 border-gray-200">
                      <span className="text-xs sm:text-sm font-semibold text-gray-700">
                        {displayHour}{period}
                      </span>
                    </div>

                    {/* Appointment Area */}
                    <div 
                      role="button"
                      tabIndex={isNonWorking ? -1 : 0}
                      className={cn(
                        "flex-1 relative py-1.5 sm:py-2 pl-1.5 sm:pl-2 pr-0 min-w-0",
                        preferences.compactMode ? "min-h-[56px] sm:min-h-[72px]" : "min-h-[64px] sm:min-h-[80px]",
                        !isNonWorking && "cursor-pointer",
                      )}
                      onClick={() => {
                        if (!isNonWorking) {
                          onTimeSlotClick(selectedDate, time, selectedStaff.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !isNonWorking) {
                          e.preventDefault();
                          onTimeSlotClick(selectedDate, time, selectedStaff.id);
                        }
                      }}
                    >
                      {slotAppointments.map((apt) => {
                        const visuals = getMobileBookingVisuals(
                          apt,
                          useMangomintMode,
                          preferences.colorBy,
                          preferences.showCanceled,
                        );
                        if (!visuals) return null;
                        const { colorStyle, colors: aptColors } = visuals;
                        const statusColors = getStatusColors(mapStatus(apt));
                        const slotHeight = preferences.compactMode ? 56 : 64;
                        const minCardH = preferences.compactMode ? 44 : 52;
                        const height = Math.max((apt.duration_minutes / 60) * slotHeight, minCardH);
                        const { minute: aptMin } = parseTimeParts(apt.scheduled_time);
                        const topOffset = (aptMin / 60) * slotHeight;
                        const canDragSingle =
                          dragDrop &&
                          apt.status !== "completed" &&
                          apt.status !== "cancelled" &&
                          Boolean(apt.team_member_id);
                        const rawFlagsSingle = extractIconFlags(apt);
                        const activeIcons = preferences.showAppointmentIcons
                          ? getActiveIcons(rawFlagsSingle)
                          : [];
                        const endTimeStr = getEndTime(
                          apt.scheduled_time || "09:00",
                          apt.duration_minutes || 0,
                        );
                        const singleCardContent = (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppointmentCardClick(apt);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleAppointmentCardClick(apt);
                              }
                            }}
                            className={cn(
                              "absolute left-0 right-0 z-[20] rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer",
                              "transition-all duration-200 shadow-md hover:shadow-lg active:shadow-xl",
                              "border-l-[3px] sm:border-l-4 active:scale-[0.98]",
                              apt.status === "cancelled" && useMangomintMode && "opacity-50",
                            )}
                            style={{
                              ...colorStyle,
                              top: `${topOffset}px`,
                              height: `${height}px`,
                              minHeight: `${minCardH}px`,
                            }}
                          >
                            <div className="flex flex-col h-full justify-between">
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    "text-[10px] sm:text-[11px] font-bold uppercase tracking-wide opacity-90 truncate",
                                    apt.status === "cancelled" && useMangomintMode && "line-through",
                                  )}
                                  style={{ color: aptColors.text }}
                                >
                                  {apt.service_name}
                                </p>
                                <p
                                  className={cn(
                                    "text-sm sm:text-base font-bold truncate mt-0.5 sm:mt-1",
                                    apt.status === "cancelled" && useMangomintMode && "line-through",
                                  )}
                                  style={{ color: aptColors.text }}
                                >
                                  {apt.client_name}
                                </p>
                              </div>
                              <p className="text-[10px] sm:text-xs font-medium opacity-80" style={{ color: aptColors.text }}>
                                {formatTime12h(apt.scheduled_time)} – {formatTime12h(endTimeStr)}
                                {preferences.showPrices &&
                                  (apt.price != null || (apt as { total_amount?: number }).total_amount != null) && (
                                    <span className="ml-1 font-semibold">
                                      · R
                                      {(
                                        (apt as { total_amount?: number }).total_amount ??
                                        apt.price ??
                                        0
                                      ).toFixed(0)}
                                    </span>
                                  )}
                              </p>
                              {height > 70 && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  {onCheckout && apt.status !== "completed" && apt.status !== "cancelled" && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onCheckout(apt);
                                      }}
                                      className="px-2 py-0.5 rounded bg-white/70 text-[9px] font-bold flex items-center gap-1 hover:bg-white/90 transition-colors"
                                    >
                                      <CreditCard className="w-2.5 h-2.5" />
                                      Checkout
                                    </button>
                                  )}
                                  {onStatusChange && apt.status === "booked" &&
                                    (apt.location_type !== "at_home" || apt.current_stage === "provider_arrived" || apt.arrival_otp_verified || apt.qr_code_verified) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(apt, "started");
                                      }}
                                      className="px-2 py-0.5 rounded bg-white/70 text-[9px] font-bold flex items-center gap-1 hover:bg-white/90 transition-colors"
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                      Start
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            <Badge
                              variant="outline"
                              className={cn(
                                "absolute top-1.5 sm:top-2 right-1.5 sm:right-2 text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5",
                                "bg-white/90 backdrop-blur-sm border-0 font-semibold",
                                statusColors.badgeClasses,
                              )}
                            >
                              {statusColors.label.toUpperCase()}
                            </Badge>

                            {activeIcons.slice(0, 2).map((icon, idx) => {
                              const IconComponent = ICON_MAP[icon.icon];
                              if (!IconComponent) return null;
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2",
                                    "w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white/90 backdrop-blur-sm",
                                    "flex items-center justify-center",
                                    icon.colorClass,
                                  )}
                                  title={icon.tooltip}
                                >
                                  <IconComponent className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                </div>
                              );
                            })}
                          </div>
                        );
                        return canDragSingle ? (
                          <DraggableAppointment
                            key={apt.id}
                            appointment={apt}
                            className={cn(
                              "absolute left-0 right-0 z-[20] rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer",
                              "transition-all duration-200 shadow-md hover:shadow-lg active:shadow-xl",
                              "border-l-[3px] sm:border-l-4 active:scale-[0.98]",
                            )}
                            style={{
                              ...colorStyle,
                              top: `${topOffset}px`,
                              height: `${height}px`,
                              minHeight: `${minCardH}px`,
                            }}
                            enableKeyboardNav={false}
                          >
                            {singleCardContent}
                          </DraggableAppointment>
                        ) : (
                          <React.Fragment key={apt.id}>{singleCardContent}</React.Fragment>
                        );
                      })}
                    </div>
                  </>
                );
                return dragDrop && selectedStaff ? (
                  <DroppableTimeSlot
                    key={time}
                    date={dateStr}
                    time={time}
                    staffId={selectedStaff.id}
                    className={rowClassName}
                    style={rowHcStyle}
                  >
                    {rowContent}
                  </DroppableTimeSlot>
                ) : (
                  <div key={time} className={rowClassName} style={rowHcStyle}>
                    {rowContent}
                  </div>
                );
              })}
          </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
              <CalendarIcon className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-center text-sm">
                {staffForDayGrid.length === 0 
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
