"use client";

import { useState, useEffect } from "react";
import { Check, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface Resource {
  id: string;
  name: string;
  description?: string;
  resource_group_id?: string;
  resource_group_name?: string;
  capacity?: number;
}

interface BookingResource {
  id: string;
  resource_id: string;
  resource_name: string;
  booking_id: string;
}

interface ResourceAssignmentPanelProps {
  bookingId: string;
  bookingDate: Date;
  bookingTime: string;
  onUpdate?: () => void;
}

export default function ResourceAssignmentPanel({
  bookingId,
  bookingDate,
  bookingTime,
  onUpdate,
}: ResourceAssignmentPanelProps) {
  const [availableResources, setAvailableResources] = useState<Resource[]>([]);
  const [assignedResources, setAssignedResources] = useState<BookingResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");

  useEffect(() => {
    loadResources();
    loadAssignedResources();
  }, [bookingId]);

  const loadResources = async () => {
    setIsLoading(true);
    try {
      const response = await fetcher.get<{ data?: Resource[]; resources?: Resource[] }>(
        `/api/provider/resources`
      );
      const list = response.data ?? response.resources ?? [];
      setAvailableResources(Array.isArray(list) ? list : []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load resources");
    } finally {
      setIsLoading(false);
    }
  };

  const loadAssignedResources = async () => {
    try {
      const response = await fetcher.get<{ data?: { resources?: BookingResource[] }; resources?: BookingResource[] }>(
        `/api/provider/bookings/${bookingId}/resources`
      );
      const list = response.data?.resources ?? response.resources ?? [];
      setAssignedResources(Array.isArray(list) ? list : []);
    } catch {
      setAssignedResources([]);
    }
  };

  const handleAssignResource = async () => {
    if (!selectedResourceId) return;

    setIsLoading(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/resources`, {
        resource_id: selectedResourceId,
      });

      toast.success("Resource assigned successfully");
      setSelectedResourceId("");
      loadAssignedResources();
      onUpdate?.();
    } catch (error: any) {
      const msg = (error as { message?: string })?.message ?? "Failed to assign resource";
      toast.error(msg.includes("not available") ? "This resource is not available at this time" : msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveResource = async (resourceId: string) => {
    setIsLoading(true);
    try {
      await fetcher.delete(
        `/api/provider/bookings/${bookingId}/resources/${resourceId}`
      );
      toast.success("Resource removed successfully");
      loadAssignedResources();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove resource");
    } finally {
      setIsLoading(false);
    }
  };

  const unassignedResources = availableResources.filter(
    (r) => !assignedResources.some((ar) => ar.resource_id === r.id)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Assignment</CardTitle>
        <CardDescription>
          Assign resources (rooms, equipment) to this booking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assigned Resources */}
        {assignedResources.length > 0 && (
          <div className="space-y-2">
            <Label>Assigned Resources</Label>
            <div className="space-y-2">
              {assignedResources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">{resource.resource_name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveResource(resource.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assign New Resource */}
        {unassignedResources.length > 0 && (
          <div className="space-y-2">
            <Label>Assign Resource</Label>
            <div className="flex gap-2">
              <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a resource" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedResources.map((resource) => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.name}
                      {resource.resource_group_name && (
                        <span className="text-gray-500 ml-2">
                          ({resource.resource_group_name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAssignResource}
                disabled={!selectedResourceId || isLoading}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                <Plus className="w-4 h-4 mr-1" />
                Assign
              </Button>
            </div>
          </div>
        )}

        {availableResources.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No resources available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
