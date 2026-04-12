import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchMapboxPublicMapConfig } from "@/lib/fetchMapboxPublicMapConfig";

const DEFAULT_STYLE = "mapbox://styles/mapbox/streets-v12";
const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];
const DEFAULT_ZOOM = 6;

export type AdminMapHandle = {
  getMap: () => mapboxgl.Map | null;
};

interface AdminMapContainerProps {
  center?: [number, number];
  zoom?: number;
  style?: string;
  className?: string;
  /** Fires once after the map style loads and is ready for layers/sources. */
  onMapReady?: (map: mapboxgl.Map) => void;
}

export const AdminMapContainer = forwardRef<AdminMapHandle, AdminMapContainerProps>(
  function AdminMapContainer(
    {
      center = DEFAULT_CENTER,
      zoom = DEFAULT_ZOOM,
      style,
      className = "",
      onMapReady,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const onMapReadyRef = useRef(onMapReady);
    onMapReadyRef.current = onMapReady;

    const [tokenState, setTokenState] = useState<"loading" | "missing" | "ready">("loading");
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [styleUrl, setStyleUrl] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ getMap: () => mapRef.current }), []);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const cfg = await fetchMapboxPublicMapConfig();
        if (cancelled) return;
        const token = cfg.accessToken;
        if (!token) {
          setTokenState("missing");
          return;
        }
        setAccessToken(token);
        setStyleUrl(cfg.styleUrl);
        setTokenState("ready");
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!accessToken || !containerRef.current) return;
      let cancelled = false;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        accessToken,
        style: styleUrl?.trim() || style || DEFAULT_STYLE,
        center,
        zoom,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        if (cancelled) return;
        const bump = () => {
          try { map.resize(); } catch { /* layout race */ }
        };
        bump();
        requestAnimationFrame(() => {
          bump();
          requestAnimationFrame(bump);
        });
        onMapReadyRef.current?.(map);
      });

      mapRef.current = map;

      const ro = new ResizeObserver(() => {
        try { map.resize(); } catch { /* ignore */ }
      });
      if (containerRef.current) ro.observe(containerRef.current);

      return () => {
        cancelled = true;
        ro.disconnect();
        map.remove();
        mapRef.current = null;
      };
      // Re-create map only when token or style changes — center/zoom are initial props.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, styleUrl, style]);

    if (tokenState === "loading") {
      return (
        <div className={`flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 ${className}`}>
          <p className="text-sm text-gray-600">Loading map configuration…</p>
        </div>
      );
    }

    if (tokenState === "missing") {
      return (
        <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center ${className}`}>
          <p className="text-sm font-semibold text-amber-950">Map preview unavailable</p>
          <p className="max-w-sm text-xs leading-relaxed text-amber-900/90">
            Add a public Mapbox token under{" "}
            <span className="font-medium">Integrations → Mapbox</span> or set the{" "}
            <code className="rounded bg-amber-100 px-1 text-[11px]">VITE_MAPBOX_ACCESS_TOKEN</code>{" "}
            environment variable.
          </p>
        </div>
      );
    }

    return (
      <div className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 ${className}`}>
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    );
  },
);
