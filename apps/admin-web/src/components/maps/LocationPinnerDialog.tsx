import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPinned, Loader2 } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { fetchMapboxPublicMapConfig } from "@/lib/fetchMapboxPublicMapConfig";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];

export type PinnedLocation = {
  address_line1: string;
  city: string;
  state?: string;
  postal_code?: string;
  country: string;
  latitude: number;
  longitude: number;
  place_name?: string;
};

type ReverseGeocodeResult = {
  place_name?: string;
  center?: [number, number];
  context?: Array<{ id: string; text: string; short_code?: string }>;
};

function parseReverse(feature: ReverseGeocodeResult, lat: number, lng: number): PinnedLocation {
  let address_line1 = feature.place_name ?? "";
  let city = "";
  let state = "";
  let postal_code = "";
  let country = "";
  for (const ctx of feature.context ?? []) {
    if (ctx.id.startsWith("place")) city = ctx.text;
    else if (ctx.id.startsWith("region")) state = ctx.text;
    else if (ctx.id.startsWith("postcode")) postal_code = ctx.text;
    else if (ctx.id.startsWith("country")) country = ctx.text;
  }
  const parts = (feature.place_name ?? "").split(",");
  if (parts.length > 0) address_line1 = parts[0].trim();
  return {
    address_line1,
    city,
    state: state || undefined,
    postal_code: postal_code || undefined,
    country,
    latitude: lat,
    longitude: lng,
    place_name: feature.place_name,
  };
}

interface LocationPinnerDialogProps {
  open: boolean;
  onClose: () => void;
  initialLatitude?: number;
  initialLongitude?: number;
  onLocationPicked: (location: PinnedLocation) => void;
}

export function LocationPinnerDialog({
  open,
  onClose,
  initialLatitude,
  initialLongitude,
  onLocationPicked,
}: LocationPinnerDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [applying, setApplying] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const cfg = await fetchMapboxPublicMapConfig();
      if (!cancelled) {
        setToken(cfg.accessToken);
        setStyleUrl(cfg.styleUrl);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) setMapReady(false);
  }, [open]);

  useEffect(() => {
    if (!open || !token || !containerRef.current) return;

    const hasValid =
      initialLatitude != null && initialLongitude != null &&
      Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude) &&
      !(initialLatitude === 0 && initialLongitude === 0);

    const lng = hasValid ? initialLongitude! : DEFAULT_CENTER[0];
    const lat = hasValid ? initialLatitude! : DEFAULT_CENTER[1];
    let cancelled = false;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: styleUrl?.trim() || "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: hasValid ? 16 : 11,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const marker = new mapboxgl.Marker({ color: "#6366f1", draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    map.on("load", () => {
      if (!cancelled) setMapReady(true);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      cancelled = true;
      setMapReady(false);
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open, token, styleUrl, initialLatitude, initialLongitude]);

  const handleConfirm = async () => {
    const marker = markerRef.current;
    if (!marker) return;
    const ll = marker.getLngLat();
    setApplying(true);
    try {
      const res = await adminApi.postJson<{ data: ReverseGeocodeResult | null }>(
        "/api/mapbox/reverse-geocode",
        { longitude: ll.lng, latitude: ll.lat },
      );
      const feature = res?.data;
      if (!feature?.place_name) {
        adminToast.error("Could not resolve that spot to an address. Move the pin or use address search.");
        return;
      }
      onLocationPicked(parseReverse(feature, ll.lat, ll.lng));
      onClose();
    } catch {
      adminToast.error("Could not look up that location. Check Mapbox setup or try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Pin location on the map"
      description="Drag the pin to the desired location, then confirm. We'll resolve the street address and coordinates."
      footer={
        <>
          <button
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={!token || !mapReady || applying}
            onClick={() => void handleConfirm()}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Applying…
              </>
            ) : (
              <>
                <MapPinned className="h-4 w-4" aria-hidden />
                Use this location
              </>
            )}
          </button>
        </>
      }
    >
      {!token ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
          <p className="text-sm font-medium text-gray-800">Loading map…</p>
          <p className="text-xs text-gray-600">
            If this stays empty, Mapbox may not be configured.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[min(52vh,320px)] w-full overflow-hidden rounded-xl border border-gray-200 shadow-inner"
        />
      )}
    </AdminModal>
  );
}
