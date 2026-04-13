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
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { providerApi } from "@/lib/provider-portal/api";
import type { Appointment, Salon, TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import type { YocoPayment } from "@/lib/provider-portal/types";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import Pagination from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/provider/PageHeader";
import type { Booking } from "@/types/beautonomi";
import { useRouter } from "next/navigation";
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
  const { selectedLocationId, provider } = useProviderPortal();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    try { return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || "table"; } catch { return "table"; }
  });
  const handleViewChange = useCallback((v: ViewMode) => {
    setViewMode(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch {}
  }, []);

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
  const [statusFilter, setStatusFilter] = useState<BookingStatus>("all");
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

      const loc = locationFilter !== "all" ? locationFilter : selectedLocationId;
      if (loc) params.set("location_id", loc);

      const { start_date, end_date } = getDateRangeParams(dateRange);
      if (start_date) params.set("start_date", start_date);
      if (end_date) params.set("end_date", end_date);

      const response = await fetcher.get<{ data: ProviderBookingListItem[] }>(
        `/api/provider/bookings?${params.toString()}`,
        { timeoutMs: 10000 },
      );

      setBookings(response.data);
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
  }, [statusFilter, dateRange, locationFilter, selectedLocationId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Realtime updates
  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;
  const refreshBackground = useCallback(() => { loadBookingsRef.current(true); }, []);
  const supabaseClient = getSupabaseClient();
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_created", refreshBackground);
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_updated", refreshBackground);
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_cancelled", refreshBackground);
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_services_changed", refreshBackground);

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
      const s = b.status as string;
      if (s === "started" || s === "in_progress") g.in_progress.push(b);
      else if (s in g) g[s].push(b);
    }
    return g;
  }, [filteredBookings]);

  // Paginated slice for current tab
  const getPagedItems = useCallback((items: ProviderBookingListItem[]) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [page]);

  // ─── Sidebar helpers ───────────────────────────────────────────────────────
  const handleBookingClick = useCallback((booking: ProviderBookingListItem) => {
    const apt: Appointment = {
      id: booking.id,
      booking_id: booking.id,
      ref_number: booking.booking_number || "",
      client_name: booking.customer_name || "Customer",
      service_id: (booking.services as any)?.[0]?.offering_id || "",
      service_name: (booking.services as any)?.[0]?.offering_name || "Service",
      scheduled_date: new Date(booking.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      scheduled_time: new Date(booking.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      duration_minutes: (booking.services as any)?.[0]?.duration || 60,
      price: booking.total_amount || 0,
      status: booking.status as any,
      team_member_name: booking.staff_name || "",
      team_member_id: (booking as any).staff_id || "",
      location_type: booking.location_type || "at_salon",
      payment_status: (booking as any).payment_status || "",
      created_by: booking.customer_name || "",
      total_amount: booking.total_amount,
    } as Appointment;
    openViewMode(apt);
  }, []);

  const handleAppointmentUpdated = useCallback((_updated: Appointment) => {
    loadBookingsRef.current?.(true);
  }, []);

  const handleAppointmentDeleted = useCallback((_id: string) => {
    loadBookingsRef.current?.(true);
  }, []);

  // ─── Yoco ──────────────────────────────────────────────────────────────────
  const shouldShowPayButton = (b: ProviderBookingListItem) => {
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
          /* Desktop table view */
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead className="font-semibold">Ref #</TableHead>
                    <TableHead className="font-semibold">Client</TableHead>
                    <TableHead className="font-semibold">Service</TableHead>
                    <TableHead className="font-semibold">Date & Time</TableHead>
                    <TableHead className="font-semibold">Service Mode</TableHead>
                    <TableHead className="font-semibold">Team Member</TableHead>
                    <TableHead className="font-semibold">Price</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleBookingClick(b)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            const s = new Set(selectedBookings);
                            s.has(b.id) ? s.delete(b.id) : s.add(b.id);
                            setSelectedBookings(s);
                          }}
                          className="p-1"
                        >
                          {selectedBookings.has(b.id) ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium text-blue-600">
                        {b.booking_number || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{b.customer_name || "Customer"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={getServiceNames(b)}>
                          {getServiceNames(b)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {new Date(b.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(b.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                          {getServiceMode(b)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={b.staff_name ? "font-medium" : "text-gray-400 italic"}>
                          {b.staff_name || "Unassigned"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Money amount={b.total_amount || 0} className="font-semibold" />
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={b.status} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {b.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleStatusChange(b.id, "confirmed", b.version)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleStatusChange(b.id, "cancelled", b.version)}
                                className="text-xs h-8"
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {b.status === "confirmed" && (
                            <Button
                              size="sm"
                              onClick={() => handleStatusChange(b.id, "started", b.version)}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
                            >
                              Start
                            </Button>
                          )}
                          {(b.status === "in_progress" || (b.status as string) === "started") && (
                            <Button
                              size="sm"
                              onClick={() => handleStatusChange(b.id, "completed", b.version)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                            >
                              Complete
                            </Button>
                          )}
                          {shouldShowPayButton(b) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleYocoPayment(b)}
                              className="gap-1 text-xs h-8"
                            >
                              <CreditCard className="w-3 h-3" />
                              Pay
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/provider/bookings/${b.id}`)}
                            className="text-xs h-8"
                          >
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* Card view */
          <div className="space-y-3">
            {paged.map((b) => (
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
                      <h3 className="font-semibold text-gray-900 truncate">{b.customer_name || "Customer"}</h3>
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
                    <p className="font-medium">
                      {new Date(b.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Time</span>
                    <p className="font-medium">
                      {new Date(b.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
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
                    {b.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => handleStatusChange(b.id, "confirmed", b.version)} className="bg-green-600 hover:bg-green-700 text-white text-xs h-9">
                          Confirm
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleStatusChange(b.id, "cancelled", b.version)} className="text-xs h-9">
                          Cancel
                        </Button>
                      </>
                    )}
                    {b.status === "confirmed" && (
                      <Button size="sm" onClick={() => handleStatusChange(b.id, "started", b.version)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9">
                        Start
                      </Button>
                    )}
                    {(b.status === "in_progress" || (b.status as string) === "started") && (
                      <Button size="sm" onClick={() => handleStatusChange(b.id, "completed", b.version)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9">
                        Complete
                      </Button>
                    )}
                    {shouldShowPayButton(b) && (
                      <Button variant="outline" size="sm" onClick={() => handleYocoPayment(b)} className="gap-1 text-xs h-9">
                        <CreditCard className="w-3 h-3" /> Pay
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/provider/bookings/${b.id}`)} className="text-xs h-9">
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
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

        {/* Sync + View toggle */}
        <div className="mb-4 flex items-center justify-between">
          <SyncIndicator isSyncing={isRefreshing} lastSynced={lastSynced} size="sm" />
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewChange("table")}
              className={`p-2 ${viewMode === "table" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewChange("cards")}
              className={`p-2 ${viewMode === "cards" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Card view"
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
                      className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
                    >
                      {label} ({count})
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
            onSuccess={handlePaymentSuccess}
          />
        )}

        {/* Appointment sidebar for full detail view */}
        <AppointmentSidebar
          teamMembers={teamMembers}
          services={services}
          locations={locations}
          onAppointmentCreated={() => loadBookings()}
          onAppointmentUpdated={handleAppointmentUpdated}
          onAppointmentDeleted={handleAppointmentDeleted}
        />
      </div>
    </RoleGuard>
  );
}
