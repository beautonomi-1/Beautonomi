/**
 * Static Mapbox map image – displays a pin at the given coordinates.
 * Uses Mapbox Static Images API. Fetches token from backend.
 */
import { useEffect, useState } from "react";
import { Image, View, ActivityIndicator } from "react-native";
import { getMapboxToken } from "@/lib/third-party-config";

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  width?: number;
  height?: number;
  zoom?: number;
  style?: object;
}

export function StaticMapImage({
  latitude,
  longitude,
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
        const token = await getMapboxToken();
        if (cancelled) return;
        if (!token) {
          setLoading(false);
          return;
        }
        const pin = `pin-l+FF0077(${longitude},${latitude})`;
        const center = `${longitude},${latitude},${zoom}`;
        const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${center}/${width}x${height}@2x?access_token=${token}`;
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
  }, [latitude, longitude, width, height, zoom]);

  if (loading) {
    return (
      <View style={[{ width, height, justifyContent: "center", alignItems: "center" }, style]}>
        <ActivityIndicator size="small" color="#FF0077" />
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
