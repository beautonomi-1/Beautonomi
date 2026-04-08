/**
 * Static Mapbox map image – displays a pin at the given coordinates.
 * Uses Mapbox Static Images API. Token and optional style from superadmin (same as web).
 */
import { useEffect, useState } from "react";
import { Image, View, ActivityIndicator } from "react-native";
import { Colors } from "@/constants/colors";
import { getMapboxConfig } from "@/lib/third-party-config";

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  /** Optional second pin (e.g. customer address) — map uses Mapbox `auto` framing when set. */
  secondaryLatitude?: number;
  secondaryLongitude?: number;
  width?: number;
  height?: number;
  zoom?: number;
  style?: object;
}

export function StaticMapImage({
  latitude,
  longitude,
  secondaryLatitude,
  secondaryLongitude,
  width = 400,
  height = 200,
  zoom = 14,
  style,
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
        // Style path: mapbox://styles/mapbox/streets-v12 -> mapbox/streets-v12
        const stylePath = config.style_url
          ? (config.style_url.match(/mapbox:\/\/styles\/(.+)/)?.[1] ?? "mapbox/streets-v12")
          : "mapbox/streets-v12";
        const hasSecondary =
          secondaryLatitude != null &&
          secondaryLongitude != null &&
          Number.isFinite(secondaryLatitude) &&
          Number.isFinite(secondaryLongitude) &&
          !(Math.abs(secondaryLatitude - latitude) < 1e-6 && Math.abs(secondaryLongitude - longitude) < 1e-6);
        let url: string;
        if (hasSecondary) {
          const pinA = `pin-l+FF0077(${longitude},${latitude})`;
          const pinB = `pin-l+2563EB(${secondaryLongitude},${secondaryLatitude})`;
          url = `https://api.mapbox.com/styles/v1/${stylePath}/static/${pinA},${pinB}/auto/${width}x${height}@2x?access_token=${config.token}`;
        } else {
          const pin = `pin-l+FF0077(${longitude},${latitude})`;
          const center = `${longitude},${latitude},${zoom}`;
          url = `https://api.mapbox.com/styles/v1/${stylePath}/static/${pin}/${center}/${width}x${height}@2x?access_token=${config.token}`;
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
      <View style={[{ width, height, justifyContent: "center", alignItems: "center" }, style]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!uri) {
    return (
      <View
        style={[
          {
            width,
            height,
            backgroundColor: "#f3f4f6",
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width, height }, style]}
      resizeMode="cover"
    />
  );
}
