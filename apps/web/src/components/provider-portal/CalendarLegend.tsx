"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CalendarLegendProps {
  className?: string;
  variant?: "default" | "compact" | "inline";
}

export function CalendarLegend({ className, variant = "default" }: CalendarLegendProps) {
  const [isOpen, setIsOpen] = useState(false);

  const statusItems = [
    {
      status: "booked",
      label: "Confirmed",
      color: "bg-[#4fd1c5]",
      textColor: "text-[#4fd1c5]",
    },
    {
      status: "started",
      label: "In Service",
      color: "bg-[#f472b6]",
      textColor: "text-[#f472b6]",
    },
    {
      status: "completed",
      label: "Completed",
      color: "bg-gray-400",
      textColor: "text-gray-400",
    },
    {
      status: "cancelled",
      label: "Cancelled",
      color: "bg-red-400",
      textColor: "text-red-400",
    },
    {
      status: "no_show",
      label: "No Show",
      color: "bg-orange-400",
      textColor: "text-orange-400",
    },
  ];

  const serviceColors = [
    { name: "Haircut", color: "bg-[#7dd3d8]" },
    { name: "Color", color: "bg-[#f8d59f]" },
    { name: "Highlight", color: "bg-[#ffe0b2]" },
    { name: "Facial", color: "bg-[#e0e0e0]" },
    { name: "Nail", color: "bg-[#b3e0f2]" },
    { name: "Balayage", color: "bg-[#f8bbd0]" },
  ];

  // Inline variant - simple horizontal list
  if (variant === "inline") {
    return (
      <div className={cn("hidden md:flex items-center gap-4 text-xs", className)}>
        {statusItems.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <div className={cn("w-2.5 h-2.5 rounded-full", item.color)} />
            <span className="text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Compact variant - collapsible on mobile
  if (variant === "compact") {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn("md:hidden", className)}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between text-xs text-gray-600 h-8"
          >
            <span>View Legend</span>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg">
            {statusItems.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", item.color)} />
                <span className="text-[10px] text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Default variant - full legend with service colors
  return (
    <div className={cn("hidden md:block p-4 bg-white border rounded-xl", className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Status Legend */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
          <div className="flex items-center gap-4">
            {statusItems.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded-full", item.color)} />
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-px h-4 bg-gray-200" />

        {/* Service Colors Legend */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Services</span>
          <div className="flex items-center gap-3">
            {serviceColors.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded", item.color)} />
                <span className="text-xs text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
