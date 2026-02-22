"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/provider-portal/types";

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const variants = {
    booked: "bg-blue-100 text-blue-800 border-blue-200",
    started: "bg-yellow-100 text-yellow-800 border-yellow-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", variants[status])}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
