"use client";

import React from "react";
import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Location {
  id: string;
  name: string;
  city?: string;
  address_line1?: string;
}

interface LocationSwitcherProps {
  locations: Location[];
  selectedLocationId: string | null;
  onLocationChange: (locationId: string) => void;
  showAllOption?: boolean;
}

export function LocationSwitcher({
  locations,
  selectedLocationId,
  onLocationChange,
  showAllOption = false,
}: LocationSwitcherProps) {
  // Don't show if only one location (unless showAllOption is true)
  if (locations.length <= 1 && !showAllOption) {
    return null;
  }

  const selectedLocation = locations.find(loc => loc.id === selectedLocationId);
  const displayName = selectedLocation
    ? `${selectedLocation.name}${selectedLocation.city ? `, ${selectedLocation.city}` : ''}`
    : locations[0]?.name || "Select Location";

  // For mobile, show just the location name (truncated), for larger screens show name + city
  const mobileDisplayName = selectedLocation?.name || locations[0]?.name || "Location";
  const desktopDisplayName = displayName;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
      <Select
        value={selectedLocationId || locations[0]?.id || undefined}
        onValueChange={onLocationChange}
      >
        <SelectTrigger className="w-[120px] sm:w-[160px] md:w-[180px] lg:w-[200px] h-8 sm:h-9 text-xs sm:text-sm border-gray-200">
          <SelectValue placeholder="Select Location">
            <span className="truncate flex items-center gap-1.5 sm:gap-2">
              <span className="truncate hidden sm:inline">{desktopDisplayName}</span>
              <span className="truncate sm:hidden">{mobileDisplayName}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {showAllOption && (
            <SelectItem value="all">
              <div className="flex flex-col">
                <span className="font-medium text-sm">All Locations</span>
                <span className="text-xs text-gray-500">View all data</span>
              </div>
            </SelectItem>
          )}
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              <div className="flex flex-col">
                <span className="font-medium text-sm">{location.name}</span>
                {location.city && (
                  <span className="text-xs text-gray-500">{location.city}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
