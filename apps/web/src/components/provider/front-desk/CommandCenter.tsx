"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, AlertCircle, Users, Scissors, CreditCard, CheckCircle2 } from "lucide-react";
import type { FrontDeskMetricRange } from "@/lib/front-desk/types";

interface CommandCenterProps {
  counts: Record<string, number>;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  metricRange: FrontDeskMetricRange;
  onMetricRangeChange: (range: FrontDeskMetricRange) => void;
}

const STATS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "needs_confirmation", label: "To confirm", icon: AlertCircle },
  { id: "arrivals", label: "Arrivals", icon: Users },
  { id: "in_service", label: "In Service", icon: Scissors },
  { id: "ready_to_pay", label: "Ready to Pay", icon: CreditCard },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
] as const;

const METRIC_RANGES: Array<{ id: FrontDeskMetricRange; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export function CommandCenter({
  counts,
  activeFilter,
  onFilterChange,
  metricRange,
  onMetricRangeChange,
}: CommandCenterProps) {
  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#0F172A]/50">
          Metrics
        </span>
        {METRIC_RANGES.map((range) => {
          const isActive = metricRange === range.id;
          return (
            <button
              key={range.id}
              type="button"
              onClick={() => onMetricRangeChange(range.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-[#0F172A] text-white shadow-sm"
                  : "bg-white text-[#0F172A]/65 ring-1 ring-[#0F172A]/10 hover:bg-[#0F172A]/5"
              )}
              aria-pressed={isActive}
            >
              {range.label}
            </button>
          );
        })}
      </div>

      <div className="w-full min-w-0 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
        <div className="flex flex-nowrap gap-3 sm:flex-wrap min-w-min sm:min-w-0">
          {STATS.map(({ id, label, icon: Icon }) => {
            const count = counts[id] ?? 0;
            const isActive = activeFilter === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onFilterChange(isActive ? "all" : id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl border transition-all duration-200 min-h-[56px] shrink-0 touch-manipulation",
                  "bg-white/80 backdrop-blur-md",
                  "shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
                  isActive
                    ? "border-[#0F172A]/20 bg-[#0F172A]/[0.03] ring-1 ring-[#0F172A]/10"
                    : "border-[#0F172A]/8 hover:border-[#0F172A]/15"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl",
                    isActive ? "bg-[#0F172A] text-white" : "bg-[#0F172A]/[0.06] text-[#0F172A]/70"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p
                    className={cn(
                      "text-[9px] font-black tracking-widest uppercase",
                      isActive ? "text-[#0F172A]" : "text-[#0F172A]/60"
                    )}
                  >
                    {label}
                  </p>
                  <p className="text-xl font-bold text-[#0F172A] tabular-nums">{count}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
