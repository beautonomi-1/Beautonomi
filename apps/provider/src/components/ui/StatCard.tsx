import { View, Text, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label?: string };
  compact?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = "#6366f1",
  iconBg = "#eef2ff",
  trend,
  compact = false,
}: StatCardProps) {
  return (
    <View style={[ { borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white }, compact ? { padding: 12 } : { padding: 16 } ]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", letterSpacing: 0.5, color: Colors.gray[500] }} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[
              compact ? { marginTop: 4, fontSize: 17 } : { marginTop: 8, fontSize: 20 },
              { fontWeight: "700", color: Colors.gray[900] },
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.65}
          >
            {value}
          </Text>
          {subtitle && (
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[400] }}>{subtitle}</Text>
          )}
          {trend && (
            <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={trend.value >= 0 ? "trending-up" : "trending-down"}
                size={14}
                color={trend.value >= 0 ? "#22c55e" : "#ef4444"}
              />
              <Text
                style={{
                  marginLeft: 4,
                  fontSize: 12,
                  fontWeight: "500",
                  color: trend.value >= 0 ? "#16a34a" : "#ef4444",
                }}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
                {trend.label ? ` ${trend.label}` : ""}
              </Text>
            </View>
          )}
        </View>
        {icon && (
          <View
            style={[
              { backgroundColor: iconBg, marginLeft: 8, alignItems: "center", justifyContent: "center", borderRadius: 12 },
              compact ? { height: 36, width: 36 } : { height: 40, width: 40 },
            ]}
          >
            <Ionicons name={icon} size={compact ? 18 : 20} color={iconColor} />
          </View>
        )}
      </View>
    </View>
  );
}
