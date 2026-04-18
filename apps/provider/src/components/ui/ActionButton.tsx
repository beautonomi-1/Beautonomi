import { TouchableOpacity, Text, ActivityIndicator, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /**
   * §UX-audit 2026-04: variant naming was misleading — `primary` rendered
   * as `Colors.gray[900]` (black) and `secondary` was a random indigo
   * (`#4f46e5`) that didn't exist anywhere else in the design language.
   * Kept those for backward compat and added `brand` (true brand pink
   * from `Colors.primary`) so marquee CTAs (onboarding complete, publish
   * listing, book now) can pop. Callers can opt in without disrupting
   * the many screens that relied on the muted black primary.
   */
  variant?: "primary" | "brand" | "secondary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  haptic?: boolean;
  style?: ViewStyle;
}

const variantBg: Record<string, ViewStyle> = {
  primary: { backgroundColor: Colors.gray[900] },
  brand: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: "#4f46e5" },
  danger: { backgroundColor: "#dc2626" },
  outline: { borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white },
  ghost: { backgroundColor: "transparent" },
};

const variantTextColor: Record<string, string> = {
  primary: Colors.white,
  brand: Colors.white,
  secondary: Colors.white,
  danger: Colors.white,
  outline: Colors.gray[900],
  ghost: Colors.gray[700],
};

const sizeStyles: Record<string, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 16, paddingVertical: 8 },
  md: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12 },
  lg: { minHeight: 56, paddingHorizontal: 24, paddingVertical: 16 },
};

const sizeFontSize: Record<string, number> = { sm: 14, md: 16, lg: 18 };

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = "left",
  haptic = true,
  style,
}: ActionButtonProps) {
  const handlePress = () => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const iconColor = variant === "outline" || variant === "ghost" ? "#111" : "#fff";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 22 : 18;

  return (
    <TouchableOpacity
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16 },
        variantBg[variant],
        sizeStyles[size],
        fullWidth && { width: "100%" },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {icon && iconPosition === "left" && (
            <Ionicons name={icon} size={iconSize} color={iconColor} style={{ marginRight: 8 }} />
          )}
          <Text style={{ textAlign: "center", fontWeight: "600", fontSize: sizeFontSize[size], color: variantTextColor[variant], ...(icon && iconPosition === "right" ? { marginRight: 8 } : {}) }}>
            {label}
          </Text>
          {icon && iconPosition === "right" && (
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
