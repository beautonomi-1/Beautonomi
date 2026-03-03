import { View, Text } from "react-native";
import { Image } from "expo-image";
import { getInitials } from "@/lib/format";

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  color?: string;
}

const sizes = {
  sm: { container: "h-8 w-8", px: 32, text: "text-xs" },
  md: { container: "h-10 w-10", px: 40, text: "text-sm" },
  lg: { container: "h-12 w-12", px: 48, text: "text-base" },
  xl: { container: "h-16 w-16", px: 64, text: "text-lg" },
};

const colors = [
  "bg-indigo-100 text-indigo-700",
  "bg-pink-100 text-pink-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, imageUrl, size = "md", color }: AvatarProps) {
  const s = sizes[size];

  if (imageUrl) {
    return (
      <View className={`${s.container} rounded-full overflow-hidden`}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: s.px, height: s.px }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      </View>
    );
  }

  const colorClass = color || getColorForName(name);

  return (
    <View
      className={`${s.container} items-center justify-center rounded-full ${colorClass}`}
    >
      <Text className={`${s.text} font-semibold`}>{getInitials(name)}</Text>
    </View>
  );
}
