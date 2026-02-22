"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterGroup {
  label: string;
  key: string;
  options: FilterOption[];
  type?: "single" | "multiple";
}

interface FilterBarProps {
  filters: FilterGroup[];
  selectedFilters: Record<string, string | string[]>;
  onFilterChange: (key: string, value: string | string[]) => void;
  onClearFilters?: () => void;
  className?: string;
  mobileSheetTitle?: string;
}

/**
 * FilterBar Component
 * 
 * Displays filter controls. On mobile, opens in a Sheet. On desktop, shows inline.
 */
export default function FilterBar({
  filters,
  selectedFilters,
  onFilterChange,
  onClearFilters,
  className,
  mobileSheetTitle = "Filters",
}: FilterBarProps) {
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const activeFilterCount = Object.values(selectedFilters).filter(
    (v) => (Array.isArray(v) ? v.length > 0 : v !== "")
  ).length;

  const FilterContent = () => (
    <div className="space-y-4">
      {filters.map((filter) => (
        <div key={filter.key}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {filter.label}
          </label>
          {filter.type === "multiple" ? (
            <div className="space-y-2">
              {filter.options.map((option) => {
                const selectedValues = (selectedFilters[filter.key] as string[]) || [];
                const isSelected = selectedValues.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const current = selectedValues;
                        if (e.target.checked) {
                          onFilterChange(filter.key, [...current, option.value]);
                        } else {
                          onFilterChange(
                            filter.key,
                            current.filter((v) => v !== option.value)
                          );
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{option.label}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <select
              value={
                Array.isArray(selectedFilters[filter.key])
                  ? ""
                  : (selectedFilters[filter.key] as string) || ""
              }
              onChange={(e) => onFilterChange(filter.key, e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      {onClearFilters && activeFilterCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onClearFilters();
            setIsMobileSheetOpen(false);
          }}
          className="w-full"
        >
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile: Sheet */}
      <div className="md:hidden">
        <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[400px] bg-white">
            <SheetHeader>
              <SheetTitle>{mobileSheetTitle}</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FilterContent />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Inline */}
      <div className="hidden md:block border rounded-lg p-4 bg-white">
        <FilterContent />
      </div>
    </div>
  );
}
