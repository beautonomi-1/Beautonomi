import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";

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
    <View style={twStyle("mb-3 flex-row items-center self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1")}>
      <View style={twStyle("mr-1.5 h-2 w-2 rounded-full bg-emerald-500")} />
      <Ionicons name="radio-outline" size={12} color="#059669" style={{ marginRight: 4 }} />
      <Text style={twStyle("text-xs font-medium text-emerald-800")}>
        Live · updated {formatRelativeUpdate(lastUpdatedAt)}
      </Text>
    </View>
  );
}
