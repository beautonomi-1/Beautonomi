/**
 * Static Mapbox map image — pin(s) at coordinates (shared with booking detail).
 * When Mapbox token is unavailable, shows an "Open in Maps" action instead.
 */
import { useEffect, useState } from "react";
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Linking,
  Platform,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { Colors } from "@/constants/colors";
import { getMapboxConfig } from "@/lib/third-party-config";

/** Build URLs for Apple / Google maps from coordinates or plain address query. */
export function buildOpenInMapsUrls(opts: {
  latitude?: number;
  longitude?: number;
  /** Full address — used when coords missing or alongside coords for search UX */
  query?: string;
}): { primary: string; fallback?: string } {
  const lat = opts.latitude;
  const lng = opts.longitude;
  const q = opts.query?.trim();
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  if (hasCoords) {
    const encoded = encodeURIComponent(`${lat},${lng}`);
    if (Platform.OS === "ios") {
      return {
        primary: `http://maps.apple.com/?ll=${lat},${lng}`,
        fallback: `https://maps.google.com/?q=${encoded}`,
      };
    }
    return {
      primary: `https://maps.google.com/?q=${encoded}`,
      fallback: `geo:${lat},${lng}?q=${encoded}`,
    };
  }
  if (q) {
    const enc = encodeURIComponent(q);
    return { primary: `https://maps.google.com/maps/search/?api=1&query=${enc}` };
  }
  return { primary: "" };
}

export async function openInMaps(opts: Parameters<typeof buildOpenInMapsUrls>[0]): Promise<boolean> {
  const { primary, fallback } = buildOpenInMapsUrls(opts);
  if (!primary) return false;
  const ok = await Linking.canOpenURL(primary).catch(() => false);
  if (ok) {
    await Linking.openURL(primary);
    return true;
  }
  if (fallback) {
    const ok2 = await Linking.canOpenURL(fallback).catch(() => false);
    if (ok2) {
      await Linking.openURL(fallback);
      return true;
    }
  }
  await Linking.openURL(primary.startsWith("http") ? primary : `https://${primary}`);
  return true;
}

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  /** Optional second pin — Mapbox `auto` framing when set (e.g. provider + customer). */
  secondaryLatitude?: number;
  secondaryLongitude?: number;
  width?: number;
  height?: number;
  zoom?: number;
  borderRadius?: number;
  /** Merged into map image / placeholders (e.g. `{ borderRadius: 12 }`). */
  style?: StyleProp<ImageStyle | ViewStyle>;
  /** When static map fails, open Apple/Google Maps with coords or this address string */
  fallbackQuery?: string;
}

export function StaticMapImage({
  latitude,
  longitude,
  secondaryLatitude,
  secondaryLongitude,
  width = 400,
  height = 200,
  zoom = 14,
  borderRadius = 16,
  style,
  fallbackQuery,
}: StaticMapImageProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config = await getMapboxConfig();
        if (cancelled) return;
        if (!config?.token) {
          setLoading(false);
          return;
        }
        const stylePath = config.style_url
          ? (config.style_url.match(/mapbox:\/\/styles\/(.+)/)?.[1] ?? "mapbox/streets-v12")
          : "mapbox/streets-v12";
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setUri(null);
          setLoading(false);
          return;
        }

        const secLat = secondaryLatitude != null ? Number(secondaryLatitude) : undefined;
        const secLng = secondaryLongitude != null ? Number(secondaryLongitude) : undefined;

        const hasSecondary =
          secLat != null &&
          secLng != null &&
          Number.isFinite(secLat) &&
          Number.isFinite(secLng) &&
          !(Math.abs(secLat - lat) < 1e-6 && Math.abs(secLng - lng) < 1e-6);

        const w = Math.round(Number(width) || 400);
        const h = Math.round(Number(height) || 200);

        let url: string;
        if (hasSecondary) {
          const pinA = `pin-l+FF0077(${lng},${lat})`;
          const pinB = `pin-l+2563EB(${secLng},${secLat})`;
          url = `https://api.mapbox.com/styles/v1/${stylePath}/static/${pinA},${pinB}/auto/${w}x${h}@2x?access_token=${config.token}`;
        } else {
          const pin = `pin-l+FF0077(${lng},${lat})`;
          const center = `${lng},${lat},${zoom}`;
          url = `https://api.mapbox.com/styles/v1/${stylePath}/static/${pin}/${center}/${w}x${h}@2x?access_token=${config.token}`;
        }
        setUri(url);
      } catch {
        if (!cancelled) setUri(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, secondaryLatitude, secondaryLongitude, width, height, zoom]);

  const baseSize = { width, height, borderRadius };

  if (loading) {
    return (
      <View
        style={[
          baseSize,
          { justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },
          style,
        ]}
      >
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!uri) {
    const canOpen =
      (Number.isFinite(latitude) && Number.isFinite(longitude)) ||
      Boolean(fallbackQuery?.trim());
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!canOpen}
        onPress={() =>
          openInMaps({
            latitude,
            longitude,
            query: fallbackQuery,
          }).catch(() => {})
        }
        style={[
          baseSize,
          {
            backgroundColor: "#eef2ff",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 12,
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary, textAlign: "center" }}>
          {canOpen ? "Open in Maps" : "Map unavailable"}
        </Text>
        {canOpen ? (
          <Text style={{ fontSize: 11, color: Colors.gray[500], marginTop: 4, textAlign: "center" }}>
            Opens in Apple or Google Maps
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width, height, borderRadius }, style as ImageStyle]}
      contentFit="cover"
      transition={200}
    />
  );
}
