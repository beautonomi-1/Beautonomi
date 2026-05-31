/**
 * Compact identity-verification badge used across provider surfaces (client list,
 * client detail, bookings, messaging, product orders) to show whether a customer
 * has completed identity verification.
 *
 * - `verified` true  → green "Verified" pill with a shield checkmark.
 * - `verified` false → neutral "Unverified" pill (only when `showUnverified`).
 *
 * Use `iconOnly` for very tight rows (renders just the shield icon, still with an
 * accessibility label). Defaults are tuned to sit inline next to a name.
 */
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function VerifiedBadge({
  verified,
  size = "sm",
  showUnverified = false,
  iconOnly = false,
  style,
}: {
  verified: boolean | null | undefined;
  size?: "xs" | "sm" | "md";
  showUnverified?: boolean;
  iconOnly?: boolean;
  style?: object;
}) {
  const isVerified = Boolean(verified);

  if (!isVerified && !showUnverified) return null;

  const iconSize = size === "md" ? 16 : size === "sm" ? 13 : 11;
  const fontSize = size === "md" ? 12 : size === "sm" ? 11 : 10;
  const paddingV = size === "md" ? 3 : 2;
  const paddingH = size === "md" ? 9 : 7;

  const label = isVerified ? "Verified" : "Unverified";
  const a11yLabel = isVerified ? "Identity verified" : "Identity not verified";

  if (iconOnly) {
    return (
      <Ionicons
        name={isVerified ? "shield-checkmark" : "shield-outline"}
        size={iconSize + 2}
        color={isVerified ? "#16a34a" : "#9ca3af"}
        accessibilityLabel={a11yLabel}
        style={style}
      />
    );
  }

  return (
    <View
      accessibilityLabel={a11yLabel}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 9999,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          backgroundColor: isVerified ? "#dcfce7" : "#f3f4f6",
        },
        style,
      ]}
    >
      <Ionicons
        name={isVerified ? "shield-checkmark" : "shield-outline"}
        size={iconSize}
        color={isVerified ? "#16a34a" : "#9ca3af"}
      />
      <Text
        style={{
          marginLeft: 3,
          fontSize,
          fontWeight: "700",
          color: isVerified ? "#15803d" : "#6b7280",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default VerifiedBadge;
