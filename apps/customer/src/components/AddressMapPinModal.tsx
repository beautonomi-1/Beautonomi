/**
 * Full-screen Mapbox map (same stack as web `LocationMapPickerDialog`): WebView + Mapbox GL JS.
 * Tiles use the tenant public token from GET /api/public/directions-config — no Apple/Google map SDK.
 * Confirm sends lat/lng to native; caller reverse-geocodes via existing POST /api/mapbox/reverse-geocode.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { RADIUS_BUTTON } from "@/constants/layout";
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";

/** Johannesburg — default center when no proximity (aligned with web picker). */
const FALLBACK_LNG = 28.0473;
const FALLBACK_LAT = -26.2041;

/**
 * Address parts resolved from the dropped pin via Mapbox Geocoding v6 (rich
 * coverage + structured context). Passed to the caller on confirm so the
 * address form can be filled directly — no second server round-trip needed,
 * and it succeeds for pins where the older v5 reverse-geocode returns nothing.
 */
export type ResolvedPinAddress = {
  place_name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type AddressMapPinModalProps = {
  visible: boolean;
  onClose: () => void;
  onPickCoordinates: (
    latitude: number,
    longitude: number,
    resolved?: ResolvedPinAddress,
  ) => void;
  initialCoordinate?: { latitude: number; longitude: number } | null;
};

async function fetchPublicDirectionsConfig(): Promise<{ token: string | null; styleUrl: string | null }> {
  const origin = getBackendUrl().trim().replace(/\/$/, "");
  if (!origin) return { token: null, styleUrl: null };
  try {
    const res = await fetch(
      `${origin}/api/public/directions-config`,
      withWebApiTenantHeaders({ cache: "no-store" as RequestCache }),
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { mapboxPublicToken?: string; mapboxStyleUrl?: string | null };
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
async function reverseGeocodeV6(
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
function parseV6Feature(place: any): ResolvedPinAddress {
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

function buildMapboxPinPickerHtml(opts: {
  accessToken: string;
  styleUrl: string;
  centerLng: number;
  centerLat: number;
  zoom: number;
  markerHex: string;
}): string {
  const tokenJs = JSON.stringify(opts.accessToken);
  const styleJs = JSON.stringify(opts.styleUrl);
  const lng = opts.centerLng;
  const lat = opts.centerLat;
  const zoom = opts.zoom;
  const colorJs = JSON.stringify(opts.markerHex);
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
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pin_update', lat: ll.lat, lng: ll.lng }));
      }
    }
    marker.on('dragend', publish);
    map.on('click', function (e) {
      marker.setLngLat(e.lngLat);
      publish();
    });
    map.on('load', publish);
    publish();
  } catch (e) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_error', message: String(e && e.message ? e.message : e) }));
    }
  }
})();
</script>
</body></html>`;
}

export function AddressMapPinModal({
  visible,
  onClose,
  onPickCoordinates,
  initialCoordinate,
}: AddressMapPinModalProps) {
  const webRef = useRef<WebView>(null);
  const [mapConfigState, setMapConfigState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [token, setToken] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchAddressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentAddressName, setCurrentAddressName] = useState<string | null>(null);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);

  const centerLng = initialCoordinate?.longitude ?? FALLBACK_LNG;
  const centerLat = initialCoordinate?.latitude ?? FALLBACK_LAT;
  const zoom = initialCoordinate ? 16 : 11;

  useEffect(() => {
    if (!visible) {
      setMapConfigState("idle");
      return;
    }
    let cancelled = false;
    setMapConfigState("loading");
    setToken(null);
    void (async () => {
      const cfg = await fetchPublicDirectionsConfig();
      if (cancelled) return;
      if (cfg.token) {
        setToken(cfg.token);
        setStyleUrl(cfg.styleUrl);
        setMapConfigState("ready");
      } else {
        setMapConfigState("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const html = useMemo(() => {
    if (!token || mapConfigState !== "ready") return "";
    const style = (styleUrl?.trim() || "mapbox://styles/mapbox/streets-v12").trim();
    return buildMapboxPinPickerHtml({
      accessToken: token,
      styleUrl: style,
      centerLng,
      centerLat,
      zoom,
      markerHex: Colors.primary,
    });
  }, [token, styleUrl, mapConfigState, centerLng, centerLat, zoom]);

  const postPinFromWebView = useCallback(() => {
    webRef.current?.injectJavaScript(`(function(){
      try {
        if (!window.__marker || !window.ReactNativeWebView) return;
        var ll = window.__marker.getLngLat();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pin', lat: ll.lat, lng: ll.lng }));
      } catch (e) {}
      true;
    })();`);
  }, []);

  const onWebMessage = useCallback(
    (ev: { nativeEvent: { data: string } }) => {
      try {
        const d = JSON.parse(ev.nativeEvent.data) as { type?: string; lat?: number; lng?: number };
        if (d.type === "pin_update" && typeof d.lat === "number" && typeof d.lng === "number") {
          if (fetchAddressTimeout.current) clearTimeout(fetchAddressTimeout.current);
          const lat = d.lat;
          const lng = d.lng;
          fetchAddressTimeout.current = setTimeout(async () => {
            if (!token) return;
            setIsFetchingAddress(true);
            try {
              const place = await reverseGeocodeV6(token, lng, lat);
              const parsed = place ? parseV6Feature(place) : null;
              setCurrentAddressName(parsed?.place_name || "Unknown Location");
            } catch {
              setCurrentAddressName("Unknown Location");
            } finally {
              setIsFetchingAddress(false);
            }
          }, 400);
        } else if (d.type === "pin" && typeof d.lat === "number" && typeof d.lng === "number") {
          const lat = d.lat;
          const lng = d.lng;
          setConfirming(true);
          // Resolve the exact confirm coordinates via v6 so the caller gets a
          // real, structured address (not just lat/lng). Falls back to
          // undefined if Mapbox returns nothing or times out — the caller then
          // tries the server reverse-geocode and finally keeps the coordinates.
          void (async () => {
            try {
              let resolved: ResolvedPinAddress | undefined;
              if (token) {
                const place = await reverseGeocodeV6(token, lng, lat);
                if (place) resolved = parseV6Feature(place);
              }
              onPickCoordinates(lat, lng, resolved);
              onClose();
            } finally {
              setConfirming(false);
            }
          })();
        }
      } catch {
        /* ignore non-JSON */
      }
    },
    [onPickCoordinates, onClose, token],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        {mapConfigState === "loading" || (mapConfigState === "ready" && !html) ? (
          <View style={styles.centerMessage}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        ) : mapConfigState === "missing" ? (
          <View style={styles.centerMessage}>
            <Ionicons name="map-outline" size={48} color={Colors.gray[400]} />
            <Text style={styles.missingTitle}>Map not configured</Text>
            <Text style={styles.missingBody}>
              Add a public Mapbox token in admin (Mapbox settings). You can still set your address using search or
              current location.
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.secondaryBtn} accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            ref={webRef}
            key={`${centerLng}-${centerLat}-${token?.slice(0, 12)}`}
            style={StyleSheet.absoluteFill}
            source={{ html, baseUrl: "https://localhost" }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            onMessage={onWebMessage}
          />
        )}

        <SafeAreaView style={styles.topBar} edges={["top"]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close map"
          >
            <Ionicons name="close" size={26} color={Colors.gray[800]} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <Text style={styles.hint} numberOfLines={1} adjustsFontSizeToFit>
              {isFetchingAddress ? "Locating..." : currentAddressName || "Tap map or drag pin"}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        {mapConfigState === "ready" && html ? (
          <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
            <TouchableOpacity
              onPress={() => {
                if (confirming) return;
                postPinFromWebView();
              }}
              disabled={confirming}
              style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Use this location"
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmText}>Use this location</Text>
                </>
              )}
            </TouchableOpacity>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[900],
  },
  centerMessage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.gray[50],
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.gray[600],
  },
  missingTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.gray[900],
    textAlign: "center",
  },
  missingBody: {
    marginTop: 10,
    fontSize: 15,
    color: Colors.gray[600],
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  secondaryBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  hint: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: Colors.gray[800],
    backgroundColor: "rgba(255,255,255,0.92)",
    marginHorizontal: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray[200],
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: RADIUS_BUTTON,
    marginBottom: 8,
  },
  confirmBtnDisabled: {
    opacity: 0.75,
  },
  confirmText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
});
