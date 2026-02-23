"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  Calendar,
  User,
  Building2,
  DollarSign,
  Eye,
  Download,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Booking } from "@/types/beautonomi";
import Link from "next/link";

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);

  useEffect(() => {
    loadBookings();
  }, [statusFilter, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  const loadBookings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      const response = await fetcher.get<{ data: Booking[] }>(
        `/api/admin/bookings?${params.toString()}`
      );
      setBookings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load bookings";
      setError(errorMessage);
      console.error("Error loading bookings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBooking = (bookingId: string, checked: boolean) => {
    const newSelected = new Set(selectedBookingIds);
    if (checked) {
      newSelected.add(bookingId);
    } else {
      newSelected.delete(bookingId);
    }
    setSelectedBookingIds(newSelected);
    setIsSelectAll(newSelected.size === filteredBookings.length && filteredBookings.length > 0);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredBookings.map((b) => b.id));
      setSelectedBookingIds(allIds);
      setIsSelectAll(true);
    } else {
      setSelectedBookingIds(new Set());
      setIsSelectAll(false);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedBookingIds.size === 0) {
      toast.error("Please select at least one booking");
      return;
    }

    const bookingIds = Array.from(selectedBookingIds);

    try {
      if (!confirm(`Perform ${action} on ${bookingIds.length} booking(s)?`)) return;

      await fetcher.post("/api/admin/bookings/bulk", {
        booking_ids: bookingIds,
        action: action === "cancel" ? "cancel" : action === "complete" ? "complete" : "export",
      });

      toast.success(`${bookingIds.length} booking(s) updated`);
      setSelectedBookingIds(new Set());
      setIsSelectAll(false);
      loadBookings();
    } catch (error: any) {
      toast.error(error.message || `Failed to perform bulk ${action}`);
    }
  };

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.booking_number?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedBookings = {
    all: filteredBookings,
    pending: filteredBookings.filter((b) => b.status === "pending"),
    confirmed: filteredBookings.filter((b) => b.status === "confirmed"),
    in_progress: filteredBookings.filter((b) => b.status === "in_progress"),
    completed: filteredBookings.filter((b) => b.status === "completed"),
    cancelled: filteredBookings.filter((b) => b.status === "cancelled"),
    no_show: filteredBookings.filter((b) => b.status === "no_show"),
  };

  const stats = {
    total: bookings.length,
    pending: groupedBookings.pending.length,
    confirmed: groupedBookings.confirmed.length,
    in_progress: groupedBookings.in_progress.length,
    completed: groupedBookings.completed.length,
    cancelled: groupedBookings.cancelled.length,
    no_show: groupedBookings.no_show.length,
    total_revenue: bookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + (b.total_amount || 0), 0),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading bookings..." />
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            {/* Header */}
            <div className="mb-6">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900"
              >
                Bookings Oversight
              </motion.h1>
              <p className="text-sm md:text-base font-light text-gray-600">Monitor all platform bookings</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Total</p>
                <p className="text-2xl font-semibold tracking-tight text-gray-900">{stats.total}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Pending</p>
                <p className="text-2xl font-semibold tracking-tight text-yellow-600">{stats.pending}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Confirmed</p>
                <p className="text-2xl font-semibold tracking-tight text-blue-600">{stats.confirmed}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">In Progress</p>
                <p className="text-2xl font-semibold tracking-tight text-purple-600">{stats.in_progress}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Completed</p>
                <p className="text-2xl font-semibold tracking-tight text-green-600">{stats.completed}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Cancelled</p>
                <p className="text-2xl font-semibold tracking-tight text-red-600">{stats.cancelled}</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
              >
                <p className="text-sm font-light text-gray-600 mb-1">Revenue</p>
                <p className="text-2xl font-semibold tracking-tight text-gray-900">R {stats.total_revenue.toLocaleString()}</p>
              </motion.div>
            </div>

            {/* Search and Filters */}
            <div className="mb-6 space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by customer, provider, or booking number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 backdrop-blur-xl bg-white/80 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="border-white/40 backdrop-blur-xl bg-white/80 hover:bg-white/90 rounded-xl"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (statusFilter !== "all") params.set("status", statusFilter);
                  if (dateFilter) params.set("start_date", dateFilter);
                  
                  const response = await fetch(`/api/admin/export/bookings?${params.toString()}`);
                  if (!response.ok) throw new Error("Export failed");
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `bookings-export-${new Date().toISOString().split("T")[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  toast.success("Export downloaded");
                } catch {
                  toast.error("Failed to export bookings");
                }
              }}
            >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </motion.div>
                </div>

                {showFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 space-y-4"
                  >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Date</label>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Bulk Actions Bar */}
        <BulkActionsBar
          selectedCount={selectedBookingIds.size}
          onClearSelection={() => {
            setSelectedBookingIds(new Set());
            setIsSelectAll(false);
          }}
          onBulkAction={handleBulkAction}
          actions={[
            { id: "complete", label: "Mark Complete", icon: CheckCircle2, variant: "default" as const },
            { id: "cancel", label: "Cancel", icon: XCircle, variant: "destructive" as const },
            { id: "export", label: "Export", icon: Download, variant: "outline" as const },
          ]}
        />

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
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-6 backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-1 shadow-lg">
                <TabsTrigger value="all" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">All ({groupedBookings.all.length})</TabsTrigger>
                <TabsTrigger value="pending" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Pending ({groupedBookings.pending.length})
                </TabsTrigger>
                <TabsTrigger value="confirmed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                Confirmed ({groupedBookings.confirmed.length})
              </TabsTrigger>
                <TabsTrigger value="in_progress" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  In Progress ({groupedBookings.in_progress.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Completed ({groupedBookings.completed.length})
                </TabsTrigger>
                <TabsTrigger value="cancelled" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Cancelled ({groupedBookings.cancelled.length})
                </TabsTrigger>
                <TabsTrigger value="no_show" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  No Show ({groupedBookings.no_show.length})
                </TabsTrigger>
              </TabsList>

            <TabsContent value="all">
              <BookingsList
                bookings={groupedBookings.all}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="pending">
              <BookingsList
                bookings={groupedBookings.pending}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="confirmed">
              <BookingsList
                bookings={groupedBookings.confirmed}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="in_progress">
              <BookingsList
                bookings={groupedBookings.in_progress}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="completed">
              <BookingsList
                bookings={groupedBookings.completed}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="cancelled">
              <BookingsList
                bookings={groupedBookings.cancelled}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="no_show">
              <BookingsList
                bookings={groupedBookings.no_show}
                selectedIds={selectedBookingIds}
                onSelect={handleSelectBooking}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            </Tabs>
          )}
          </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}

 
function BookingsList({
  bookings,
  selectedIds,
  onSelect,
  isSelectAll: _isSelectAll,
  onSelectAll: _onSelectAll,
}: {
  bookings: Booking[];
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  isSelectAll: boolean;
  onSelectAll: (checked: boolean) => void;
}) {
   
  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings found"
        description="No bookings match these criteria"
      />
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          selected={selectedIds.has(booking.id)}
          onSelect={(checked) => onSelect(booking.id, checked)}
        />
      ))}
    </div>
  );
}

function BookingCard({
  booking,
  selected,
  onSelect,
}: {
  booking: Booking;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const getStatusColor = () => {
    switch (booking.status) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-purple-100 text-purple-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      case "no_show":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onSelect} />
        </div>
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor()}`}>
              {booking.status}
            </span>
            <h3 className="text-lg font-semibold tracking-tight text-gray-900">
              Booking #{booking.booking_number}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>
                <span className="font-medium">Customer ID:</span> {booking.customer_id}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span>
                <span className="font-medium">Provider ID:</span> {booking.provider_id}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>
                {new Date(booking.scheduled_at).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span>
                {booking.currency} {booking.total_amount?.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {booking.services?.slice(0, 3).map((service, index) => (
              <span
                key={index}
                className="px-2 py-1 backdrop-blur-sm bg-pink-50/80 border border-pink-100 rounded-lg text-xs font-medium text-[#FF0077]"
              >
                {service.offering_name || "Service"}
              </span>
            ))}
            {booking.services && booking.services.length > 3 && (
              <span className="px-2 py-1 backdrop-blur-sm bg-pink-50/80 border border-pink-100 rounded-lg text-xs font-medium text-[#FF0077]">
                +{booking.services.length - 3} more
              </span>
            )}
          </div>
            </div>

            <div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href={`/admin/bookings/${booking.id}`}>
                  <Button variant="outline" className="border-white/40 backdrop-blur-sm bg-white/60 hover:bg-white/80">
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
