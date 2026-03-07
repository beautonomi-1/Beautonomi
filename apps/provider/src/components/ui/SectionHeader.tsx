import { View, Text, TouchableOpacity } from "react-native";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={{ marginBottom: 12, marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>{title}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#4f46e5" }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
