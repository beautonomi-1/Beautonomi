import { TouchableOpacity, Text, ActivityIndicator, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  haptic?: boolean;
  style?: ViewStyle;
}

const variantStyles = {
  primary: "bg-gray-900",
  secondary: "bg-indigo-600",
  danger: "bg-red-600",
  outline: "border border-gray-200 bg-white",
  ghost: "bg-transparent",
};

const textStyles = {
  primary: "text-white",
  secondary: "text-white",
  danger: "text-white",
  outline: "text-gray-900",
  ghost: "text-gray-700",
};

const sizeStyles = {
  sm: "min-h-[36px] px-4 py-2",
  md: "min-h-[48px] px-5 py-3",
  lg: "min-h-[56px] px-6 py-4",
};

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
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const iconColor = variant === "outline" || variant === "ghost" ? "#111" : "#fff";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 22 : 18;

  return (
    <TouchableOpacity
      className={`flex-row items-center justify-center rounded-xl ${variantStyles[variant]} ${sizeStyles[size]} ${
        fullWidth ? "w-full" : ""
      } ${disabled || loading ? "opacity-50" : ""}`}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon && iconPosition === "left" && (
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          )}
          <Text
            className={`text-center font-semibold ${textStyles[variant]} ${
              size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base"
            }`}
          >
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
