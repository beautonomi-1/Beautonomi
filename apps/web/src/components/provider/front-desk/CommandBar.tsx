"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, ChevronDown, UserPlus, CalendarPlus, ListTodo } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { LocationSwitcher } from "@/components/provider/LocationSwitcher";
import { openCreateMode } from "@/stores/appointment-sidebar-store";

interface CommandBarProps {
  date: Date;
  onDateChange: (date: Date) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  locationId: string | null;
  locations: Array<{ id: string; name: string }>;
  onLocationChange: (locationId: string) => void;
  onRefetch: () => Promise<void>;
}

export function CommandBar({
  date,
  onDateChange,
  searchQuery,
  onSearchChange,
  locationId,
  locations,
  onLocationChange,
}: CommandBarProps) {
  const handleNewWalkIn = () => {
    const now = new Date();
    const mins = now.getMinutes();
    const snapped = Math.ceil(mins / 15) * 15;
    now.setMinutes(snapped, 0, 0);
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const loc = locations[0];
    openCreateMode({
      staffId: "",
      staffName: "",
      date: format(now, "yyyy-MM-dd"),
      startTime: timeStr,
      locationId: locationId || loc?.id || "",
      locationName: loc?.name || "Location",
      appointmentKind: "walk_in",
    });
  };

  const handleNewAppointment = () => {
    const loc = locations[0];
    openCreateMode({
      staffId: "",
      staffName: "",
      date: format(date, "yyyy-MM-dd"),
      startTime: "",
      locationId: locationId || loc?.id || "",
      locationName: loc?.name || "Location",
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
      <div className="flex flex-1 gap-3 min-w-0">
        {locations.length > 1 && (
          <LocationSwitcher
            locations={locations}
            selectedLocationId={locationId}
            onLocationChange={onLocationChange}
          />
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "min-h-[48px] justify-start font-medium rounded-2xl border-[#0F172A]/12 bg-white/80 backdrop-blur-sm hover:bg-white hover:border-[#0F172A]/20 text-[#0F172A] shadow-[0_2px_8px_rgba(0,0,0,0.03)]",
                !date && "text-[#0F172A]/50"
              )}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              {date ? format(date, "MMM d, yyyy") : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-[2.5rem] border-[#0F172A]/10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && onDateChange(d)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0F172A]/40" />
          <Input
            placeholder="Search client, phone..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-11 min-h-[48px] rounded-2xl border-[#0F172A]/12 bg-white/80 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.03)] focus-visible:ring-[#0F172A]/20"
          />
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="min-h-[48px] gap-2 rounded-2xl border-[#0F172A] bg-[#0F172A] text-white hover:bg-[#0F172A]/90 hover:text-white border-0 shadow-[0_4px_14px_rgba(15,23,42,0.25)]"
          >
            Quick Actions
            <ChevronDown className="h-4 w-4 opacity-80" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-[2.5rem] border-[#0F172A]/10 shadow-[0_10px_40px_rgba(0,0,0,0.1)] p-2">
          <DropdownMenuItem onClick={handleNewWalkIn} className="gap-3 cursor-pointer rounded-xl py-2.5">
            <UserPlus className="h-4 w-4" />
            New Walk-in
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleNewAppointment} className="gap-3 cursor-pointer rounded-xl py-2.5">
            <CalendarPlus className="h-4 w-4" />
            New Appointment
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.location.assign("/provider/waitlist")}
            className="gap-3 cursor-pointer rounded-xl py-2.5"
          >
            <ListTodo className="h-4 w-4" />
            Add to Waitlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
