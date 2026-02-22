"use client";

import React, { useEffect, useRef, useState } from "react";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

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

interface ServiceZoneMapProps {
  zones: ServiceZone[];
  providerLocation?: { latitude: number; longitude: number };
  onZoneCreate?: (zone: Partial<ServiceZone>) => void;
  onZoneUpdate?: (zoneId: string, zone: Partial<ServiceZone>) => void;
  onZoneDelete?: (zoneId: string) => void;
  editable?: boolean;
  height?: string;
}

export default function ServiceZoneMap({
  zones,
  providerLocation,
  onZoneCreate,
  onZoneUpdate: _onZoneUpdate,
  onZoneDelete: _onZoneDelete,
  editable = false,
  height = "500px",
}: ServiceZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [_isDrawing, _setIsDrawing] = useState(false);
  const [drawingPolygon, setDrawingPolygon] = useState<any[]>([]);
  const [_selectedZone, _setSelectedZone] = useState<ServiceZone | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let mapInstance: any = null;
    let mapboxgl: any = null;

    const initMap = async () => {
      try {
        // Dynamically import mapbox-gl
        mapboxgl = (await import("mapbox-gl")).default;
        // @ts-expect-error - @mapbox/mapbox-gl-draw has no type declarations
        const MapboxDraw = (await import("@mapbox/mapbox-gl-draw")).default;

        // Get Mapbox access token
        const mapbox = await getMapboxService();
        const accessToken = (mapbox as any).config.accessToken;

        if (!accessToken) {
          throw new Error("Mapbox access token not configured");
        }

        // Set access token
        mapboxgl.accessToken = accessToken;

        // Initialize map
        mapInstance = new mapboxgl.Map({
          container: mapContainerRef.current!,
          style: "mapbox://styles/mapbox/streets-v12",
          center: providerLocation
            ? [providerLocation.longitude, providerLocation.latitude]
            : [28.0473, -26.2041], // Default to Johannesburg
          zoom: providerLocation ? 12 : 10,
        });

        mapRef.current = mapInstance;

        // Add navigation controls
        mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

        // Initialize draw control if editable
        let draw: any = null;
        if (editable) {
          draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
              polygon: true,
              trash: true,
            },
          });
          mapInstance.addControl(draw, "top-left");

          // Handle polygon creation
          mapInstance.on("draw.create", (e: any) => {
            const feature = e.features[0];
            if (feature.geometry.type === "Polygon") {
              const coordinates = feature.geometry.coordinates[0];
              setDrawingPolygon(
                coordinates.map(([lng, lat]: [number, number]) => ({
                  longitude: lng,
                  latitude: lat,
                }))
              );
            }
          });

          mapInstance.on("draw.update", (e: any) => {
            const feature = e.features[0];
            if (feature.geometry.type === "Polygon") {
              const coordinates = feature.geometry.coordinates[0];
              setDrawingPolygon(
                coordinates.map(([lng, lat]: [number, number]) => ({
                  longitude: lng,
                  latitude: lat,
                }))
              );
            }
          });

          mapInstance.on("draw.delete", () => {
            setDrawingPolygon([]);
          });
        }

        // Wait for map to load
        mapInstance.on("load", () => {
          // Add provider location marker
          if (providerLocation) {
            new mapboxgl.Marker({ color: "#FF0077" })
              .setLngLat([providerLocation.longitude, providerLocation.latitude])
              .setPopup(new mapboxgl.Popup().setHTML("<b>Your Location</b>"))
              .addTo(mapInstance);
          }

          // Add zone polygons
          zones.forEach((zone) => {
            if (zone.zone_type === "polygon" && zone.polygon_coordinates) {
              const coordinates = zone.polygon_coordinates[0] || zone.polygon_coordinates;
              const polygonCoords = coordinates.map((coord: any) => {
                if (Array.isArray(coord)) {
                  return coord;
                }
                return [coord.longitude, coord.latitude];
              });

              // Close the polygon
              if (polygonCoords.length > 0) {
                polygonCoords.push(polygonCoords[0]);
              }

              mapInstance.addSource(`zone-${zone.id}`, {
                type: "geojson",
                data: {
                  type: "Feature",
                  geometry: {
                    type: "Polygon",
                    coordinates: [polygonCoords],
                  },
                },
              });

              mapInstance.addLayer({
                id: `zone-${zone.id}-fill`,
                type: "fill",
                source: `zone-${zone.id}`,
                paint: {
                  "fill-color": zone.is_active ? "#FF0077" : "#999999",
                  "fill-opacity": 0.3,
                },
              });

              mapInstance.addLayer({
                id: `zone-${zone.id}-outline`,
                type: "line",
                source: `zone-${zone.id}`,
                paint: {
                  "line-color": zone.is_active ? "#FF0077" : "#999999",
                  "line-width": 2,
                },
              });
            } else if (zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
              // Add radius circle
              const center = [zone.center_longitude, zone.center_latitude];
              const _radiusMeters = zone.radius_km * 1000;

              // Create circle using turf.js (would need to import)
              // For now, add a marker at center
              new mapboxgl.Marker({ color: zone.is_active ? "#FF0077" : "#999999" })
                .setLngLat(center)
                .setPopup(
                  new mapboxgl.Popup().setHTML(
                    `<b>${zone.name}</b><br/>Radius: ${zone.radius_km}km`
                  )
                )
                .addTo(mapInstance);
            }
          });

          setIsLoading(false);
        });

        mapInstance.on("error", (e: any) => {
          console.error("Map error:", e);
          setIsLoading(false);
        });
      } catch (error: any) {
        console.error("Failed to initialize map:", error);
        toast.error("Failed to load map. Please check Mapbox configuration.");
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      if (mapInstance) {
        mapInstance.remove();
      }
    };
  }, [zones, providerLocation, editable]);

  const handleSavePolygon = () => {
    if (drawingPolygon.length < 3) {
      toast.error("Polygon must have at least 3 points");
      return;
    }

    if (onZoneCreate) {
      onZoneCreate({
        zone_type: "polygon",
        polygon_coordinates: [drawingPolygon.map((p) => [p.longitude, p.latitude])],
        name: `Zone ${zones.length + 1}`,
        travel_fee: 0,
        is_active: true,
      });
      setDrawingPolygon([]);
      toast.success("Polygon zone created");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Loader2 className="w-6 h-6 animate-spin text-[#FF0077]" />
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapContainerRef} style={{ height, width: "100%" }} className="rounded-lg" />
      
      {editable && drawingPolygon.length > 0 && (
        <div className="absolute top-4 left-4 bg-white p-4 rounded-lg shadow-lg z-10">
          <p className="text-sm mb-2">Drawing polygon ({drawingPolygon.length} points)</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSavePolygon} className="bg-[#FF0077] hover:bg-[#D60565]">
              <Save className="w-4 h-4 mr-1" />
              Save Zone
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDrawingPolygon([]);
                if (mapRef.current) {
                  // Clear draw control
                  const draw = mapRef.current.getDraw();
                  if (draw) {
                    draw.deleteAll();
                  }
                }
              }}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
