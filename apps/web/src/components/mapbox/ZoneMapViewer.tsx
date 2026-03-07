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

const DEFAULT_STYLE = "mapbox/streets-v12";

/**
 * Zone map viewer using Mapbox Static Images API (aligned with platform Mapbox config).
 * Falls back to list view when Mapbox is not configured.
 */
export default function ZoneMapViewer({
  zones,
  providerLocation,
  height = "400px",
  onZoneClick,
}: ZoneMapViewerProps) {
  const [staticImageUrl, setStaticImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const center = providerLocation || { latitude: -26.2041, longitude: 28.0473 };

    (async () => {
      try {
        const res = await fetch("/api/public/directions-config");
        const json = await res.json().catch(() => ({}));
        const data = json?.data;
        const token = data?.mapboxPublicToken;
        const styleUrl = data?.mapboxStyleUrl;

        if (cancelled || !token) {
          setStaticImageUrl(null);
          return;
        }
        const stylePath = styleUrl
          ? (styleUrl.match(/mapbox:\/\/styles\/(.+)/)?.[1] ?? DEFAULT_STYLE)
          : DEFAULT_STYLE;
        const pin = `pin-l+FF0077(${center.longitude},${center.latitude})`;
        const centerStr = `${center.longitude},${center.latitude},12`;
        const url = `https://api.mapbox.com/styles/v1/${stylePath}/static/${pin}/${centerStr}/600x400@2x?access_token=${token}`;
        setStaticImageUrl(url);
      } catch {
        if (!cancelled) setStaticImageUrl(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [providerLocation, zones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center border rounded-lg" style={{ height }}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!staticImageUrl) {
    return (
      <div className="border rounded-lg p-4" style={{ height, overflowY: "auto" }}>
        <h3 className="font-semibold mb-4">Service Zones</h3>
        <div className="space-y-2">
          {zones.map((zone, index) => (
            <div
              key={zone.id || index}
              className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                zone.is_active ? "border-primary" : "border-gray-300"
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
      <img
        src={staticImageUrl}
        alt="Service zone location"
        className="w-full h-full object-cover"
        width={600}
        height={400}
      />
    </div>
  );
}
