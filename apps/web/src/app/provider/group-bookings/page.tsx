"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { GroupBooking, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Users, Calendar, Edit, Trash2, CheckCircle, Plus, Sparkles, Info,
} from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { Money } from "@/components/provider-portal/Money";
import { openGroupViewMode, openGroupSheet, openGroupEditMode } from "@/stores/appointment-sidebar-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

function GroupBookingsPageInner() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { hasPermission, isOwner } = usePermissions();
  const canCreateGroups = isOwner || hasPermission("create_appointments");
  const canEditGroups = isOwner || hasPermission("edit_appointments");
  const canCancelGroups =
    isOwner || hasPermission("cancel_appointments") || hasPermission("edit_appointments");
  const [hasMounted, setHasMounted] = useState(false);
  const [groupBookings, setGroupBookings] = useState<GroupBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [groupCancelConfirm, setGroupCancelConfirm] = useState<{ id: string; status: string } | null>(
    null,
  );

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
      toast.error(t("web.provider.groupBookingsPage.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, dateRange, searchQuery]);

  useEffect(() => { setHasMounted(true); }, []);
  useEffect(() => {
    if (!hasMounted) return;
    loadGroupBookings();
  }, [hasMounted, loadGroupBookings]);

  const normalizeGroupBookingId = (id: string) =>
    id.startsWith("group:") ? id.slice("group:".length) : id;

  const handleSearch = () => { setPage(1); loadGroupBookings(); };
  const handleCreate = () => {
    openGroupSheet();
  };

  const handleEdit = (booking: GroupBooking) => {
    openGroupEditMode(booking);
  };

  const handleDelete = async (id: string, currentStatus: string) => {
    if (currentStatus === "cancelled") {
      toast.info(t("web.provider.groupBookingsPage.alreadyCancelled"));
      return;
    }
    setGroupCancelConfirm({ id, status: currentStatus });
  };

  const confirmGroupCancel = async () => {
    if (!groupCancelConfirm) return;
    const { id } = groupCancelConfirm;
    try {
      await providerApi.deleteGroupBooking(id);
      toast.success(t("web.provider.groupBookingsPage.cancelled"));
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to cancel group booking:", error);
      toast.error(t("web.provider.groupBookingsPage.cancelFailed"));
    } finally {
      setGroupCancelConfirm(null);
    }
  };

  const handleCheckIn = async (bookingId: string, participantId: string) => {
    const normalizedBookingId = normalizeGroupBookingId(bookingId);
    try {
      await providerApi.checkInGroupParticipant(normalizedBookingId, participantId);
      toast.success(t("web.provider.groupBookingsPage.checkedIn"));
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to check in participant:", error);
      toast.error(t("web.provider.groupBookingsPage.checkInFailed"));
    }
  };

  const handleCheckOut = async (bookingId: string, participantId: string) => {
    const normalizedBookingId = normalizeGroupBookingId(bookingId);
    try {
      await providerApi.checkOutGroupParticipant(normalizedBookingId, participantId);
      toast.success(t("web.provider.groupBookingsPage.checkedOut"));
      loadGroupBookings();
    } catch (error) {
      console.error("Failed to check out participant:", error);
      toast.error(t("web.provider.groupBookingsPage.checkOutFailed"));
    }
  };


  const openDetail = async (booking: GroupBooking) => {
    const normalizedBookingId = normalizeGroupBookingId(booking.id);
    openGroupViewMode(normalizedBookingId);
  };

  const openedFromQueryRef = React.useRef(false);
  useEffect(() => {
    if (!hasMounted || openedFromQueryRef.current) return;
    const openId = searchParams.get("open_group_id")?.trim();
    if (!openId) return;
    openedFromQueryRef.current = true;
    void openDetail({ id: normalizeGroupBookingId(openId) } as GroupBooking);
  }, [hasMounted, searchParams]);

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
    return { dateStr: booking.scheduled_date || t("web.provider.common.emDash"), timeStr: booking.scheduled_time || "" };
  };

  const isFinal = (status: string) => status === "cancelled" || status === "completed";

  if (!hasMounted) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-gray-600">{t("web.provider.groupBookingsPage.loading")}</p>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.groupBookingsPage.loading")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.groupBookingsPage.title")}
        subtitle={t("web.provider.groupBookingsPage.subtitle")}
        primaryAction={
          canCreateGroups
            ? {
label: t("web.provider.groupBookingsPage.newGroupBooking"),
                onClick: handleCreate,
                icon: <Plus className="w-4 h-4 me-2 flex-shrink-0" />,
              }
            : undefined
        }
      />

      {canCreateGroups ? (
      <SectionCard className="mb-4 overflow-hidden border-rose-100 bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950 p-0 text-white sm:mb-6">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-5 w-5 text-rose-200" />
            </div>
            <div className="min-w-0">
<p className="text-sm font-semibold text-rose-100">{t("web.provider.groupBookingsPage.buildGroupSession")}</p>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
{t("web.provider.groupBookingsPage.buildGroupSessionBody")}
              </p>
            </div>
          </div>
          <Button onClick={handleCreate} className="w-full flex-shrink-0 bg-white text-slate-950 hover:bg-rose-50 sm:w-auto">
            <Plus className="me-2 h-4 w-4" />
            {t("web.provider.groupBookingsPage.createGroup")}
          </Button>
        </div>
      </SectionCard>
      ) : null}

      {/* Filters */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
placeholder={t("web.provider.groupBookingsPage.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="ps-10 min-h-[44px] touch-manipulation"
          />
        </div>
        <div className="flex gap-2 sm:gap-3 flex-1 sm:flex-initial">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="flex-1 sm:w-40 min-h-[44px] touch-manipulation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("web.provider.common.dateRange.today")}</SelectItem>
              <SelectItem value="week">{t("web.provider.common.dateRange.thisWeek")}</SelectItem>
              <SelectItem value="month">{t("web.provider.common.dateRange.monthToDate")}</SelectItem>
              <SelectItem value="all">{t("web.provider.common.dateRange.allTime")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-40 min-h-[44px] touch-manipulation">
<SelectValue placeholder={t("web.provider.common.statusLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("web.provider.common.allStatuses")}</SelectItem>
              <SelectItem value="booked">{t("web.provider.common.status.booked")}</SelectItem>
              <SelectItem value="started">{t("web.provider.common.status.started")}</SelectItem>
              <SelectItem value="completed">{t("web.provider.common.status.completed")}</SelectItem>
              <SelectItem value="cancelled">{t("web.provider.common.status.cancelled")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} className="bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation px-4 sm:px-6">
<span className="hidden sm:inline">{t("web.provider.common.search")}</span>
            <Search className="w-4 h-4 sm:hidden" />
          </Button>
        </div>
      </div>

      {/* Group Bookings List */}
      {groupBookings.length === 0 ? (
        <SectionCard className="p-8 sm:p-12">
          <EmptyState
            icon={Users}
            title={t("web.provider.groupBookingsPage.emptyTitle")}
            description={t("web.provider.groupBookingsPage.emptyDescription")}
            action={{ label: t("web.provider.groupBookingsPage.createGroupBooking"), onClick: handleCreate }}
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
                    <TableHead>{t("web.provider.groupBookingsPage.ref")}</TableHead>
                    <TableHead>{t("web.provider.groupBookingsPage.dateTime")}</TableHead>
                    <TableHead>{t("web.provider.common.service")}</TableHead>
                    <TableHead>{t("web.provider.portal.newSaleDialog.teamMember")}</TableHead>
                    <TableHead>{t("web.provider.groupBookingsPage.participants")}</TableHead>
                    <TableHead>{t("web.provider.groupBookingsPage.total")}</TableHead>
                    <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                    <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupBookings.map((booking) => {
                    const { dateStr, timeStr } = formatDateTime(booking);
                    const participantCount = booking.participants?.length ?? 0;
                    const cancelled = booking.status === "cancelled";
                    const completed = booking.status === "completed";
                    return (
                      <TableRow
                        key={booking.id}
                        className={cn(cancelled && "opacity-60", "cursor-pointer")}
                        data-group-booking-row={booking.id}
                        onClick={() => void openDetail(booking)}
                      >
                        <TableCell className="font-medium">{booking.ref_number}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3" />
                            <span>{dateStr} {timeStr}</span>
                          </div>
                        </TableCell>
                        <TableCell>{booking.service_name ?? t("web.provider.common.emDash")}</TableCell>
                        <TableCell>{booking.team_member_name ?? t("web.provider.common.emDash")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
<span>{t("web.provider.groupBookingsPage.participantCount", { count: participantCount })}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {booking.total_price != null ? <Money amount={booking.total_price} /> : t("web.provider.common.emDash")}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(booking.status)}>{t(`web.provider.common.status.${booking.status === "completed" ? "completed" : booking.status === "cancelled" ? "cancelled" : booking.status === "started" ? "started" : booking.status === "booked" ? "booked" : "pending"}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDetail(booking)}>
                              <Info className="w-3 h-3 me-1" />
                              {t("web.provider.common.details")}
                            </Button>
                            {!isFinal(booking.status) && (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(booking)}>
                                <Edit className="w-3 h-3 me-1" />
                                {t("web.provider.common.edit")}
                              </Button>
                            )}
                            {!cancelled && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(booking.id, booking.status)}
                                className="text-red-600 hover:text-red-700"
                                disabled={completed}
title={completed ? t("web.provider.groupBookingsPage.completedCannotCancel") : undefined}
                              >
                                <Trash2 className="w-3 h-3 me-1" />
                                {t("web.provider.common.cancel")}
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
                      <Badge className={getStatusColor(booking.status)}>{t(`web.provider.common.status.${booking.status === "completed" ? "completed" : booking.status === "cancelled" ? "cancelled" : booking.status === "started" ? "started" : booking.status === "booked" ? "booked" : "pending"}`)}</Badge>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.groupBookingsPage.serviceLabel")}</span>
                        <span className="font-medium">{booking.service_name ?? t("web.provider.common.emDash")}</span>
                      </div>
                      <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.groupBookingsPage.teamMemberLabel")}</span>
                        <span className="font-medium">{booking.team_member_name ?? t("web.provider.common.emDash")}</span>
                      </div>
                      <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.groupBookingsPage.participantsLabel")}</span>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
<span className="font-medium">{t("web.provider.groupBookingsPage.participantCount", { count: participants.length })}</span>
                        </div>
                      </div>
                      <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.groupBookingsPage.totalLabel")}</span>
                        <span className="font-semibold text-base">
                          {booking.total_price != null ? <Money amount={booking.total_price} /> : t("web.provider.common.emDash")}
                        </span>
                      </div>
                    </div>

                    {/* Participants */}
                    {participants.length > 0 && (
                      <div className="border-t pt-4 space-y-2">
<div className="font-medium text-sm mb-2">{t("web.provider.groupBookingsPage.participants")}</div>
                        {participants.map((participant) => (
                          <div key={participant.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{participant.client_name}</div>
                              <div className="text-xs text-gray-500">{participant.service_name}</div>
                              {participant.notes && (
                                <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
{t("web.provider.groupBookingsPage.notePrefix", { notes: participant.notes })}
                                </div>
                              )}
                              {participant.price != null && participant.price > 0 && (
                                <div className="text-xs text-gray-500 mt-1"><Money amount={participant.price} /></div>
                              )}
                            </div>
                            {!cancelled && !completed && (
                              <div className="flex items-center gap-2">
                                {!participant.checked_in ? (
                                  <Button variant="outline" size="sm" onClick={() => handleCheckIn(booking.id, participant.id)} className="min-h-[36px] text-xs touch-manipulation">
                                    <CheckCircle className="w-3 h-3 me-1" />
                                    {t("web.provider.groupBookingsPage.checkIn")}
                                  </Button>
                                ) : !participant.checked_out ? (
                                  <Button variant="outline" size="sm" onClick={() => handleCheckOut(booking.id, participant.id)} className="min-h-[36px] text-xs touch-manipulation bg-green-50 border-green-200">
                                    <CheckCircle className="w-3 h-3 me-1" />
                                    {t("web.provider.groupBookingsPage.checkOut")}
                                  </Button>
                                ) : (
<div className="text-xs text-green-600 font-medium">{t("web.provider.groupBookingsPage.completed")}</div>
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
                        <Info className="w-4 h-4 me-2" />
                        {t("web.provider.common.details")}
                      </Button>
                      {!isFinal(booking.status) && (
                        <Button variant="outline" onClick={() => handleEdit(booking)} className="flex-1 min-h-[44px] touch-manipulation">
                          <Edit className="w-4 h-4 me-2" />
                          {t("web.provider.common.edit")}
                        </Button>
                      )}
                      {!cancelled && (
                        <Button
                          variant="outline"
                          onClick={() => handleDelete(booking.id, booking.status)}
                          className="flex-1 min-h-[44px] touch-manipulation text-red-600 hover:text-red-700"
                          disabled={completed}
                        >
                          <Trash2 className="w-4 h-4 me-2" />
                          {t("web.provider.common.cancel")}
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

      <AlertDialog
        open={!!groupCancelConfirm}
        onOpenChange={(open) => {
          if (!open) setGroupCancelConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
<AlertDialogTitle>{t("web.provider.groupBookingsPage.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
{t("web.provider.groupBookingsPage.cancelDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
<AlertDialogCancel>{t("web.provider.groupBookingsPage.keepBooking")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void confirmGroupCancel()}
            >
              {t("web.provider.groupBookingsPage.cancelGroupBooking")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

export default function GroupBookingsPage() {
  return (
    <Suspense fallback={null}>
      <GroupBookingsPageInner />
    </Suspense>
  );
}
