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
    <View style={[ { borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, minWidth: 0 }, compact ? { padding: 12 } : { padding: 16 } ]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: icon ? 4 : 0 }}>
          <Text
            style={{ fontSize: compact ? 11 : 12, fontWeight: "500", letterSpacing: 0.3, color: Colors.gray[500] }}
            numberOfLines={2}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.85}
          >
            {title}
          </Text>
          <Text
            style={[
              compact ? { marginTop: 4, fontSize: 16 } : { marginTop: 8, fontSize: 18 },
              { fontWeight: "700", color: Colors.gray[900] },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.55}
          >
            {value}
          </Text>
          {subtitle && (
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[400] }} numberOfLines={1}>
              {subtitle}
            </Text>
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
              { backgroundColor: iconBg, marginLeft: 4, alignItems: "center", justifyContent: "center", borderRadius: 12, flexShrink: 0 },
              compact ? { height: 32, width: 32 } : { height: 36, width: 36 },
            ]}
          >
            <Ionicons name={icon} size={compact ? 16 : 18} color={iconColor} />
          </View>
        )}
      </View>
    </View>
  );
}
