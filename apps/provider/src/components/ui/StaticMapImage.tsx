/**
 * Static Mapbox map image — displays a pin at the given coordinates.
 * Uses Mapbox Static Images API. Token and optional style from superadmin (same as customer app).
 */
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Image } from "expo-image";
import { Colors } from "@/constants/colors";
import { getMapboxConfig } from "@/lib/third-party-config";
import { twStyle } from "@/lib/twStyle";

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  /** Optional second pin (e.g. customer address) — map uses Mapbox `auto` framing when set. */
  secondaryLatitude?: number;
  secondaryLongitude?: number;
  width?: number;
  height?: number;
  zoom?: number;
  borderRadius?: number;
  className?: string;
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
  className = "",
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

  if (loading) {
    return (
      <View
        style={[twStyle(className ?? ""), {
          width,
          height,
          borderRadius,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#f3f4f6",
        }]}
      >
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!uri) {
    return (
      <View
        style={[twStyle(className ?? ""), {
          width,
          height,
          borderRadius,
          backgroundColor: "#f3f4f6",
          justifyContent: "center",
          alignItems: "center",
        }]}
      >
        <Text style={twStyle("text-xs text-gray-400")}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width, height, borderRadius }}
      contentFit="cover"
      transition={200}
    />
  );
}
