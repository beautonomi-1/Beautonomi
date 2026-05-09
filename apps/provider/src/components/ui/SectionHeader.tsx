import { View, Text, TouchableOpacity } from "react-native";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={{ marginBottom: 12, marginTop: 24, flexDirection: "row", alignItems: subtitle ? "flex-start" : "center", justifyContent: "space-between" }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ marginTop: 4, fontSize: 12, color: "#6b7280", lineHeight: 16 }}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#4f46e5" }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
