import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

type Props = {
  lastUpdatedAt: number | null;
};

function formatRelativeUpdate(ms: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  return `${mins}m ago`;
}

export function BookingLiveSyncIndicator({ lastUpdatedAt }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    const timer = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, [lastUpdatedAt]);

  if (!lastUpdatedAt) return null;

  return (
    <View
      style={{
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#a7f3d0",
        backgroundColor: "#ecfdf5",
        paddingHorizontal: 12,
        paddingVertical: 4,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10b981", marginRight: 6 }} />
      <Ionicons name="radio-outline" size={12} color="#059669" style={{ marginRight: 4 }} />
      <Text style={{ fontSize: 12, fontWeight: "500", color: "#065f46" }}>
        Live · updated {formatRelativeUpdate(lastUpdatedAt)}
      </Text>
    </View>
  );
}
