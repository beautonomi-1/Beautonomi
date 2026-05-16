"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { GroupBooking, GroupBookingParticipant, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search, Users, Calendar, Edit, Trash2, CheckCircle, Plus, Sparkles,
  MapPin, Clock, DollarSign, User, Phone, Mail, FileText, Play,
  CheckSquare, XCircle, Info, Building2, Home,
} from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { Money } from "@/components/provider-portal/Money";
import { GroupBookingDialog } from "@/components/provider-portal/GroupBookingDialog";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";

export default function GroupBookingsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [groupBookings, setGroupBookings] = useState<GroupBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<GroupBooking | null>(null);

  // Detail sheet
  const [detailBooking, setDetailBooking] = useState<GroupBooking | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isStatusChanging, setIsStatusChanging] = useState(false);

  const loadGroupBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      };

      const today = new Date();
      const todayStr = formatLocalDate(today);

      if (dateRange === "today") {
        filters.date_from = todayStr;
        filters.date_to = todayStr;
      } else if (dateRange === "week") {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        filters.date_from = formatLocalDate(weekStart);
        filters.date_to = formatLocalDate(weekEnd);
      } else if (dateRange === "month") {
        filters.date_from = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
        filters.date_to = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
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

  useEffect(() => { setHasMounted(true); }, []);
  useEffect(() => {
    if (!hasMounted) return;
    loadGroupBookings();
  }, [hasMounted, loadGroupBookings]);

  const handleSearch = () => { setPage(1); loadGroupBookings(); };
  const handleCreate = () => { setSelectedBooking(null); setIsDialogOpen(true); };

  const handleEdit = (booking: GroupBooking) => {
    setSelectedBooking(booking);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string, currentStatus: string) => {
    if (currentStatus === "cancelled") {
      toast.info("This group booking is already cancelled.");
      return;
    }
    if (!confirm("Cancel this group booking and any linked participant bookings?")) return;
    try {
      await providerApi.deleteGroupBooking(id);
      toast.success("Group booking cancelled");
      // Update detail sheet if open
      if (detailBooking?.id === id) {
        setDetailBooking(prev => prev ? { ...prev, status: "cancelled" } : null);
      }
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to cancel group booking:", error);
      toast.error("Failed to cancel group booking");
    }
  };

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    setIsStatusChanging(true);
    try {
      await fetcher.patch(`/api/provider/group-bookings/${bookingId}`, { status: newStatus });
      toast.success(`Group booking marked as ${newStatus}`);
      // Optimistically update detail sheet
      if (detailBooking?.id === bookingId) {
        setDetailBooking(prev => prev ? { ...prev, status: newStatus as GroupBooking["status"] } : null);
      }
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update booking status");
    } finally {
      setIsStatusChanging(false);
    }
  };

  const handleCheckIn = async (bookingId: string, participantId: string) => {
    try {
      await providerApi.checkInGroupParticipant(bookingId, participantId);
      toast.success("Participant checked in");
      // Optimistically update
      if (detailBooking?.id === bookingId && detailBooking.participants) {
        setDetailBooking(prev => prev ? {
          ...prev,
          participants: prev.participants?.map(p =>
            p.id === participantId ? { ...p, checked_in: true } : p
          ),
        } : null);
      }
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
      if (detailBooking?.id === bookingId && detailBooking.participants) {
        setDetailBooking(prev => prev ? {
          ...prev,
          participants: prev.participants?.map(p =>
            p.id === participantId ? { ...p, checked_out: true } : p
          ),
        } : null);
      }
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to check out participant:", error);
      toast.error("Failed to check out participant");
    }
  };

  const openDetail = (booking: GroupBooking) => {
    setDetailBooking(booking);
    setIsDetailOpen(true);
  };

  const openParticipantBookingForRefund = (bookingId?: string | null) => {
    const id = bookingId?.trim();
    if (!id) {
      toast.error("This participant does not have a linked booking yet");
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign(`/provider/bookings/${encodeURIComponent(id)}`);
    }
  };

  const handleDownloadReceipt = async (bookingId: string, refNumber?: string) => {
    try {
      const response = await fetch(`/api/provider/group-bookings/${encodeURIComponent(bookingId)}/receipt/pdf`);
      if (!response.ok) throw new Error("Failed to generate group receipt");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `group-receipt-${refNumber || bookingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Group receipt downloaded");
    } catch (error) {
      console.error("Failed to download group receipt:", error);
      toast.error("Failed to download group receipt");
    }
  };

  type GroupBookingStatus = GroupBooking["status"] | "confirmed" | "pending";
  const getStatusColor = (status: GroupBookingStatus) => {
    switch (status) {
      case "booked":
      case "confirmed":
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "started":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-500 line-through";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (booking: GroupBooking) => {
    if (booking.scheduled_at) {
      const d = new Date(booking.scheduled_at);
      return {
        dateStr: new Intl.DateTimeFormat("en-ZA", { year: "numeric", month: "short", day: "numeric" }).format(d),
        timeStr: new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(d),
      };
    }
    return { dateStr: booking.scheduled_date || "—", timeStr: booking.scheduled_time || "" };
  };

  const isFinal = (status: string) => status === "cancelled" || status === "completed";

  if (!hasMounted) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-gray-600">Loading group bookings...</p>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading group bookings..." />;
  }

  return (
    <div>
      <PageHeader
        title="Group Bookings"
        subtitle="Create and manage bridal parties, group events, and shared appointment sessions"
        primaryAction={{
          label: "New group booking",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2 flex-shrink-0" />,
        }}
      />

      <SectionCard className="mb-4 overflow-hidden border-rose-100 bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950 p-0 text-white sm:mb-6">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-5 w-5 text-rose-200" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rose-100">Build a group session</p>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Pick a service, staff member, time slot, and participants in one guided flow. Each participant is tracked for check-in, checkout, accounting, and calendar availability.
              </p>
            </div>
          </div>
          <Button onClick={handleCreate} className="w-full flex-shrink-0 bg-white text-slate-950 hover:bg-rose-50 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Create group
          </Button>
        </div>
      </SectionCard>

      {/* Filters */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by ref number, client, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
              <SelectItem value="all">All Time</SelectItem>
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
          <Button onClick={handleSearch} className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation px-4 sm:px-6">
            <span className="hidden sm:inline">Search</span>
            <Search className="w-4 h-4 sm:hidden" />
          </Button>
        </div>
      </div>

      {/* Group Bookings List */}
      {groupBookings.length === 0 ? (
        <SectionCard className="p-8 sm:p-12">
          <EmptyState
            icon={Users}
            title="No group bookings yet"
            description="Create your first group session for bridal parties, events, families, or shared service appointments."
            action={{ label: "Create group booking", onClick: handleCreate }}
          />
        </SectionCard>
      ) : (
        <>
          {/* Desktop Table */}
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
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupBookings.map((booking) => {
                    const { dateStr, timeStr } = formatDateTime(booking);
                    const participantCount = booking.participants?.length ?? 0;
                    const cancelled = booking.status === "cancelled";
                    const completed = booking.status === "completed";
                    return (
                      <TableRow key={booking.id} className={cn(cancelled && "opacity-60")}>
                        <TableCell className="font-medium">{booking.ref_number}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3" />
                            <span>{dateStr} {timeStr}</span>
                          </div>
                        </TableCell>
                        <TableCell>{booking.service_name ?? "—"}</TableCell>
                        <TableCell>{booking.team_member_name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>{participantCount} participant{participantCount !== 1 ? "s" : ""}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {booking.total_price != null ? <Money amount={booking.total_price} /> : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDetail(booking)}>
                              <Info className="w-3 h-3 mr-1" />
                              Details
                            </Button>
                            {!isFinal(booking.status) && (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(booking)}>
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            )}
                            {!cancelled && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(booking.id, booking.status)}
                                className="text-red-600 hover:text-red-700"
                                disabled={completed}
                                title={completed ? "Completed bookings cannot be cancelled" : undefined}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {groupBookings.map((booking) => {
              const { dateStr, timeStr } = formatDateTime(booking);
              const participants = booking.participants ?? [];
              const cancelled = booking.status === "cancelled";
              const completed = booking.status === "completed";
              return (
                <SectionCard key={booking.id} className={cn("p-4 sm:p-6", cancelled && "opacity-70")}>
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-semibold text-base sm:text-lg mb-1">{booking.ref_number}</div>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{dateStr} {timeStr}</span>
                        </div>
                      </div>
                      <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Service:</span>
                        <span className="font-medium">{booking.service_name ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Team Member:</span>
                        <span className="font-medium">{booking.team_member_name ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Participants:</span>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span className="font-medium">{participants.length} participant{participants.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold text-base">
                          {booking.total_price != null ? <Money amount={booking.total_price} /> : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Participants */}
                    {participants.length > 0 && (
                      <div className="border-t pt-4 space-y-2">
                        <div className="font-medium text-sm mb-2">Participants</div>
                        {participants.map((participant) => (
                          <div key={participant.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{participant.client_name}</div>
                              <div className="text-xs text-gray-500">{participant.service_name}</div>
                              {participant.price != null && participant.price > 0 && (
                                <div className="text-xs text-gray-500 mt-1"><Money amount={participant.price} /></div>
                              )}
                            </div>
                            {!cancelled && !completed && (
                              <div className="flex items-center gap-2">
                                {!participant.checked_in ? (
                                  <Button variant="outline" size="sm" onClick={() => handleCheckIn(booking.id, participant.id)} className="min-h-[36px] text-xs touch-manipulation">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Check In
                                  </Button>
                                ) : !participant.checked_out ? (
                                  <Button variant="outline" size="sm" onClick={() => handleCheckOut(booking.id, participant.id)} className="min-h-[36px] text-xs touch-manipulation bg-green-50 border-green-200">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Check Out
                                  </Button>
                                ) : (
                                  <div className="text-xs text-green-600 font-medium">Completed</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                      <Button variant="outline" onClick={() => openDetail(booking)} className="flex-1 min-h-[44px] touch-manipulation">
                        <Info className="w-4 h-4 mr-2" />
                        Details
                      </Button>
                      {!isFinal(booking.status) && (
                        <Button variant="outline" onClick={() => handleEdit(booking)} className="flex-1 min-h-[44px] touch-manipulation">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      )}
                      {!cancelled && (
                        <Button
                          variant="outline"
                          onClick={() => handleDelete(booking.id, booking.status)}
                          className="flex-1 min-h-[44px] touch-manipulation text-red-600 hover:text-red-700"
                          disabled={completed}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
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

      {/* Comprehensive Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {detailBooking && <GroupBookingDetailPanel
            booking={detailBooking}
            onStatusChange={handleStatusChange}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onOpenParticipantBooking={openParticipantBookingForRefund}
            onEdit={() => { setIsDetailOpen(false); handleEdit(detailBooking); }}
            onCancel={() => handleDelete(detailBooking.id, detailBooking.status)}
            onDownloadReceipt={() => handleDownloadReceipt(detailBooking.id, detailBooking.ref_number)}
            isStatusChanging={isStatusChanging}
          />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Comprehensive detail panel ────────────────────────────────────────────
interface DetailPanelProps {
  booking: GroupBooking;
  onStatusChange: (id: string, status: string) => void;
  onCheckIn: (bookingId: string, participantId: string) => void;
  onCheckOut: (bookingId: string, participantId: string) => void;
  onOpenParticipantBooking: (bookingId?: string | null) => void;
  onEdit: () => void;
  onCancel: () => void;
  onDownloadReceipt: () => void;
  isStatusChanging: boolean;
}

function GroupBookingDetailPanel({
  booking,
  onStatusChange,
  onCheckIn,
  onCheckOut,
  onOpenParticipantBooking,
  onEdit,
  onCancel,
  onDownloadReceipt,
  isStatusChanging,
}: DetailPanelProps) {
  const participants: GroupBookingParticipant[] = booking.participants ?? [];
  const cancelled = booking.status === "cancelled";
  const completed = booking.status === "completed";
  const isFinal = cancelled || completed;
  const started = booking.status === "started";

  const formatDt = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(d);
  };

  const statusActions: Array<{ label: string; value: string; icon: React.ReactNode; className?: string }> = [
    ...(booking.status === "booked" ? [{ label: "Mark Started", value: "started", icon: <Play className="w-4 h-4" />, className: "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100" }] : []),
    ...(started ? [{ label: "Mark Completed", value: "completed", icon: <CheckSquare className="w-4 h-4" />, className: "bg-green-50 border-green-300 text-green-800 hover:bg-green-100" }] : []),
  ];

  const checkedIn = participants.filter(p => p.checked_in).length;
  const checkedOut = participants.filter(p => p.checked_out).length;
  const participantRevenue = participants.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  return (
    <div className="space-y-6 pb-8">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-3">
          <span>Group Booking</span>
          <span className="text-sm font-mono text-gray-500">{booking.ref_number}</span>
        </SheetTitle>
      </SheetHeader>

      {/* Status + quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn(
          "text-sm px-3 py-1",
          booking.status === "booked" && "bg-blue-100 text-blue-800",
          booking.status === "started" && "bg-yellow-100 text-yellow-800",
          booking.status === "completed" && "bg-green-100 text-green-800",
          booking.status === "cancelled" && "bg-gray-100 text-gray-500",
        )}>
          {booking.status}
        </Badge>
        {statusActions.map(a => (
          <Button key={a.value} variant="outline" size="sm" disabled={isStatusChanging}
            onClick={() => onStatusChange(booking.id, a.value)}
            className={cn("gap-1.5", a.className)}>
            {a.icon}{a.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={onDownloadReceipt} className="gap-1.5">
          <FileText className="w-4 h-4" />Group receipt
        </Button>
        {!isFinal && (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Edit className="w-4 h-4" />Edit
          </Button>
        )}
        {!cancelled && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={completed}
            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <XCircle className="w-4 h-4" />Cancel booking
          </Button>
        )}
      </div>

      <Separator />

      {/* Session info */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Session Details</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {booking.scheduled_at && (
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
              <div>
                <dt className="text-gray-500 text-xs">Date &amp; Time</dt>
                <dd className="font-medium">{formatDt(booking.scheduled_at)}</dd>
              </div>
            </div>
          )}
          {booking.service_name && (
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
              <div>
                <dt className="text-gray-500 text-xs">Service</dt>
                <dd className="font-medium">{booking.service_name}</dd>
              </div>
            </div>
          )}
          {booking.team_member_name && (
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
              <div>
                <dt className="text-gray-500 text-xs">Team Member</dt>
                <dd className="font-medium">{booking.team_member_name}</dd>
              </div>
            </div>
          )}
          {(booking as any).duration_minutes && (
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
              <div>
                <dt className="text-gray-500 text-xs">Duration</dt>
                <dd className="font-medium">{(booking as any).duration_minutes} min</dd>
              </div>
            </div>
          )}
        </dl>
      </section>

      <Separator />

      {/* Location */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Location</h3>
        <div className="flex items-start gap-2 text-sm">
          {(booking as any).location_type === "at_home"
            ? <Home className="w-4 h-4 mt-0.5 text-violet-500 flex-shrink-0" />
            : <Building2 className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />}
          <div>
            <p className="font-medium capitalize">{((booking as any).location_type || "at_salon").replace("_", " ")}</p>
            {(booking as any).address_line1 && (
              <p className="text-gray-600">
                {(booking as any).address_line1}
                {(booking as any).address_city ? `, ${(booking as any).address_city}` : ""}
                {(booking as any).address_state ? `, ${(booking as any).address_state}` : ""}
              </p>
            )}
            {(booking as any).travel_fee > 0 && (
              <p className="text-xs text-violet-700 mt-1 font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Travel fee: <Money amount={(booking as any).travel_fee} />
              </p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* Financial summary
        *
        * §Group-booking-audit 2026-05: when no participants are linked yet
        * the only money on the row is the at-home travel fee. Labelling that
        * R 100 line "Total" made it look like a real receipt the customer
        * owed; the receipt PDF was correspondingly showing "Balance due R
        * 100,00" in red. Mirror the PDF treatment here — show "Session
        * estimate" + a soft note instead of "Total" — so the operator sees
        * exactly what the receipt will print.
        */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Financials</h3>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Participant services</span>
            <span className="font-medium"><Money amount={participantRevenue} /></span>
          </div>
          {(booking as any).travel_fee > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Travel fee</span>
              <span className="font-medium"><Money amount={(booking as any).travel_fee} /></span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between font-semibold">
            <span>{participants.length === 0 ? "Session estimate" : "Total"}</span>
            <span className="text-lg"><Money amount={booking.total_price ?? 0} /></span>
          </div>
          {participants.length === 0 && (
            <p className="text-xs text-gray-500 pt-1">
              No participant bookings are linked yet. Add participants so the
              receipt reflects each service price instead of the session
              estimate.
            </p>
          )}
        </div>
      </section>

      <Separator />

      {/* Participants */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Participants ({participants.length})
          </h3>
          <div className="flex gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />{checkedIn} in
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-blue-500" />{checkedOut} out
            </span>
          </div>
        </div>

        {participants.length === 0 ? (
          <p className="text-sm text-gray-500">No participants added yet.</p>
        ) : (
          <div className="space-y-3">
            {participants.map((p, idx) => (
              <div key={p.id} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-mono w-5">{idx + 1}.</span>
                      <div>
                        <p className="font-medium text-sm truncate">{p.client_name || "Guest"}</p>
                        <p className="text-xs text-gray-500">{p.service_name || "—"}</p>
                      </div>
                    </div>
                    <div className="ml-7 mt-1 flex flex-col gap-0.5 text-xs text-gray-500">
                      {p.client_email && (
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.client_email}</span>
                      )}
                      {p.client_phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.client_phone}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {p.price != null && p.price > 0 && (
                      <p className="text-sm font-semibold"><Money amount={p.price} /></p>
                    )}
                    <div className="mt-1">
                      {p.checked_out
                        ? <span className="text-xs text-green-600 font-medium">✓ Checked out</span>
                        : p.checked_in
                        ? <span className="text-xs text-amber-600 font-medium">✓ Checked in</span>
                        : <span className="text-xs text-gray-400">Not arrived</span>}
                    </div>
                  </div>
                </div>

                {!isFinal && (
                  <div className="flex gap-2 ml-7">
                    {!p.checked_in ? (
                      <Button variant="outline" size="sm" onClick={() => onCheckIn(booking.id, p.id)} className="h-8 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />Check In
                      </Button>
                    ) : !p.checked_out ? (
                      <Button variant="outline" size="sm" onClick={() => onCheckOut(booking.id, p.id)} className="h-8 text-xs bg-green-50 border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />Check Out
                      </Button>
                    ) : null}
                  </div>
                )}
                {p.booking_id ? (
                  <div className="ml-7">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenParticipantBooking(p.booking_id)}
                      className="h-8 text-xs bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    >
                      Open booking to refund
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      {(booking as any).notes && (
        <>
          <Separator />
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Notes</h3>
            <div className="flex items-start gap-2 text-sm">
              <FileText className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
              <p className="text-gray-700 whitespace-pre-wrap">{(booking as any).notes}</p>
            </div>
          </section>
        </>
      )}

      {/* Timestamps */}
      <Separator />
      <section className="space-y-1 text-xs text-gray-400">
        {(booking as any).created_at && <p>Created: {formatDt((booking as any).created_at)}</p>}
        {(booking as any).updated_at && <p>Last updated: {formatDt((booking as any).updated_at)}</p>}
      </section>
    </div>
  );
}

function formatLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
