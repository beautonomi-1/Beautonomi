"use client";

import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamMember } from "@/lib/provider-portal/types";
import { getStaffColor } from "./constants";

interface StaffHeaderProps {
  member: TeamMember;
  index: number;
  bookingCount: number;
  hasContent: boolean;
  onViewWeekSchedule?: (m: TeamMember) => void;
  onPrintDaySchedule?: (m: TeamMember) => void;
  onEditWorkHours?: (m: TeamMember) => void;
  onSetDayOff?: (m: TeamMember) => void;
}

function StaffHeaderComponent({
  member,
  index,
  bookingCount,
  hasContent,
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
}: StaffHeaderProps) {
  const gradient = getStaffColor(index);

  return (
    <div
      className={cn(
        "border-r border-gray-200 last:border-r-0 py-3 px-2",
        "flex flex-col items-center gap-1 transition-all",
        hasContent
          ? "flex-[2] min-w-[180px] max-w-[400px]"
          : "flex-1 min-w-[120px] max-w-[200px]",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity focus:outline-none group">
            <div className="relative">
              <Avatar className="w-10 h-10 ring-2 ring-white shadow-md">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback
                  className="text-white text-sm font-bold"
                  style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
                >
                  {member.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              {bookingCount > 0 && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                  {bookingCount}
                </span>
              )}
            </div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-primary transition-colors flex items-center gap-0.5">
              {member.name.split(" ")[0]}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          <DropdownMenuItem onClick={() => onViewWeekSchedule?.(member)} disabled={!onViewWeekSchedule}>
            View Week Schedule
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPrintDaySchedule?.(member)} disabled={!onPrintDaySchedule}>
            Print Day Schedule
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEditWorkHours?.(member)} disabled={!onEditWorkHours}>
            Edit Work Hours
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetDayOff?.(member)} disabled={!onSetDayOff}>
            Set Day Off
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const StaffHeader = memo(StaffHeaderComponent, (prev, next) =>
  prev.member.id === next.member.id &&
  prev.member.name === next.member.name &&
  prev.member.avatar_url === next.member.avatar_url &&
  prev.index === next.index &&
  prev.bookingCount === next.bookingCount &&
  prev.hasContent === next.hasContent,
);

StaffHeader.displayName = "StaffHeader";
