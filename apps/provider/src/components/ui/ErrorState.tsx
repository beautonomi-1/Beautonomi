import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message = "Something went wrong", onRetry, retryLabel = "Try Again" }: ErrorStateProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 64 }}>
      <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#fef2f2" }}>
        <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
      </View>
      <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "500", color: "#111827" }}>Error</Text>
      <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: "#6b7280" }}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={{ marginTop: 24, borderRadius: 12, backgroundColor: "#111827", paddingHorizontal: 24, paddingVertical: 12 }}
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Text style={{ fontWeight: "500", color: "#fff" }}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
