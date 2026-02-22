"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, X, MapPin } from "lucide-react";
import { toast } from "sonner";

interface PolygonZoneEditorProps {
  onSave: (polygon: { coordinates: Array<{ longitude: number; latitude: number }> }) => void;
  onCancel: () => void;
  initialPolygon?: Array<{ longitude: number; latitude: number }>;
  providerLocation?: { latitude: number; longitude: number };
}

/**
 * Polygon Zone Editor Component
 * 
 * Allows providers to create polygon zones by:
 * 1. Clicking on a map to add points (if map available)
 * 2. Manually entering coordinates
 * 3. Using address search to add points
 * 
 * Falls back to manual coordinate entry if map is not available
 */
export default function PolygonZoneEditor({
  onSave,
  onCancel,
  initialPolygon,
  providerLocation,
}: PolygonZoneEditorProps) {
  const [polygonPoints, setPolygonPoints] = useState<
    Array<{ longitude: number; latitude: number; address?: string }>
  >(initialPolygon || []);
  const [addressInput, setAddressInput] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapAvailable, setMapAvailable] = useState(false);

  useEffect(() => {
    // Check if map is available
    const checkMapAvailability = async () => {
      try {
        const response = await fetch("/api/mapbox/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test", limit: 1 }),
        });
        setMapAvailable(response.ok);
      } catch {
        setMapAvailable(false);
      }
    };
    checkMapAvailability();
  }, []);

  const handleAddPointFromAddress = async () => {
    if (!addressInput.trim()) return;

    setIsGeocoding(true);
    try {
      const response = await fetch("/api/mapbox/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: addressInput, limit: 1 }),
      });

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const result = data.data[0];
        const newPoint = {
          longitude: result.center[0],
          latitude: result.center[1],
          address: result.place_name,
        };
        setPolygonPoints([...polygonPoints, newPoint]);
        setAddressInput("");
        toast.success("Point added");
      } else {
        toast.error("Address not found");
      }
    } catch (error) {
      toast.error("Failed to geocode address");
      console.error("Geocoding error:", error);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleAddPointManually = () => {
    // Add empty point that user can fill in
    setPolygonPoints([
      ...polygonPoints,
      {
        longitude: providerLocation?.longitude || 0,
        latitude: providerLocation?.latitude || 0,
      },
    ]);
  };

  const handleRemovePoint = (index: number) => {
    setPolygonPoints(polygonPoints.filter((_, i) => i !== index));
  };

  const handleUpdatePoint = (
    index: number,
    field: "longitude" | "latitude",
    value: string
  ) => {
    const updated = [...polygonPoints];
    updated[index] = {
      ...updated[index],
      [field]: parseFloat(value) || 0,
    };
    setPolygonPoints(updated);
  };

  const handleSave = () => {
    if (polygonPoints.length < 3) {
      toast.error("Polygon must have at least 3 points");
      return;
    }

    // Validate coordinates
    for (const point of polygonPoints) {
      if (
        point.latitude < -90 ||
        point.latitude > 90 ||
        point.longitude < -180 ||
        point.longitude > 180
      ) {
        toast.error("Invalid coordinates. Latitude must be -90 to 90, Longitude -180 to 180");
        return;
      }
    }

    onSave({ coordinates: polygonPoints });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Add Points to Polygon</Label>
        <p className="text-xs text-gray-500 mb-2">
          Add at least 3 points to create a polygon. You can add points by address or manually enter coordinates.
        </p>

        {/* Address Input */}
        <div className="flex gap-2 mb-4">
          <Input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Search address..."
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleAddPointFromAddress();
              }
            }}
            disabled={isGeocoding}
          />
          <Button
            onClick={handleAddPointFromAddress}
            disabled={!addressInput.trim() || isGeocoding}
            variant="outline"
          >
            {isGeocoding ? "Searching..." : "Add from Address"}
          </Button>
          <Button onClick={handleAddPointManually} variant="outline">
            Add Manually
          </Button>
        </div>

        {/* Points List */}
        {polygonPoints.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
            {polygonPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 border rounded bg-gray-50"
              >
                <MapPin className="w-4 h-4 text-[#FF0077] flex-shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={point.latitude}
                      onChange={(e) =>
                        handleUpdatePoint(index, "latitude", e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={point.longitude}
                      onChange={(e) =>
                        handleUpdatePoint(index, "longitude", e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                </div>
                {point.address && (
                  <p className="text-xs text-gray-600 flex-1 truncate">{point.address}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePoint(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {polygonPoints.length < 3 && (
          <p className="text-xs text-amber-600 mt-2">
            Add at least {3 - polygonPoints.length} more point(s) to create a polygon
          </p>
        )}
      </div>

      {!mapAvailable && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> Map visualization is not available. You can still create polygon zones by adding points manually or using address search.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={polygonPoints.length < 3}
          className="bg-[#FF0077] hover:bg-[#D60565]"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Polygon
        </Button>
      </div>
    </div>
  );
}
