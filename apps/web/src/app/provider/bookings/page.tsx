"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CheckSquare,
  Square,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
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
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

type BookingStatus = "all" | "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

export default function ProviderBookings() {
  const _router = useRouter();
  const { selectedLocationId } = useProviderPortal();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatus>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [pendingRatingBooking, setPendingRatingBooking] = useState<{
    id: string;
    customer_name: string;
    location_id: string | null;
    location_name?: string | null;
  } | null>(null);
  const [showPostNudge, setShowPostNudge] = useState(false);

  // Cache for bookings data
  const bookingsCacheRef = useRef<Map<string, { data: Booking[]; timestamp: number }>>(new Map());
  const BOOKINGS_CACHE_DURATION = 10 * 1000; // 10 seconds
  const pendingBookingsRequests = useRef<Map<string, Promise<any>>>(new Map());

  const loadBookings = useCallback(async () => {
    // Create cache key
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFilter) {
      params.set("start_date", dateFilter);
      const endDate = new Date(dateFilter);
      endDate.setDate(endDate.getDate() + 1);
      params.set("end_date", endDate.toISOString().split("T")[0]);
    }
    if (selectedLocationId) {
      params.set("location_id", selectedLocationId);
    }
    const cacheKey = params.toString() || "all";

    // Check cache first
    const cached = bookingsCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BOOKINGS_CACHE_DURATION) {
      setBookings(cached.data);
      setIsLoading(false);
      setError(null);
      
      // Refresh in background if cache is > 5 seconds old
      if (Date.now() - cached.timestamp > 5 * 1000) {
        loadBookingsFresh(cacheKey, params, true).catch(() => {
          // Silently fail background refresh
        });
      }
      return;
    }

    // Check for pending request
    if (pendingBookingsRequests.current.has(cacheKey)) {
      try {
        const result = await pendingBookingsRequests.current.get(cacheKey);
        setBookings(result);
        return;
      } catch {
        // Continue with new request if previous failed
      }
    }

    await loadBookingsFresh(cacheKey, params);
  }, [statusFilter, dateFilter, selectedLocationId]);

  const loadBookingsFresh = useCallback(async (cacheKey: string, params: URLSearchParams, isBackground = false) => {
    const requestPromise = (async () => {
      try {
        if (!isBackground) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);
        setConflictError(null);

        const response = await fetcher.get<{ data: Booking[] }>(
          `/api/provider/bookings?${params.toString()}`,
          { timeoutMs: 8000 } // 8 second timeout
        );
        
        // Update cache
        bookingsCacheRef.current.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
        });
        
        setBookings(response.data);
        setLastSynced(new Date());
        return response.data;
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load bookings";
        setError(errorMessage);
        console.error("Error loading bookings:", err);
        throw err;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        pendingBookingsRequests.current.delete(cacheKey);
      }
    })();

    pendingBookingsRequests.current.set(cacheKey, requestPromise);
    await requestPromise;
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleStatusChange = async (bookingId: string, newStatus: string, version?: number) => {
    const booking = bookings.find((b) => b.id === bookingId);
    try {
      setConflictError(null);
      const response = await fetcher.patch<{ booking: Booking; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        {
          status: newStatus,
          version, // Include version for conflict detection
        }
      );
      
      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }
      
      toast.success("Booking status updated");
      loadBookings();

      if (newStatus === "completed" && booking) {
        setPendingRatingBooking({
          id: booking.id,
          customer_name: (booking as any).customer_name ?? "Customer",
          location_id: booking.location_id ?? null,
          location_name: (booking as any).location_name ?? null,
        });
      }
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        toast.error("Failed to update booking status");
      }
    }
  };

  const handleBulkAction = async (action: string, bookingIds: string[]) => {
    try {
      setConflictError(null);
      await fetcher.post(`/api/provider/bookings/bulk`, {
        action,
        booking_ids: bookingIds,
      });
      toast.success(`Bulk ${action} completed for ${bookingIds.length} booking(s)`);
      setSelectedBookings(new Set());
      loadBookings();
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("Some bookings were modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        toast.error(`Failed to ${action} bookings`);
      }
    }
  };

  // Memoize filtered bookings to prevent recalculation on every render
  const filteredBookings = useMemo(() => {
    if (!searchQuery) return bookings;
    const query = searchQuery.toLowerCase();
    return bookings.filter((booking) => {
      const customerName = (booking as any).customer_name?.toLowerCase() || "";
      const bookingNumber = booking.booking_number?.toLowerCase() || "";
      return customerName.includes(query) || bookingNumber.includes(query);
    });
  }, [bookings, searchQuery]);

  // Memoize grouped bookings - single pass instead of multiple filters
  const groupedBookings = useMemo(() => {
    const grouped: Record<string, Booking[]> = {
      pending: [],
      confirmed: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      no_show: [],
    };
    
    for (const booking of filteredBookings) {
      const status = booking.status;
      if ((status as string) === "started" || status === "in_progress") {
        grouped.in_progress.push(booking);
      } else if (status in grouped) {
        grouped[status].push(booking);
      }
    }
    
    return grouped;
  }, [filteredBookings]);

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
        <PageHeader
          title="Bookings"
          subtitle="Manage all your customer bookings"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Bookings" }
          ]}
        />

        {/* Sync Indicator */}
        <div className="mb-4 flex items-center justify-between">
          <SyncIndicator 
            isSyncing={isRefreshing} 
            lastSynced={lastSynced}
            size="sm"
          />
        </div>

        {/* Conflict Alert */}
        {conflictError && (
          <BookingConflictAlert
            conflictMessage={conflictError}
            onRefresh={() => {
              setConflictError(null);
              loadBookings();
            }}
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

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by customer name or booking number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as BookingStatus)}
                    className="w-full p-2.5 border rounded-md min-h-[44px]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Date</label>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bookings Tabs */}
        {error ? (
          <EmptyState
            title="Failed to load bookings"
            description={error}
            action={{
              label: "Retry",
              onClick: loadBookings,
            }}
          />
        ) : (
          <Tabs defaultValue="all" className="w-full max-w-full overflow-x-hidden">
            <div 
              className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="min-w-max sm:min-w-0">
                <TabsList className="inline-flex h-auto w-full sm:w-auto gap-1 sm:gap-2 bg-transparent p-0 sm:p-1 sm:bg-muted rounded-none sm:rounded-md border-b border-gray-200 sm:border-b-0">
                  <TabsTrigger 
                    value="all"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    All ({filteredBookings.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="pending"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    Pending ({groupedBookings.pending.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="confirmed"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    Confirmed ({groupedBookings.confirmed.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="in_progress"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    In Progress ({groupedBookings.in_progress.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="completed"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    Completed ({groupedBookings.completed.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="cancelled"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    Cancelled ({groupedBookings.cancelled.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="no_show"
                    className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent sm:data-[state=active]:bg-[#FF0077] data-[state=active]:text-[#FF0077] sm:data-[state=active]:text-white transition-all duration-200 hover:text-[#FF0077] sm:hover:text-white whitespace-nowrap"
                  >
                    No Shows ({groupedBookings.no_show.length})
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="all" className="mt-6">
              <BookingsList
                bookings={filteredBookings}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="pending" className="mt-6">
              <BookingsList
                bookings={groupedBookings.pending}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="confirmed" className="mt-6">
              <BookingsList
                bookings={groupedBookings.confirmed}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="completed" className="mt-6">
              <BookingsList
                bookings={groupedBookings.completed}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="in_progress" className="mt-6">
              <BookingsList
                bookings={groupedBookings.in_progress}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="cancelled" className="mt-6">
              <BookingsList
                bookings={groupedBookings.cancelled}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
            <TabsContent value="no_show" className="mt-6">
              <BookingsList
                bookings={groupedBookings.no_show}
                onStatusChange={handleStatusChange}
                selectedIds={selectedBookings}
                onSelectionChange={setSelectedBookings}
              />
            </TabsContent>
          </Tabs>
        )}

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
      </div>
    </RoleGuard>
  );
}

function BookingsList({
  bookings,
  onStatusChange,
  selectedIds,
  onSelectionChange,
}: {
  bookings: Booking[];
  onStatusChange: (id: string, status: string, version?: number) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const router = useRouter();

  const handleToggleSelection = (bookingId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(bookingId)) {
      newSelection.delete(bookingId);
    } else {
      newSelection.add(bookingId);
    }
    onSelectionChange(newSelection);
  };

  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings found"
        description="You don't have any bookings matching these criteria"
      />
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          onStatusChange={onStatusChange}
          onViewDetails={() => router.push(`/provider/bookings/${booking.id}`)}
          isSelected={selectedIds.has(booking.id)}
          onToggleSelection={() => handleToggleSelection(booking.id)}
        />
      ))}
    </div>
  );
}

function BookingCard({
  booking,
  onStatusChange,
  onViewDetails,
  isSelected,
  onToggleSelection,
}: {
  booking: Booking;
  onStatusChange: (id: string, status: string, version?: number) => void;
  onViewDetails: () => void;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}) {
  const getStatusIcon = () => {
    switch (booking.status) {
      case "confirmed":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "pending":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (booking.status) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className={`bg-white border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-[#FF0077]" : ""}`}>
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          {onToggleSelection && (
            <button
              onClick={onToggleSelection}
              className="flex-shrink-0 mt-1"
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5 text-[#FF0077]" />
              ) : (
                <Square className="w-5 h-5 text-gray-400" />
              )}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
              {getStatusIcon()}
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {(booking as any).customer_name || "Customer"}
              </h3>
              <span
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}
              >
                {booking.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  {new Date(booking.scheduled_at).toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>
                  {new Date(booking.scheduled_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {booking.location_type === "at_salon" && (booking as any).location_name && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{(booking as any).location_name}</span>
                </div>
              )}
              {(booking as any).staff_name && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{(booking as any).staff_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Services Section */}
        {booking.services && booking.services.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Services</p>
            <div className="flex flex-wrap gap-2">
              {booking.services.slice(0, 3).map((service, index) => (
                <span
                  key={index}
                  className="px-2.5 py-1 bg-gray-100 rounded-md text-xs text-gray-700"
                >
                  {(service as any).offering_name || "Service"}
                </span>
              ))}
              {booking.services.length > 3 && (
                <span className="px-2.5 py-1 bg-gray-100 rounded-md text-xs text-gray-700">
                  +{booking.services.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Price and Booking Number */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-lg sm:text-xl font-semibold text-gray-900">
              {booking.currency} {booking.total_amount?.toFixed(2)}
            </p>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Booking #{booking.booking_number}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={onViewDetails}
              className="min-h-[44px] text-sm sm:text-base w-full sm:w-auto"
            >
              View Details
            </Button>
            {booking.status === "pending" && (
              <>
                <Button
                  onClick={() => onStatusChange(booking.id, "confirmed", (booking as any).version)}
                  className="bg-green-600 hover:bg-green-700 text-white min-h-[44px] text-sm sm:text-base w-full sm:w-auto"
                >
                  Confirm
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => onStatusChange(booking.id, "cancelled", (booking as any).version)}
                  className="min-h-[44px] text-sm sm:text-base w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </>
            )}
            {booking.status === "confirmed" && (
              <Button
                onClick={() => onStatusChange(booking.id, "completed", (booking as any).version)}
                className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] text-sm sm:text-base w-full sm:w-auto"
              >
                Mark Complete
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
