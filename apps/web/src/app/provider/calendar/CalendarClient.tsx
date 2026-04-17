"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { fetcher, PROVIDER_BOOTSTRAP_TIMEOUT_MS } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Settings, Users, RefreshCw, SlidersHorizontal, Printer, PersonStanding, X } from "lucide-react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
// Side-effect imports to register stub components with Turbopack (workaround for HMR bug)
import "@/components/provider-portal/AppointmentDialogMobile";
import "@/components/provider-portal/AppointmentDetailsModal";
import { format, startOfWeek, endOfWeek, addDays, parseISO } from "date-fns";
import { dateRangeBoundsUtc, resolveTz, nowInTz } from "@/lib/dates/provider-tz";
import { useRoutePerformance } from "@/lib/performance/useRoutePerformance";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PreferencesPanel, MangomintStatusLegend } from "@/components/calendar";
import { openViewMode, openCreateMode } from "@/stores/appointment-sidebar-store";
import { AppointmentSidebar } from "@/components/appointments";
import { WaitingRoomButton, WaitingRoomPanel } from "@/components/waitingRoom";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ServiceItem, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import {
  expandTimeBlocksForCalendarRange,
  resolveTimeBlockRecordId,
} from "@/components/provider-portal/calendar/expand-time-blocks";
import { AppointmentStatus, mapStatus } from "@/lib/scheduling/mangomintAdapter";
import { TimeBlockSidebar } from "@/components/calendar/TimeBlockSidebar";
import { useTimeBlockSidebar, openEditTimeBlockMode } from "@/stores/time-block-sidebar-store";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contrast, Eye, EyeOff, Grid3X3, Tag, DollarSign, Palette, Clock } from "lucide-react";
import { toast } from "sonner";
import { useMediaQueryMatch, TW_MD_MIN_QUERY } from "@/hooks/useMediaQueryMatch";
import type { CalendarInitialPayload } from "./fetch-calendar-initial";

const CalendarDesktopWithDnd = dynamic(
  () =>
    import("@/components/provider-portal/CalendarDesktopWithDnd").then(
      (m) => m.CalendarDesktopWithDnd
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 min-h-[280px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/80">
        <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    ),
  }
);

const CalendarMobileWithDnd = dynamic(
  () =>
    import("@/components/provider-portal/CalendarMobileWithDnd").then(
      (m) => m.CalendarMobileWithDnd
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center py-12">
        <RefreshCw className="h-7 w-7 animate-spin text-primary/40" />
      </div>
    ),
  }
);

const GroupBookingDialog = dynamic(
  () =>
    import("@/components/provider-portal/GroupBookingDialog").then(
      (m) => m.GroupBookingDialog
    ),
  { ssr: false }
);

const PrintScheduleDialog = dynamic(
  () =>
    import("@/components/provider-portal/PrintScheduleDialog").then(
      (m) => m.PrintScheduleDialog
    ),
  { ssr: false }
);

const SetDayOffDialog = dynamic(
  () =>
    import("@/components/provider-portal/SetDayOffDialog").then(
      (m) => m.SetDayOffDialog
    ),
  { ssr: false }
);

const EditWorkHoursDialog = dynamic(
  () =>
    import("@/components/provider-portal/EditWorkHoursDialog").then(
      (m) => m.EditWorkHoursDialog
    ),
  { ssr: false }
);

const CheckoutDialog = dynamic(
  () =>
    import("@/components/provider-portal/CheckoutDialog").then(
      (m) => m.CheckoutDialog
    ),
  { ssr: false }
);

const AppointmentStatusManager = dynamic(
  () =>
    import("@/components/provider-portal/AppointmentStatusManager").then(
      (m) => m.AppointmentStatusManager
    ),
  { ssr: false }
);

const RateCustomerModal = dynamic(
  () => import("@/components/reviews/rate-customer-modal"),
  { ssr: false }
);

/** Inline calendar display preferences for the mobile Filter sheet */
function MobileCalendarPreferencesSection() {
  const router = useRouter();
  const {
    preferences,
    isLoaded,
    toggleHighContrastMode,
    toggleShowCanceledAppointments,
    toggleCompactMode,
    toggleShowIcons,
    updatePreference,
    reset,
  } = useCalendarPreferences();

  if (!isLoaded) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Display preferences</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Contrast className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label htmlFor="mobile-high-contrast" className="text-sm font-normal cursor-pointer truncate">
              High contrast
            </Label>
          </div>
          <Switch
            id="mobile-high-contrast"
            checked={preferences.highContrast}
            onCheckedChange={toggleHighContrastMode}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {preferences.showCanceled ? (
              <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <EyeOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <Label htmlFor="mobile-show-canceled" className="text-sm font-normal cursor-pointer truncate">
              Show canceled
            </Label>
          </div>
          <Switch
            id="mobile-show-canceled"
            checked={preferences.showCanceled}
            onCheckedChange={toggleShowCanceledAppointments}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Grid3X3 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label htmlFor="mobile-compact" className="text-sm font-normal cursor-pointer truncate">
              Compact blocks
            </Label>
          </div>
          <Switch
            id="mobile-compact"
            checked={preferences.compactMode}
            onCheckedChange={toggleCompactMode}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label htmlFor="mobile-show-icons" className="text-sm font-normal cursor-pointer truncate">
              Show icons
            </Label>
          </div>
          <Switch
            id="mobile-show-icons"
            checked={preferences.showAppointmentIcons}
            onCheckedChange={toggleShowIcons}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label htmlFor="mobile-show-prices" className="text-sm font-normal cursor-pointer truncate">
              Show prices
            </Label>
          </div>
          <Switch
            id="mobile-show-prices"
            checked={preferences.showPrices}
            onCheckedChange={(checked) => updatePreference("showPrices", checked)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Palette className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label className="text-sm font-normal">Color by</Label>
          </div>
          <Select
            value={preferences.colorBy}
            onValueChange={(value: "status" | "service" | "team_member") =>
              updatePreference("colorBy", value)
            }
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="team_member">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Label htmlFor="mobile-scroll-now" className="text-sm font-normal cursor-pointer truncate">
              Scroll to now
            </Label>
          </div>
          <Switch
            id="mobile-scroll-now"
            checked={preferences.scrollToNow}
            onCheckedChange={(checked) => updatePreference("scrollToNow", checked)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8"
          onClick={() => reset()}
        >
          Reset to defaults
        </Button>
        <Button
          variant="link"
          size="sm"
          className="text-xs text-muted-foreground p-0 h-auto"
          onClick={() => router.push("/provider/settings/calendar/display-preferences")}
        >
          More display settings →
        </Button>
      </div>
    </div>
  );
}

const parseHourFromUnknown = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})(?::\d{1,2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : null;
};

const readHoursField = (dayHours: unknown, key: "open" | "close"): unknown => {
  if (!dayHours || typeof dayHours !== "object") return undefined;
  const raw = dayHours as Record<string, unknown>;
  if (key === "open") return raw.open ?? raw.open_time ?? raw.start_time ?? raw.start;
  return raw.close ?? raw.close_time ?? raw.end_time ?? raw.end;
};

const isClosedDay = (dayHours: unknown): boolean => {
  if (!dayHours || typeof dayHours !== "object") return false;
  const raw = dayHours as Record<string, unknown>;
  return raw.closed === true || raw.is_open === false;
};

const parseTimeFromUnknown = (
  value: unknown,
  fallbackHour: number,
  fallbackMinute: number
): { hour: number; minute: number } => {
  if (typeof value !== "string") return { hour: fallbackHour, minute: fallbackMinute };
  const match = value.trim().match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return { hour: fallbackHour, minute: fallbackMinute };
  const hourRaw = Number(match[1]);
  const minuteRaw = Number(match[2] ?? "0");
  const hour = Number.isFinite(hourRaw) ? Math.max(0, Math.min(23, hourRaw)) : fallbackHour;
  const minute = Number.isFinite(minuteRaw) ? Math.max(0, Math.min(59, minuteRaw)) : fallbackMinute;
  return { hour, minute };
};

const isValidDateValue = (value: Date): boolean => !Number.isNaN(value.getTime());
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTimeForCalendar = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  const rawHour = Number(match[1]);
  const rawMinute = Number(match[2]);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return null;
  const hour = Math.max(0, Math.min(23, rawHour));
  const minute = Math.max(0, Math.min(59, rawMinute));
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const sanitizeAvailabilityBlocks = (blocks: AvailabilityBlockDisplay[]): AvailabilityBlockDisplay[] => {
  return blocks
    .map((block) => {
      const date = typeof block.date === "string" ? block.date.trim().slice(0, 10) : "";
      if (!YMD_PATTERN.test(date)) return null;
      const startTime = normalizeTimeForCalendar(block.start_time);
      const endTime = normalizeTimeForCalendar(block.end_time);
      if (!startTime || !endTime) return null;
      return {
        ...block,
        date,
        start_time: startTime,
        end_time: endTime,
      };
    })
    .filter((block): block is AvailabilityBlockDisplay => block !== null);
};

type CheckoutSaleLine = {
  id: string;
  type: "service" | "product";
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  item_id?: string | null;
};

/** Build POS sale lines from calendar appointment (multi-service + booking products). */
function buildSaleItemsFromAppointment(apt: Appointment): CheckoutSaleLine[] {
  const items: CheckoutSaleLine[] = [];
  const services = (apt as { services?: Array<Record<string, unknown>> }).services;
  if (Array.isArray(services) && services.length > 0) {
    services.forEach((s, idx) => {
      const name = String(s.offering_name ?? s.service_name ?? s.name ?? "Service");
      const unit = Number(s.price ?? 0);
      const oid = s.offering_id ?? s.service_id ?? s.id;
      items.push({
        id: String(oid ?? `svc-${idx}`),
        type: "service",
        name,
        quantity: 1,
        unit_price: unit,
        total: unit,
        item_id: typeof oid === "string" ? oid : oid != null ? String(oid) : null,
      });
    });
  }

  const products = (apt as { products?: Array<Record<string, unknown>> }).products;
  if (Array.isArray(products) && products.length > 0) {
    products.forEach((p, idx) => {
      const name = String(p.product_name ?? p.name ?? "Product");
      const qty = Math.max(1, Number(p.quantity ?? 1));
      const unit = Number(p.unit_price ?? 0);
      const lineTotal = Number(p.total_price ?? unit * qty);
      const pid = p.product_id ?? p.id;
      items.push({
        id: String(pid ?? `prd-${idx}`),
        type: "product",
        name,
        quantity: qty,
        unit_price: unit,
        total: lineTotal,
        item_id: typeof pid === "string" ? pid : pid != null ? String(pid) : null,
      });
    });
  }

  if (items.length === 0) {
    items.push({
      id: apt.service_id || apt.id,
      type: "service",
      name: apt.service_name || "Service",
      quantity: 1,
      unit_price: Number(apt.price ?? 0),
      total: Number(apt.price ?? 0),
      item_id: apt.service_id || null,
    });
  }

  return items;
}

export function CalendarClient({ initialCalendar }: { initialCalendar: CalendarInitialPayload }) {
  const router = useRouter();
  const { dateView, setDateView, provider, isLoading: isLoadingProvider, salons, selectedLocationId } = useProviderPortal();
  const businessTz = resolveTz(provider?.timezone);
  const [appointments, setAppointments] = useState<Appointment[]>(() => initialCalendar?.appointments ?? []);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => initialCalendar?.teamMembers ?? []);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => initialCalendar?.timeBlocks ?? []);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlockDisplay[]>(
    () => initialCalendar?.availabilityBlocks ?? [],
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Initialise from URL ?date= param passed through SSR initialCalendar.dateFrom
    if (initialCalendar?.dateFrom) {
      try {
        const d = parseISO(initialCalendar.dateFrom);
        if (isValidDateValue(d)) return d;
      } catch { /* ignore */ }
    }
    return new Date();
  });
  const selectedDateSafe = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
  const [locationOperatingHours, setLocationOperatingHours] = useState<Record<string, { open: string; close: string; closed: boolean }> | null>(null);
  
  // Calculate optimal startHour and endHour based on operating hours,
  // staff working hours, and actual appointment / block times.
  const { startHour, endHour } = React.useMemo(() => {
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const getDayKey = (date: Date) => DAY_NAMES[date.getDay()];

    const getDatesForView = () => {
      const dates: Date[] = [];
      const start = new Date(selectedDateSafe);
      if (dateView === "day") {
        dates.push(new Date(start));
      } else if (dateView === "3-days") {
        for (let i = 0; i < 3; i++) dates.push(addDays(start, i));
      } else {
        const weekStart = startOfWeek(selectedDateSafe, { weekStartsOn: 1 });
        for (let i = 0; i < 7; i++) dates.push(addDays(weekStart, i));
      }
      return dates;
    };
    const visibleDates = getDatesForView();
    const visibleDateStrs = new Set(visibleDates.map(d => format(d, "yyyy-MM-dd")));

    let calculatedStartHour = 8;
    let calculatedEndHour = 20;

    // Collect the widest hour range from BOTH location operating hours
    // AND individual staff working hours so the calendar covers all
    // shifts — including staff who work outside location hours or on
    // weekends when the location is nominally "closed".
    let minHour = 23;
    let maxHour = 0;
    let hasAnyOpenSlot = false;

    const expandFromDayHours = (dayHours: unknown) => {
      if (!dayHours || isClosedDay(dayHours)) return;
      const openHour = parseHourFromUnknown(readHoursField(dayHours, "open"));
      const closeHour = parseHourFromUnknown(readHoursField(dayHours, "close"));
      if (openHour == null || closeHour == null) return;
      hasAnyOpenSlot = true;
      minHour = Math.min(minHour, openHour);
      maxHour = Math.max(maxHour, closeHour);
    };

    visibleDates.forEach((date) => {
      const dayKey = getDayKey(date);

      // Location operating hours
      if (locationOperatingHours) {
        expandFromDayHours(locationOperatingHours[dayKey]);
      }

      // Staff working hours — expand the range for every team member
      // whose shift falls on a visible day, even if the location itself
      // is marked "closed" for that day.
      for (const member of teamMembers) {
        if (!member.working_hours) continue;
        expandFromDayHours(member.working_hours[dayKey]);
      }
    });

    if (hasAnyOpenSlot) {
      const padding = 1;
      calculatedStartHour = Math.max(0, minHour - padding);
      calculatedEndHour = Math.min(23, maxHour + padding);
    } else {
      // No open slots detected — either location hours aren't set,
      // all visible days are closed, or the data format wasn't parsed.
      // Use sensible business-hour defaults so the grid isn't empty.
      calculatedStartHour = 8;
      calculatedEndHour = 20;
    }

    // Expand range to include all appointments on visible dates (prevents clipping)
    const toDateStr = (d: string) => (d && d.length >= 10 ? d.slice(0, 10) : d);
    appointments.forEach((apt) => {
      const aptDateStr = toDateStr(apt.scheduled_date || "");
      if (!aptDateStr || !visibleDateStrs.has(aptDateStr)) return;
      const { hour: h, minute: m } = parseTimeFromUnknown(apt.scheduled_time, 9, 0);
      const duration = apt.duration_minutes || 60;
      const endMinutes = h * 60 + m + duration;
      const endH = Math.min(23, Math.ceil(endMinutes / 60));
      if (h < calculatedStartHour) calculatedStartHour = Math.max(0, h - 1);
      if (endH > calculatedEndHour) calculatedEndHour = Math.min(23, endH + 1);
    });

    // Include time blocks in the visible hour range
    timeBlocks.forEach((block) => {
      const blockDateStr =
        typeof block.date === "string" && block.date.length >= 10 ? block.date.slice(0, 10) : "";
      if (!blockDateStr || !visibleDateStrs.has(blockDateStr)) return;
      const { hour: h } = parseTimeFromUnknown(block.start_time, 0, 0);
      const endParts = parseTimeFromUnknown(block.end_time, h, 0);
      const endMinutes = endParts.hour * 60 + endParts.minute;
      const endH = Math.min(23, Math.ceil(endMinutes / 60));
      if (h < calculatedStartHour) calculatedStartHour = Math.max(0, h - 1);
      if (endH > calculatedEndHour) calculatedEndHour = Math.min(23, endH + 1);
    });

    return { startHour: calculatedStartHour, endHour: calculatedEndHour };
  }, [locationOperatingHours, selectedDateSafe, dateView, appointments, timeBlocks, teamMembers]);
  
  const _timeBlockSidebarState = useTimeBlockSidebar();
  
  // Waiting room state
  const [isWaitingRoomOpen, setIsWaitingRoomOpen] = useState(false);
  
  // Compute waiting appointments (for badge count and panel)
  const waitingAppointments = React.useMemo(() => {
    return appointments.filter(apt => {
      const status = mapStatus(apt);
      return status === AppointmentStatus.WAITING;
    });
  }, [appointments]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(() => initialCalendar?.error ?? null);
  useRoutePerformance("calendar", !isLoadingProvider && !isLoading && teamMembers.length > 0);
  const calendarViewportMd = useMediaQueryMatch(TW_MD_MIN_QUERY);
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>("all");
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([]);
  const loadDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastForegroundRefreshRef = useRef(0);
  const [_isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isGroupBookingDialogOpen, setIsGroupBookingDialogOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printDialogStaffId, setPrintDialogStaffId] = useState<string | null>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [postCheckoutRateOpen, setPostCheckoutRateOpen] = useState(false);
  const [postCheckoutRateBookingId, setPostCheckoutRateBookingId] = useState<string | null>(null);
  const [postCheckoutRateClientName, setPostCheckoutRateClientName] = useState<string>("Client");
  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isSetDayOffDialogOpen, setIsSetDayOffDialogOpen] = useState(false);
  const [isEditWorkHoursDialogOpen, setIsEditWorkHoursDialogOpen] = useState(false);
  const [selectedStaffForDialog, setSelectedStaffForDialog] = useState<TeamMember | null>(null);
  const [defaultTimeSlot, setDefaultTimeSlot] = useState<string>("");
  const [defaultTeamMemberId, setDefaultTeamMemberId] = useState<string>("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedAppointmentsForGroup, setSelectedAppointmentsForGroup] = useState<Appointment[]>([]);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Self-heal invalid date state so format()/date-fns calls never throw.
  useEffect(() => {
    if (!isValidDateValue(selectedDate)) {
      setSelectedDate(nowInTz(businessTz));
    }
  }, [selectedDate, businessTz]);

  // Swipe detection for mobile navigation
  const minSwipeDistance = 50;

  const _handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const _handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const _handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      navigateDate(1);
    } else if (isRightSwipe) {
      navigateDate(-1);
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Cache for calendar data (appointments + blocks)
  const calendarCacheRef = useRef<Map<string, { data: Appointment[]; timeBlocks: TimeBlock[]; availabilityBlocks: AvailabilityBlockDisplay[]; timestamp: number }>>(new Map());
  const CALENDAR_CACHE_DURATION = 60 * 1000; // 60 seconds (increased from 10s for better perf)
  const pendingCalendarRequests = useRef<Map<string, Promise<any>>>(new Map());

  // Cache for team members (longer duration since they change less frequently)
  const teamMembersCacheRef = useRef<{ data: TeamMember[]; locationId: string | null; timestamp: number } | null>(null);
  const TEAM_MEMBERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const pendingTeamMembersRequest = useRef<Promise<TeamMember[]> | null>(null);

  useEffect(() => {
    if (!initialCalendar.cacheKey || initialCalendar.error) return;
    calendarCacheRef.current.set(initialCalendar.cacheKey, {
      data: initialCalendar.appointments,
      timeBlocks: initialCalendar.timeBlocks ?? [],
      availabilityBlocks: initialCalendar.availabilityBlocks ?? [],
      timestamp: Date.now(),
    });
    if (initialCalendar.teamMembers.length > 0) {
      teamMembersCacheRef.current = {
        data: initialCalendar.teamMembers,
        locationId: null,
        timestamp: Date.now(),
      };
    }
  }, [initialCalendar]);

  // Load services using same API as /provider/bookings (listServices)
  const servicesLoadedRef = useRef(false);
  const loadServices = useCallback(async () => {
    if (servicesLoadedRef.current || services.length > 0) return;
    try {
      servicesLoadedRef.current = true;
      const svcs = await providerApi.listServices();
      setServices(svcs || []);
    } catch (error) {
      console.error("Failed to load services:", error);
      servicesLoadedRef.current = false;
    }
  }, []);

  // Load services on mount (same API as appointments page)
  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Track previous location ID to prevent unnecessary updates
  const prevLocationIdRef = useRef<string | null>(null);
  const locationHoursCacheRef = useRef<Map<string, Record<string, any> | null>>(new Map());
  
  // Get stable reference to first salon ID
  const firstSalonId = salons.length > 0 ? salons[0]?.id : null;
  const currentLocationId = selectedLocationId || firstSalonId;

  // Load location operating hours
  useEffect(() => {
    prevLocationIdRef.current = currentLocationId || null;

    const loadLocationHours = async () => {
      if (!currentLocationId) {
        setLocationOperatingHours(null);
        return;
      }

      // Always read fresh from salons array (invalidated on operating hours save)
      const location = salons.find(s => s.id === currentLocationId) as any;
      const rawHours = location?.operating_hours || location?.working_hours;
      const hours = rawHours && typeof rawHours === "object" && Object.keys(rawHours).length > 0
        ? rawHours
        : null;
      
      if (hours) {
        locationHoursCacheRef.current.set(currentLocationId, hours);
        setLocationOperatingHours(hours);
      } else {
        // If not in salons array, try fetching all locations and find the one we need
        try {
          const response = await fetcher.get<{ data: any[] }>(`/api/provider/locations`);
          const allLocations = response.data || [];
          const foundLocation = allLocations.find((loc: any) => loc.id === currentLocationId);
          
          const foundHours = foundLocation?.operating_hours || foundLocation?.working_hours;
          const validHours = foundHours && typeof foundHours === "object" && Object.keys(foundHours).length > 0
            ? foundHours
            : null;
          if (validHours) {
            locationHoursCacheRef.current.set(currentLocationId, validHours);
            setLocationOperatingHours(validHours);
          } else {
            // No operating hours found, set to null (will use default 24-hour view)
            locationHoursCacheRef.current.set(currentLocationId, null);
            setLocationOperatingHours(null);
          }
        } catch (error) {
          console.error("Failed to load location operating hours:", error);
          // On error, set to null (will use default 24-hour view without greying)
          locationHoursCacheRef.current.set(currentLocationId, null);
          setLocationOperatingHours(null);
        }
      }
    };
    
    loadLocationHours();
  }, [currentLocationId, salons]); // Re-run when salon payload arrives to avoid fallback refetches

  // Load team members with caching
  const loadTeamMembers = useCallback(async (locationId?: string): Promise<TeamMember[]> => {
    // Check cache first
    const cached = teamMembersCacheRef.current;
    if (cached && 
        Date.now() - cached.timestamp < TEAM_MEMBERS_CACHE_DURATION &&
        cached.locationId === (locationId || null)) {
      return cached.data;
    }

    // Check for pending request
    if (pendingTeamMembersRequest.current) {
      return pendingTeamMembersRequest.current;
    }

    // Fetch team members
    const requestPromise = (async () => {
      try {
        // Try with location filter first
        let locationMembers = await providerApi.listTeamMembers(locationId);
        // If no members found with location filter, try without location filter
        if (locationMembers.length === 0 && locationId) {
          // API now falls back for legacy DBs without provider_staff_locations; keep one retry for older servers.
          locationMembers = await providerApi.listTeamMembers(undefined);
        }
        
        // Update cache
        teamMembersCacheRef.current = {
          data: locationMembers,
          locationId: locationId || null,
          timestamp: Date.now(),
        };
        
        return locationMembers;
      } finally {
        pendingTeamMembersRequest.current = null;
      }
    })();

    pendingTeamMembersRequest.current = requestPromise;
    return requestPromise;
  }, []);

  // Define loadDataFresh first (used by loadData)
  const loadDataFresh = useCallback(async (dateFrom: string, dateTo: string, cacheKey: string, showLoading: boolean) => {
    const requestPromise = (async () => {
      try {
        if (showLoading) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setCalendarError(null);

        // Load appointments, team members, and time blocks in parallel
        // Use cached team members if available, otherwise fetch
        const locationId = selectedLocationId || undefined;
        const currentTeamMembers = teamMembers.length > 0 ? teamMembers : null;
        const membersPromise = currentTeamMembers 
          ? Promise.resolve(currentTeamMembers) 
          : loadTeamMembers(locationId);
        
        const { fromIso, toIso } = dateRangeBoundsUtc(dateFrom, dateTo, businessTz);

        const [
          apptsResponse,
          membersResult,
          blocks,
          availBlocks,
          staffUnavail,
          bookingHolds,
        ] = await Promise.all([
          providerApi.listAppointments(
            {
              date_from: dateFrom,
              date_to: dateTo,
              expand_for_calendar: true,
              ...(selectedTeamMember !== "all" && { team_member_id: selectedTeamMember }),
            },
            { page: 1, limit: 500 }
          ),
          membersPromise,
          providerApi.listTimeBlocks({
            date_from: dateFrom,
            date_to: dateTo,
            ...(selectedTeamMember !== "all" && { team_member_id: selectedTeamMember }),
            ...(selectedLocationId && { location_id: selectedLocationId }),
          }),
          providerApi.listAvailabilityBlocks({ from: fromIso, to: toIso }),
          providerApi.listStaffCalendarUnavailability({
            date_from: dateFrom,
            date_to: dateTo,
          }),
          providerApi.listProviderBookingHolds({
            date_from: dateFrom,
            date_to: dateTo,
          }),
        ]);

        const members = membersResult;

        // Filter availability blocks by current location when set (block applies to all locations or this location)
        const filteredAvailBlocks = selectedLocationId
          ? availBlocks.filter((b) => b.location_id == null || b.location_id === selectedLocationId)
          : availBlocks;
        const sanitizedAvailBlocks = sanitizeAvailabilityBlocks(filteredAvailBlocks);
        const filteredStaffUnavail =
          selectedTeamMember !== "all"
            ? staffUnavail.filter((b) => b.team_member_id === selectedTeamMember)
            : staffUnavail;
        // B8: filter active booking_holds the same way (team / location).
        const filteredBookingHolds = bookingHolds.filter((b) => {
          if (selectedTeamMember !== "all" && b.team_member_id && b.team_member_id !== selectedTeamMember) {
            return false;
          }
          if (selectedLocationId && b.location_id && b.location_id !== selectedLocationId) {
            return false;
          }
          return true;
        });
        const sanitizedBookingHolds = sanitizeAvailabilityBlocks(filteredBookingHolds);
        const mergedAvailOverlay = [
          ...filteredStaffUnavail,
          ...sanitizedAvailBlocks,
          ...sanitizedBookingHolds,
        ];

        const expandedBlocks = expandTimeBlocksForCalendarRange(blocks, dateFrom, dateTo);

        // Update cache (include blocks so cached restores don't leave them stale)
        calendarCacheRef.current.set(cacheKey, {
          data: apptsResponse.data,
          timeBlocks: expandedBlocks,
          availabilityBlocks: mergedAvailOverlay,
          timestamp: Date.now(),
        });

        setAppointments(apptsResponse.data);
        setTimeBlocks(expandedBlocks);
        setAvailabilityBlocks(mergedAvailOverlay);
        setTeamMembers((prevMembers) => {
          // Initialize selectedTeamMemberIds when members are loaded
          if (members.length > 0) {
            // If no members were selected before, select all
            if (prevMembers.length === 0) {
              setSelectedTeamMemberIds(members.map(m => m.id));
            } else {
              // Keep existing selections, but add any new members
              setSelectedTeamMemberIds((prevIds) => {
                const existingIds = new Set(prevIds);
                const newIds = members.map(m => m.id).filter(id => !existingIds.has(id));
                // If no previous selections, select all; otherwise add new ones
                return prevIds.length === 0 
                  ? members.map(m => m.id)
                  : newIds.length > 0 
                    ? [...prevIds, ...newIds]
                    : prevIds;
              });
            }
          }
          return members;
        });
      } catch (error: any) {
        console.error("Failed to load calendar data:", error);
        setCalendarError(error?.message || "Failed to load calendar data");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        pendingCalendarRequests.current.delete(cacheKey);
      }
    })();

    pendingCalendarRequests.current.set(cacheKey, requestPromise);
    await requestPromise;
  }, [selectedTeamMember, teamMembers, selectedLocationId, loadTeamMembers, businessTz]);

  // Force refresh by clearing cache and loading fresh data
  const forceRefresh = useCallback(async () => {
    const safeSelectedDate = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
    if (!isValidDateValue(selectedDate)) {
      setSelectedDate(safeSelectedDate);
    }

    // Calculate date range based on view
    let dateFrom: string;
    let dateTo: string;
    
    if (dateView === "day") {
      dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
      dateTo = dateFrom;
    } else if (dateView === "3-days") {
      dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
      const endDate = addDays(safeSelectedDate, 2);
      dateTo = format(endDate, "yyyy-MM-dd");
    } else {
      // Week view
      const weekStart = startOfWeek(safeSelectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(safeSelectedDate, { weekStartsOn: 1 });
      dateFrom = format(weekStart, "yyyy-MM-dd");
      dateTo = format(weekEnd, "yyyy-MM-dd");
    }

    // Create cache key (include location for location-specific caching)
    const locationKey = selectedLocationId || 'all';
    const cacheKey = `${dateFrom}-${dateTo}-${selectedTeamMember}-${locationKey}`;
    
    // Clear cache for this key to force fresh load
    calendarCacheRef.current.delete(cacheKey);
    
    // Force fresh load
    await loadDataFresh(dateFrom, dateTo, cacheKey, false);
  }, [selectedDate, businessTz, dateView, selectedTeamMember, selectedLocationId, loadDataFresh]);

  const loadData = useCallback(async (showLoading = false) => {
    // Clear any pending timeouts
    if (loadDataTimeoutRef.current) {
      clearTimeout(loadDataTimeoutRef.current);
      loadDataTimeoutRef.current = null;
    }

    const safeSelectedDate = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
    if (!isValidDateValue(selectedDate)) {
      setSelectedDate(safeSelectedDate);
    }

    // Calculate date range based on view
    let dateFrom: string;
    let dateTo: string;

    if (dateView === "day") {
      dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
      dateTo = dateFrom;
    } else if (dateView === "3-days") {
      dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
      const endDate = addDays(safeSelectedDate, 2);
      dateTo = format(endDate, "yyyy-MM-dd");
    } else {
      // Week view
      const weekStart = startOfWeek(safeSelectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(safeSelectedDate, { weekStartsOn: 1 });
      dateFrom = format(weekStart, "yyyy-MM-dd");
      dateTo = format(weekEnd, "yyyy-MM-dd");
    }

    // Create cache key (include location for location-specific caching)
    const locationKey = selectedLocationId || "all";
    const cacheKey = `${dateFrom}-${dateTo}-${selectedTeamMember}-${locationKey}`;

    // Check cache first
    const cached = calendarCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CALENDAR_CACHE_DURATION) {
      setAppointments(cached.data);
      if (cached.timeBlocks) setTimeBlocks(cached.timeBlocks);
      if (cached.availabilityBlocks) setAvailabilityBlocks(cached.availabilityBlocks);
      // Load team members if needed (using cached version if available)
      if (teamMembers.length === 0) {
        loadTeamMembers(selectedLocationId || undefined)
          .then((members) => {
            setTeamMembers((prevMembers) => {
              // Initialize selectedTeamMemberIds when members are loaded
              if (members.length > 0 && prevMembers.length === 0) {
                setSelectedTeamMemberIds(members.map((m) => m.id));
              }
              return members;
            });
          })
          .catch(() => {
            // Ignore errors for background team member load
          });
      }
      setIsLoading(false);
      setIsRefreshing(false);

      // Refresh in background if cache is > 30 seconds old (increased from 5s)
      if (Date.now() - cached.timestamp > 30 * 1000) {
        loadDataFresh(dateFrom, dateTo, cacheKey, false).catch(() => {
          // Silently fail background refresh
        });
      }
      return;
    }

    // Check for pending request
    if (pendingCalendarRequests.current.has(cacheKey)) {
      try {
        await pendingCalendarRequests.current.get(cacheKey);
        return;
      } catch {
        // Continue with new request if previous failed
      }
    }

    await loadDataFresh(dateFrom, dateTo, cacheKey, showLoading);
  }, [selectedDate, businessTz, dateView, selectedTeamMember, teamMembers.length, selectedLocationId, loadDataFresh, loadTeamMembers]);

  // Optimistically update appointments when status/current_stage changes (instant block color change)
  const handleAppointmentUpdated = useCallback(
    (updatedAppointment: Appointment) => {
      const bookingId =
        updatedAppointment.booking_id ??
        (updatedAppointment.id?.includes("-svc-")
          ? updatedAppointment.id.split("-svc-")[0]
          : updatedAppointment.id);
      if (!bookingId) {
        void loadData(false);
        return;
      }

      setAppointments((prev) =>
        prev.map((apt) => {
          const belongsToBooking =
            apt.booking_id === bookingId ||
            apt.id === bookingId ||
            (typeof apt.id === "string" && apt.id.startsWith(bookingId + "-svc-"));
          if (!belongsToBooking) return apt;
          return {
            ...apt,
            status: updatedAppointment.status,
            current_stage: updatedAppointment.current_stage,
          };
        })
      );

      const safeSelectedDate = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
      let dateFrom: string;
      let dateTo: string;
      if (dateView === "day") {
        dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
        dateTo = dateFrom;
      } else if (dateView === "3-days") {
        dateFrom = format(safeSelectedDate, "yyyy-MM-dd");
        dateTo = format(addDays(safeSelectedDate, 2), "yyyy-MM-dd");
      } else {
        const weekStart = startOfWeek(safeSelectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(safeSelectedDate, { weekStartsOn: 1 });
        dateFrom = format(weekStart, "yyyy-MM-dd");
        dateTo = format(weekEnd, "yyyy-MM-dd");
      }
      const locationKey = selectedLocationId || "all";
      const cacheKey = `${dateFrom}-${dateTo}-${selectedTeamMember}-${locationKey}`;
      calendarCacheRef.current.delete(cacheKey);
      void loadData(false);
    },
    [selectedDate, businessTz, dateView, selectedTeamMember, selectedLocationId, loadData]
  );

  const supabaseClient = getSupabaseClient();

  const debouncedRealtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRealtimeRefresh = useCallback(() => {
    if (debouncedRealtimeRefreshRef.current) {
      clearTimeout(debouncedRealtimeRefreshRef.current);
    }
    debouncedRealtimeRefreshRef.current = setTimeout(() => {
      forceRefresh();
    }, 500);
  }, [forceRefresh]);

  // §Provider-launch (audit 2026-04): each call to `useSupabaseRealtime`
  // with a booking_* event subscribes to the SAME underlying `bookings`
  // channel (see subscribeToBookings). Registering four of them created
  // four duplicate channels that all fire the same handler, wasting
  // Realtime quota and causing 4x debounced refreshes per change. One
  // subscription is sufficient because the handler already refreshes the
  // whole calendar when any booking row changes.
  useSupabaseRealtime(supabaseClient, provider?.id, 'booking_updated', debouncedRealtimeRefresh);

  // Initial load - wait for provider data (skip blocking spinner when RSC hydrated cache)
  useEffect(() => {
    if (!isLoadingProvider && provider) {
      const hydrated = Boolean(initialCalendar.cacheKey && !initialCalendar.error);
      loadData(!hydrated);
    }
  }, [isLoadingProvider, provider, loadData, initialCalendar.cacheKey, initialCalendar.error]);

  // Invalidate team members cache when location changes
  useEffect(() => {
    // Clear team members cache when location changes
    teamMembersCacheRef.current = null;
    pendingTeamMembersRequest.current = null;
  }, [selectedLocationId]);

  // Reload data when date or view changes (filters are applied client-side)
  // Use debouncing to prevent excessive calls
  useEffect(() => {
    // Clear any pending timeout
    if (loadDataTimeoutRef.current) {
      clearTimeout(loadDataTimeoutRef.current);
    }

    loadDataTimeoutRef.current = setTimeout(() => {
      loadData(false);
    }, 0);

    return () => {
      if (loadDataTimeoutRef.current) {
        clearTimeout(loadDataTimeoutRef.current);
      }
    };
  }, [selectedDate, dateView, selectedTeamMember, loadData]);

  useEffect(() => {
    const maybeRefresh = () => {
      const nowTs = Date.now();
      if (nowTs - lastForegroundRefreshRef.current < 30000) return;
      lastForegroundRefreshRef.current = nowTs;
      loadData(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };

    const handleFocus = () => {
      maybeRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  const navigateDate = (days: number) => {
    const baseDate = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
    const newDate = new Date(baseDate);
    if (dateView === "week") {
      newDate.setDate(newDate.getDate() + days * 7);
    } else if (dateView === "3-days") {
      newDate.setDate(newDate.getDate() + days * 3);
    } else {
      newDate.setDate(newDate.getDate() + days);
    }
    // Clear calendar cache so the next loadData call fetches fresh data
    calendarCacheRef.current.clear();
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    calendarCacheRef.current.clear();
    setSelectedDate(nowInTz(businessTz));
  };

  const handleAppointmentClick = useCallback(async (appointment: Appointment) => {
    const bookingId = appointment.booking_id
      ? appointment.booking_id
      : appointment.id.includes("-svc-")
        ? appointment.id.split("-svc-")[0]
        : appointment.id;
    try {
      const full = await providerApi.getAppointment(bookingId);
      openViewMode(full);
    } catch {
      openViewMode(appointment);
    }
  }, []);

  const handleTimeSlotClick = (date: Date, time: string, teamMemberId: string) => {
    const currentLocation = selectedLocationId 
      ? salons.find(s => s.id === selectedLocationId)
      : salons[0];
    openCreateMode({
      staffId: teamMemberId,
      staffName: teamMembers.find(m => m.id === teamMemberId)?.name,
      date: format(date, "yyyy-MM-dd"),
      startTime: time,
      locationId: currentLocation?.id,
      locationName: currentLocation?.name,
    });
  };

  // Staff dropdown menu handlers
  const handleViewWeekSchedule = (staffMember: TeamMember) => {
    // Filter calendar to show only this staff member and switch to week view
    setSelectedTeamMember(staffMember.id);
    setSelectedTeamMemberIds([staffMember.id]);
    setDateView("week");
    // Optionally scroll to current week
    goToToday();
  };

  const handlePrintDaySchedule = (staffMember: TeamMember) => {
    // Open print dialog filtered to this staff member
    setPrintDialogStaffId(staffMember.id);
    setIsPrintDialogOpen(true);
  };

  const handleEditWorkHours = (staffMember: TeamMember) => {
    setSelectedStaffForDialog(staffMember);
    setIsEditWorkHoursDialogOpen(true);
  };

  const handleSetDayOff = (staffMember: TeamMember) => {
    setSelectedStaffForDialog(staffMember);
    setIsSetDayOffDialogOpen(true);
  };

  const handleCreateAppointment = () => {
    const currentLocation = selectedLocationId 
      ? salons.find(s => s.id === selectedLocationId)
      : salons[0];
    const staffId = selectedTeamMember !== "all" 
      ? selectedTeamMember 
      : filteredTeamMembers[0]?.id || "";
    const staffMember = teamMembers.find(m => m.id === staffId);
    
    if (!staffId && filteredTeamMembers.length === 0) {
      console.warn("No staff members available to create appointment");
      return;
    }
    
    if (!currentLocation?.id) {
      console.warn("No location available to create appointment");
      return;
    }
    
    // Use the currently-viewed calendar date (falls back to today if invalid)
    const targetDate = isValidDateValue(selectedDate) ? selectedDate : nowInTz(businessTz);
    openCreateMode({
      staffId,
      staffName: staffMember?.name,
      date: format(targetDate, "yyyy-MM-dd"),
      startTime: "",
      locationId: currentLocation.id,
      locationName: currentLocation.name,
    });
  };

  const handleCreateAppointmentRef = useRef(handleCreateAppointment);
  handleCreateAppointmentRef.current = handleCreateAppointment;

  useEffect(() => {
    const handler = () => handleCreateAppointmentRef.current();
    window.addEventListener("openAppointmentDialog", handler);
    return () => window.removeEventListener("openAppointmentDialog", handler);
  }, []);

  // Read URL search params for prefill from waitlist / client profile / external navigation
  const searchParams = useSearchParams();
  const prefillHandledRef = useRef(false);
  useEffect(() => {
    if (prefillHandledRef.current) return;
    const shouldOpenNew = searchParams.get("new") === "1";
    const customerId = searchParams.get("customerId");
    if (!shouldOpenNew && !customerId) return;
    if (salons.length === 0 || teamMembers.length === 0) return;
    prefillHandledRef.current = true;

    const currentLocation = selectedLocationId
      ? salons.find(s => s.id === selectedLocationId)
      : salons[0];
    const prefillStaffId = searchParams.get("staff_id") || "";
    const staffId = prefillStaffId || (filteredTeamMembers[0]?.id ?? "");
    const staffMember = teamMembers.find(m => m.id === staffId);
    const prefillDate = searchParams.get("date") || format(nowInTz(businessTz), "yyyy-MM-dd");
    const prefillTime = searchParams.get("time") || "";

    const appointmentKind = searchParams.get("walk_in") === "true"
      ? "walk_in" as const
      : undefined;

    openCreateMode({
      staffId,
      staffName: staffMember?.name,
      date: prefillDate,
      startTime: prefillTime,
      locationId: currentLocation?.id,
      locationName: currentLocation?.name,
      appointmentKind,
      prefillClientName: searchParams.get("client_name") || undefined,
      prefillClientEmail: searchParams.get("client_email") || undefined,
      prefillClientPhone: searchParams.get("client_phone") || undefined,
      prefillCustomerId: customerId || undefined,
      prefillServiceId: searchParams.get("service_id") || undefined,
    });

    // Clean up the URL params so a page refresh doesn't re-trigger
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    url.searchParams.delete("customerId");
    url.searchParams.delete("client_name");
    url.searchParams.delete("client_email");
    url.searchParams.delete("client_phone");
    url.searchParams.delete("service_id");
    url.searchParams.delete("staff_id");
    url.searchParams.delete("time");
    url.searchParams.delete("walk_in");
    url.searchParams.delete("waitlist_entry_id");
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
  }, [searchParams, salons, teamMembers, selectedLocationId, businessTz]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for front-desk rapid booking
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isInputFocused) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleCreateAppointmentRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const _handleEditAppointment = () => {
    if (selectedAppointment) {
      setIsDetailsModalOpen(false);
      openViewMode(selectedAppointment);
    }
  };

  const _handleDeleteAppointment = async () => {
    if (!selectedAppointment) return;
    
    if (confirm(`Are you sure you want to delete appointment ${selectedAppointment.ref_number}?`)) {
      try {
        await providerApi.deleteAppointment(selectedAppointment.id);
        setIsDetailsModalOpen(false);
        setSelectedAppointment(null);
        loadData();
      } catch (error) {
        console.error("Failed to delete appointment:", error);
        alert("Failed to delete appointment. Please try again.");
      }
    }
  };

  const _handleStatusChange = async (newStatus: Appointment["status"]) => {
    if (!selectedAppointment) return;
    
    try {
      await providerApi.updateAppointment(selectedAppointment.id, {
        status: newStatus,
        ...((selectedAppointment as any).version !== undefined && { version: (selectedAppointment as any).version }),
      });
      setIsDetailsModalOpen(false);
      setSelectedAppointment(null);
      loadData();
    } catch (error) {
      console.error("Failed to update appointment status:", error);
      alert("Failed to update appointment status. Please try again.");
    }
  };

  const _handleAppointmentSuccess = () => {
    // Force a refresh by calling loadData
    // Use a small delay to ensure the database has been updated
    setTimeout(() => {
      loadData();
    }, 500);
  };

  // Handle checkout flow
  const _handleCheckout = () => {
    if (selectedAppointment) {
      setIsDetailsModalOpen(false);
      setIsCheckoutDialogOpen(true);
    }
  };

  // Handle checkout from appointment creation
  const _handleAppointmentCheckout = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsCheckoutDialogOpen(true);
  };

  // Handle checkout completion
  const handleCheckoutComplete = async (
    paymentMethod: string,
    tipAmount: number,
    discountAmount: number,
    notes: string
  ) => {
    if (!selectedAppointment) {
      throw new Error("No appointment selected");
    }

    const apt = selectedAppointment;
    const bookingIdForRating = String(apt.booking_id ?? apt.id);
    const clientIdForRating = apt.client_id?.trim() || "";
    const clientNameForRating = apt.client_name?.trim() || "Client";

    try {
      await providerApi.completeService(apt.id);
      if (notes && notes !== apt.notes) {
        await providerApi.updateAppointment(apt.id, { notes }).catch(() => {});
      }

      // Create sale record with payment details (all services + products on the booking)
      try {
        const saleItems = buildSaleItemsFromAppointment(apt);
        const lineSum = saleItems.reduce((s, i) => s + i.total, 0);
        const subtotalForSale = Number(apt.subtotal ?? lineSum);
        const taxForSale = Number(apt.tax_amount ?? 0);
        const travel = Number(apt.travel_fee ?? 0);
        const bookingTotal =
          Number(apt.total_amount) > 0
            ? Number(apt.total_amount)
            : subtotalForSale + taxForSale + travel;
        const saleTotal = Math.max(0, bookingTotal + tipAmount - discountAmount);

        await providerApi.createSale({
          customer_id: apt.client_id,
          client_name: apt.client_name,
          date: apt.scheduled_date,
          items: saleItems.map((i) => ({
            id: i.id,
            type: i.type,
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            total: i.total,
            item_id: i.item_id ?? undefined,
          })),
          subtotal: subtotalForSale,
          tax: taxForSale,
          total: saleTotal,
          payment_method: paymentMethod,
          location_id: apt.location_id || undefined,
          team_member_id: apt.team_member_id || undefined,
          notes: notes ? `${notes}${tipAmount > 0 ? ` (Tip: R${tipAmount})` : ""}`.trim() : undefined,
          discount_amount: discountAmount,
        } as Parameters<typeof providerApi.createSale>[0]);
      } catch (error) {
        console.error("Failed to create sale record:", error);
        // Don't fail the checkout if sale creation fails
      }

      setIsCheckoutDialogOpen(false);
      setSelectedAppointment(null);
      loadData();

      if (clientIdForRating && bookingIdForRating) {
        setPostCheckoutRateBookingId(bookingIdForRating);
        setPostCheckoutRateClientName(clientNameForRating);
        setPostCheckoutRateOpen(true);
      }
    } catch (error) {
      console.error("Checkout failed:", error);
      throw error;
    }
  };

  const handleStatusManagerUpdate = async (
    appointmentId: string,
    newStatus: string,
    _reason?: string,
    _notes?: string
  ) => {
    try {
      if (newStatus === "completed" || newStatus === "in_progress" || newStatus === "started") {
        if (newStatus === "completed") {
          await providerApi.completeService(appointmentId);
        } else {
          await providerApi.startService(appointmentId);
        }
      } else {
        const apt = appointments.find((a) => a.id === appointmentId || (a as any).booking_id === appointmentId);
        await providerApi.updateAppointment(appointmentId, {
          status: newStatus as Appointment["status"],
          ...(apt && (apt as any).version !== undefined && { version: (apt as any).version }),
        });
      }
      setIsStatusManagerOpen(false);
      setSelectedAppointment(null);
      loadData();
    } catch (error) {
      console.error("Failed to update status:", error);
      throw error;
    }
  };

  // Handle drag-and-drop reschedule
  const handleReschedule = async (
    appointmentId: string,
    newDate: string,
    newTime: string,
    newStaffId: string
  ) => {
    try {
      const apt = appointments.find((a) => a.id === appointmentId || (a as any).booking_id === appointmentId);
      await providerApi.updateAppointment(appointmentId, {
        scheduled_date: newDate,
        scheduled_time: newTime,
        team_member_id: newStaffId,
        ...(apt && (apt as any).version !== undefined && { version: (apt as any).version }),
      });
      loadData();
    } catch (error) {
      console.error("Failed to reschedule appointment:", error);
      throw error;
    }
  };

  // Filter team members based on selection
  // If selectedTeamMemberIds is empty but teamMembers exist, show all members
  const filteredTeamMembers = selectedTeamMember === "all" 
    ? (selectedTeamMemberIds.length > 0 
        ? teamMembers.filter(m => selectedTeamMemberIds.includes(m.id))
        : teamMembers) // Show all if no selection made yet
    : teamMembers.filter(m => m.id === selectedTeamMember);

  // Toggle team member in filter (always resets to "all" API mode so
  // checkbox filtering stays client-side and doesn't conflict with
  // the single-staff API filter used by "View Week Schedule")
  const toggleTeamMemberFilter = (memberId: string) => {
    if (selectedTeamMember !== "all") {
      setSelectedTeamMember("all");
    }
    setSelectedTeamMemberIds(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Select all team members
  const selectAllTeamMembers = () => {
    setSelectedTeamMember("all");
    setSelectedTeamMemberIds(teamMembers.map(m => m.id));
  };

  // Deselect all team members (clear the filter)
  const deselectAllTeamMembers = () => {
    setSelectedTeamMember("all");
    setSelectedTeamMemberIds([]);
  };

  // Clear single staff filter (when viewing one staff member's schedule)
  const clearStaffFilter = () => {
    setSelectedTeamMember("all");
    setSelectedTeamMemberIds(teamMembers.map(m => m.id));
  };

  // Ensure selectedTeamMemberIds is initialized when team members are loaded
  useEffect(() => {
    if (teamMembers.length > 0 && selectedTeamMemberIds.length === 0) {
      setSelectedTeamMemberIds(teamMembers.map(m => m.id));
    }
  }, [teamMembers, selectedTeamMemberIds.length]);

  // Team member checkbox filtering is client-side only; do not refetch calendar data here.

  // Show loading only on initial load (before we have any data).
  // Once team members are loaded, keep the calendar mounted to preserve local state
  // (e.g. layout mode, selected staff) and show a subtle refresh indicator instead.
  if (isLoadingProvider || (isLoading && teamMembers.length === 0 && !calendarError)) {
    return (
      <LoadingTimeout
        loadingMessage={isLoadingProvider ? "Loading provider data..." : "Loading calendar..."}
        timeoutMs={PROVIDER_BOOTSTRAP_TIMEOUT_MS}
      />
    );
  }

  if (calendarError && teamMembers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <div className="rounded-full bg-red-50 p-4">
          <X className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Failed to load calendar</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">{calendarError}</p>
        <Button onClick={() => loadData(true)} className="min-h-[44px]">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 sm:mx-0 sm:mt-0 max-w-full flex flex-col md:h-full md:overflow-x-hidden">
      {/*
        §Provider-launch (audit 2026-04): if a background refresh fails
        while the calendar is already populated, previously `calendarError`
        was set but never surfaced (the blocking error UI only fires when
        teamMembers is empty). We now show a dismissible inline banner so
        the provider knows the grid may be stale and can retry without
        losing their place.
      */}
      {calendarError && teamMembers.length > 0 && (
        <div
          role="alert"
          className="mx-3 mt-3 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex-1">
            <span className="font-medium">Calendar couldn&apos;t refresh.</span>{" "}
            <span className="text-amber-800">{calendarError}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => loadData(true)}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCalendarError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {calendarViewportMd === null && (
        <div
          className="flex flex-1 min-h-[50vh] md:min-h-[min(100vh,720px)] w-full items-center justify-center"
          aria-busy="true"
          aria-label="Loading calendar layout"
        >
          <RefreshCw className="h-9 w-9 animate-spin text-primary/40" />
        </div>
      )}
      {calendarViewportMd === true && (
      <div className="flex flex-col w-full max-w-full overflow-hidden flex-1 min-h-0 relative">
        {/*
          §Provider-launch (audit 2026-04): the "Refreshing..." affordance
          lived only inside the mobile layout, so desktop providers saw no
          feedback during background revalidations. Mirror it here in the
          top-right overlay so both surfaces communicate the stale state.
        */}
        {isRefreshing && (
          <div className="absolute top-3 right-3 z-40 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2 border border-gray-200 pointer-events-none">
            <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs text-gray-600">Refreshing…</span>
          </div>
        )}
        {/* Desktop Header - Mangomint Style */}
        <div className="bg-gradient-to-r from-[#1a1f3c] to-[#252a4a] sticky top-0 z-20 px-3 lg:px-6 py-3 overflow-x-auto">
          <div className="flex items-center justify-between gap-2 lg:gap-4 min-w-max">
            {/* Left: Today + Navigation + Date */}
            <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={goToToday}
                className="font-semibold text-white hover:bg-white/10 h-9 px-2 lg:px-3 text-xs lg:text-sm"
              >
                TODAY
              </Button>
              
              <div className="flex items-center bg-white/10 rounded-lg">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigateDate(-1)}
                  className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-white/10 rounded-l-lg rounded-r-none"
                >
                  <ChevronLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigateDate(1)}
                  className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-white/10 rounded-r-lg rounded-l-none"
                >
                  <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5" />
                </Button>
              </div>

              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="font-semibold text-white text-sm lg:text-base hover:bg-white/10 h-9 px-2 lg:px-3 whitespace-nowrap"
                  >
                    {dateView === "week" 
                      ? `${format(startOfWeek(selectedDateSafe, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(selectedDateSafe, { weekStartsOn: 1 }), "d, yyyy")}`
                      : format(selectedDateSafe, "EEE, MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDateSafe}
                    onSelect={(date) => {
                      if (date) {
                        calendarCacheRef.current.clear();
                        setSelectedDate(date);
                        setIsDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Center: Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 lg:gap-2 text-white hover:bg-white/10 h-9 px-2 lg:px-4 flex-shrink-0"
                  title="Filter by team members"
                  aria-label="Filter by team members"
                  aria-haspopup="true"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden lg:inline">FILTERS</span>
                  {(selectedTeamMember !== "all" || selectedTeamMemberIds.length < teamMembers.length) && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary text-white ml-1">
                      {selectedTeamMember !== "all" ? "1" : selectedTeamMemberIds.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-64">
                {selectedTeamMember !== "all" && (
                  <>
                    <div className="px-2 py-2 bg-blue-50 border-b border-blue-100">
                      <div className="text-xs font-medium text-blue-900 mb-1">
                        Viewing: {teamMembers.find(m => m.id === selectedTeamMember)?.name}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-7 text-blue-700 hover:text-blue-900 hover:bg-blue-100 w-full justify-start"
                        onClick={clearStaffFilter}
                      >
                        Show All Staff Members
                      </Button>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="px-2 py-1.5 text-xs font-medium text-gray-500 uppercase">
                  Team Members
                </div>
                <div className="flex gap-2 px-2 pb-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAllTeamMembers}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={deselectAllTeamMembers}>
                    Reset
                  </Button>
                </div>
                <Separator />
                {teamMembers.map((member) => (
                  <DropdownMenuCheckboxItem
                    key={member.id}
                    checked={selectedTeamMemberIds.includes(member.id)}
                    onCheckedChange={() => toggleTeamMemberFilter(member.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="text-xs bg-gradient-to-br from-primary to-[#FF6B35] text-white">
                          {member.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{member.name}</span>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Right: View Toggle + Actions */}
            <div className="flex items-center gap-1 lg:gap-3 flex-shrink-0">
              {/* Day/Week Toggle - Prominent like Mangomint */}
              <div className="flex items-center bg-white/10 rounded-lg p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateView("day")}
                  className={cn(
                    "h-8 px-2 lg:px-4 text-xs lg:text-sm font-semibold rounded-md transition-all",
                    dateView === "day" 
                      ? "bg-white text-[#1a1f3c] hover:bg-white shadow-sm" 
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  DAY
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateView("week")}
                  className={cn(
                    "h-8 px-2 lg:px-4 text-xs lg:text-sm font-semibold rounded-md transition-all",
                    dateView === "week" 
                      ? "bg-white text-[#1a1f3c] hover:bg-white shadow-sm" 
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  WEEK
                </Button>
              </div>

              {/* Status Legend (Mangomint-style) */}
              <MangomintStatusLegend
                variant="popover"
                showKinds={false}
                showBlocks={false}
                showAvailabilityOverlays
                compact
                className="text-white hover:bg-white/10"
              />

              {/* Preferences Panel */}
              <PreferencesPanel
                variant="icon"
                className="text-white hover:bg-white/10"
                align="end"
              />

              {/* Settings Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-white/10">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push("/provider/settings/calendar/display-preferences")}>
                    Display Preferences
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/provider/settings/calendar/colors-icons")}>
                    Colors & Icons
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/provider/settings/calendar/links")}>
                    Calendar Links
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/provider/settings/calendar-integration")}>
                    Calendar Integration
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Print Schedule - visible on md+ screens, mobile uses Filter Sheet */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPrintDialogOpen(true)}
                className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-white/10 hidden md:flex"
                title="Print Schedule"
                aria-label="Print schedule"
              >
                <Printer className="w-4 h-4" />
              </Button>

              {/* Group Booking - visible on md+ screens, mobile uses Filter Sheet */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const now = new Date();
                  const h = now.getHours();
                  const m = Math.ceil(now.getMinutes() / 15) * 15;
                  setDefaultTimeSlot(`${String(m >= 60 ? h + 1 : h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
                  if (selectedTeamMember !== "all") setDefaultTeamMemberId(selectedTeamMember);
                  setIsGroupBookingDialogOpen(true);
                }}
                className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-white/10 hidden md:flex"
                title="Group Booking"
                aria-label="Create group booking"
              >
                <Users className="w-4 h-4" />
              </Button>

              {/* New appointment dropdown - Add (schedule any time) + Walk-in (quick add now) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-primary/20 hover:text-white border border-white/20 hidden md:flex"
                    title="New appointment"
                    aria-label="New appointment"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={handleCreateAppointment}
                    className="gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add appointment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const bizNow = nowInTz(businessTz);
                      const minutes = bizNow.getMinutes();
                      const snappedMinutes = Math.ceil(minutes / 15) * 15;
                      bizNow.setMinutes(snappedMinutes, 0, 0);
                      const timeString = `${bizNow.getHours().toString().padStart(2, "0")}:${bizNow.getMinutes().toString().padStart(2, "0")}`;
                      const staffId = selectedTeamMember !== "all"
                        ? selectedTeamMember
                        : filteredTeamMembers[0]?.id || "";
                      const staffMember = teamMembers.find(m => m.id === staffId);
                      const currentLocation = selectedLocationId
                        ? salons.find(s => s.id === selectedLocationId)
                        : salons[0];
                      openCreateMode({
                        staffId,
                        staffName: staffMember?.name,
                        date: format(bizNow, "yyyy-MM-dd"),
                        startTime: timeString,
                        locationId: currentLocation?.id,
                        locationName: currentLocation?.name,
                        appointmentKind: "walk_in",
                      });
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <PersonStanding className="w-4 h-4 text-amber-600" />
                    Walk-in
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Desktop Calendar + Sidebar Container */}
        <div className={cn(
          "flex h-[calc(100vh-64px)] w-full max-w-full overflow-hidden box-border"
        )}>
          {/* Desktop Calendar */}
          <div className="flex-1 overflow-auto min-w-0 flex flex-col box-border p-4 transition-all duration-200">
            {teamMembers.length === 0 ? (
              <EmptyState
                title="No team members"
                description="Add team members in Settings → Team to see the calendar"
                action={{
                  label: "Add Team Member",
                  onClick: () => router.push("/provider/team/members"),
                }}
              />
            ) : (
              <div className="flex flex-1 flex-col min-h-0 min-w-0">
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pb-2 border-b border-border/60 mb-2 shrink-0"
                  aria-label="Schedule legend"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden />
                    Bookings
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/90" aria-hidden />
                    Blocks & breaks
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400/70" aria-hidden />
                    Shifts / closed
                  </span>
                </div>
                <CalendarDesktopWithDnd
                  allAppointments={appointments}
                  onReschedule={handleReschedule}
                  enableConflictValidation
                  appointments={appointments}
                  teamMembers={filteredTeamMembers}
                  timeBlocks={timeBlocks}
                  availabilityBlocks={availabilityBlocks}
                  selectedDate={selectedDateSafe}
                  view={dateView}
                  onAppointmentClick={handleAppointmentClick}
                  onTimeSlotClick={handleTimeSlotClick}
                  onTimeBlockClick={(block) => {
                    openEditTimeBlockMode({
                      ...block,
                      id: resolveTimeBlockRecordId(block),
                    });
                  }}
                  onCheckout={(apt) => {
                    setSelectedAppointment(apt);
                    setIsCheckoutDialogOpen(true);
                  }}
                  onStatusChange={async (apt, status) => {
                    try {
                      await providerApi.updateAppointment(apt.id, { status });
                      toast.success("Booking status updated successfully");
                      loadData();
                      if (selectedAppointment && selectedAppointment.id === apt.id) {
                        const updated = await providerApi.getAppointment(apt.id);
                        setSelectedAppointment(updated);
                      }
                    } catch (error: any) {
                      console.error("Failed to update status:", error);
                      const errorMessage = error?.message || error?.details || `Failed to update booking status to ${status}`;
                      toast.error(errorMessage, {
                        description: error?.code ? `Error code: ${error.code}` : undefined,
                      });
                    }
                  }}
                  onRefresh={loadData}
                  startHour={startHour}
                  endHour={endHour}
                  locationOperatingHours={locationOperatingHours}
                  onViewWeekSchedule={handleViewWeekSchedule}
                  onPrintDaySchedule={handlePrintDaySchedule}
                  onEditWorkHours={handleEditWorkHours}
                  onSetDayOff={handleSetDayOff}
                  businessTimezone={businessTz}
                />
              </div>
            )}
          </div>

          {/* Time Block Sidebar */}
          <TimeBlockSidebar
            teamMembers={teamMembers}
            onTimeBlockCreated={(_block) => {
              loadData();
            }}
            onTimeBlockUpdated={(_block) => {
              loadData();
            }}
            onTimeBlockDeleted={(_id) => {
              loadData();
            }}
            onRefresh={loadData}
          />
        </div>
      </div>
      )}

      {calendarViewportMd === false && (
      <div className="relative max-w-[100vw] w-full flex-1 min-w-0 min-h-0">
        {teamMembers.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No team members"
              description="Add team members in Settings → Team to see the calendar"
              action={{
                label: "Add Team Member",
                  onClick: () => router.push("/provider/team/members"),
                }}
              />
          </div>
        ) : (
          <>
            {isRefreshing && (
              <div className="absolute top-20 right-4 z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 border border-gray-200">
                <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                <span className="text-xs text-gray-600">Refreshing...</span>
              </div>
            )}
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 text-[11px] text-muted-foreground border-b border-border/50"
              aria-label="Schedule legend"
            >
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-primary" aria-hidden />
                Bookings
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-amber-400/90" aria-hidden />
                Blocks & breaks
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-slate-400/70" aria-hidden />
                Shifts / closed
              </span>
            </div>
            <CalendarMobileWithDnd
              allAppointments={appointments}
              timeBlocks={timeBlocks}
              onReschedule={handleReschedule}
              enableConflictValidation
              appointments={appointments}
              teamMembers={filteredTeamMembers}
              selectedDate={selectedDateSafe}
              view={dateView}
              onRefresh={loadData}
              onDateChange={(date) => {
                if (date instanceof Date && !isNaN(date.getTime())) {
                  calendarCacheRef.current.clear();
                  setSelectedDate(date);
                }
              }}
              onAppointmentClick={handleAppointmentClick}
              onTimeBlockClick={(block) => {
                openEditTimeBlockMode({
                  ...block,
                  id: resolveTimeBlockRecordId(block),
                });
              }}
              onTimeSlotClick={(date, time, teamMemberId) => {
                const currentLocation = selectedLocationId
                  ? salons.find(s => s.id === selectedLocationId)
                  : salons[0];
                const staffMember = teamMembers.find(m => m.id === teamMemberId);
                openCreateMode({
                  staffId: teamMemberId,
                  staffName: staffMember?.name,
                  date: format(date, "yyyy-MM-dd"),
                  startTime: time,
                  locationId: currentLocation?.id,
                  locationName: currentLocation?.name,
                });
              }}
              onCheckout={(apt) => {
                setSelectedAppointment(apt);
                setIsCheckoutDialogOpen(true);
              }}
              onStatusChange={async (apt, status) => {
                try {
                  await providerApi.updateAppointment(apt.id, { status });
                  toast.success("Booking status updated successfully");
                  loadData();
                  if (selectedAppointment && selectedAppointment.id === apt.id) {
                    const updated = await providerApi.getAppointment(apt.id);
                    setSelectedAppointment(updated);
                  }
                } catch (error: any) {
                  console.error("Failed to update status:", error);
                  const errorMessage = error?.message || error?.details || `Failed to update booking status to ${status}`;
                  toast.error(errorMessage, {
                    description: error?.code ? `Error code: ${error.code}` : undefined,
                  });
                }
              }}
              startHour={startHour}
              endHour={endHour}
              locationOperatingHours={locationOperatingHours}
              availabilityBlocks={availabilityBlocks}
              onViewWeekSchedule={handleViewWeekSchedule}
              onPrintDaySchedule={handlePrintDaySchedule}
              onEditWorkHours={handleEditWorkHours}
              onSetDayOff={handleSetDayOff}
              selectedTeamMemberId={selectedTeamMember === "all" ? null : selectedTeamMember}
              onClearStaffFilter={clearStaffFilter}
              onAddAppointment={handleCreateAppointment}
              onFilterClick={() => setIsFilterSheetOpen(true)}
              onViewChange={(v) => {
                setDateView(v);
              }}
              businessTimezone={businessTz}
            />

            {/* Scroll-to-now floating button — only visible when viewing today */}
            {format(selectedDateSafe, "yyyy-MM-dd") === format(nowInTz(businessTz), "yyyy-MM-dd") && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("calendar-scroll-to-now"))}
                className="fixed bottom-20 left-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold shadow-lg active:scale-95 transition-transform"
                aria-label="Scroll to current time"
              >
                <Clock className="w-3.5 h-3.5" />
                Now
              </button>
            )}
          </>
        )}
        
        {/* Appointment Dialog shared with desktop - no separate mobile sidebar */}
        
        {/* Time Block Sidebar - Mobile */}
        <TimeBlockSidebar
          teamMembers={teamMembers}
          onTimeBlockCreated={(_block) => {
            loadData();
          }}
          onTimeBlockUpdated={(_block) => {
            loadData();
          }}
          onTimeBlockDeleted={(_id) => {
            loadData();
          }}
          onRefresh={loadData}
        />
      </div>
      )}

      {/* Mobile Filter Sheet */}
      <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
        <SheetContent side="left" className="w-80 flex flex-col p-0 overflow-hidden">
          <SheetHeader className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-100">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-8 mt-4 space-y-6">
            {/* View Selector */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">View</h3>
              <div className="flex gap-2">
                <Button
                  variant={dateView === "day" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateView("day")}
                  className={dateView === "day" ? "bg-[#1a1f3c]" : ""}
                >
                  Day
                </Button>
                <Button
                  variant={dateView === "3-days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateView("3-days")}
                  className={dateView === "3-days" ? "bg-[#1a1f3c]" : ""}
                >
                  3 days
                </Button>
                <Button
                  variant={dateView === "week" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateView("week")}
                  className={dateView === "week" ? "bg-[#1a1f3c]" : ""}
                >
                  Week
                </Button>
              </div>
            </div>

            {/* Team Members */}
            <div>
              {selectedTeamMember !== "all" && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm font-medium text-blue-900 mb-2">
                    Viewing: {teamMembers.find(m => m.id === selectedTeamMember)?.name}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-7 w-full text-blue-700 border-blue-300 hover:bg-blue-100"
                    onClick={() => {
                      clearStaffFilter();
                      setIsFilterSheetOpen(false);
                    }}
                  >
                    Show All Staff Members
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Team Members</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs h-7"
                    onClick={selectAllTeamMembers}
                  >
                    Select All
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs h-7"
                    onClick={deselectAllTeamMembers}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTeamMemberIds.includes(member.id)}
                      onCheckedChange={(_checked) => {
                        toggleTeamMemberFilter(member.id);
                      }}
                    />
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="bg-[#1a1f3c] text-white text-xs">
                        {member.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Display preferences (mobile) */}
            <Separator />
            <MobileCalendarPreferencesSection />

            {/* Quick Actions - Print, Group Booking, Walk-in, Settings */}
            <Separator />
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setIsFilterSheetOpen(false);
                    setIsPrintDialogOpen(true);
                  }}
                >
                  <Printer className="w-4 h-4" />
                  Print Schedule
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setIsFilterSheetOpen(false);
                    const now = new Date();
                    const h = now.getHours();
                    const m = Math.ceil(now.getMinutes() / 15) * 15;
                    setDefaultTimeSlot(`${String(m >= 60 ? h + 1 : h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
                    if (selectedTeamMember !== "all") setDefaultTeamMemberId(selectedTeamMember);
                    setIsGroupBookingDialogOpen(true);
                  }}
                >
                  <Users className="w-4 h-4" />
                  Create Group Booking
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setIsFilterSheetOpen(false);
                    const bizNow = nowInTz(businessTz);
                    const minutes = bizNow.getMinutes();
                    const snappedMinutes = Math.ceil(minutes / 15) * 15;
                    bizNow.setMinutes(snappedMinutes, 0, 0);
                    const timeString = `${bizNow.getHours().toString().padStart(2, "0")}:${bizNow.getMinutes().toString().padStart(2, "0")}`;
                    const staffId = selectedTeamMember !== "all"
                      ? selectedTeamMember
                      : teamMembers[0]?.id || "";
                    const staffMember = teamMembers.find(m => m.id === staffId);
                    const currentLocation = selectedLocationId
                      ? salons.find(s => s.id === selectedLocationId)
                      : salons[0];
                    openCreateMode({
                      staffId,
                      staffName: staffMember?.name,
                      date: format(bizNow, "yyyy-MM-dd"),
                      startTime: timeString,
                      locationId: currentLocation?.id,
                      locationName: currentLocation?.name,
                      appointmentKind: "walk_in",
                    });
                  }}
                >
                  <PersonStanding className="w-4 h-4" />
                  Quick Walk-in
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setIsFilterSheetOpen(false);
                    router.push("/provider/settings/calendar/display-preferences");
                  }}
                >
                  <Settings className="w-4 h-4" />
                  Calendar Settings
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Appointment sidebar modal for view/create/edit */}
      <AppointmentSidebar
        teamMembers={teamMembers}
        services={services}
        locations={salons}
        onAppointmentCreated={forceRefresh}
        onAppointmentUpdated={handleAppointmentUpdated}
        onAppointmentDeleted={forceRefresh}
        onRefresh={forceRefresh}
      />

      {/* Group Booking Dialog */}
      {isGroupBookingDialogOpen && (
        <GroupBookingDialog
          open
          onOpenChange={setIsGroupBookingDialogOpen}
          defaultDate={selectedDateSafe}
          defaultTime={defaultTimeSlot}
          defaultTeamMemberId={defaultTeamMemberId}
          existingAppointments={selectedAppointmentsForGroup}
          onSuccess={() => {
            setSelectedAppointmentsForGroup([]);
            loadData();
          }}
        />
      )}

      {/* Print Schedule Dialog */}
      {isPrintDialogOpen && (
        <PrintScheduleDialog
          open
          onOpenChange={(open) => {
            setIsPrintDialogOpen(open);
            if (!open) {
              setPrintDialogStaffId(null);
            }
          }}
          appointments={appointments}
          teamMembers={teamMembers}
          selectedDate={selectedDateSafe}
          view={dateView}
          initialStaffId={printDialogStaffId || undefined}
        />
      )}

      {/* Set Day Off Dialog */}
      {isSetDayOffDialogOpen && (
        <SetDayOffDialog
          open
          onOpenChange={(open) => {
            setIsSetDayOffDialogOpen(open);
            if (!open) {
              setSelectedStaffForDialog(null);
            }
          }}
          staffMember={selectedStaffForDialog}
          selectedDate={selectedDateSafe}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Edit Work Hours Dialog */}
      {isEditWorkHoursDialogOpen && (
        <EditWorkHoursDialog
          open
          onOpenChange={(open) => {
            setIsEditWorkHoursDialogOpen(open);
            if (!open) {
              setSelectedStaffForDialog(null);
            }
          }}
          staffMember={selectedStaffForDialog}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Checkout Dialog */}
      {isCheckoutDialogOpen && selectedAppointment && (
        <CheckoutDialog
          isOpen
          onClose={() => setIsCheckoutDialogOpen(false)}
          checkoutData={{
            appointment_id: selectedAppointment.id,
            client_id: selectedAppointment.client_id || "",
            client_name: selectedAppointment.client_name,
            client_email: selectedAppointment.client_email,
            team_member_name: selectedAppointment.team_member_name || "Staff",
            scheduled_date: selectedAppointment.scheduled_date,
            scheduled_time: selectedAppointment.scheduled_time,
            services: [
              {
                id: selectedAppointment.service_id || "1",
                name: selectedAppointment.service_name,
                price: selectedAppointment.price || 0,
                duration_minutes: selectedAppointment.duration_minutes,
                quantity: 1,
              },
            ],
            products:
              (selectedAppointment as any).addons?.map((addon: any) => ({
                id: addon.id,
                name: addon.name,
                price: addon.price,
                quantity: 1,
              })) || [],
          }}
          onComplete={handleCheckoutComplete}
        />
      )}

      {postCheckoutRateBookingId && (
        <RateCustomerModal
          open={postCheckoutRateOpen}
          onOpenChange={(open) => {
            setPostCheckoutRateOpen(open);
            if (!open) setPostCheckoutRateBookingId(null);
          }}
          bookingId={postCheckoutRateBookingId}
          customerName={postCheckoutRateClientName}
          onSuccess={() => {
            setPostCheckoutRateOpen(false);
            setPostCheckoutRateBookingId(null);
          }}
        />
      )}

      {/* Status Manager Dialog */}
      {isStatusManagerOpen && selectedAppointment && (
        <AppointmentStatusManager
          appointment={selectedAppointment}
          isOpen
          onClose={() => setIsStatusManagerOpen(false)}
          onStatusUpdate={handleStatusManagerUpdate}
        />
      )}

      {/* Waiting Room */}
      <WaitingRoomButton
        count={waitingAppointments.length}
        onClick={() => setIsWaitingRoomOpen(true)}
      />
      {isWaitingRoomOpen && (
        <WaitingRoomPanel
          waitingAppointments={waitingAppointments}
          onClose={() => setIsWaitingRoomOpen(false)}
          onRefresh={loadData}
          onAppointmentClick={async (apt) => {
            await handleAppointmentClick(apt);
            setIsWaitingRoomOpen(false);
          }}
        />
      )}
    </div>
  );
}
