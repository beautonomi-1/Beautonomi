"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useResponsive } from "@/hooks/useMobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface ReportFiltersProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onReset?: () => void;
  showStaffFilter?: boolean;
  showServiceFilter?: boolean;
  staffOptions?: Array<{ id: string; name: string }>;
  serviceOptions?: Array<{ id: string; name: string }>;
  onStaffChange?: (staffId: string | null) => void;
  onServiceChange?: (serviceId: string | null) => void;
  selectedStaff?: string | null;
  selectedService?: string | null;
}

export function ReportFilters({
  dateRange,
  onDateRangeChange,
  onReset,
  showStaffFilter = false,
  showServiceFilter = false,
  staffOptions = [],
  serviceOptions = [],
  onStaffChange,
  onServiceChange,
  selectedStaff,
  selectedService,
}: ReportFiltersProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const numberOfMonths = useResponsive({ mobile: 1, tablet: 1, desktop: 2 });

  const quickDateOptions = [
    { label: "Today", days: 0 },
    { label: "Yesterday", days: -1 },
    { label: "Last 7 days", days: -7 },
    { label: "Last 30 days", days: -30 },
    { label: "This month", days: -new Date().getDate() + 1 },
    { label: "Last month", days: -new Date().getDate() - new Date(new Date().getFullYear(), new Date().getMonth() - 1, 0).getDate() },
    { label: "This year", days: -new Date(new Date().getFullYear(), 0, 1).getDate() + 1 },
  ];

  const handleQuickDate = (days: number) => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() + days);
    onDateRangeChange({ from, to: today });
    setIsDatePickerOpen(false);
  };

  const hasActiveFilters = 
    dateRange.from || 
    dateRange.to || 
    selectedStaff || 
    selectedService;

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
      {/* Date Range Picker */}
      <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full sm:w-auto justify-start text-left font-normal",
              !dateRange.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} -{" "}
                  {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 border-b">
            <p className="text-sm font-medium mb-2">Quick Select</p>
            <div className="grid grid-cols-2 gap-2">
              {quickDateOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => handleQuickDate(option.days)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange.from}
            selected={dateRange}
            onSelect={(range) => {
              onDateRangeChange({
                from: range?.from ?? undefined,
                to: range?.to ?? undefined,
              });
            }}
            numberOfMonths={numberOfMonths}
          />
        </PopoverContent>
      </Popover>

      {/* Staff Filter */}
      {showStaffFilter && onStaffChange && (
        <Select
          value={selectedStaff || "all"}
          onValueChange={(value) => onStaffChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffOptions.map((staff) => (
              <SelectItem key={staff.id} value={staff.id}>
                {staff.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Service Filter */}
      {showServiceFilter && onServiceChange && (
        <Select
          value={selectedService || "all"}
          onValueChange={(value) => onServiceChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {serviceOptions.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Reset Button */}
      {hasActiveFilters && onReset && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="w-full sm:w-auto"
        >
          <X className="mr-2 h-4 w-4" />
          Reset Filters
        </Button>
      )}
    </div>
  );
}
