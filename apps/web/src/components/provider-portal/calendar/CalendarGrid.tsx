"use client";

import React, { useRef, useEffect, useMemo, useCallback, memo } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { isTodayInTz, nowInTz, resolveTz } from "@/lib/dates/provider-tz";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  isMangomintModeEnabled,
} from "@/lib/scheduling/mangomintAdapter";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import { DragGhostOverlay } from "@/components/provider-portal/DragDropCalendar";
import type { Appointment, TeamMember, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

import { HOUR_HEIGHT, TIME_COLUMN_WIDTH, UNASSIGNED_ID } from "./constants";
import {
  generateTimeSlots,
  getFirstHourAnyStaffAvailable,
  parseScheduledTime,
  toDateStr,
  type CalendarBlock,
} from "./utils";

import { TimeColumn } from "./TimeColumn";
import { StaffColumn } from "./StaffColumn";
import { DateColumn } from "./DateColumn";
import { StaffHeader } from "./StaffHeader";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";

interface CalendarGridProps {
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
  businessTimezone?: string;
}

function CalendarGridComponent({
  appointments,
  teamMembers,
  timeBlocks = [],
  availabilityBlocks = [],
  selectedDate,
  view,
  onAppointmentClick,
  onTimeSlotClick,
  onTimeBlockClick,
  startHour = 8,
  endHour = 20,
  locationOperatingHours,
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
  businessTimezone,
}: CalendarGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerStaffScrollRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLDivElement>(null);

  const { preferences } = useCalendarPreferences();
  const useMangomintMode = isMangomintModeEnabled();
  const { format: providerFormatMoney } = useProviderMoneyFormat();
  const stableFormatPrice = useCallback((n: number) => providerFormatMoney(n), [providerFormatMoney]);

  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour]);
  const isMultiStaffView = view === "day";

  const dates = useMemo(() => {
    const result: Date[] = [];
    if (view === "day") {
      result.push(new Date(selectedDate));
    } else if (view === "3-days") {
      for (let i = 0; i < 3; i++) result.push(addDays(selectedDate, i));
    } else {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      for (let i = 0; i < 7; i++) result.push(addDays(ws, i));
    }
    return result;
  }, [selectedDate, view]);

  // --- Memoized lookup maps ---
  const appointmentsByStaffAndDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const apt of appointments) {
      const staffKey = apt.team_member_id ? String(apt.team_member_id) : UNASSIGNED_ID;
      const key = `${staffKey}-${toDateStr(apt.scheduled_date || "")}`;
      const list = map.get(key);
      if (list) list.push(apt);
      else map.set(key, [apt]);
    }
    return map;
  }, [appointments]);

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

  const getAppointmentsForStaff = useCallback(
    (staffId: string, date: Date): Appointment[] =>
      appointmentsByStaffAndDate.get(`${staffId}-${format(date, "yyyy-MM-dd")}`) || [],
    [appointmentsByStaffAndDate],
  );

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

  // Day view: include Unassigned and orphan staff
  const displayMembers = useMemo(() => {
    if (view !== "day") return teamMembers;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const memberIds = new Set(teamMembers.map((m) => m.id));
    const orphans: TeamMember[] = [];
    const hasUnassigned = (appointmentsByStaffAndDate.get(`${UNASSIGNED_ID}-${dateStr}`) ?? []).length > 0;

    appointmentsByStaffAndDate.forEach((apts, key) => {
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
      result.push({ id: UNASSIGNED_ID, name: "Unassigned", role: "employee", email: "", mobile: "", is_active: true });
    }
    result.push(...teamMembers, ...orphans);
    return result;
  }, [teamMembers, selectedDate, view, appointmentsByStaffAndDate]);

  // Stable callback references
  const handleAppointmentClick = useCallback(
    (apt: Appointment) => onAppointmentClick(apt),
    [onAppointmentClick],
  );
  const handleTimeSlotClick = useCallback(
    (date: Date, time: string, staffId: string) => onTimeSlotClick(date, time, staffId),
    [onTimeSlotClick],
  );

  // Current time indicator (business timezone-aware)
  const tz = resolveTz(businessTimezone);
  const now = nowInTz(tz);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const showCurrentTime =
    dates.some((d) => isTodayInTz(d, tz)) && currentHour >= startHour && currentHour <= endHour;
  const currentTimeTop = (currentHour - startHour) * HOUR_HEIGHT + (currentMinute / 60) * HOUR_HEIGHT;

  const firstAvailableTop = useMemo(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const d = dates.find((x) => format(x, "yyyy-MM-dd") === dateStr) ?? selectedDate;
    const staffPool =
      isMultiStaffView
        ? displayMembers.filter((m) => m.id !== UNASSIGNED_ID)
        : teamMembers;
    const h = getFirstHourAnyStaffAvailable(
      d,
      startHour,
      endHour,
      staffPool.length > 0 ? staffPool : displayMembers,
      locationOperatingHours,
    );
    return (h - startHour) * HOUR_HEIGHT;
  }, [
    selectedDate,
    dates,
    startHour,
    endHour,
    locationOperatingHours,
    isMultiStaffView,
    displayMembers,
    teamMembers,
  ]);

  // Scroll: never above first bookable hour; today also bias toward "now" when it's the next meaningful anchor
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const viewingToday = dates.some((d) => isTodayInTz(d, tz));
    const visibleDateStrs = new Set(dates.map((d) => format(d, "yyyy-MM-dd")));

    let earliestAppt = Infinity;
    for (const apt of appointments) {
      const ds = toDateStr(apt.scheduled_date || "");
      if (!visibleDateStrs.has(ds)) continue;
      const { hour: h, minute: m } = parseScheduledTime(apt.scheduled_time);
      const top = (h - startHour) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
      if (top < earliestAppt) earliestAppt = top;
    }

    const firstWorkScroll = Math.max(0, firstAvailableTop - 16);
    const apptScroll = earliestAppt < Infinity ? Math.max(0, earliestAppt - 40) : Infinity;
    const nowScroll = viewingToday && showCurrentTime ? Math.max(0, currentTimeTop - 80) : Infinity;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);

    let target: number;
    if (viewingToday && showCurrentTime && nowScroll < Infinity) {
      const apptOrNow =
        apptScroll < Infinity ? Math.min(apptScroll, nowScroll) : nowScroll;
      target = Math.min(maxScroll, Math.max(firstWorkScroll, apptOrNow));
    } else if (apptScroll < Infinity) {
      target = Math.min(maxScroll, Math.min(firstWorkScroll, apptScroll));
    } else {
      target = Math.min(maxScroll, firstWorkScroll);
    }

    requestAnimationFrame(() => {
      el.scrollTop = target;
    });
  }, [
    dates,
    appointments,
    selectedDate,
    startHour,
    endHour,
    showCurrentTime,
    currentTimeTop,
    firstAvailableTop,
    tz,
  ]);

  /** Keep staff header strip aligned with the day grid when columns overflow horizontally. */
  useEffect(() => {
    if (!isMultiStaffView) return;
    const body = scrollContainerRef.current;
    const head = headerStaffScrollRef.current;
    if (!body || !head) return;

    const syncHead = () => {
      if (head.scrollLeft === body.scrollLeft) return;
      head.scrollLeft = body.scrollLeft;
    };
    const syncBody = () => {
      if (body.scrollLeft === head.scrollLeft) return;
      body.scrollLeft = head.scrollLeft;
    };

    body.addEventListener("scroll", syncHead, { passive: true });
    head.addEventListener("scroll", syncBody, { passive: true });
    syncHead();
    return () => {
      body.removeEventListener("scroll", syncHead);
      head.removeEventListener("scroll", syncBody);
    };
  }, [isMultiStaffView, displayMembers.length, selectedDate.getTime(), view]);

  // Preferences-derived values — only used for visual emphasis, not for "Closed" labeling
  const workStart = useMangomintMode ? (preferences.workdayStartHour ?? 0) : 0;
  const workEnd = useMangomintMode ? (preferences.workdayEndHour ?? 23) : 23;
  const highContrast = useMangomintMode && !!preferences.highContrast;

  // Pre-compute staff header booking counts
  const staffBookingCounts = useMemo(() => {
    if (!isMultiStaffView) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const member of displayMembers) {
      const apts = getAppointmentsForStaff(member.id, selectedDate);
      const visible = useMangomintMode && !preferences.showCanceled
        ? apts.filter((a) => a.status !== "cancelled")
        : apts;
      counts.set(member.id, new Set(visible.map((a) => (a as any).booking_id || a.id)).size);
    }
    return counts;
  }, [displayMembers, selectedDate, isMultiStaffView, getAppointmentsForStaff, useMangomintMode, preferences.showCanceled]);

  const staffHasContent = useMemo(() => {
    if (!isMultiStaffView) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const member of displayMembers) {
      const apts = getAppointmentsForStaff(member.id, selectedDate);
      const blocks = getBlocksForStaff(member.id, selectedDate);
      const visible = useMangomintMode && !preferences.showCanceled
        ? apts.filter((a) => a.status !== "cancelled")
        : apts;
      map.set(member.id, visible.length > 0 || blocks.length > 0);
    }
    return map;
  }, [displayMembers, selectedDate, isMultiStaffView, getAppointmentsForStaff, getBlocksForStaff, useMangomintMode, preferences.showCanceled]);

  return (
    <div className="flex flex-1 h-full min-h-0 w-full max-w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden box-border">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Row — multi-staff: horizontal scroll synced with grid body */}
        <div className="flex border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white flex-shrink-0 min-w-0">
          <div className="flex-shrink-0 border-r border-gray-200" style={{ width: `${TIME_COLUMN_WIDTH}px` }} />

          {isMultiStaffView ? (
            <div
              ref={headerStaffScrollRef}
              className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
            >
              <div className="flex min-w-max">
                {displayMembers.map((member, idx) => (
                  <StaffHeader
                    key={member.id}
                    member={member}
                    index={idx}
                    bookingCount={staffBookingCounts.get(member.id) ?? 0}
                    hasContent={staffHasContent.get(member.id) ?? false}
                    onViewWeekSchedule={onViewWeekSchedule}
                    onPrintDaySchedule={onPrintDaySchedule}
                    onEditWorkHours={onEditWorkHours}
                    onSetDayOff={onSetDayOff}
                  />
                ))}
              </div>
            </div>
          ) : (
            dates.map((date, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex-1 min-w-[90px] max-w-[200px] border-r border-gray-200 last:border-r-0 py-3 text-center",
                  isTodayInTz(date, tz) && "bg-primary/5",
                )}
              >
                <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">{format(date, "EEE")}</p>
                <p className={cn("text-xl font-bold mt-0.5", isTodayInTz(date, tz) ? "text-primary" : "text-gray-900")}>
                  {format(date, "d")}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Scrollable Time Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto relative min-w-0">
          <div className="flex min-h-full min-w-max">
            <TimeColumn timeSlots={timeSlots} />

            <div className="flex flex-row min-w-max relative isolate">
              <DragGhostOverlay hourHeight={HOUR_HEIGHT} startHour={startHour} />

              {isMultiStaffView
                ? displayMembers.map((member) => (
                    <StaffColumn
                      key={member.id}
                      member={member}
                      teamMembers={teamMembers}
                      date={selectedDate}
                      appointments={getAppointmentsForStaff(member.id, selectedDate)}
                      blocks={getBlocksForStaff(member.id, selectedDate)}
                      timeSlots={timeSlots}
                      startHour={startHour}
                      useMangomintMode={useMangomintMode}
                      colorBy={preferences.colorBy}
                      showCanceled={preferences.showCanceled}
                      showPrices={preferences.showPrices}
                      highContrast={highContrast}
                      workStart={workStart}
                      workEnd={workEnd}
                      locationOperatingHours={locationOperatingHours}
                      onAppointmentClick={handleAppointmentClick}
                      onTimeSlotClick={handleTimeSlotClick}
                      onTimeBlockClick={onTimeBlockClick}
                      formatPrice={stableFormatPrice}
                    />
                  ))
                : dates.map((date, idx) => (
                    <DateColumn
                      key={idx}
                      date={date}
                      appointments={appointments}
                      timeBlocks={timeBlocks}
                      availabilityBlocks={availabilityBlocks}
                      teamMembers={teamMembers}
                      timeSlots={timeSlots}
                      startHour={startHour}
                      useMangomintMode={useMangomintMode}
                      colorBy={preferences.colorBy}
                      showCanceled={preferences.showCanceled}
                      showPrices={preferences.showPrices}
                      highContrast={highContrast}
                      workStart={workStart}
                      workEnd={workEnd}
                      locationOperatingHours={locationOperatingHours}
                      onAppointmentClick={handleAppointmentClick}
                      onTimeSlotClick={handleTimeSlotClick}
                      onTimeBlockClick={onTimeBlockClick}
                      formatPrice={stableFormatPrice}
                    />
                  ))}
              {showCurrentTime && <CurrentTimeIndicator ref={currentTimeRef} top={currentTimeTop} />}
            </div>
          </div>
        </div>
      </div>

      {displayMembers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <div className="text-center p-8">
            <CalendarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Team Members</h3>
            <p className="text-gray-500 text-sm max-w-sm">
              Add team members in Settings &rarr; Team to start scheduling appointments.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function blockOverlaySig(blocks: AvailabilityBlockDisplay[] | undefined): string {
  return (blocks ?? [])
    .map((b) => `${b.id}-${b.date}-${b.start_time}-${b.team_member_id ?? ""}`)
    .join("|");
}

export const CalendarGrid = memo(CalendarGridComponent, (prev, next) => {
  if (prev.appointments.length !== next.appointments.length) return false;
  if (prev.teamMembers.length !== next.teamMembers.length) return false;
  if (prev.timeBlocks?.length !== next.timeBlocks?.length) return false;
  if (prev.availabilityBlocks?.length !== next.availabilityBlocks?.length) return false;
  if (blockOverlaySig(prev.availabilityBlocks) !== blockOverlaySig(next.availabilityBlocks)) return false;
  if (prev.selectedDate.getTime() !== next.selectedDate.getTime()) return false;
  if (prev.view !== next.view) return false;
  if (prev.startHour !== next.startHour) return false;
  if (prev.endHour !== next.endHour) return false;
  if (prev.locationOperatingHours !== next.locationOperatingHours) return false;

  if (prev.teamMembers !== next.teamMembers) {
    const prevWh = prev.teamMembers.map((m) => JSON.stringify(m.working_hours ?? {})).join("|");
    const nextWh = next.teamMembers.map((m) => JSON.stringify(m.working_hours ?? {})).join("|");
    if (prevWh !== nextWh) return false;
  }

  const prevTb = (prev.timeBlocks ?? []).map((t) => `${t.id}-${t.date}-${t.start_time}-${t.team_member_id ?? ""}`).join(",");
  const nextTb = (next.timeBlocks ?? []).map((t) => `${t.id}-${t.date}-${t.start_time}-${t.team_member_id ?? ""}`).join(",");
  if (prevTb !== nextTb) return false;

  const prevIds = prev.appointments.map((a) => `${a.id}-${a.scheduled_date}-${a.scheduled_time}-${a.status}`).join(",");
  const nextIds = next.appointments.map((a) => `${a.id}-${a.scheduled_date}-${a.scheduled_time}-${a.status}`).join(",");
  return prevIds === nextIds;
});

CalendarGrid.displayName = "CalendarGrid";
