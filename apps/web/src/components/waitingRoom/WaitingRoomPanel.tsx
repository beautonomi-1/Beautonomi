"use client";

/**
 * Waiting Room Panel - Mangomint-style floating panel
 * 
 * Shows a list of appointments in WAITING status with actions
 * to notify clients and mark them as in service.
 * 
 * Phase 3 enhancements:
 * - arrivedAt timestamp tracking
 * - No-show and Late cancel fast actions
 * - "Waiting too long" indicator (> 15 min)
 * 
 * @module components/waitingRoom/WaitingRoomPanel
 */

import React, { useState, useEffect } from "react";
import { differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VirtualList } from "@/components/ui/virtual-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  X,
  Bell,
  Send,
  User,
  Play,
  RefreshCw,
  MoreHorizontal,
  AlertTriangle,
  XCircle,
  UserX,
} from "lucide-react";

import type { Appointment } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
import { usePermissions } from "@/hooks/usePermissions";
import { formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";

/** Threshold for "waiting too long" warning in minutes */
const WAITING_TOO_LONG_THRESHOLD = 15;

function RunningLateChip({ apt }: { apt: Appointment }) {
  const { t } = useTranslation();
  if (!apt.customer_running_late_at) return null;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
      {t("web.provider.waitingRoomPanel.runningLate")}
      {apt.customer_running_late_minutes
        ? t("web.provider.waitingRoomPanel.runningLateMinutes", { minutes: apt.customer_running_late_minutes })
        : ""}
    </span>
  );
}

type CloseOutBooking = {
  id: string;
  booking_number?: string | null;
  scheduled_at: string;
  status: string;
  suggested_close_out_action?: string;
  customer?: { full_name?: string | null } | null;
  booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;
};

type CloseOutResponse = {
  summary: { total: number; today: number; older: number };
  bookings: CloseOutBooking[];
};

interface WaitingRoomPanelProps {
  /** Appointments with WAITING status */
  waitingAppointments: Appointment[];
  /** Close panel callback */
  onClose: () => void;
  /** Refresh data callback */
  onRefresh: () => void;
  /** Open appointment details callback */
  onAppointmentClick?: (appointment: Appointment) => void;
}

export function WaitingRoomPanel({
  waitingAppointments,
  onClose,
  onRefresh,
  onAppointmentClick,
}: WaitingRoomPanelProps) {
  const { t } = useTranslation();
  const { hasPermission, isOwner } = usePermissions();
  const canEditAppointments = isOwner || hasPermission("edit_appointments");
  const canCancelAppointments =
    isOwner || hasPermission("cancel_appointments") || canEditAppointments;
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    type: "no_show" | "late_cancel";
    appointment: Appointment;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [closeOutQueue, setCloseOutQueue] = useState<CloseOutResponse | null>(null);
  const [closeOutLoading, setCloseOutLoading] = useState(false);

  const loadCloseOutQueue = React.useCallback(async () => {
    try {
      setCloseOutLoading(true);
      const res = await fetcher.get<{ data: CloseOutResponse }>(
        "/api/provider/bookings/close-out",
      );
      setCloseOutQueue(res.data ?? null);
    } catch {
      setCloseOutQueue(null);
    } finally {
      setCloseOutLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCloseOutQueue();
  }, [loadCloseOutQueue, waitingAppointments.length]);

  // Update current time every minute for accurate wait duration
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Sort by check-in time (use arrivedAt from metadata, or scheduled_time as fallback)
  const sortedAppointments = [...waitingAppointments].sort((a, b) => {
    const aArrivedAt = (a as any).metadata?.arrivedAt || a.scheduled_time;
    const bArrivedAt = (b as any).metadata?.arrivedAt || b.scheduled_time;
    return aArrivedAt.localeCompare(bArrivedAt);
  });

  // Calculate wait duration
  const getWaitDuration = (appointment: Appointment): { text: string; minutes: number; notYet: boolean } => {
    // Try to use arrivedAt from metadata first
    const metadata = (appointment as any).metadata;
    let checkInTime: Date;
    
    if (metadata?.arrivedAt) {
      checkInTime = new Date(metadata.arrivedAt);
    } else {
      // Fall back to scheduled_time
      const [hour, minute] = appointment.scheduled_time.split(":").map(Number);
      checkInTime = new Date();
      checkInTime.setHours(hour, minute, 0, 0);
    }
    
    const minutesWaiting = differenceInMinutes(currentTime, checkInTime);
    
    if (minutesWaiting < 0) return { text: t("web.provider.waitingRoomPanel.notYet"), minutes: 0, notYet: true };
    if (minutesWaiting < 60) return { text: t("web.provider.waitingRoomPanel.waitMinutes", { count: minutesWaiting }), minutes: minutesWaiting, notYet: false };
    const hours = Math.floor(minutesWaiting / 60);
    const mins = minutesWaiting % 60;
    return { text: t("web.provider.waitingRoomPanel.waitHours", { hours, minutes: mins }), minutes: minutesWaiting, notYet: false };
  };

  // Check if waiting too long
  const isWaitingTooLong = (minutes: number): boolean => {
    return minutes >= WAITING_TOO_LONG_THRESHOLD;
  };

  // Handle notify client
  const handleNotify = async (appointment: Appointment) => {
    setLoadingIds(prev => new Set(prev).add(`notify-${appointment.id}`));
    try {
      const { resendAppointmentNotification } = await import("@/app/actions/notifications");
      const result = await resendAppointmentNotification(appointment.id, "reminder", undefined, ["push", "email", "sms"]);
      if (result.success) {
        toast.success(t("web.provider.waitingRoomPanel.notified", { name: appointment.client_name }));
      } else {
        toast.error(result.error || t("web.provider.waitingRoomPanel.notifyFailed"));
      }
    } catch (error) {
      console.error("Failed to notify:", error);
      toast.error(t("web.provider.waitingRoomPanel.notifyFailed"));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(`notify-${appointment.id}`);
        return next;
      });
    }
  };

  // Handle mark in service
  const handleMarkInService = async (appointment: Appointment) => {
    if (!canEditAppointments) {
      toast.error(t("web.provider.waitingRoomPanel.noPermissionStart"));
      return;
    }
    setLoadingIds(prev => new Set(prev).add(`service-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "started",
      });
      toast.success(t("web.provider.waitingRoomPanel.nowInService", { name: appointment.client_name }));
      onRefresh();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error(t("web.provider.waitingRoomPanel.updateFailed"));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(`service-${appointment.id}`);
        return next;
      });
    }
  };

  // Handle no-show
  const handleNoShow = async (appointment: Appointment) => {
    if (!canCancelAppointments) {
      toast.error(t("web.provider.waitingRoomPanel.noPermissionNoShow"));
      return;
    }
    setLoadingIds(prev => new Set(prev).add(`noshow-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "no_show",
      });
      // Send no-show notification
      try {
        const { sendCancellationNotificationAction } = await import("@/app/actions/notifications");
        await sendCancellationNotificationAction(appointment.id, "no_show", true, ["push", "email", "sms"]);
      } catch (e) {
        console.warn("Failed to send no-show notification:", e);
      }
      toast.success(t("web.provider.waitingRoomPanel.markedNoShow", { name: appointment.client_name }));
      onRefresh();
    } catch (error) {
      console.error("Failed to mark no-show:", error);
      toast.error(t("web.provider.waitingRoomPanel.noShowFailed"));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(`noshow-${appointment.id}`);
        return next;
      });
      setConfirmAction(null);
    }
  };

  const handleBulkCompleteCloseOut = async () => {
    const eligible = (closeOutQueue?.bookings ?? []).filter((b) =>
      ["in_progress", "checked_in"].includes(String(b.status)),
    );
    if (eligible.length === 0) {
      toast.error(t("web.provider.waitingRoomPanel.noInServiceToComplete"));
      return;
    }
    setCloseOutLoading(true);
    try {
      await fetcher.post("/api/provider/bookings/close-out/bulk-complete", {
        booking_ids: eligible.map((b) => b.id),
      });
      toast.success(t("web.provider.waitingRoomPanel.completedAppointments", { count: eligible.length }));
      onRefresh();
      await loadCloseOutQueue();
    } catch {
      toast.error(t("web.provider.waitingRoomPanel.completeFailed"));
    } finally {
      setCloseOutLoading(false);
    }
  };

  const closeOutBookings = closeOutQueue?.bookings ?? [];
  const closeOutTotal = closeOutQueue?.summary.total ?? 0;

  // Handle late cancel
  const handleLateCancel = async (appointment: Appointment) => {
    if (!canCancelAppointments) {
      toast.error(t("web.provider.waitingRoomPanel.noPermissionCancel"));
      return;
    }
    setLoadingIds(prev => new Set(prev).add(`cancel-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "cancelled",
        cancellation_reason: "Late cancellation by client",
      });
      // Send cancellation notification
      try {
        const { sendCancellationNotificationAction } = await import("@/app/actions/notifications");
        await sendCancellationNotificationAction(appointment.id, "late_cancel", true, ["push", "email", "sms"]);
      } catch (e) {
        console.warn("Failed to send cancellation notification:", e);
      }
      toast.success(t("web.provider.waitingRoomPanel.cancelledLate", { name: appointment.client_name }));
      onRefresh();
    } catch (error) {
      console.error("Failed to cancel:", error);
      toast.error(t("web.provider.waitingRoomPanel.cancelFailed"));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(`cancel-${appointment.id}`);
        return next;
      });
      setConfirmAction(null);
    }
  };

  return (
    <div className={cn(
      "fixed bottom-24 left-4 sm:left-6 z-50",
      "w-[calc(100vw-2rem)] sm:w-[360px] max-h-[calc(100vh-10rem)]",
      "bg-white rounded-xl shadow-2xl",
      "border border-gray-200",
      "flex flex-col overflow-hidden",
      "animate-in slide-in-from-bottom-5 duration-200"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <User className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{t("web.provider.waitingRoomPanel.title")}</h3>
            <p className="text-xs text-gray-500">
              {t("web.provider.waitingRoomPanel.clientsWaiting", { count: waitingAppointments.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              onRefresh();
              void loadCloseOutQueue();
            }}
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
      </div>

      {closeOutTotal > 0 ? (
        <div className="border-b bg-amber-50/80 px-3 py-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-amber-950">
              {t("web.provider.waitingRoomPanel.unclosed", { count: closeOutTotal })}
            </p>
            {canEditAppointments &&
            closeOutBookings.some((b) => ["in_progress", "checked_in"].includes(String(b.status))) ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-amber-900 hover:bg-amber-100"
                disabled={closeOutLoading}
                onClick={() => void handleBulkCompleteCloseOut()}
              >
                {t("web.provider.waitingRoomPanel.completeInService")}
              </Button>
            ) : null}
          </div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {closeOutBookings.slice(0, 5).map((row) => {
              const name = row.customer?.full_name?.trim() || t("web.provider.waitingRoomPanel.customerFallback");
              const service =
                row.booking_services?.[0]?.offering?.title?.trim() || t("web.provider.waitingRoomPanel.appointmentFallback");
              return (
                <button
                  key={row.id}
                  type="button"
                  className="w-full rounded-lg bg-white/80 px-2 py-1.5 text-start text-xs hover:bg-white"
                  onClick={() => {
                    onAppointmentClick?.({
                      id: row.id,
                      client_name: name,
                      service_name: service,
                      scheduled_time: formatBookingTimeInTimeZone(row.scheduled_at),
                      status: row.status,
                    } as Appointment);
                  }}
                >
                  <span className="font-medium text-gray-900">{name}</span>
                  <span className="text-gray-500">
                    {" "}
                    · {formatBookingTimeInTimeZone(row.scheduled_at)} · {row.status.replace(/_/g, " ")}
                  </span>
                </button>
              );
            })}
            {closeOutBookings.length > 5 ? (
              <p className="text-[10px] text-amber-800 px-1">
                {t("web.provider.waitingRoomPanel.moreInQueue", { count: closeOutBookings.length - 5 })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {sortedAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <User className="w-12 h-12 mb-2 opacity-50" />
          <p className="text-sm">{t("web.provider.waitingRoomPanel.noClients")}</p>
        </div>
      ) : sortedAppointments.length > 10 ? (
        // Use virtual scrolling for large lists
        <VirtualList
          items={sortedAppointments}
          itemHeight={100}
          containerHeight={400}
          className="flex-1"
          renderItem={(apt, _index) => {
            const isNotifying = loadingIds.has(`notify-${apt.id}`);
            const isMarking = loadingIds.has(`service-${apt.id}`);
            const _isMarkingNoShow = loadingIds.has(`noshow-${apt.id}`);
            const _isCancelling = loadingIds.has(`cancel-${apt.id}`);
            const waitInfo = getWaitDuration(apt);
            const tooLong = isWaitingTooLong(waitInfo.minutes);

            return (
              <div
                key={apt.id}
                className={cn(
                  "p-3 rounded-lg mx-2 my-1",
                  "bg-gray-50 hover:bg-gray-100",
                  "transition-colors cursor-pointer",
                  "group",
                  tooLong && "ring-2 ring-red-200 bg-red-50/50"
                )}
                onClick={() => onAppointmentClick?.(apt)}
              >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className={cn(
                          "font-semibold text-sm",
                          tooLong 
                            ? "bg-red-100 text-red-600" 
                            : "bg-violet-100 text-violet-600"
                        )}>
                          {apt.client_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {tooLong && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 truncate">
                          {apt.client_name}
                        </p>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            waitInfo.notYet 
                              ? "bg-gray-100 text-gray-600"
                              : tooLong
                                ? "bg-red-100 text-red-700"
                                : "bg-violet-100 text-violet-700"
                          )}>
                            {waitInfo.text}
                          </span>
                          <RunningLateChip apt={apt} />
                          {/* More actions dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotify(apt);
                                }}
                              >
                                <Send className="w-4 h-4 me-2" />
                                {t("web.provider.waitingRoomPanel.sendReminder")}
                              </DropdownMenuItem>
                              {canCancelAppointments && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmAction({ type: "no_show", appointment: apt });
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <UserX className="w-4 h-4 me-2" />
                                    {t("web.provider.waitingRoomPanel.markNoShow")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmAction({ type: "late_cancel", appointment: apt });
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <XCircle className="w-4 h-4 me-2" />
                                    {t("web.provider.waitingRoomPanel.lateCancel")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {t("web.provider.waitingRoomPanel.withStaff", { service: apt.service_name, staff: apt.team_member_name })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("web.provider.waitingRoomPanel.scheduled", { time: apt.scheduled_time })}
                        {tooLong && (
                          <span className="ms-2 text-red-500 font-medium">
                            {t("web.provider.waitingRoomPanel.waitingTooLong")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 text-xs text-gray-600 hover:text-violet-600 hover:bg-violet-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotify(apt);
                      }}
                      disabled={isNotifying}
                    >
                      {isNotifying ? (
                        <RefreshCw className="w-3.5 h-3.5 me-1 animate-spin" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 me-1" />
                      )}
                      {t("web.provider.waitingRoomPanel.notify")}
                    </Button>
                    {canEditAppointments && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "flex-1 h-8 text-xs",
                          tooLong 
                            ? "text-red-600 hover:text-red-700 hover:bg-red-50 font-medium"
                            : "text-gray-600 hover:text-pink-600 hover:bg-pink-50"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkInService(apt);
                        }}
                        disabled={isMarking}
                      >
                        {isMarking ? (
                          <RefreshCw className="w-3.5 h-3.5 me-1 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 me-1" />
                        )}
                        {t("web.provider.waitingRoomPanel.startService")}
                      </Button>
                    )}
                  </div>
                </div>
              );
          }}
        />
      ) : (
        // Regular rendering for smaller lists
        <ScrollArea className="flex-1 max-h-[400px]">
          <div className="p-2 space-y-1">
            {sortedAppointments.map((apt, _index) => {
              const isNotifying = loadingIds.has(`notify-${apt.id}`);
              const isMarking = loadingIds.has(`service-${apt.id}`);
              const _isMarkingNoShow = loadingIds.has(`noshow-${apt.id}`);
              const _isCancelling = loadingIds.has(`cancel-${apt.id}`);
              const waitInfo = getWaitDuration(apt);
              const tooLong = isWaitingTooLong(waitInfo.minutes);

              return (
                <div
                  key={apt.id}
                  className={cn(
                    "p-3 rounded-lg",
                    "bg-gray-50 hover:bg-gray-100",
                    "transition-colors cursor-pointer",
                    "group",
                    tooLong && "ring-2 ring-red-200 bg-red-50/50"
                  )}
                  onClick={() => onAppointmentClick?.(apt)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className={cn(
                          "font-semibold text-sm",
                          tooLong 
                            ? "bg-red-100 text-red-600" 
                            : "bg-violet-100 text-violet-600"
                        )}>
                          {apt.client_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {tooLong && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 truncate">
                          {apt.client_name}
                        </p>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            waitInfo.notYet 
                              ? "bg-gray-100 text-gray-600"
                              : tooLong
                                ? "bg-red-100 text-red-700"
                                : "bg-violet-100 text-violet-700"
                          )}>
                            {waitInfo.text}
                          </span>
                          <RunningLateChip apt={apt} />
                          {/* More actions dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotify(apt);
                                }}
                              >
                                <Send className="w-4 h-4 me-2" />
                                {t("web.provider.waitingRoomPanel.sendReminder")}
                              </DropdownMenuItem>
                              {canCancelAppointments && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmAction({ type: "no_show", appointment: apt });
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <UserX className="w-4 h-4 me-2" />
                                    {t("web.provider.waitingRoomPanel.markNoShow")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmAction({ type: "late_cancel", appointment: apt });
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <XCircle className="w-4 h-4 me-2" />
                                    {t("web.provider.waitingRoomPanel.lateCancel")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {t("web.provider.waitingRoomPanel.withStaff", { service: apt.service_name, staff: apt.team_member_name })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("web.provider.waitingRoomPanel.scheduled", { time: apt.scheduled_time })}
                        {tooLong && (
                          <span className="ms-2 text-red-500 font-medium">
                            {t("web.provider.waitingRoomPanel.waitingTooLong")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 text-xs text-gray-600 hover:text-violet-600 hover:bg-violet-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotify(apt);
                      }}
                      disabled={isNotifying}
                    >
                      {isNotifying ? (
                        <RefreshCw className="w-3.5 h-3.5 me-1 animate-spin" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 me-1" />
                      )}
                      {t("web.provider.waitingRoomPanel.notify")}
                    </Button>
                    {canEditAppointments && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "flex-1 h-8 text-xs",
                          tooLong 
                            ? "text-red-600 hover:text-red-700 hover:bg-red-50 font-medium"
                            : "text-gray-600 hover:text-pink-600 hover:bg-pink-50"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkInService(apt);
                        }}
                        disabled={isMarking}
                      >
                        {isMarking ? (
                          <RefreshCw className="w-3.5 h-3.5 me-1 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 me-1" />
                        )}
                        {t("web.provider.waitingRoomPanel.startService")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Confirmation Dialogs */}
      <AlertDialog 
        open={confirmAction !== null} 
        onOpenChange={() => setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "no_show" ? t("web.provider.waitingRoomPanel.confirmNoShowTitle") : t("web.provider.waitingRoomPanel.confirmLateCancelTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "no_show" ? (
                <>
                  {t("web.provider.waitingRoomPanel.confirmNoShowBody", { name: confirmAction?.appointment.client_name })}
                </>
              ) : (
                <>
                  {t("web.provider.waitingRoomPanel.confirmLateCancelBody", { name: confirmAction?.appointment.client_name })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("web.provider.waitingRoomPanel.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction?.type === "no_show") {
                  handleNoShow(confirmAction.appointment);
                } else if (confirmAction?.type === "late_cancel") {
                  handleLateCancel(confirmAction.appointment);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {confirmAction?.type === "no_show" ? t("web.provider.waitingRoomPanel.confirmNoShow") : t("web.provider.waitingRoomPanel.confirmLateCancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default WaitingRoomPanel;
