"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, Users, Scissors, CreditCard, CheckCircle2 } from "lucide-react";

interface CommandCenterProps {
  counts: Record<string, number>;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const STATS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "arrivals", label: "Arrivals", icon: Users },
  { id: "in_service", label: "In Service", icon: Scissors },
  { id: "ready_to_pay", label: "Ready to Pay", icon: CreditCard },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
] as const;

export function CommandCenter({ counts, activeFilter, onFilterChange }: CommandCenterProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {STATS.map(({ id, label, icon: Icon }) => {
        const count = counts[id] ?? 0;
        const isActive = activeFilter === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onFilterChange(isActive ? "all" : id)}
            className={cn(
              "flex items-center gap-3 px-5 py-3.5 rounded-2xl border transition-all duration-200 min-h-[56px]",
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
  );
}
