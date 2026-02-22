"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { GroupBooking, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Users, Calendar, Edit, Trash2, CheckCircle } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { Money } from "@/components/provider-portal/Money";
import { GroupBookingDialog } from "@/components/provider-portal/GroupBookingDialog";
import { toast } from "sonner";

export default function GroupBookingsPage() {
  const [groupBookings, setGroupBookings] = useState<GroupBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<GroupBooking | null>(null);

  const loadGroupBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      };

      if (dateRange === "month") {
        const now = new Date();
        filters.date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        filters.date_to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listGroupBookings(filters, pagination);
      setGroupBookings(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load group bookings:", error);
      toast.error("Failed to load group bookings");
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, dateRange, searchQuery]);

  useEffect(() => {
    loadGroupBookings();
  }, [loadGroupBookings]);

  const handleSearch = () => {
    setPage(1);
    loadGroupBookings();
  };

  const handleCreate = () => {
    setSelectedBooking(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (booking: GroupBooking) => {
    setSelectedBooking(booking);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this group booking?")) return;

    try {
      await providerApi.deleteGroupBooking(id);
      toast.success("Group booking deleted");
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to delete group booking:", error);
      toast.error("Failed to delete group booking");
    }
  };

  const handleCheckIn = async (bookingId: string, participantId: string) => {
    try {
      await providerApi.checkInGroupParticipant(bookingId, participantId);
      toast.success("Participant checked in");
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to check in participant:", error);
      toast.error("Failed to check in participant");
    }
  };

  const handleCheckOut = async (bookingId: string, participantId: string) => {
    try {
      await providerApi.checkOutGroupParticipant(bookingId, participantId);
      toast.success("Participant checked out");
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to check out participant:", error);
      toast.error("Failed to check out participant");
    }
  };

  const getStatusColor = (status: GroupBooking["status"]) => {
    switch (status) {
      case "booked":
        return "bg-blue-100 text-blue-800";
      case "started":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading group bookings..." />;
  }

  return (
    <div>
      <PageHeader
        title="Group Bookings"
        subtitle="Manage group appointments with multiple participants"
        primaryAction={{
          label: "New Group Booking",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {/* Filters - Mobile First */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by ref number, client, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 min-h-[44px] touch-manipulation"
          />
        </div>
        <div className="flex gap-2 sm:gap-3 flex-1 sm:flex-initial">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="flex-1 sm:w-40 min-h-[44px] touch-manipulation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">Month to Date</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-40 min-h-[44px] touch-manipulation">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="started">Started</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleSearch} 
            className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation px-4 sm:px-6"
          >
            <span className="hidden sm:inline">Search</span>
            <Search className="w-4 h-4 sm:hidden" />
          </Button>
        </div>
      </div>

      {/* Group Bookings List - Mobile First */}
      {groupBookings.length === 0 ? (
        <SectionCard className="p-8 sm:p-12">
          <EmptyState
            title="No group bookings"
            description="Create group bookings to schedule multiple clients in one appointment"
            action={{
              label: "Create Group Booking",
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <>
          {/* Desktop Table View */}
          <SectionCard className="p-0 overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref #</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Team Member</TableHead>
                    <TableHead>Participants</TableHead>
                    <TableHead>Total Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">{booking.ref_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {booking.scheduled_date} {booking.scheduled_time}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{booking.service_name}</TableCell>
                      <TableCell>{booking.team_member_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>
                            {booking.participants.length} participant{booking.participants.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Money amount={booking.total_price} />
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(booking)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(booking.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {groupBookings.map((booking) => (
              <SectionCard key={booking.id} className="p-4 sm:p-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-base sm:text-lg mb-1">
                        {booking.ref_number}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {booking.scheduled_date} {booking.scheduled_time}
                        </span>
                      </div>
                    </div>
                    <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Service:</span>
                      <span className="font-medium">{booking.service_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Team Member:</span>
                      <span className="font-medium">{booking.team_member_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Participants:</span>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">
                          {booking.participants.length} participant{booking.participants.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Price:</span>
                      <span className="font-semibold text-base">
                        <Money amount={booking.total_price} />
                      </span>
                    </div>
                  </div>

                  {/* Participants List with Check-in/Check-out */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="font-medium text-sm mb-2">Participants</div>
                    {booking.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{participant.client_name}</div>
                          <div className="text-xs text-gray-500">{participant.service_name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            <Money amount={participant.price} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!participant.checked_in ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCheckIn(booking.id, participant.id)}
                              className="min-h-[36px] text-xs touch-manipulation"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Check In
                            </Button>
                          ) : !participant.checked_out ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCheckOut(booking.id, participant.id)}
                              className="min-h-[36px] text-xs touch-manipulation bg-green-50 border-green-200"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Check Out
                            </Button>
                          ) : (
                            <div className="text-xs text-green-600 font-medium">
                              Completed
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      onClick={() => handleEdit(booking)}
                      className="flex-1 min-h-[44px] touch-manipulation"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDelete(booking.id)}
                      className="flex-1 min-h-[44px] touch-manipulation text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <GroupBookingDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        booking={selectedBooking}
        onSuccess={loadGroupBookings}
      />
    </div>
  );
}