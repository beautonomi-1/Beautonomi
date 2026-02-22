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

/** Threshold for "waiting too long" warning in minutes */
const WAITING_TOO_LONG_THRESHOLD = 15;

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
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    type: "no_show" | "late_cancel";
    appointment: Appointment;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

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
  const getWaitDuration = (appointment: Appointment): { text: string; minutes: number } => {
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
    
    if (minutesWaiting < 0) return { text: "Not yet", minutes: 0 };
    if (minutesWaiting < 60) return { text: `${minutesWaiting}m`, minutes: minutesWaiting };
    const hours = Math.floor(minutesWaiting / 60);
    const mins = minutesWaiting % 60;
    return { text: `${hours}h ${mins}m`, minutes: minutesWaiting };
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
      const result = await resendAppointmentNotification(appointment.id, "reminder");
      if (result.success) {
        toast.success(`Notified ${appointment.client_name}`);
      } else {
        toast.error(result.error || "Failed to send notification");
      }
    } catch (error) {
      console.error("Failed to notify:", error);
      toast.error("Failed to send notification");
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
    setLoadingIds(prev => new Set(prev).add(`service-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "started",
      });
      toast.success(`${appointment.client_name} is now in service`);
      onRefresh();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status");
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
    setLoadingIds(prev => new Set(prev).add(`noshow-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "no_show",
      });
      // Send no-show notification
      try {
        const { sendCancellationNotificationAction } = await import("@/app/actions/notifications");
        await sendCancellationNotificationAction(appointment.id, "no_show", true);
      } catch (e) {
        console.warn("Failed to send no-show notification:", e);
      }
      toast.success(`${appointment.client_name} marked as no-show`);
      onRefresh();
    } catch (error) {
      console.error("Failed to mark no-show:", error);
      toast.error("Failed to mark as no-show");
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(`noshow-${appointment.id}`);
        return next;
      });
      setConfirmAction(null);
    }
  };

  // Handle late cancel
  const handleLateCancel = async (appointment: Appointment) => {
    setLoadingIds(prev => new Set(prev).add(`cancel-${appointment.id}`));
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "cancelled",
        cancellation_reason: "Late cancellation by client",
      });
      // Send cancellation notification
      try {
        const { sendCancellationNotificationAction } = await import("@/app/actions/notifications");
        await sendCancellationNotificationAction(appointment.id, "late_cancel", true);
      } catch (e) {
        console.warn("Failed to send cancellation notification:", e);
      }
      toast.success(`${appointment.client_name} appointment cancelled (late)`);
      onRefresh();
    } catch (error) {
      console.error("Failed to cancel:", error);
      toast.error("Failed to cancel appointment");
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
            <h3 className="font-semibold text-gray-900">Waiting Room</h3>
            <p className="text-xs text-gray-500">
              {waitingAppointments.length} client{waitingAppointments.length !== 1 ? "s" : ""} waiting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
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

      {/* Content */}
      {sortedAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <User className="w-12 h-12 mb-2 opacity-50" />
          <p className="text-sm">No clients waiting</p>
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
                            waitInfo.text === "Not yet" 
                              ? "bg-gray-100 text-gray-600"
                              : tooLong
                                ? "bg-red-100 text-red-700"
                                : "bg-violet-100 text-violet-700"
                          )}>
                            {waitInfo.text}
                          </span>
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
                                <Send className="w-4 h-4 mr-2" />
                                Send Reminder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({ type: "no_show", appointment: apt });
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <UserX className="w-4 h-4 mr-2" />
                                Mark as No-Show
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({ type: "late_cancel", appointment: apt });
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Late Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {apt.service_name} with {apt.team_member_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scheduled: {apt.scheduled_time}
                        {tooLong && (
                          <span className="ml-2 text-red-500 font-medium">
                            • Waiting too long!
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
                        <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 mr-1" />
                      )}
                      Notify
                    </Button>
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
                        <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1" />
                      )}
                      Start Service
                    </Button>
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
                            waitInfo.text === "Not yet" 
                              ? "bg-gray-100 text-gray-600"
                              : tooLong
                                ? "bg-red-100 text-red-700"
                                : "bg-violet-100 text-violet-700"
                          )}>
                            {waitInfo.text}
                          </span>
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
                                <Send className="w-4 h-4 mr-2" />
                                Send Reminder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({ type: "no_show", appointment: apt });
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <UserX className="w-4 h-4 mr-2" />
                                Mark as No-Show
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({ type: "late_cancel", appointment: apt });
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Late Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {apt.service_name} with {apt.team_member_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scheduled: {apt.scheduled_time}
                        {tooLong && (
                          <span className="ml-2 text-red-500 font-medium">
                            • Waiting too long!
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
                        <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 mr-1" />
                      )}
                      Notify
                    </Button>
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
                        <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1" />
                      )}
                      Start Service
                    </Button>
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
              {confirmAction?.type === "no_show" ? "Mark as No-Show?" : "Late Cancel?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "no_show" ? (
                <>
                  This will mark <strong>{confirmAction?.appointment.client_name}</strong>'s 
                  appointment as a no-show. They will be notified and this may affect 
                  their booking privileges.
                </>
              ) : (
                <>
                  This will cancel <strong>{confirmAction?.appointment.client_name}</strong>'s 
                  appointment as a late cancellation. A cancellation fee may apply 
                  according to your policy.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              {confirmAction?.type === "no_show" ? "Mark No-Show" : "Late Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default WaitingRoomPanel;
