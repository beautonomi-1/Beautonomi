"use client";

import { useState, useEffect } from "react";
import { Check, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { coerceSelectedDate } from "@beautonomi/utils";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";
import { fetcher } from "@/lib/http/fetcher";

interface Resource {
  id: string;
  name: string;
  description?: string;
  resource_group_id?: string;
  resource_group_name?: string;
  capacity?: number;
  is_required: boolean;
}

interface ResourceSelectionProps {
  /** Provider UUID or slug; public APIs use slug (e.g. from provider.slug) */
  providerId: string;
  serviceIds: string[];
  selectedDate: Date | null;
  /** Slot start time (e.g. "10:00" or ISO string); used with selectedDate for availability check */
  selectedTimeSlot: string | null;
  selectedResources: string[];
  onResourceChange: (resourceIds: string[]) => void;
  /** Duration in minutes for the booking; used to compute end_at for availability check */
  durationMinutes?: number;
  className?: string;
  /**
   * Called after the resource list loads and zero resources are found.
   * Use to auto-advance past this step when resources aren't configured.
   */
  onNoResources?: () => void;
}

export default function ResourceSelection({
  providerId,
  serviceIds,
  selectedDate,
  selectedTimeSlot,
  selectedResources,
  onResourceChange,
  durationMinutes = 60,
  className,
  onNoResources,
}: ResourceSelectionProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (providerId && serviceIds.length > 0) {
      loadResources();
    }
  }, [providerId, serviceIds]);

  useEffect(() => {
    if (selectedDate && selectedTimeSlot && selectedResources.length > 0) {
      checkAvailability();
    }
  }, [selectedDate, selectedTimeSlot, selectedResources]);

  const loadResources = async () => {
    setIsLoading(true);
    try {
      const response = await fetcher.get<{ resources?: Resource[]; data?: Resource[] }>(
        `/api/public/providers/${providerId}/resources?service_ids=${serviceIds.join(",")}`
      );
      const list = response.resources ?? response.data ?? [];
      const loaded = Array.isArray(list) ? list : [];
      setResources(loaded);
      if (loaded.length === 0) {
        onNoResources?.();
      }
    } catch {
      setResources([]);
      onNoResources?.();
    } finally {
      setIsLoading(false);
    }
  };

  const checkAvailability = async () => {
    const day = coerceSelectedDate(selectedDate);
    if (!day || !selectedTimeSlot || selectedResources.length === 0) return;

    try {
      const dateStr = formatLocalDateYYYYMMDD(day);
      // selectedTimeSlot may be an ISO datetime string ("2026-05-08T10:00:00.000Z") or
      // a plain "HH:MM" string. Extract HH:MM in either case.
      const timeStr = (() => {
        if (!selectedTimeSlot) return selectedTimeSlot;
        if (selectedTimeSlot.includes("T") || selectedTimeSlot.includes("Z")) {
          const d = new Date(selectedTimeSlot);
          if (Number.isFinite(d.getTime())) {
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            return `${hh}:${mm}`;
          }
        }
        // Already "HH:MM[:SS]" format — take first 5 chars
        return selectedTimeSlot.length >= 5 ? selectedTimeSlot.slice(0, 5) : selectedTimeSlot;
      })();
      const response = await fetcher.post<{ available: Record<string, boolean> }>(
        `/api/public/providers/${providerId}/availability/resources/check`,
        {
          resource_ids: selectedResources,
          date: dateStr,
          time: timeStr,
          duration_minutes: durationMinutes,
        }
      );
      setAvailability(response.available || {});
    } catch (error: any) {
      console.error("Failed to check resource availability:", error);
    }
  };

  const handleResourceToggle = (resourceId: string) => {
    if (selectedResources.includes(resourceId)) {
      onResourceChange(selectedResources.filter((id) => id !== resourceId));
    } else {
      // Check if resource is required
      const resource = resources.find((r) => r.id === resourceId);
      if (resource?.is_required) {
        // If required, ensure it's selected
        if (!selectedResources.includes(resourceId)) {
          onResourceChange([...selectedResources, resourceId]);
        }
      } else {
        onResourceChange([...selectedResources, resourceId]);
      }
    }
  };

  const groupedResources = resources.reduce((acc, resource) => {
    const groupName = resource.resource_group_name || "Other";
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(resource);
    return acc;
  }, {} as Record<string, Resource[]>);

  if (isLoading) {
    return (
      <div className={className}>
        <p className="text-sm text-gray-500">Loading resources...</p>
      </div>
    );
  }

  if (resources.length === 0) {
    return null; // Don't show if no resources
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <Label className="text-base font-semibold">Select Resources (Optional)</Label>
          <p className="text-sm text-gray-500 mt-1">
            Choose any additional resources needed for your booking
          </p>
        </div>

        {Object.entries(groupedResources).map(([groupName, groupResources]) => (
          <div key={groupName} className="space-y-2">
            {groupName !== "Other" && (
              <h4 className="text-sm font-medium text-gray-700">{groupName}</h4>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groupResources.map((resource) => {
                const isSelected = selectedResources.includes(resource.id);
                const isAvailable = availability[resource.id] !== false;
                const isRequired = resource.is_required;

                return (
                  <Card
                    key={resource.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "border-[#FF0077] bg-[#FF0077]/5"
                        : "hover:border-gray-300"
                    } ${!isAvailable && selectedDate && selectedTimeSlot ? "opacity-50" : ""}`}
                    onClick={() => handleResourceToggle(resource.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            {resource.name}
                            {isRequired && (
                              <Badge variant="outline" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </CardTitle>
                          {resource.description && (
                            <CardDescription className="text-xs mt-1">
                              {resource.description}
                            </CardDescription>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected
                              ? "bg-[#FF0077] border-[#FF0077]"
                              : "border-gray-300"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    </CardHeader>
                    {resource.capacity && (
                      <CardContent className="pt-0">
                        <p className="text-xs text-gray-500">Capacity: {resource.capacity}</p>
                      </CardContent>
                    )}
                    {!isAvailable && selectedDate && selectedTimeSlot && (
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          <span>Not available at this time</span>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {selectedResources.length > 0 && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-900">
              {selectedResources.length} resource{selectedResources.length !== 1 ? "s" : ""}{" "}
              selected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
