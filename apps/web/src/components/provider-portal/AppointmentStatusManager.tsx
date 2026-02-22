"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  UserX,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Appointment } from "@/lib/provider-portal/types";

type AppointmentStatus = 
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

interface StatusOption {
  value: AppointmentStatus;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    description: "Waiting for confirmation",
  },
  {
    value: "confirmed",
    label: "Confirmed",
    icon: CheckCircle2,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Appointment confirmed",
  },
  {
    value: "in_progress",
    label: "In Progress",
    icon: Play,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    description: "Service is being performed",
  },
  {
    value: "completed",
    label: "Completed",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
    description: "Service completed successfully",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    description: "Appointment was cancelled",
  },
  {
    value: "no_show",
    label: "No Show",
    icon: UserX,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    description: "Client did not attend",
  },
];

interface CancellationReason {
  id: string;
  label: string;
}

const CANCELLATION_REASONS: CancellationReason[] = [
  { id: "client_request", label: "Client requested cancellation" },
  { id: "client_no_show", label: "Client did not show up" },
  { id: "provider_unavailable", label: "Provider unavailable" },
  { id: "scheduling_conflict", label: "Scheduling conflict" },
  { id: "emergency", label: "Emergency" },
  { id: "other", label: "Other reason" },
];

interface AppointmentStatusManagerProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (
    appointmentId: string,
    newStatus: AppointmentStatus,
    reason?: string,
    notes?: string
  ) => Promise<void>;
}

export function AppointmentStatusManager({
  appointment,
  isOpen,
  onClose,
  onStatusUpdate,
}: AppointmentStatusManagerProps) {
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!appointment) return null;

  // Map Appointment status (booked|started) to display status (confirmed|in_progress)
  const displayStatus = appointment.status === "booked" ? "confirmed" : appointment.status === "started" ? "in_progress" : appointment.status;
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === displayStatus
  );

  const handleStatusSelect = (status: AppointmentStatus) => {
    setSelectedStatus(status);
    
    // If cancelling or marking no-show, show confirmation dialog
    if (status === "cancelled" || status === "no_show") {
      setShowConfirmation(true);
    } else {
      // For other statuses, update directly
      handleUpdate(status);
    }
  };

  const handleUpdate = async (status?: AppointmentStatus) => {
    const targetStatus = status || selectedStatus;
    if (!targetStatus) return;

    setIsUpdating(true);
    try {
      await onStatusUpdate(
        appointment.id,
        targetStatus,
        cancellationReason || undefined,
        notes || undefined
      );
      handleClose();
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setSelectedStatus(null);
    setCancellationReason("");
    setNotes("");
    setShowConfirmation(false);
    onClose();
  };

  // Available transitions based on current status
  // Note: Appointment uses "booked"|"started", we map to AppointmentStatus "confirmed"|"in_progress"
  const getAvailableTransitions = (): AppointmentStatus[] => {
    switch (appointment.status) {
      case "pending":
        return ["confirmed", "cancelled"];
      case "booked":
        return ["in_progress", "cancelled", "no_show"];
      case "started":
        return ["completed", "cancelled"];
      case "completed":
        return []; // Can't change from completed
      case "cancelled":
        return ["pending"]; // Can reactivate
      case "no_show":
        return ["pending"]; // Can reactivate
      default:
        return [];
    }
  };

  const availableTransitions = getAvailableTransitions();

  return (
    <>
      {/* Main Status Selection Dialog */}
      <Dialog open={isOpen && !showConfirmation} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Appointment Status</DialogTitle>
            <DialogDescription>
              {appointment.client_name} • {appointment.service_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", currentStatus?.bgColor)}>
                {currentStatus && <currentStatus.icon className={cn("w-5 h-5", currentStatus.color)} />}
              </div>
              <div>
                <p className="text-xs text-gray-500">Current Status</p>
                <p className={cn("font-semibold", currentStatus?.color)}>
                  {currentStatus?.label}
                </p>
              </div>
            </div>

            {/* Status Options */}
            {availableTransitions.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Change to:</Label>
                <div className="grid gap-2">
                  {STATUS_OPTIONS.filter((s) =>
                    availableTransitions.includes(s.value)
                  ).map((status) => {
                    const Icon = status.icon;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                          "hover:border-[#FF0077] hover:bg-[#FF0077]/5",
                          selectedStatus === status.value
                            ? "border-[#FF0077] bg-[#FF0077]/5"
                            : "border-gray-200"
                        )}
                        onClick={() => handleStatusSelect(status.value)}
                        disabled={isUpdating}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            status.bgColor
                          )}
                        >
                          <Icon className={cn("w-5 h-5", status.color)} />
                        </div>
                        <div className="flex-1">
                          <p className={cn("font-semibold", status.color)}>
                            {status.label}
                          </p>
                          <p className="text-xs text-gray-500">
                            {status.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">
                  No status changes available for this appointment.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation/No-Show Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={() => setShowConfirmation(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {selectedStatus === "cancelled"
                ? "Cancel Appointment"
                : "Mark as No Show"}
            </DialogTitle>
            <DialogDescription>
              This action will update the appointment status. Please provide a reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Reason Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Reason *</Label>
              <Select
                value={cancellationReason}
                onValueChange={setCancellationReason}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Additional Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional details..."
                className="h-24 resize-none"
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Important</p>
                <p>
                  {selectedStatus === "cancelled"
                    ? "The client will be notified of this cancellation."
                    : "This may affect the client's booking history."}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleUpdate()}
              disabled={!cancellationReason || isUpdating}
            >
              {isUpdating ? (
                "Updating..."
              ) : selectedStatus === "cancelled" ? (
                "Confirm Cancellation"
              ) : (
                "Mark as No Show"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Quick status badge component for inline use
interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

export function AppointmentStatusBadge({ status, size = "md", onClick }: StatusBadgeProps) {
  const statusOption = STATUS_OPTIONS.find((s) => s.value === status);
  
  if (!statusOption) {
    return (
      <Badge variant="outline" className="capitalize">
        {status}
      </Badge>
    );
  }

  const Icon = statusOption.icon;
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border-0",
        statusOption.bgColor,
        statusOption.color,
        sizeClasses[size],
        onClick && "cursor-pointer hover:opacity-80"
      )}
      onClick={onClick}
    >
      <Icon className={cn(
        "mr-1",
        size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5"
      )} />
      {statusOption.label}
    </Badge>
  );
}

// Quick action buttons for common status changes
interface QuickStatusActionsProps {
  appointment: Appointment;
  onStatusUpdate: (status: AppointmentStatus) => void;
  compact?: boolean;
}

export function QuickStatusActions({
  appointment,
  onStatusUpdate,
  compact = false,
}: QuickStatusActionsProps) {
  const currentStatus = appointment.status;

  // Define quick actions based on current status
  // Note: Appointment uses "booked"|"started", we pass AppointmentStatus "confirmed"|"in_progress" to onStatusUpdate
  const getQuickActions = () => {
    switch (currentStatus) {
      case "pending":
        return [
          { status: "confirmed" as AppointmentStatus, label: "Confirm", icon: CheckCircle2, color: "text-blue-600 hover:bg-blue-50" },
        ];
      case "booked":
        return [
          { status: "in_progress" as AppointmentStatus, label: "Start", icon: Play, color: "text-purple-600 hover:bg-purple-50" },
          { status: "no_show" as AppointmentStatus, label: "No Show", icon: UserX, color: "text-gray-600 hover:bg-gray-100" },
        ];
      case "started":
        return [
          { status: "completed" as AppointmentStatus, label: "Complete", icon: CheckCircle2, color: "text-green-600 hover:bg-green-50" },
        ];
      default:
        return [];
    }
  };

  const quickActions = getQuickActions();

  if (quickActions.length === 0) return null;

  return (
    <div className={cn("flex gap-1", compact ? "flex-col" : "flex-row")}>
      {quickActions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.status}
            variant="ghost"
            size={compact ? "sm" : "default"}
            className={cn(
              "gap-1",
              action.color,
              compact && "h-7 px-2 text-xs"
            )}
            onClick={() => onStatusUpdate(action.status)}
          >
            <Icon className={compact ? "w-3 h-3" : "w-4 h-4"} />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
