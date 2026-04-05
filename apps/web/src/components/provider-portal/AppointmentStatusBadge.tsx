"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/provider-portal/types";

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const variants = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    booked: "bg-blue-100 text-blue-800 border-blue-200",
    started: "bg-yellow-100 text-yellow-800 border-yellow-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    no_show: "bg-orange-100 text-orange-800 border-orange-200",
  };

  const label =
    status === "no_show"
      ? "No Show"
      : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", variants[status] ?? "bg-gray-100 text-gray-700 border-gray-200")}
    >
      {label}
    </Badge>
  );
}
