import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  actionAccessibilityLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "folder-open-outline", title, description, actionLabel, actionAccessibilityLabel, onAction }: EmptyStateProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 64 }}>
      <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: Colors.gray[100] }}>
        <Ionicons name={icon} size={28} color={Colors.gray[400]} />
      </View>
      <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>{title}</Text>
      {description && (
        <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, lineHeight: 20, color: Colors.gray[500] }}>{description}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={{ marginTop: 24, borderRadius: 12, backgroundColor: Colors.gray[900], paddingHorizontal: 24, paddingVertical: 12 }}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
        >
          <Text style={{ fontWeight: "500", color: Colors.white }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
