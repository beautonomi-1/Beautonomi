import { Colors } from "@/constants/colors";
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";

/** Johannesburg — default center when no proximity (aligned with web picker). */
export const FALLBACK_LNG = 28.0473;
export const FALLBACK_LAT = -26.2041;

export type ResolvedPinAddress = {
  place_name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export async function fetchPublicDirectionsConfig(): Promise<{ token: string | null; styleUrl: string | null }> {
  const origin = getBackendUrl().trim().replace(/\/$/, "");
  if (!origin) return { token: null, styleUrl: null };
  try {
    const res = await fetch(
      `${origin}/api/public/directions-config`,
      withWebApiTenantHeaders({ cache: "no-store" as RequestCache }),
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { mapboxPublicToken?: string; mapboxStyleUrl?: string | null };
      error?: { message?: string; code?: string };
    };
    const d = json?.data;
    const t = typeof d?.mapboxPublicToken === "string" ? d.mapboxPublicToken.trim() : "";
    const s =
      typeof d?.mapboxStyleUrl === "string" && d.mapboxStyleUrl.trim()
        ? d.mapboxStyleUrl.trim()
        : "";
    return { token: t || null, styleUrl: s || null };
  } catch {
    return { token: null, styleUrl: null };
  }
}

/** Reverse-geocode a coordinate via Mapbox Geocoding v6 (public token), with a timeout. */
export async function reverseGeocodeV6(
  token: string,
  lng: number,
  lat: number,
  timeoutMs = 6000,
): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&access_token=${token}`,
        { signal: controller.signal },
      );
      const json = await res.json();
      return json?.features?.[0] ?? null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Map a Mapbox v6 feature to structured address parts. */
export function parseV6Feature(place: any): ResolvedPinAddress {
  const props = place?.properties ?? {};
  const ctx = props.context ?? {};
  const fullAddress = typeof props.full_address === "string" ? props.full_address : "";
  const line1 =
    (ctx.address?.name && String(ctx.address.name)) ||
    (props.name && String(props.name)) ||
    (fullAddress ? fullAddress.split(",")[0].trim() : "") ||
    "";
  return {
    place_name: fullAddress || props.name || undefined,
    address_line1: line1 || undefined,
    city: ctx.place?.name || ctx.locality?.name || ctx.district?.name || undefined,
    state: ctx.region?.name || undefined,
    postal_code: ctx.postcode?.name || undefined,
    country: ctx.country?.name || undefined,
  };
}

export function buildMapboxPinPickerHtml(opts: {
  accessToken: string;
  styleUrl: string;
  centerLng: number;
  centerLat: number;
  zoom: number;
  markerHex: string;
  /** When true, posts pin updates to window.parent (iframe on web) instead of ReactNativeWebView. */
  webIframe?: boolean;
}): string {
  const tokenJs = JSON.stringify(opts.accessToken);
  const styleJs = JSON.stringify(opts.styleUrl);
  const lng = opts.centerLng;
  const lat = opts.centerLat;
  const zoom = opts.zoom;
  const colorJs = JSON.stringify(opts.markerHex);
  const postBody = opts.webIframe
    ? `var raw = JSON.stringify(payload);
       if (window.parent && window.parent !== window) { window.parent.postMessage(raw, '*'); }`
    : `var raw = JSON.stringify(payload);
       if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(raw); }`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet"/>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head><body>
<div id="map"></div>
<script>
(function(){
  function post(payload) {
    ${postBody}
  }
  try {
    mapboxgl.accessToken = ${tokenJs};
    var style = ${styleJs};
    var center = [${lng}, ${lat}];
    var map = new mapboxgl.Map({
      container: 'map',
      style: style || 'mapbox://styles/mapbox/streets-v12',
      center: center,
      zoom: ${zoom}
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    var marker = new mapboxgl.Marker({ color: ${colorJs}, draggable: true })
      .setLngLat(center)
      .addTo(map);
    window.__marker = marker;
    function publish() {
      var ll = marker.getLngLat();
      window.__pinLngLat = { lat: ll.lat, lng: ll.lng };
      post({ type: 'pin_update', lat: ll.lat, lng: ll.lng });
    }
    marker.on('dragend', publish);
    map.on('click', function (e) {
      marker.setLngLat(e.lngLat);
      publish();
    });
    map.on('load', publish);
    publish();
  } catch (e) {
    post({ type: 'map_error', message: String(e && e.message ? e.message : e) });
  }
})();
</script>
</body></html>`;
}

export const MAP_PIN_MARKER_COLOR = Colors.primary;
