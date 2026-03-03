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

  const sizeClasses = {
    sm: "min-h-[40px] px-3 text-sm",
    md: "min-h-[48px] px-4 text-base",
    lg: "min-h-[56px] px-4 text-lg",
  };

  const bgClass = variant === "filled" ? "bg-gray-50" : "bg-white";

  return (
    <View className="mb-4">
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">
          {label}
        </Text>
      )}
      <Animated.View
        className={`flex-row items-center rounded-xl ${bgClass}`}
        style={borderAnimatedStyle}
      >
        {leftIcon && (
          <View className="pl-3">
            <Ionicons
              name={leftIcon}
              size={18}
              color={focused ? "#111827" : "#9ca3af"}
            />
          </View>
        )}
        <TextInput
          className={`flex-1 ${sizeClasses[size]} text-gray-900`}
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
            className="min-h-[44px] min-w-[44px] items-center justify-center"
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
      {error && <Text className="mt-1 text-xs text-red-500">{error}</Text>}
      {hint && !error && (
        <Text className="mt-1 text-xs text-gray-400">{hint}</Text>
      )}
    </View>
  );
}
