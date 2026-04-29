import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { getInitials } from "@/lib/format";

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  color?: string;
}

const sizeMap = {
  sm: { px: 32, fontSize: 12 },
  md: { px: 40, fontSize: 14 },
  lg: { px: 48, fontSize: 16 },
  xl: { px: 64, fontSize: 18 },
};

const colorPairs: { bg: string; text: string }[] = [
  { bg: "#e0e7ff", text: "#4338ca" },
  { bg: "#fce7f3", text: "#be185d" },
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#fef3c7", text: "#b45309" },
  { bg: "#cffafe", text: "#0e7490" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#ffe4e6", text: "#be123c" },
  { bg: "#ccfbf1", text: "#0f766e" },
];

function getColorForName(name: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colorPairs[Math.abs(hash) % colorPairs.length];
}

export function Avatar({ name, imageUrl, size = "md", color }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const s = sizeMap[size];
  const colorPair = color ? { bg: color, text: "#111" } : getColorForName(name);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <View style={{ width: s.px, height: s.px, borderRadius: s.px / 2, overflow: "hidden" }}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: s.px, height: s.px }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          onError={() => setImageFailed(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: s.px,
        height: s.px,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: s.px / 2,
        backgroundColor: colorPair.bg,
      }}
    >
      <Text style={{ fontSize: s.fontSize, fontWeight: "600", color: colorPair.text }}>{getInitials(name)}</Text>
    </View>
  );
}
