"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search,
  Filter,
  Calendar,
  User,
  MapPin,
  Clock,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CheckSquare,
  Square,
  Plus,
  LayoutGrid,
  List,
  CalendarCheck,
  CalendarClock,
  PlayCircle,
  Banknote,
} from "lucide-react";
import { clearFetcherCache, fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { providerApi } from "@/lib/provider-portal/api";
import type { Appointment, Salon, TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import type { YocoPayment } from "@/lib/provider-portal/types";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import Pagination from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/provider/PageHeader";
import type { Booking } from "@/types/beautonomi";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SyncIndicator } from "@/components/provider/SyncIndicator";
import { BookingConflictAlert } from "@/components/provider/BookingConflictAlert";
import { BulkBookingActions } from "@/components/provider/BulkBookingActions";
import { PostForRewardNudge } from "@/components/provider/PostForRewardNudge";
import { ProviderClientRatingDialog } from "@/components/provider-portal/ProviderClientRatingDialog";
import { AppointmentStatusBadge } from "@/components/provider-portal/AppointmentStatusBadge";
import { Money } from "@/components/provider-portal/Money";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { AppointmentSidebar } from "@/components/appointments";
import { openViewMode } from "@/stores/appointment-sidebar-store";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import type { ProviderBookingListItem } from "./bookings-types";
import {
  buildProviderBookingActionModel,
  type ProviderBookingAction,
} from "@/lib/provider-booking/action-policy";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";

type BookingStatus = "all" | "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
type DateRange = "today" | "week" | "month" | "all_time";
type ViewMode = "table" | "cards";

const VIEW_STORAGE_KEY = "provider_bookings_view_mode";

function getDateRangeParams(range: DateRange): { start_date?: string; end_date?: string } {
  if (range === "all_time") return {};
  const now = new Date();
  if (range === "today") {
    const ymd = now.toISOString().split("T")[0];
    return { start_date: ymd, end_date: ymd };
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start_date: start.toISOString().split("T")[0], end_date: end.toISOString().split("T")[0] };
  }
  // month
  return {
    start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
    end_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
  };
}

export function BookingsClient({
  initialBookings,
  initialError,
}: {
  initialBookings: ProviderBookingListItem[] | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocationId, provider } = useProviderPortal();
  const yocoEnabled = useFeatureFlag("payment_yoco");

  // View mode — §Hydration 2026-04: initial state MUST match server render
  // (always "table") to avoid React error #418. We rehydrate from
  // localStorage after mount so user preferences still persist.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode | null;
      if (stored === "table" || stored === "cards") setViewMode(stored);
    } catch {}
  }, []);
  const handleViewChange = useCallback((v: ViewMode) => {
    setViewMode(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch {}
  }, []);

  // §Hydration 2026-04: server renders with its own TZ/locale; client renders
  // with user's. `toLocaleDateString` / `toLocaleTimeString` produce different
  // strings on each side → #418. Gate locale-formatted strings on a mount
  // flag and render a neutral placeholder during SSR + first paint.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  // Bookings data
  const [bookings, setBookings] = useState<ProviderBookingListItem[]>(() => initialBookings ?? []);
  const [isLoading, setIsLoading] = useState(() => initialError === null && initialBookings === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(() =>
    initialBookings !== null && !initialError ? new Date() : null,
  );
  const [error, setError] = useState<string | null>(() => initialError);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<BookingStatus>(
    initialStatus === "pending" ||
      initialStatus === "confirmed" ||
      initialStatus === "in_progress" ||
      initialStatus === "completed" ||
      initialStatus === "cancelled" ||
      initialStatus === "no_show"
      ? initialStatus
      : "all",
  );
  const paymentStatusFilter = searchParams.get("payment_status");
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const deferredSearch = useDeferredValue(searchQuery);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Selection & bulk
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Rating / nudge
  const [pendingRatingBooking, setPendingRatingBooking] = useState<{
    id: string;
    customer_name: string;
    location_id: string | null;
    location_name?: string | null;
  } | null>(null);
  const [showPostNudge, setShowPostNudge] = useState(false);

  // Yoco
  const [yocoDialogOpen, setYocoDialogOpen] = useState(false);
  const [yocoBooking, setYocoBooking] = useState<ProviderBookingListItem | null>(null);

  // Sidebar data (team members, services, locations for AppointmentSidebar)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [locations, setLocations] = useState<Salon[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [tm, svc, locs] = await Promise.all([
          providerApi.listTeamMembers(),
          providerApi.listServices(),
          providerApi.getSalons(),
        ]);
        setTeamMembers(tm || []);
        setServices(svc || []);
        setLocations(locs || []);
      } catch {
        setTeamMembers([]);
        setServices([]);
        setLocations([]);
      }
    })();
  }, []);

  // Sync location filter if selected location no longer exists
  useEffect(() => {
    if (locationFilter !== "all" && locations.length > 0 && !locations.some((l) => l.id === locationFilter)) {
      setLocationFilter("all");
    }
  }, [locations, locationFilter]);

  // ─── Data loading ──────────────────────────────────────────────────────────
  const loadBookings = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);
      setConflictError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentStatusFilter) params.set("payment_status", paymentStatusFilter);

      const loc = locationFilter !== "all" ? locationFilter : selectedLocationId;
      if (loc) params.set("location_id", loc);

      const { start_date, end_date } = getDateRangeParams(dateRange);
      if (start_date) params.set("start_date", start_date);
      if (end_date) params.set("end_date", end_date);

      const atHomeParams = new URLSearchParams(params);
      atHomeParams.delete("location_id");
      atHomeParams.set("location_type", "at_home");

      // GET /api/provider/bookings caps each response at 1000 rows. Walk
      // server offset pages until a short page so the table shows EVERY
      // booking for the selected range (incl. "All time" / high volume),
      // matching the provider app's paged fetch.
      const fetchAllPages = async (
        baseParams: URLSearchParams,
      ): Promise<ProviderBookingListItem[]> => {
        const PAGE_SIZE = 1000;
        const acc: ProviderBookingListItem[] = [];
        for (let offset = 0; offset < 1_000_000; offset += PAGE_SIZE) {
          const pageParams = new URLSearchParams(baseParams);
          pageParams.set("limit", String(PAGE_SIZE));
          pageParams.set("offset", String(offset));
          const res = await fetcher.get<{ data: ProviderBookingListItem[] }>(
            `/api/provider/bookings?${pageParams.toString()}`,
            { timeoutMs: 15000, staleTimeMs: 0 },
          );
          const rows = res.data ?? [];
          acc.push(...rows);
          if (rows.length < PAGE_SIZE) break;
        }
        return acc;
      };

      const [main, extra] = await Promise.all([
        fetchAllPages(params),
        loc ? fetchAllPages(atHomeParams) : Promise.resolve([] as ProviderBookingListItem[]),
      ]);

      const seen = new Set(main.map((b) => b.id));
      setBookings([...main, ...extra.filter((b) => !seen.has(b.id))]);
      setLastSynced(new Date());
      setPage(1);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load bookings";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, paymentStatusFilter, dateRange, locationFilter, selectedLocationId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Realtime updates — §Bookings-realtime 2026-04: a single channel per
  // provider handles every booking-table event type (INSERT/UPDATE/DELETE
  // on bookings + services). Four separate `useSupabaseRealtime` calls
  // subscribed to the same postgres_changes channel and the last-registered
  // handler won; the remaining three were dead. Debounce the refresh so a
  // burst of events (e.g. a confirm + status change) coalesces into one
  // fetch instead of four.
  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshBackground = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      loadBookingsRef.current(true);
    }, 250);
  }, []);
  useEffect(() => () => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
  }, []);
  const supabaseClient = getSupabaseClient();
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_updated", refreshBackground);

  // Fallback polling (30s) when the tab is visible so data still freshens
  // even if a websocket connection is blocked (some mobile networks / CSPs).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const tick = () => {
      if (document.visibilityState === "visible") refreshBackground();
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [refreshBackground]);

  // ─── Status actions ────────────────────────────────────────────────────────
  const handleStatusChange = async (bookingId: string, newStatus: string, version?: number) => {
    const booking = bookings.find((b) => b.id === bookingId);
    try {
      setConflictError(null);

      if (newStatus === "completed") {
        await fetcher.post(`/api/provider/bookings/${bookingId}/complete-service`, {});
        toast.success("Service completed");
        loadBookings();
        if (booking) {
          setPendingRatingBooking({
            id: booking.id,
            customer_name: booking.customer_name ?? "Customer",
            location_id: booking.location_id ?? null,
            location_name: booking.location_name ?? null,
          });
        }
        return;
      }

      if (newStatus === "started") {
        await fetcher.post(`/api/provider/bookings/${bookingId}/start-service`, {});
        toast.success("Service started");
        loadBookings();
        return;
      }

      if (newStatus === "start_journey") {
        await fetcher.post(`/api/provider/bookings/${bookingId}/start-journey`, {});
        toast.success("Journey started");
        loadBookings();
        return;
      }

      if (newStatus === "mark_arrived") {
        await fetcher.post(`/api/provider/bookings/${bookingId}/arrive`, {});
        toast.success("Arrival marked");
        loadBookings();
        return;
      }

      const response = await fetcher.patch<{ booking: Booking; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        { status: newStatus, version },
      );

      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }

      toast.success("Booking status updated");
      loadBookings();
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to update booking status");
      }
    }
  };

  const handleBulkAction = async (action: string, bookingIds: string[]) => {
    try {
      setConflictError(null);
      await fetcher.post(`/api/provider/bookings/bulk`, { action, booking_ids: bookingIds });
      toast.success(`Bulk ${action} completed for ${bookingIds.length} booking(s)`);
      setSelectedBookings(new Set());
      loadBookings();
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        setConflictError("Some bookings were modified. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        toast.error(`Failed to ${action} bookings`);
      }
    }
  };

  const primaryBookingAction = (booking: ProviderBookingListItem): ProviderBookingAction | null => {
    const model = buildProviderBookingActionModel({
      id: booking.id,
      status: booking.status,
      db_status: (booking as any).db_status,
      payment_status: booking.payment_status,
      scheduled_at: booking.scheduled_at,
      location_type: booking.location_type,
      location_id: booking.location_id,
      current_stage: booking.current_stage,
      arrival_otp_verified: (booking as any).arrival_otp_verified,
      qr_code_verified: (booking as any).qr_code_verified,
      arrival_otp_pending: (booking as any).arrival_otp_pending,
      qr_arrival_pending: (booking as any).qr_arrival_pending,
    });
    return model.primaryAction;
  };

  const runPrimaryBookingAction = (booking: ProviderBookingListItem, action: ProviderBookingAction) => {
    if (action.id === "start_journey") {
      return handleStatusChange(booking.id, "start_journey", booking.version);
    }
    if (action.id === "mark_arrived") {
      return handleStatusChange(booking.id, "mark_arrived", booking.version);
    }
    if (action.id === "start_service") {
      return handleStatusChange(booking.id, "started", booking.version);
    }
    if (action.id === "complete_service") {
      return handleStatusChange(booking.id, "completed", booking.version);
    }
    if (action.id === "check_in") {
      return handleStatusChange(booking.id, "checked_in", booking.version);
    }
    return handleStatusChange(booking.id, action.dbTarget, booking.version);
  };

  // ─── Search & filter ───────────────────────────────────────────────────────
  const filteredBookings = useMemo(() => {
    if (!deferredSearch) return bookings;
    const q = deferredSearch.toLowerCase();
    return bookings.filter((b) => {
      const name = b.customer_name?.toLowerCase() || "";
      const num = b.booking_number?.toLowerCase() || "";
      const svcNames = (b.services || []).map((s: any) => (s.offering_name || "").toLowerCase()).join(" ");
      return name.includes(q) || num.includes(q) || svcNames.includes(q);
    });
  }, [bookings, deferredSearch]);

  const groupedBookings = useMemo(() => {
    const g: Record<string, ProviderBookingListItem[]> = {
      pending: [], confirmed: [], in_progress: [], completed: [], cancelled: [], no_show: [],
    };
    for (const b of filteredBookings) {
      const s = (b.status as string) || "";
      // API maps DB statuses via mapStatusToProvider → e.g. confirmed → "booked", waiting/checked_in → "booked"
      const bucket =
        s === "started" || s === "in_progress"
          ? "in_progress"
          : s === "booked" || s === "waiting" || s === "checked_in"
            ? "confirmed"
            : s;
      if (bucket === "in_progress") g.in_progress.push(b);
      else if (bucket in g) g[bucket as keyof typeof g].push(b);
    }
    return g;
  }, [filteredBookings]);

  // Metrics time period — independent of the bookings list `dateRange` so
  // providers can view a filtered list below while still pivoting the
  // snapshot above.
  type StatsRange = "today" | "week" | "month" | "all";
  const [statsRange, setStatsRange] = useState<StatsRange>("today");
  const STATS_STORAGE_KEY = "provider_bookings_stats_range";
  useEffect(() => {
    try {
      const v = localStorage.getItem(STATS_STORAGE_KEY) as StatsRange | null;
      if (v === "today" || v === "week" || v === "month" || v === "all") setStatsRange(v);
    } catch {}
  }, []);
  const handleStatsRangeChange = useCallback((v: StatsRange) => {
    setStatsRange(v);
    try { localStorage.setItem(STATS_STORAGE_KEY, v); } catch {}
  }, []);

  // Top-of-page snapshot: count/revenue over the selected stats range +
  // live pending/in-progress tallies. Computed over the full bookings set
  // so the strip stays useful even while the list below is filtered.
  const statsSnapshot = useMemo(() => {
    if (!hasMounted) {
      return { count: 0, revenue: 0, pendingCount: 0, inProgressCount: 0 };
    }
    const now = new Date();
    let rangeStart = 0;
    let rangeEnd = Number.POSITIVE_INFINITY;
    if (statsRange !== "all") {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (statsRange === "today") {
        rangeStart = d.getTime();
        rangeEnd = rangeStart + 24 * 60 * 60 * 1000;
      } else if (statsRange === "week") {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        rangeStart = start.getTime();
        rangeEnd = rangeStart + 7 * 24 * 60 * 60 * 1000;
      } else {
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      }
    }
    let count = 0;
    let revenue = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    for (const b of bookings) {
      const s = (b.status || "").toLowerCase();
      if (s === "pending") pendingCount += 1;
      if (s === "started" || s === "in_progress") inProgressCount += 1;
      const ts = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      if (ts >= rangeStart && ts < rangeEnd) {
        count += 1;
        if (s !== "cancelled" && s !== "canceled" && s !== "no_show") {
          revenue += Number(b.total_amount || 0);
        }
      }
    }
    return { count, revenue, pendingCount, inProgressCount };
  }, [bookings, hasMounted, statsRange]);

  const statsRangeLabel = useMemo(() => {
    if (statsRange === "today") return "Today";
    if (statsRange === "week") return "This Week";
    if (statsRange === "month") return "This Month";
    return "All Time";
  }, [statsRange]);

  // Paginated slice for current tab
  const getPagedItems = useCallback((items: ProviderBookingListItem[]) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [page]);

  // ─── Sidebar helpers ───────────────────────────────────────────────────────
  const handleBookingClick = useCallback((booking: ProviderBookingListItem) => {
    const firstService = (booking.services as any)?.[0] || {};
    const apt: Appointment = {
      id: booking.id,
      booking_id: booking.id,
      ref_number: booking.booking_number || "",
      client_name: booking.customer_name || "Customer",
      service_id: firstService.offering_id || firstService.service_id || "",
      service_name: firstService.offering_name || firstService.service_name || "Service",
      scheduled_date: new Date(booking.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      scheduled_time: new Date(booking.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      duration_minutes: firstService.duration_minutes || firstService.duration || 60,
      price: booking.total_amount || 0,
      status: booking.status as any,
      team_member_name: firstService.staff_name || booking.staff_name || "",
      team_member_id: firstService.staff_id || (booking as any).staff_id || "",
      location_type: booking.location_type || "at_salon",
      location_id: booking.location_id ?? "",
      address_line1: (booking as any).address?.line1 || "",
      address_city: (booking as any).address?.city || "",
      address_state: (booking as any).address?.state || "",
      address_country: (booking as any).address?.country || "",
      address_postal_code: (booking as any).address?.postal_code || "",
      address_latitude: (booking as any).address?.latitude ?? null,
      address_longitude: (booking as any).address?.longitude ?? null,
      travel_fee: (booking as any).travel_fee || 0,
      payment_status: (booking as any).payment_status || "",
      created_by: booking.customer_name || "",
      created_date: (booking as any).created_at || new Date().toISOString(),
      total_amount: booking.total_amount,
      is_group_booking: Boolean((booking as any).is_group_booking),
      group_booking_ref: (booking as any).group_booking_ref ?? null,
      recurring_series_id: (booking as any).recurring_series_id ?? null,
      is_recurring: Boolean((booking as any).is_recurring || (booking as any).recurring_series_id),
      recurring_series: (booking as any).recurring_series ?? null,
      recurrence_rule: (booking as any).recurrence_rule ?? null,
      recurrence_start_date: (booking as any).recurrence_start_date ?? null,
      recurrence_end_date: (booking as any).recurrence_end_date ?? null,
      recurrence_frequency: (booking as any).recurrence_frequency ?? null,
      recurrence_last_booking_date: (booking as any).recurrence_last_booking_date ?? null,
      recurrence_occurrences: (booking as any).recurrence_occurrences ?? null,
      services: (booking as any).services || [],
      products: (booking as any).products || [],
    } as Appointment;
    openViewMode(apt);
  }, []);

  const openBookingDetails = useCallback((booking: ProviderBookingListItem) => {
    const groupId = (booking as any).group_booking_id;
    if ((booking as any).is_group_booking) {
      const rawId =
        (typeof groupId === "string" && groupId.length > 0
          ? groupId
          : typeof booking.id === "string" && booking.id.startsWith("group:")
            ? booking.id.slice("group:".length)
            : "") || "";
      if (rawId) {
        router.push(`/provider/group-bookings?open_group_id=${encodeURIComponent(rawId)}`);
        return;
      }
      router.push("/provider/group-bookings");
      return;
    }
    router.push(`/provider/bookings/${booking.id}`);
  }, [router]);

  const handleAppointmentUpdated = useCallback((_updated: Appointment) => {
    clearFetcherCache();
    loadBookingsRef.current?.(true);
  }, []);

  const handleAppointmentDeleted = useCallback((_id: string) => {
    clearFetcherCache();
    loadBookingsRef.current?.(true);
  }, []);

  // ─── Yoco ──────────────────────────────────────────────────────────────────
  const shouldShowPayButton = (b: ProviderBookingListItem) => {
    if (!yocoEnabled) return false;
    const s = (b.status || "").toLowerCase();
    if (s === "cancelled" || s === "canceled") return false;
    const ps = ((b as any).payment_status || "").toLowerCase();
    return ps !== "paid";
  };

  const handleYocoPayment = (b: ProviderBookingListItem) => {
    setYocoBooking(b);
    setYocoDialogOpen(true);
  };

  const handlePaymentSuccess = (_payment: YocoPayment) => {
    loadBookings();
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const getStatusColor = (s: string) => {
    switch (s) {
      case "confirmed": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "cancelled": return "bg-red-100 text-red-800";
      case "completed": return "bg-blue-100 text-blue-800";
      case "in_progress": case "started": return "bg-purple-100 text-purple-800";
      case "no_show": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getServiceMode = (b: ProviderBookingListItem) =>
    b.location_type === "at_home" ? "House call" : "At salon";

  const getServiceNames = (b: ProviderBookingListItem): string => {
    const svcs = b.services as any[] | undefined;
    if (!svcs || svcs.length === 0) return "—";
    return svcs.map((s) => s.offering_name || "Service").join(", ");
  };

  // §Hydration 2026-04: stable placeholder during SSR prevents #418 from
  // locale-dependent date formatting. Client swaps in the formatted string
  // once mounted.
  const fmtDate = (iso?: string | null) => {
    if (!iso || !hasMounted) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return "—"; }
  };
  const fmtTime = (iso?: string | null) => {
    if (!iso || !hasMounted) return "—";
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };
  const fmtDateLong = (iso?: string | null) => {
    if (!iso || !hasMounted) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch { return "—"; }
  };

  // Deterministic avatar color derived from the customer name so the same
  // client always gets the same chip color in the table. Avoids random seed
  // differences between SSR and CSR.
  const getAvatarPalette = (name: string): { bg: string; text: string } => {
    const palettes = [
      { bg: "bg-pink-100", text: "text-pink-700" },
      { bg: "bg-purple-100", text: "text-purple-700" },
      { bg: "bg-indigo-100", text: "text-indigo-700" },
      { bg: "bg-blue-100", text: "text-blue-700" },
      { bg: "bg-teal-100", text: "text-teal-700" },
      { bg: "bg-emerald-100", text: "text-emerald-700" },
      { bg: "bg-amber-100", text: "text-amber-700" },
      { bg: "bg-rose-100", text: "text-rose-700" },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return palettes[Math.abs(hash) % palettes.length];
  };
  const getInitials = (name: string): string => {
    const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
  };

  // ─── Render bookings list (either table or cards) ──────────────────────────
  const renderBookingsList = (items: ProviderBookingListItem[]) => {
    const paged = getPagedItems(items);
    const totalPages = Math.ceil(items.length / pageSize);

    if (items.length === 0) {
      return <EmptyState title="No bookings found" description="No bookings match the current filters" />;
    }

    return (
      <>
        {viewMode === "table" ? (
          /* Modern desktop table — sticky header, zebra-ish hover, avatars,
             status pill column, inline primary action + overflow. */
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
              <Table className="min-w-[960px]">
                <TableHeader className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 py-3">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ref</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Client</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Service</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">When</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Mode</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Team</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 text-right">Price</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</TableHead>
                    <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((b, idx) => {
                    const name = b.customer_name || "Customer";
                    const palette = getAvatarPalette(name);
                    const isSel = selectedBookings.has(b.id);
                    const primaryAction = primaryBookingAction(b);
                    return (
                      <TableRow
                        key={b.id}
                        data-selected={isSel ? "true" : undefined}
                        className={
                          "cursor-pointer transition-colors border-b border-gray-100 " +
                          (idx % 2 === 0 ? "bg-white " : "bg-gray-50/40 ") +
                          "hover:bg-[#FF0077]/[0.035] data-[selected=true]:bg-[#FF0077]/[0.06]"
                        }
                        onClick={() => handleBookingClick(b)}
                      >
                        <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              const s = new Set(selectedBookings);
                              s.has(b.id) ? s.delete(b.id) : s.add(b.id);
                              setSelectedBookings(s);
                            }}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label={isSel ? "Deselect booking" : "Select booking"}
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-[#FF0077]" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-gray-700">
                          {b.booking_number || "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${palette.bg} ${palette.text}`}>
                              {getInitials(name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="font-medium text-sm text-gray-900 truncate">{name}</div>
                                {(b as any).is_group_booking ? (
                                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                                    Group
                                  </span>
                                ) : null}
                              </div>
                              {b.location_name && (
                                <div className="text-[11px] text-gray-500 truncate">{b.location_name}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="max-w-[220px] truncate text-sm text-gray-800" title={getServiceNames(b)}>
                            {getServiceNames(b)}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="leading-tight" suppressHydrationWarning>
                            <div className="text-sm font-medium text-gray-900">{fmtDate(b.scheduled_at)}</div>
                            <div className="text-[11px] text-gray-500">{fmtTime(b.scheduled_at)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            (b.location_type === "at_home"
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                              : "bg-slate-50 text-slate-700 border border-slate-100")
                          }>
                            {getServiceMode(b)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={"text-sm " + (b.staff_name ? "font-medium text-gray-800" : "text-gray-400 italic")}>
                            {b.staff_name || "Unassigned"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Money amount={b.total_amount || 0} className="font-semibold text-gray-900 tabular-nums" />
                        </TableCell>
                        <TableCell className="py-3">
                          <AppointmentStatusBadge status={b.status} />
                        </TableCell>
                        <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {primaryAction && (
                              <Button
                                size="sm"
                                onClick={() => runPrimaryBookingAction(b, primaryAction)}
                                className="bg-violet-600 hover:bg-violet-700 text-white text-[11px] h-7 px-2.5"
                              >
                                {primaryAction.label}
                              </Button>
                            )}
                            {shouldShowPayButton(b) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleYocoPayment(b)}
                                className="text-[11px] h-7 px-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                                title="Take payment"
                                aria-label="Take payment"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openBookingDetails(b)}
                              className="text-[11px] h-7 px-2 text-gray-600"
                              aria-label="Details"
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* Card view */
          <div className="space-y-3">
            {paged.map((b) => {
              const primaryAction = primaryBookingAction(b);
              return (
              <div
                key={b.id}
                className={`bg-white border rounded-xl p-4 sm:p-5 hover:shadow-md transition-all cursor-pointer ${selectedBookings.has(b.id) ? "ring-2 ring-primary" : ""}`}
                onClick={() => handleBookingClick(b)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        const s = new Set(selectedBookings);
                        s.has(b.id) ? s.delete(b.id) : s.add(b.id);
                        setSelectedBookings(s);
                      }}
                      className="flex-shrink-0 p-1"
                    >
                      {selectedBookings.has(b.id) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-semibold text-gray-900 truncate">{b.customer_name || "Customer"}</h3>
                        {(b as any).is_group_booking ? (
                          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                            Group
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500">#{b.booking_number}</p>
                    </div>
                  </div>
                  <AppointmentStatusBadge status={b.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm py-2 border-t border-gray-100">
                  <div>
                    <span className="text-gray-500 text-xs">Service</span>
                    <p className="font-medium truncate" title={getServiceNames(b)}>{getServiceNames(b)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Team Member</span>
                    <p className={b.staff_name ? "font-medium" : "text-gray-400 italic"}>
                      {b.staff_name || "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Date</span>
                    <p className="font-medium" suppressHydrationWarning>
                      {fmtDateLong(b.scheduled_at)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Time</span>
                    <p className="font-medium" suppressHydrationWarning>
                      {fmtTime(b.scheduled_at)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Service Mode</span>
                    <p className="font-medium">{getServiceMode(b)}</p>
                  </div>
                  {b.location_name && (
                    <div>
                      <span className="text-gray-500 text-xs">Location</span>
                      <p className="font-medium truncate">{b.location_name}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <span className="text-xs text-gray-500">Total</span>
                    <p className="font-bold text-lg"><Money amount={b.total_amount || 0} /></p>
                  </div>
                  <div className="flex gap-1.5">
                    {primaryAction && (
                      <Button size="sm" onClick={() => runPrimaryBookingAction(b, primaryAction)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9">
                        {primaryAction.label}
                      </Button>
                    )}
                    {shouldShowPayButton(b) && (
                      <Button variant="outline" size="sm" onClick={() => handleYocoPayment(b)} className="gap-1 text-xs h-9">
                        <CreditCard className="w-3 h-3" /> Pay
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openBookingDetails(b)} className="text-xs h-9">
                      Details
                    </Button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading bookings..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="w-full max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between mb-2">
          <PageHeader
            title="Bookings"
            subtitle="Manage all your customer bookings and appointments"
            breadcrumbs={[
              { label: "Home", href: "/" },
              { label: "Provider", href: "/provider" },
              { label: "Bookings" },
            ]}
          />
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent("open-appointment-sidebar"))}
            className="bg-[#FF0077] hover:bg-[#E6006B] text-white shadow-sm flex-shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">New Appointment</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        {/* Snapshot stats strip with its own time-period filter. Revenue
            card inherits brand accent. Mobile: 2 cols; ≥sm: 4 cols. */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {([
              ["today", "Today"],
              ["week", "Week"],
              ["month", "Month"],
              ["all", "All"],
            ] as Array<[StatsRange, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleStatsRangeChange(value)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                  (statsRange === value
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50")
                }
                aria-pressed={statsRange === value}
              >
                {label}
              </button>
            ))}
          </div>
          {isRefreshing && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatTile
            icon={<CalendarCheck className="w-4 h-4" />}
            label={statsRangeLabel}
            value={statsSnapshot.count.toLocaleString()}
            tone="slate"
          />
          <StatTile
            icon={<CalendarClock className="w-4 h-4" />}
            label="Pending"
            value={statsSnapshot.pendingCount.toLocaleString()}
            tone={statsSnapshot.pendingCount > 0 ? "amber" : "slate"}
          />
          <StatTile
            icon={<PlayCircle className="w-4 h-4" />}
            label="In progress"
            value={statsSnapshot.inProgressCount.toLocaleString()}
            tone={statsSnapshot.inProgressCount > 0 ? "violet" : "slate"}
          />
          <StatTile
            icon={<Banknote className="w-4 h-4" />}
            label={`${statsRangeLabel} revenue`}
            value={<Money amount={statsSnapshot.revenue} />}
            tone="brand"
          />
        </div>

        {/* Sync + View toggle */}
        <div className="mb-4 flex items-center justify-between">
          <SyncIndicator isSyncing={isRefreshing} lastSynced={lastSynced} size="sm" />
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewChange("table")}
              className={`p-2 ${viewMode === "table" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewChange("cards")}
              className={`p-2 ${viewMode === "cards" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Card view"
              aria-label="Card view"
              aria-pressed={viewMode === "cards"}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conflict Alert */}
        {conflictError && (
          <BookingConflictAlert
            conflictMessage={conflictError}
            onRefresh={() => { setConflictError(null); loadBookings(); }}
            onDismiss={() => setConflictError(null)}
          />
        )}

        {/* Bulk Actions */}
        <BulkBookingActions
          selectedIds={selectedBookings}
          onSelectionChange={setSelectedBookings}
          onBulkAction={handleBulkAction}
          totalCount={filteredBookings.length}
          visibleIds={filteredBookings.map((b) => b.id)}
        />

        {/* Filters bar */}
        <div className="mb-6 flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by client, service, or ref number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 min-h-[44px]"
            />
          </div>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-full md:w-48 min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">Month to Date</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BookingStatus)}>
            <SelectTrigger className="w-full md:w-48 min-h-[44px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
          {locations.length > 0 && (
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-full md:w-56 min-h-[44px]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name || "Location"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Bookings with status tabs */}
        {error ? (
          <EmptyState
            title="Failed to load bookings"
            description={error}
            action={{ label: "Retry", onClick: () => loadBookings() }}
          />
        ) : (
          <Tabs defaultValue="all" className="w-full max-w-full overflow-x-hidden" onValueChange={() => setPage(1)}>
            <div
              className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="min-w-max sm:min-w-0">
                <TabsList className="inline-flex h-auto w-full sm:w-auto gap-1 sm:gap-2 bg-transparent p-0 sm:p-1 sm:bg-muted rounded-none sm:rounded-md border-b border-gray-200 sm:border-b-0">
                  {([
                    ["all", "All", filteredBookings.length],
                    ["pending", "Pending", groupedBookings.pending.length],
                    ["confirmed", "Confirmed", groupedBookings.confirmed.length],
                    ["in_progress", "In Progress", groupedBookings.in_progress.length],
                    ["completed", "Completed", groupedBookings.completed.length],
                    ["cancelled", "Cancelled", groupedBookings.cancelled.length],
                    ["no_show", "No Shows", groupedBookings.no_show.length],
                  ] as const).map(([value, label, count]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="group flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {label}
                        <span
                          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600 group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary sm:group-data-[state=active]:bg-white/20 sm:group-data-[state=active]:text-white"
                        >
                          {count}
                        </span>
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <TabsContent value="all" className="mt-6">
              {renderBookingsList(filteredBookings)}
            </TabsContent>
            <TabsContent value="pending" className="mt-6">
              {renderBookingsList(groupedBookings.pending)}
            </TabsContent>
            <TabsContent value="confirmed" className="mt-6">
              {renderBookingsList(groupedBookings.confirmed)}
            </TabsContent>
            <TabsContent value="in_progress" className="mt-6">
              {renderBookingsList(groupedBookings.in_progress)}
            </TabsContent>
            <TabsContent value="completed" className="mt-6">
              {renderBookingsList(groupedBookings.completed)}
            </TabsContent>
            <TabsContent value="cancelled" className="mt-6">
              {renderBookingsList(groupedBookings.cancelled)}
            </TabsContent>
            <TabsContent value="no_show" className="mt-6">
              {renderBookingsList(groupedBookings.no_show)}
            </TabsContent>
          </Tabs>
        )}

        {/* Rating dialog after completion */}
        {pendingRatingBooking && (
          <ProviderClientRatingDialog
            open={!!pendingRatingBooking}
            onOpenChange={(open) => !open && setPendingRatingBooking(null)}
            bookingId={pendingRatingBooking.id}
            customerName={pendingRatingBooking.customer_name}
            locationId={pendingRatingBooking.location_id}
            locationName={pendingRatingBooking.location_name ?? undefined}
            requireRating
            onRatingSubmitted={() => {
              setPendingRatingBooking(null);
              setShowPostNudge(true);
            }}
          />
        )}
        <PostForRewardNudge open={showPostNudge} onOpenChange={setShowPostNudge} />

        {/* Yoco payment dialog */}
        {yocoBooking && (
          <YocoPaymentDialog
            open={yocoDialogOpen}
            onOpenChange={setYocoDialogOpen}
            amount={yocoBooking.total_amount || 0}
            appointmentId={yocoBooking.id}
            bookingLocationId={(yocoBooking as { location_id?: string | null }).location_id ?? null}
            onSuccess={handlePaymentSuccess}
          />
        )}

        {/* Appointment sidebar for full detail view */}
        <AppointmentSidebar
          teamMembers={teamMembers}
          services={services}
          locations={locations}
          onAppointmentCreated={() => {
            clearFetcherCache();
            loadBookings();
          }}
          onAppointmentUpdated={handleAppointmentUpdated}
          onAppointmentDeleted={handleAppointmentDeleted}
          onRefresh={() => {
            clearFetcherCache();
            loadBookingsRef.current?.(true);
          }}
        />
      </div>
    </RoleGuard>
  );
}

/** Compact snapshot tile for the bookings page header strip. Mobile-first; brand accent for the
 *  revenue tile so the money metric stands out. */
type StatTileTone = "slate" | "amber" | "violet" | "brand";

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: StatTileTone;
}) {
  const palette: Record<StatTileTone, { wrap: string; iconWrap: string; label: string }> = {
    slate: {
      wrap: "border-gray-200 bg-white",
      iconWrap: "bg-gray-100 text-gray-600",
      label: "text-gray-500",
    },
    amber: {
      wrap: "border-amber-200 bg-amber-50/70",
      iconWrap: "bg-amber-100 text-amber-700",
      label: "text-amber-700",
    },
    violet: {
      wrap: "border-violet-200 bg-violet-50/70",
      iconWrap: "bg-violet-100 text-violet-700",
      label: "text-violet-700",
    },
    brand: {
      wrap: "border-[#FF0077]/20 bg-gradient-to-br from-[#FF0077]/5 to-[#FF0077]/[0.02]",
      iconWrap: "bg-[#FF0077]/10 text-[#FF0077]",
      label: "text-[#FF0077]",
    },
  };
  const c = palette[tone];
  return (
    <div className={`rounded-xl border ${c.wrap} p-3 sm:p-4 shadow-sm`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg ${c.iconWrap}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] sm:text-xs font-medium uppercase tracking-wide ${c.label}`}>{label}</div>
          <div className="text-base sm:text-lg font-semibold text-gray-900 truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}
