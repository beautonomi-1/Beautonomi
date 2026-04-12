"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPinned } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";
import { attachMapResize } from "@/lib/mapbox/attach-map-resize";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import type { GeocodeResult } from "@/lib/mapbox/mapbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Johannesburg — sensible default when no coordinates yet */
const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];

export type PickedMapLocation = {
  address_line1: string;
  city: string;
  state?: string;
  postal_code?: string;
  country: string;
  latitude: number;
  longitude: number;
  place_name?: string;
};

interface LocationMapPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLongitude?: number;
  initialLatitude?: number;
  /** When Mapbox omits country on reverse, fill dropdown from this (e.g. "South Africa"). */
  defaultCountryName?: string;
  onLocationPicked: (address: PickedMapLocation) => void;
}

export function LocationMapPickerDialog({
  open,
  onOpenChange,
  initialLongitude,
  initialLatitude,
  defaultCountryName,
  onLocationPicked,
}: LocationMapPickerDialogProps) {
  const [mapboxState, setMapboxState] = useState<"loading" | "ready" | "missing">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const markerRef = useRef<{ getLngLat: () => { lng: number; lat: number }; remove: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMapboxState("loading");
    (async () => {
      try {
        const cfg = await fetchMapboxPublicMapConfig();
        if (!cancelled) {
          const t = cfg.accessToken && cfg.accessToken.trim() ? cfg.accessToken.trim() : null;
          setToken(t);
          setStyleUrl(cfg.styleUrl);
          setMapboxState(t ? "ready" : "missing");
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setMapboxState("missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setMapReady(false);
  }, [open]);

  useEffect(() => {
    if (!open || !token || typeof window === "undefined") return;
    const container = mapContainerRef.current;
    if (!container) return;

    const hasValidInitial =
      initialLongitude != null &&
      initialLatitude != null &&
      Number.isFinite(initialLongitude) &&
      Number.isFinite(initialLatitude) &&
      !(initialLongitude === 0 && initialLatitude === 0);

    const centerLng = hasValidInitial ? initialLongitude! : DEFAULT_CENTER[0];
    const centerLat = hasValidInitial ? initialLatitude! : DEFAULT_CENTER[1];

    let cancelled = false;
    let detachResize: (() => void) | undefined;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !mapContainerRef.current) return;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        accessToken: token,
        style: styleUrl?.trim() || "mapbox://styles/mapbox/streets-v12",
        center: [centerLng, centerLat],
        zoom: hasValidInitial ? 16 : 11,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      detachResize = attachMapResize(map, mapContainerRef.current);

      const marker = new mapboxgl.Marker({ color: "#FF0077", draggable: true })
        .setLngLat([centerLng, centerLat])
        .addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
      if (!cancelled) setMapReady(true);
    })();

    return () => {
      cancelled = true;
      detachResize?.();
      setMapReady(false);
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [open, token, styleUrl, initialLongitude, initialLatitude]);

  const handleApply = async () => {
    const marker = markerRef.current;
    if (!marker) return;
    const ll = marker.getLngLat();
    setApplying(true);
    try {
      const res = await fetcher.post<{ data: GeocodeResult | null }>("/api/mapbox/reverse-geocode", {
        longitude: ll.lng,
        latitude: ll.lat,
      });
      const feature = res.data;
      if (!feature?.place_name) {
        toast.error("Could not resolve that spot to an address. Move the pin or use address search.");
        return;
      }
      const parsed = mapGeocodeFeatureToAddressParts(feature, { defaultCountryName });
      onLocationPicked({
        address_line1: parsed.address_line1,
        city: parsed.city,
        state: parsed.state || undefined,
        postal_code: parsed.postal_code || undefined,
        country: parsed.country,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        place_name: parsed.place_name,
      });
      onOpenChange(false);
    } catch {
      toast.error("Could not look up that location. Check Mapbox setup or try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b border-slate-200 bg-slate-50/90 px-4 py-4 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-900">
            <MapPinned className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            Pin your base on the map
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-slate-700">
            Drag the pin to your door or gate, then confirm. We&apos;ll fill street, city, and coordinates—same as
            choosing a search result.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-3 sm:px-5">
          {mapboxState === "loading" ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
              <p className="text-sm font-medium text-slate-800">Loading map…</p>
            </div>
          ) : mapboxState === "missing" ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center">
              <MapPinned className="h-10 w-10 text-amber-600/80" aria-hidden />
              <p className="text-sm font-semibold text-amber-950">Map not configured</p>
              <p className="text-xs text-amber-900/90">
                Add a public Mapbox token in admin (Mapbox settings) or set{" "}
                <code className="rounded bg-amber-100 px-1 text-[11px]">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> for local
                dev. You can still confirm your location using address search above.
              </p>
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              className={cn("h-[min(52vh,320px)] w-full overflow-hidden rounded-xl border border-slate-200 shadow-inner")}
            />
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:px-5">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={mapboxState !== "ready" || !mapReady || applying}
            onClick={() => void handleApply()}
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Applying…
              </>
            ) : (
              "Use this pin location"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
