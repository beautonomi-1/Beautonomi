/**
 * Web: Mapbox GL JS pin picker via iframe (same Mapbox stack as native WebView).
 */
import { useState, useCallback, useEffect, useMemo, useRef, createElement } from "react";
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { RADIUS_BUTTON } from "@/constants/layout";
import {
  buildMapboxPinPickerHtml,
  fetchPublicDirectionsConfig,
  FALLBACK_LAT,
  FALLBACK_LNG,
  MAP_PIN_MARKER_COLOR,
  parseV6Feature,
  reverseGeocodeV6,
  type ResolvedPinAddress,
} from "./address-map-pin-helpers";

export type { ResolvedPinAddress };

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

type PinMessage = { type?: string; lat?: number; lng?: number; message?: string };

export function AddressMapPinModal({
  visible,
  onClose,
  onPickCoordinates,
  initialCoordinate,
}: AddressMapPinModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pinCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
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
      markerHex: MAP_PIN_MARKER_COLOR,
      webIframe: true,
    });
  }, [token, styleUrl, mapConfigState, centerLng, centerLat, zoom]);

  const handlePinMessage = useCallback(
    (raw: string) => {
      try {
        const d = JSON.parse(raw) as PinMessage;
        if (d.type === "pin_update" && typeof d.lat === "number" && typeof d.lng === "number") {
          pinCoordsRef.current = { lat: d.lat, lng: d.lng };
          if (fetchAddressTimeout.current) clearTimeout(fetchAddressTimeout.current);
          const lat = d.lat;
          const lng = d.lng;
          fetchAddressTimeout.current = setTimeout(async () => {
            if (!token) return;
            setIsFetchingAddress(true);
            try {
              const place = await reverseGeocodeV6(token, lng, lat);
              const parsed = place ? parseV6Feature(place) : null;
              setCurrentAddressName(parsed?.place_name || "Unknown location");
            } catch {
              setCurrentAddressName("Unknown location");
            } finally {
              setIsFetchingAddress(false);
            }
          }, 400);
        }
      } catch {
        /* ignore */
      }
    },
    [token],
  );

  useEffect(() => {
    if (!visible) return;
    const onWindowMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      handlePinMessage(event.data);
    };
    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [visible, handlePinMessage]);

  const confirmPin = useCallback(async () => {
    if (confirming) return;
    const coords = pinCoordsRef.current ?? { lat: centerLat, lng: centerLng };
    setConfirming(true);
    try {
      let resolved: ResolvedPinAddress | undefined;
      if (token) {
        const place = await reverseGeocodeV6(token, coords.lng, coords.lat);
        if (place) resolved = parseV6Feature(place);
      }
      onPickCoordinates(coords.lat, coords.lng, resolved);
      onClose();
    } finally {
      setConfirming(false);
    }
  }, [confirming, centerLat, centerLng, token, onPickCoordinates, onClose]);

  const mapFrame =
    mapConfigState === "ready" && html
      ? createElement("iframe", {
          ref: iframeRef,
          title: "Drop pin on map",
          srcDoc: html,
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
          },
        })
      : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
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
          mapFrame
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
            <Text style={styles.hint} numberOfLines={1}>
              {isFetchingAddress ? "Locating..." : currentAddressName || "Tap map or drag pin"}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        {mapConfigState === "ready" && html ? (
          <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
            <TouchableOpacity
              onPress={() => void confirmPin()}
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
