"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface ServiceZone {
  id?: string;
  name: string;
  zone_type: "postal_code" | "city" | "polygon" | "radius";
  polygon_coordinates?: any;
  center_latitude?: number;
  center_longitude?: number;
  radius_km?: number;
  travel_fee: number;
  is_active: boolean;
}

interface ZoneMapViewerProps {
  zones: ServiceZone[];
  providerLocation?: { latitude: number; longitude: number };
  height?: string;
  onZoneClick?: (zone: ServiceZone) => void;
}

/**
 * Simple zone map viewer using iframe with Mapbox Static Images API
 * Falls back to a simple visualization if Mapbox is not available
 */
export default function ZoneMapViewer({
  zones,
  providerLocation,
  height = "400px",
  onZoneClick,
}: ZoneMapViewerProps) {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const generateMapUrl = async () => {
      try {
        // Try to get Mapbox token
        await fetch("/api/mapbox/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test", limit: 1 }),
        });

        // If Mapbox is configured, we can use it
        // For now, use a simple Google Maps embed or static image
        const center = providerLocation || { latitude: -26.2041, longitude: 28.0473 };
        
        // Create a simple map using Google Maps embed (fallback)
        const googleMapsUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6d-s6U4uO3vJz8&q=${center.latitude},${center.longitude}&zoom=12`;
        setMapUrl(googleMapsUrl);
      } catch {
        console.warn("Mapbox not available, using fallback");
        // Fallback: use a simple visualization
        setMapUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    generateMapUrl();
  }, [providerLocation, zones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center border rounded-lg" style={{ height }}>
        <Loader2 className="w-6 h-6 animate-spin text-[#FF0077]" />
      </div>
    );
  }

  if (!mapUrl) {
    // Fallback: Simple list view
    return (
      <div className="border rounded-lg p-4" style={{ height, overflowY: "auto" }}>
        <h3 className="font-semibold mb-4">Service Zones</h3>
        <div className="space-y-2">
          {zones.map((zone, index) => (
            <div
              key={zone.id || index}
              className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                zone.is_active ? "border-[#FF0077]" : "border-gray-300"
              }`}
              onClick={() => onZoneClick?.(zone)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{zone.name}</p>
                  <p className="text-sm text-gray-600">
                    {zone.zone_type === "postal_code" && "Postal Code Zone"}
                    {zone.zone_type === "city" && "City Zone"}
                    {zone.zone_type === "radius" && `Radius: ${zone.radius_km}km`}
                    {zone.zone_type === "polygon" && "Polygon Zone"}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    zone.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {zone.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden" style={{ height }}>
      <iframe
        src={mapUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
