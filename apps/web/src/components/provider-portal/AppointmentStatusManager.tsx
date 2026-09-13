"use client";

import React, { useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
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
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "pending", icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50" },
  { value: "confirmed", icon: CheckCircle2, color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "in_progress", icon: Play, color: "text-purple-600", bgColor: "bg-purple-50" },
  { value: "completed", icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50" },
  { value: "cancelled", icon: XCircle, color: "text-red-600", bgColor: "bg-red-50" },
  { value: "no_show", icon: UserX, color: "text-gray-600", bgColor: "bg-gray-100" },
];

const CANCELLATION_REASON_IDS = [
  "client_request",
  "client_no_show",
  "provider_unavailable",
  "scheduling_conflict",
  "emergency",
  "other",
] as const;

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
  const { t } = useTranslation();
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!appointment) return null;

  const displayStatus = appointment.status === "booked" ? "confirmed" : appointment.status === "started" ? "in_progress" : appointment.status;
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === displayStatus
  );

  const handleStatusSelect = (status: AppointmentStatus) => {
    setSelectedStatus(status);

    if (status === "cancelled" || status === "no_show") {
      setShowConfirmation(true);
    } else {
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

  const getAvailableTransitions = (): AppointmentStatus[] => {
    switch (appointment.status) {
      case "pending":
        return ["confirmed", "cancelled"];
      case "booked":
        return ["in_progress", "cancelled", "no_show"];
      case "started":
        return ["completed", "cancelled"];
      case "completed":
        return [];
      case "cancelled":
        return ["pending"];
      case "no_show":
        return ["pending"];
      default:
        return [];
    }
  };

  const availableTransitions = getAvailableTransitions();

  return (
    <>
      <Dialog open={isOpen && !showConfirmation} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("web.provider.portal.appointmentStatus.title")}</DialogTitle>
            <DialogDescription>
              {appointment.client_name} • {appointment.service_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", currentStatus?.bgColor)}>
                {currentStatus && <currentStatus.icon className={cn("w-5 h-5", currentStatus.color)} />}
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("web.provider.portal.appointmentStatus.currentStatus")}</p>
                <p className={cn("font-semibold", currentStatus?.color)}>
                  {currentStatus ? t(`web.provider.portal.appointmentStatus.${currentStatus.value}`) : null}
                </p>
              </div>
            </div>

            {availableTransitions.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("web.provider.portal.appointmentStatus.changeTo")}</Label>
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
                          "flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-start",
                          "hover:border-primary hover:bg-primary/5",
                          selectedStatus === status.value
                            ? "border-primary bg-primary/5"
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
                            {t(`web.provider.portal.appointmentStatus.${status.value}`)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t(`web.provider.portal.appointmentStatus.${status.value}Desc`)}
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
                  {t("web.provider.portal.appointmentStatus.noChanges")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t("web.provider.portal.appointmentStatus.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmation} onOpenChange={() => setShowConfirmation(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {selectedStatus === "cancelled"
                ? t("web.provider.portal.appointmentStatus.cancelAppointment")
                : t("web.provider.portal.appointmentStatus.markAsNoShow")}
            </DialogTitle>
            <DialogDescription>
              {t("web.provider.portal.appointmentStatus.confirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("web.provider.portal.appointmentStatus.reason")}</Label>
              <Select
                value={cancellationReason}
                onValueChange={setCancellationReason}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.portal.appointmentStatus.selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASON_IDS.map((reasonId) => (
                    <SelectItem key={reasonId} value={reasonId}>
                      {t(`web.provider.portal.appointmentStatus.reason_${reasonId}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("web.provider.portal.appointmentStatus.additionalNotes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("web.provider.portal.appointmentStatus.notesPlaceholder")}
                className="h-24 resize-none"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">{t("web.provider.portal.appointmentStatus.important")}</p>
                <p>
                  {selectedStatus === "cancelled"
                    ? t("web.provider.portal.appointmentStatus.cancelWarning")
                    : t("web.provider.portal.appointmentStatus.noShowWarning")}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
            >
              {t("web.provider.portal.appointmentStatus.goBack")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleUpdate()}
              disabled={!cancellationReason || isUpdating}
            >
              {isUpdating
                ? t("web.provider.portal.appointmentStatus.updating")
                : selectedStatus === "cancelled"
                  ? t("web.provider.portal.appointmentStatus.confirmCancellation")
                  : t("web.provider.portal.appointmentStatus.markAsNoShow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

export function AppointmentStatusBadge({ status, size = "md", onClick }: StatusBadgeProps) {
  const { t } = useTranslation();
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
        "me-1",
        size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5"
      )} />
      {t(`web.provider.portal.appointmentStatus.${statusOption.value}`)}
    </Badge>
  );
}

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
  const { t } = useTranslation();
  const currentStatus = appointment.status;

  const isAtHome = appointment.location_type === "at_home";
  const providerReady =
    appointment.current_stage === "provider_arrived" ||
    appointment.arrival_otp_verified ||
    appointment.qr_code_verified;

  const getQuickActions = () => {
    switch (currentStatus) {
      case "pending":
        return [
          { status: "confirmed" as AppointmentStatus, label: t("web.provider.portal.appointmentStatus.actionConfirm"), icon: CheckCircle2, color: "text-blue-600 hover:bg-blue-50" },
        ];
      case "booked": {
        const actions: { status: AppointmentStatus; label: string; icon: typeof Play; color: string }[] = [];
        if (!isAtHome || providerReady) {
          actions.push({ status: "in_progress" as AppointmentStatus, label: t("web.provider.portal.appointmentStatus.actionStart"), icon: Play, color: "text-purple-600 hover:bg-purple-50" });
        }
        actions.push({ status: "no_show" as AppointmentStatus, label: t("web.provider.portal.appointmentStatus.actionNoShow"), icon: UserX, color: "text-gray-600 hover:bg-gray-100" });
        return actions;
      }
      case "started":
        return [
          { status: "completed" as AppointmentStatus, label: t("web.provider.portal.appointmentStatus.actionComplete"), icon: CheckCircle2, color: "text-green-600 hover:bg-green-50" },
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
