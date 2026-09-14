"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@beautonomi/i18n";
import type { Appointment } from "@/lib/provider-portal/types";

const STATUS_NS = "web.provider.appointmentStatusBadge";

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const { t } = useTranslation();
  const variants: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    pending_payment: "bg-amber-100 text-amber-800 border-amber-200",
    booked: "bg-blue-100 text-blue-800 border-blue-200",
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    waiting: "bg-purple-100 text-purple-800 border-purple-200",
    checked_in: "bg-indigo-100 text-indigo-800 border-indigo-200",
    in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
    started: "bg-yellow-100 text-yellow-800 border-yellow-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    no_show: "bg-orange-100 text-orange-800 border-orange-200",
  };

  // Dot color mirrors the mobile Badge's status dot for product-family parity.
  const dots: Record<string, string> = {
    pending: "bg-amber-500",
    pending_payment: "bg-amber-500",
    booked: "bg-blue-500",
    confirmed: "bg-blue-500",
    waiting: "bg-purple-500",
    checked_in: "bg-indigo-500",
    in_progress: "bg-yellow-500",
    started: "bg-yellow-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500",
    no_show: "bg-orange-500",
  };

  const labelByStatus: Record<Appointment["status"], string> = {
    pending: t(`${STATUS_NS}.pending`),
    pending_payment: t(`${STATUS_NS}.awaitingPayment`),
    booked: t(`${STATUS_NS}.booked`),
    confirmed: t(`${STATUS_NS}.confirmed`),
    waiting: t(`${STATUS_NS}.waiting`),
    checked_in: t(`${STATUS_NS}.checkedIn`),
    in_progress: t(`${STATUS_NS}.in_progress`),
    started: t(`${STATUS_NS}.started`),
    completed: t(`${STATUS_NS}.completed`),
    cancelled: t(`${STATUS_NS}.cancelled`),
    no_show: t(`${STATUS_NS}.no_show`),
  };
  const label = labelByStatus[status] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-xs font-medium", variants[status] ?? "bg-gray-100 text-gray-700 border-gray-200")}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[status] ?? "bg-gray-400")} aria-hidden />
      {label}
    </Badge>
  );
}
