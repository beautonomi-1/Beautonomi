import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  type TextInputProps,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "filled";
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  size = "md",
  variant = "default",
  value,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const focusProgress = useSharedValue(0);

  const handleFocus = (
    e: Parameters<NonNullable<TextInputProps["onFocus"]>>[0],
  ) => {
    setFocused(true);
    focusProgress.value = withSpring(1, { damping: 14, stiffness: 120 });
    onFocus?.(e);
  };

  const handleBlur = (
    e: Parameters<NonNullable<TextInputProps["onBlur"]>>[0],
  ) => {
    setFocused(false);
    focusProgress.value = withSpring(0, { damping: 14, stiffness: 120 });
    onBlur?.(e);
  };

  const borderAnimatedStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? interpolateColor(
          focusProgress.value,
          [0, 1],
          ["#fca5a5", "#ef4444"],
        )
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          ["#e5e7eb", "#111827"],
        );
    return { borderWidth: 1.5, borderColor };
  });

  const sizeStyle = size === "sm" ? { minHeight: 40, paddingHorizontal: 12, fontSize: 14 } : size === "md" ? { minHeight: 48, paddingHorizontal: 16, fontSize: 16 } : { minHeight: 56, paddingHorizontal: 16, fontSize: 18 };
  const backgroundColor = variant === "filled" ? "#F9FAFB" : "#fff";

  return (
    <View style={{ marginBottom: 16 }}>
      {label && (
        <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: "#374151" }}>
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          { flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor },
          borderAnimatedStyle,
        ]}
      >
        {leftIcon && (
          <View style={{ paddingLeft: 12 }}>
            <Ionicons
              name={leftIcon}
              size={18}
              color={focused ? "#111827" : "#9ca3af"}
            />
          </View>
        )}
        <TextInput
          style={{ flex: 1, ...sizeStyle, color: "#111827" }}
          placeholderTextColor="#9ca3af"
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={label}
          {...rest}
        />
        {rightIcon && (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
            hitSlop={8}
            accessibilityLabel={`${label} action`}
          >
            <Ionicons
              name={rightIcon}
              size={18}
              color={focused ? "#111827" : "#9ca3af"}
            />
          </TouchableOpacity>
        )}
      </Animated.View>
      {error && <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>{error}</Text>}
      {hint && !error && <Text style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>{hint}</Text>}
    </View>
  );
}
