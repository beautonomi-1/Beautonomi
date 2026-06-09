"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useResponsive } from "@/hooks/useMobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  format,
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  subMonths,
  isValid,
  parseISO,
} from "date-fns";
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
  /**
   * Persist the active range to `?from=&to=` (yyyy-MM-dd) so it survives
   * navigation/refresh. Hydrates from the URL once on mount. Defaults to true.
   */
  persistToUrl?: boolean;
}

/** Calendar-correct quick ranges (inclusive), computed at click time. */
const QUICK_DATE_OPTIONS: Array<{ label: string; range: () => DateRange }> = [
  { label: "Today", range: () => ({ from: startOfDay(new Date()), to: new Date() }) },
  {
    label: "Yesterday",
    range: () => {
      const y = subDays(new Date(), 1);
      return { from: startOfDay(y), to: startOfDay(y) };
    },
  },
  { label: "Last 7 days", range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: new Date() }) },
  { label: "Last 30 days", range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: new Date() }) },
  { label: "This month", range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  {
    label: "Last month",
    range: () => {
      const lastMonth = subMonths(new Date(), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    },
  },
  { label: "This year", range: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

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
  persistToUrl = true,
}: ReportFiltersProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const numberOfMonths = useResponsive({ mobile: 1, tablet: 1, desktop: 2 });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  // Hydrate the range from ?from=&to= once on mount so a shared/refreshed URL
  // reopens the same window. Parent owns the default until this fires.
  useEffect(() => {
    if (!persistToUrl || hydratedRef.current) return;
    hydratedRef.current = true;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (!fromParam && !toParam) return;
    const from = fromParam ? parseISO(fromParam) : undefined;
    const to = toParam ? parseISO(toParam) : undefined;
    if ((from && !isValid(from)) || (to && !isValid(to))) return;
    onDateRangeChange({ from: from && isValid(from) ? from : undefined, to: to && isValid(to) ? to : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistToUrl]);

  const writeRangeToUrl = (range: DateRange) => {
    if (!persistToUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    if (range.from) params.set("from", format(range.from, "yyyy-MM-dd"));
    else params.delete("from");
    if (range.to) params.set("to", format(range.to, "yyyy-MM-dd"));
    else params.delete("to");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const applyRange = (range: DateRange) => {
    onDateRangeChange(range);
    writeRangeToUrl(range);
  };

  const handleQuickDate = (range: DateRange) => {
    applyRange(range);
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
              {QUICK_DATE_OPTIONS.map((option) => (
                <Button
                  key={option.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => handleQuickDate(option.range())}
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
              applyRange({
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
          onClick={() => {
            if (persistToUrl) {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("from");
              params.delete("to");
              router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            }
            onReset?.();
          }}
          className="w-full sm:w-auto"
        >
          <X className="mr-2 h-4 w-4" />
          Reset Filters
        </Button>
      )}
    </div>
  );
}
