"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Settings, Users, RefreshCw, SlidersHorizontal, Printer, PersonStanding } from "lucide-react";
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
import { CalendarMobileView } from "@/components/provider-portal/CalendarMobileView";
import { CalendarDesktopView } from "@/components/provider-portal/CalendarDesktopView";
import { GroupBookingDialog } from "@/components/provider-portal/GroupBookingDialog";
import { PrintScheduleDialog } from "@/components/provider-portal/PrintScheduleDialog";
import { SetDayOffDialog } from "@/components/provider-portal/SetDayOffDialog";
import { EditWorkHoursDialog } from "@/components/provider-portal/EditWorkHoursDialog";
import { CheckoutDialog } from "@/components/provider-portal/CheckoutDialog";
import { AppointmentStatusManager } from "@/components/provider-portal/AppointmentStatusManager";
import { DragDropProvider } from "@/components/provider-portal/DragDropCalendar";
// Side-effect imports to register stub components with Turbopack (workaround for HMR bug)
import "@/components/provider-portal/AppointmentDialogMobile";
import "@/components/provider-portal/AppointmentDetailsModal";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
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
import { AppointmentStatus, mapStatus } from "@/lib/scheduling/mangomintAdapter";
import { TimeBlockSidebar } from "@/components/calendar/TimeBlockSidebar";
import { useTimeBlockSidebar, openEditTimeBlockMode } from "@/stores/time-block-sidebar-store";
import { toast } from "sonner";

export default function ProviderCalendar() {
  const { dateView, setDateView, provider, isLoading: isLoadingProvider, salons, selectedLocationId } = useProviderPortal();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlockDisplay[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [locationOperatingHours, setLocationOperatingHours] = useState<Record<string, { open: string; close: string; closed: boolean }> | null>(null);
  
  // Calculate optimal startHour and endHour based on operating hours and actual appointment times
  const { startHour, endHour } = React.useMemo(() => {
    const getDatesForView = () => {
      const dates: Date[] = [];
      const start = new Date(selectedDate);
      if (dateView === "day") {
        dates.push(new Date(start));
      } else if (dateView === "3-days") {
        for (let i = 0; i < 3; i++) dates.push(addDays(start, i));
      } else {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        for (let i = 0; i < 7; i++) dates.push(addDays(weekStart, i));
      }
      return dates;
    };
    const visibleDateStrs = new Set(getDatesForView().map(d => format(d, "yyyy-MM-dd")));

    // Base range from operating hours (or defaults)
    let calculatedStartHour = 8;
    let calculatedEndHour = 20;

    if (locationOperatingHours) {
      const getDayKey = (date: Date) => {
        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        return DAY_NAMES[date.getDay()];
      };
      let minHour = 23;
      let maxHour = 0;
      let hasOpenDays = false;
      getDatesForView().forEach((date) => {
        const dayHours = locationOperatingHours[getDayKey(date)];
        if (dayHours && !dayHours.closed) {
          hasOpenDays = true;
          const [openHour] = dayHours.open.split(':').map(Number);
          const [closeHour] = dayHours.close.split(':').map(Number);
          minHour = Math.min(minHour, openHour);
          maxHour = Math.max(maxHour, closeHour);
        }
      });
      if (hasOpenDays) {
        const padding = 1;
        calculatedStartHour = Math.max(0, minHour - padding);
        calculatedEndHour = Math.min(23, maxHour + padding);
      }
    } else {
      calculatedStartHour = 0;
      calculatedEndHour = 23;
    }

    // Expand range to include all appointments on visible dates (prevents clipping)
    const toDateStr = (d: string) => (d && d.length >= 10 ? d.slice(0, 10) : d);
    appointments.forEach((apt) => {
      const aptDateStr = toDateStr(apt.scheduled_date || "");
      if (!aptDateStr || !visibleDateStrs.has(aptDateStr)) return;
      const parts = (apt.scheduled_time || "09:00").split(":").map((p) => parseInt(p, 10));
      const h = Number.isFinite(parts[0]) ? parts[0] : 9;
      const m = Number.isFinite(parts[1]) ? parts[1] : 0;
      const duration = apt.duration_minutes || 60;
      const endMinutes = h * 60 + m + duration;
      const endH = Math.min(23, Math.ceil(endMinutes / 60));
      if (h < calculatedStartHour) calculatedStartHour = Math.max(0, h - 1);
      if (endH > calculatedEndHour) calculatedEndHour = Math.min(23, endH + 1);
    });

    return { startHour: calculatedStartHour, endHour: calculatedEndHour };
  }, [locationOperatingHours, selectedDate, dateView, appointments]);
  
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>("all");
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([]);
  const loadDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [_isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isGroupBookingDialogOpen, setIsGroupBookingDialogOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printDialogStaffId, setPrintDialogStaffId] = useState<string | null>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isSetDayOffDialogOpen, setIsSetDayOffDialogOpen] = useState(false);
  const [isEditWorkHoursDialogOpen, setIsEditWorkHoursDialogOpen] = useState(false);
  const [selectedStaffForDialog, setSelectedStaffForDialog] = useState<TeamMember | null>(null);
  const [defaultTimeSlot, _setDefaultTimeSlot] = useState<string>("");
  const [defaultTeamMemberId, _setDefaultTeamMemberId] = useState<string>("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedAppointmentsForGroup, setSelectedAppointmentsForGroup] = useState<Appointment[]>([]);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

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

  // Cache for calendar data
  const calendarCacheRef = useRef<Map<string, { data: Appointment[]; timestamp: number }>>(new Map());
  const CALENDAR_CACHE_DURATION = 60 * 1000; // 60 seconds (increased from 10s for better perf)
  const pendingCalendarRequests = useRef<Map<string, Promise<any>>>(new Map());
  
  // Cache for team members (longer duration since they change less frequently)
  const teamMembersCacheRef = useRef<{ data: TeamMember[]; locationId: string | null; timestamp: number } | null>(null);
  const TEAM_MEMBERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const pendingTeamMembersRequest = useRef<Promise<TeamMember[]> | null>(null);

  // Load services using same API as /provider/appointments (listServices)
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
    // Skip if location hasn't changed
    if (prevLocationIdRef.current === currentLocationId) {
      return;
    }

    prevLocationIdRef.current = currentLocationId || null;

    const loadLocationHours = async () => {
      if (!currentLocationId) {
        setLocationOperatingHours(null);
        return;
      }

      // Check cache first
      if (locationHoursCacheRef.current.has(currentLocationId)) {
        const cached = locationHoursCacheRef.current.get(currentLocationId) ?? null;
        setLocationOperatingHours(cached);
        return;
      }

      // Try to get from salons array first
      const location = salons.find(s => s.id === currentLocationId) as any;
      const hours = location?.operating_hours || location?.working_hours;
      
      if (hours) {
        locationHoursCacheRef.current.set(currentLocationId, hours);
        setLocationOperatingHours(hours);
      } else {
        // If not in salons array, try fetching all locations and find the one we need
        try {
          const response = await fetcher.get<{ data: any[] }>(`/api/provider/locations`);
          const allLocations = response.data || [];
          const foundLocation = allLocations.find((loc: any) => loc.id === currentLocationId);
          
          if (foundLocation?.operating_hours) {
            locationHoursCacheRef.current.set(currentLocationId, foundLocation.operating_hours);
            setLocationOperatingHours(foundLocation.operating_hours);
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
  }, [currentLocationId]); // Only depend on the computed location ID

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
          console.log("No team members found for location, trying without location filter");
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

        // Load appointments, team members, and time blocks in parallel
        // Use cached team members if available, otherwise fetch
        const locationId = selectedLocationId || undefined;
        const currentTeamMembers = teamMembers.length > 0 ? teamMembers : null;
        const membersPromise = currentTeamMembers 
          ? Promise.resolve(currentTeamMembers) 
          : loadTeamMembers(locationId);
        
        const fromIso = `${dateFrom}T00:00:00.000Z`;
        const toIso = `${dateTo}T23:59:59.999Z`;

        const [apptsResponse, membersResult, blocks, availBlocks] = await Promise.all([
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
          }),
          providerApi.listAvailabilityBlocks({ from: fromIso, to: toIso }),
        ]);

        const members = membersResult;

        // Filter availability blocks by current location when set (block applies to all locations or this location)
        const filteredAvailBlocks = selectedLocationId
          ? availBlocks.filter((b) => b.location_id == null || b.location_id === selectedLocationId)
          : availBlocks;

        // Update cache
        calendarCacheRef.current.set(cacheKey, {
          data: apptsResponse.data,
          timestamp: Date.now(),
        });

        setAppointments(apptsResponse.data);
        setTimeBlocks(blocks);
        setAvailabilityBlocks(filteredAvailBlocks);
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
      } catch (error) {
        console.error("Failed to load calendar data:", error);
        throw error;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        pendingCalendarRequests.current.delete(cacheKey);
      }
    })();

    pendingCalendarRequests.current.set(cacheKey, requestPromise);
    await requestPromise;
  }, [selectedTeamMember, teamMembers, selectedLocationId, loadTeamMembers]);

  // Force refresh by clearing cache and loading fresh data
  const forceRefresh = useCallback(async () => {
    // Calculate date range based on view
    let dateFrom: string;
    let dateTo: string;
    
    if (dateView === "day") {
      dateFrom = format(selectedDate, "yyyy-MM-dd");
      dateTo = dateFrom;
    } else if (dateView === "3-days") {
      dateFrom = format(selectedDate, "yyyy-MM-dd");
      const endDate = addDays(selectedDate, 2);
      dateTo = format(endDate, "yyyy-MM-dd");
    } else {
      // Week view
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
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
  }, [selectedDate, dateView, selectedTeamMember, selectedLocationId, loadDataFresh]);

  // Optimistically update appointments when status/current_stage changes (instant block color change)
  const handleAppointmentUpdated = useCallback((updatedAppointment: Appointment) => {
    const bookingId = updatedAppointment.booking_id ?? (updatedAppointment.id?.includes("-svc-") ? updatedAppointment.id.split("-svc-")[0] : updatedAppointment.id);
    if (!bookingId) {
      forceRefresh();
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
    // Sync with server (persisted changes will overwrite; ensures consistency)
    forceRefresh();
  }, [forceRefresh]);

  const loadData = useCallback(async (showLoading = false) => {
    // Clear any pending timeouts
    if (loadDataTimeoutRef.current) {
      clearTimeout(loadDataTimeoutRef.current);
      loadDataTimeoutRef.current = null;
    }

    // Calculate date range based on view
    let dateFrom: string;
    let dateTo: string;
    
    if (dateView === "day") {
      dateFrom = format(selectedDate, "yyyy-MM-dd");
      dateTo = dateFrom;
    } else if (dateView === "3-days") {
      dateFrom = format(selectedDate, "yyyy-MM-dd");
      const endDate = addDays(selectedDate, 2);
      dateTo = format(endDate, "yyyy-MM-dd");
    } else {
      // Week view
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
      dateFrom = format(weekStart, "yyyy-MM-dd");
      dateTo = format(weekEnd, "yyyy-MM-dd");
    }

    // Create cache key (include location for location-specific caching)
    const locationKey = selectedLocationId || 'all';
    const cacheKey = `${dateFrom}-${dateTo}-${selectedTeamMember}-${locationKey}`;
    
    // Check cache first
    const cached = calendarCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CALENDAR_CACHE_DURATION) {
      setAppointments(cached.data);
      // Load team members if needed (using cached version if available)
      if (teamMembers.length === 0) {
        loadTeamMembers(selectedLocationId || undefined)
          .then((members) => {
            setTeamMembers((prevMembers) => {
              // Initialize selectedTeamMemberIds when members are loaded
              if (members.length > 0 && prevMembers.length === 0) {
                setSelectedTeamMemberIds(members.map(m => m.id));
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
  }, [selectedDate, dateView, selectedTeamMember, teamMembers.length, selectedLocationId, loadDataFresh, loadTeamMembers]);

  // Set up Supabase Realtime for instant updates (replaces polling)
  // Use browser client for client components
  const supabaseClient = getSupabaseClient();

  // Subscribe to booking changes via Supabase Realtime
  useSupabaseRealtime(
    supabaseClient,
    provider?.id,
    'booking_created',
    (_event) => {
      // Refresh calendar when booking is created - force refresh to bypass cache
      forceRefresh();
    }
  );

  useSupabaseRealtime(
    supabaseClient,
    provider?.id,
    'booking_cancelled',
    (_event) => {
      // Refresh calendar when booking is cancelled - force refresh to bypass cache
      forceRefresh();
    }
  );

  useSupabaseRealtime(
    supabaseClient,
    provider?.id,
    'booking_updated',
    (_event) => {
      // Refresh calendar when status/current_stage changes - persist and update block colors
      forceRefresh();
    }
  );

  useSupabaseRealtime(
    supabaseClient,
    provider?.id,
    'booking_services_changed',
    (_event) => {
      // Refresh calendar when booking_services changes (e.g. service added/removed)
      forceRefresh();
    }
  );

  // Initial load - wait for provider data
  useEffect(() => {
    if (!isLoadingProvider && provider) {
      loadData(true);
    }
  }, [isLoadingProvider, provider, loadData]);

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

    // Debounce the API call (reduced from 150ms to 100ms for faster response)
    loadDataTimeoutRef.current = setTimeout(() => {
      loadData(false);
    }, 100);

    return () => {
      if (loadDataTimeoutRef.current) {
        clearTimeout(loadDataTimeoutRef.current);
      }
    };
  }, [selectedDate, dateView, selectedTeamMember, loadData]);

  // Refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData(false);
      }
    };

    const handleFocus = () => {
      loadData(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const navigateDate = (days: number) => {
    // Optimistic update - update date immediately for instant feedback
    const newDate = new Date(selectedDate);
    if (dateView === "week") {
      newDate.setDate(newDate.getDate() + days * 7);
    } else if (dateView === "3-days") {
      newDate.setDate(newDate.getDate() + days * 3);
    } else {
      newDate.setDate(newDate.getDate() + days);
    }
    // Update immediately - data will load in background
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    openViewMode(appointment);
  };

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

  // Listen for the FAB "openAppointmentDialog" custom event from ProviderBottomNav
  useEffect(() => {
    const handler = () => handleCreateAppointment();
    window.addEventListener("openAppointmentDialog", handler);
    return () => window.removeEventListener("openAppointmentDialog", handler);
  });

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
    
    const today = new Date();
    openCreateMode({
      staffId,
      staffName: staffMember?.name,
      date: format(today, "yyyy-MM-dd"),
      startTime: "",
      locationId: currentLocation.id,
      locationName: currentLocation.name,
    });
  };

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
    
    try {
      // Update appointment status to completed
      await providerApi.updateAppointment(selectedAppointment.id, {
        status: "completed",
        notes: notes || selectedAppointment.notes,
        ...((selectedAppointment as any).version !== undefined && { version: (selectedAppointment as any).version }),
      });
      
      // Create sale record with payment details
      try {
        await providerApi.createSale({
          customer_id: selectedAppointment.client_id,
          client_name: selectedAppointment.client_name,
          date: selectedAppointment.scheduled_date,
          items: [{
            id: selectedAppointment.service_id || selectedAppointment.id,
            type: "service",
            name: selectedAppointment.service_name,
            quantity: 1,
            unit_price: selectedAppointment.price ?? 0,
            total: selectedAppointment.price ?? 0,
          }],
          subtotal: selectedAppointment.price,
          tax: 0,
          total: selectedAppointment.price + tipAmount - discountAmount,
          payment_method: paymentMethod,
          notes: notes ? `${notes}${tipAmount > 0 ? ` (Tip: R${tipAmount})` : ""}`.trim() : undefined,
          discount_amount: discountAmount,
        } as any);
      } catch (error) {
        console.error("Failed to create sale record:", error);
        // Don't fail the checkout if sale creation fails
      }
      
      // Close dialog and refresh data
      setIsCheckoutDialogOpen(false);
      setSelectedAppointment(null);
      loadData();
    } catch (error) {
      console.error("Checkout failed:", error);
      // Re-throw so CheckoutDialog can handle it
      throw error;
    }
  };

  // Handle status update from status manager
  const handleStatusManagerUpdate = async (
    appointmentId: string,
    newStatus: string,
    _reason?: string,
    _notes?: string
  ) => {
    try {
      const apt = appointments.find((a) => a.id === appointmentId || (a as any).booking_id === appointmentId);
      await providerApi.updateAppointment(appointmentId, {
        status: newStatus as Appointment["status"],
        ...(apt && (apt as any).version !== undefined && { version: (apt as any).version }),
      });
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

  // Toggle team member in filter
  const toggleTeamMemberFilter = (memberId: string) => {
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

  // Deselect all team members and reset to show all
  const deselectAllTeamMembers = () => {
    setSelectedTeamMember("all");
    setSelectedTeamMemberIds(teamMembers.map(m => m.id));
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

  // Reload data when filters change (optimized - only reload if team members are loaded)
  useEffect(() => {
    if (teamMembers.length > 0 && !isLoadingProvider) {
      loadData();
    }
  }, [selectedTeamMemberIds, dateView, teamMembers.length, isLoadingProvider, loadData]);

  // Show loading only on initial load (before we have any data).
  // Once team members are loaded, keep the calendar mounted to preserve local state
  // (e.g. layout mode, selected staff) and show a subtle refresh indicator instead.
  if (isLoadingProvider || (isLoading && teamMembers.length === 0)) {
    return <LoadingTimeout loadingMessage={isLoadingProvider ? "Loading provider data..." : "Loading calendar..."} />;
  }

  return (
    <div className="bg-gray-50 sm:mx-0 sm:mt-0 max-w-full flex flex-col md:h-full md:overflow-x-hidden">
      {/* Desktop View */}
      <div className="hidden md:flex md:flex-col w-full max-w-full overflow-hidden flex-1 min-h-0">
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
                      ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "d, yyyy")}`
                      : format(selectedDate, "EEE, MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
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
                    <Badge className="text-[10px] h-4 px-1.5 bg-[#FF0077] text-white ml-1">
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
                        <AvatarFallback className="text-xs bg-gradient-to-br from-[#FF0077] to-[#FF6B35] text-white">
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
                  <DropdownMenuItem onClick={() => window.location.href = "/provider/settings/calendar/display-preferences"}>
                    Display Preferences
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.href = "/provider/settings/calendar/colors-icons"}>
                    Colors & Icons
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.href = "/provider/settings/calendar/links"}>
                    Calendar Links
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.href = "/provider/settings/calendar-integration"}>
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
                onClick={() => setIsGroupBookingDialogOpen(true)}
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
                    className="h-8 w-8 lg:h-9 lg:w-9 text-white hover:bg-[#FF0077]/20 hover:text-white border border-white/20 hidden md:flex"
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
                      const now = new Date();
                      const minutes = now.getMinutes();
                      const snappedMinutes = Math.ceil(minutes / 15) * 15;
                      now.setMinutes(snappedMinutes, 0, 0);
                      const timeString = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
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
                        date: format(now, "yyyy-MM-dd"),
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
                  onClick: () => window.location.href = "/provider/team/members",
                }}
              />
            ) : (
              <div className="flex flex-1 flex-col min-h-0 min-w-0">
                <DragDropProvider
                  teamMembers={filteredTeamMembers}
                  allAppointments={appointments}
                  timeBlocks={timeBlocks}
                  enableConflictValidation={true}
                  onReschedule={handleReschedule}
                >
                  <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    <CalendarDesktopView
                      appointments={appointments}
                      teamMembers={filteredTeamMembers}
                      timeBlocks={timeBlocks}
                      availabilityBlocks={availabilityBlocks}
                      selectedDate={selectedDate}
                      view={dateView}
                      onAppointmentClick={handleAppointmentClick}
                      onTimeSlotClick={handleTimeSlotClick}
                      onTimeBlockClick={(block) => {
                        openEditTimeBlockMode(block);
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
                    />
                  </div>
                </DragDropProvider>
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

      {/* Mobile View */}
      <div className="md:hidden relative max-w-[100vw]">
        {teamMembers.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No team members"
              description="Add team members in Settings → Team to see the calendar"
              action={{
                label: "Add Team Member",
                onClick: () => window.location.href = "/provider/team/members",
              }}
            />
          </div>
        ) : (
          <>
            {isRefreshing && (
              <div className="absolute top-20 right-4 z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 border border-gray-200">
                <RefreshCw className="w-4 h-4 text-[#FF0077] animate-spin" />
                <span className="text-xs text-gray-600">Refreshing...</span>
              </div>
            )}
            <CalendarMobileView
              appointments={appointments}
              teamMembers={filteredTeamMembers}
              selectedDate={selectedDate}
              view={dateView === "week" ? "week" : "day"}
              onDateChange={(date) => {
                // Optimistic update - update immediately
                setSelectedDate(date);
              }}
              onAppointmentClick={(apt) => openViewMode(apt)}
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
              onViewChange={(view) => {
                setDateView(view === "week" ? "week" : "day");
              }}
            />
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

      {/* Mobile Filter Sheet */}
      <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
        <SheetContent side="left" className="w-80">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
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
                    const now = new Date();
                    const minutes = now.getMinutes();
                    const snappedMinutes = Math.ceil(minutes / 15) * 15;
                    now.setMinutes(snappedMinutes, 0, 0);
                    const timeString = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
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
                      date: format(now, "yyyy-MM-dd"),
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
                    window.location.href = "/provider/settings/calendar/display-preferences";
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

      {/* Appointment Sidebar - Airbnb-style modal for view/create/edit */}
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
      <GroupBookingDialog
        open={isGroupBookingDialogOpen}
        onOpenChange={setIsGroupBookingDialogOpen}
        defaultDate={selectedDate}
        defaultTime={defaultTimeSlot}
        defaultTeamMemberId={defaultTeamMemberId}
        existingAppointments={selectedAppointmentsForGroup}
        onSuccess={() => {
          setSelectedAppointmentsForGroup([]);
          loadData();
        }}
      />

      {/* Print Schedule Dialog */}
      <PrintScheduleDialog
        open={isPrintDialogOpen}
        onOpenChange={(open) => {
          setIsPrintDialogOpen(open);
          if (!open) {
            setPrintDialogStaffId(null);
          }
        }}
        appointments={appointments}
        teamMembers={teamMembers}
        selectedDate={selectedDate}
        view={dateView === "week" ? "week" : "day"}
        initialStaffId={printDialogStaffId || undefined}
      />

      {/* Set Day Off Dialog */}
      <SetDayOffDialog
        open={isSetDayOffDialogOpen}
        onOpenChange={(open) => {
          setIsSetDayOffDialogOpen(open);
          if (!open) {
            setSelectedStaffForDialog(null);
          }
        }}
        staffMember={selectedStaffForDialog}
        selectedDate={selectedDate}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* Edit Work Hours Dialog */}
      <EditWorkHoursDialog
        open={isEditWorkHoursDialogOpen}
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

      {/* Checkout Dialog */}
      <CheckoutDialog
        isOpen={isCheckoutDialogOpen}
        onClose={() => setIsCheckoutDialogOpen(false)}
        checkoutData={
          selectedAppointment
            ? {
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
                products: (selectedAppointment as any).addons?.map((addon: any) => ({
                  id: addon.id,
                  name: addon.name,
                  price: addon.price,
                  quantity: 1,
                })) || [],
              }
            : null
        }
        onComplete={handleCheckoutComplete}
      />

      {/* Status Manager Dialog */}
      <AppointmentStatusManager
        appointment={selectedAppointment}
        isOpen={isStatusManagerOpen}
        onClose={() => setIsStatusManagerOpen(false)}
        onStatusUpdate={handleStatusManagerUpdate}
      />

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
          onAppointmentClick={(apt) => {
            openViewMode(apt);
            setIsWaitingRoomOpen(false);
          }}
        />
      )}
    </div>
  );
}
