/**
 * Static Mapbox map image — displays a pin at the given coordinates.
 * Uses Mapbox Static Images API with token from backend.
 */
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Image } from "expo-image";
import { Colors } from "@/constants/colors";
import { getMapboxToken } from "@/lib/third-party-config";
import { twStyle } from "@/lib/twStyle";

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  width?: number;
  height?: number;
  zoom?: number;
  borderRadius?: number;
  className?: string;
}

export function StaticMapImage({
  latitude,
  longitude,
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
