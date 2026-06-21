"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/provider-portal/types";

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const variants: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    pending_payment: "bg-amber-100 text-amber-800 border-amber-200",
    booked: "bg-blue-100 text-blue-800 border-blue-200",
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
    started: "bg-yellow-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500",
    no_show: "bg-orange-500",
  };

  const label =
    status === "no_show"
      ? "No Show"
      : status === "pending_payment"
        ? "Awaiting payment"
        : status.charAt(0).toUpperCase() + status.slice(1);

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
