import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ErrorStateProps {
  message?: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional icon override (defaults to a calm alert circle). */
  icon?: keyof typeof Ionicons.glyphMap;
}

export function ErrorState({
  message = "We couldn't load this right now. Check your connection and try again.",
  title = "Something didn't load",
  onRetry,
  retryLabel = "Try Again",
  icon = "cloud-offline-outline",
}: ErrorStateProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 64 }}>
      <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#fef2f2" }}>
        <Ionicons name={icon} size={28} color="#ef4444" />
      </View>
      <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: "#111827" }}>{title}</Text>
      <Text style={{ marginTop: 6, textAlign: "center", fontSize: 14, lineHeight: 20, color: "#6b7280" }}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={{ marginTop: 24, borderRadius: 12, backgroundColor: "#111827", paddingHorizontal: 28, paddingVertical: 12, minHeight: 44, alignItems: "center", justifyContent: "center" }}
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Text style={{ fontWeight: "600", color: "#fff" }}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
