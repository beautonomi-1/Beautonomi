import { View, type ViewStyle } from "react-native";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "outlined" | "filled";
  padding?: "none" | "sm" | "md" | "lg";
  style?: ViewStyle;
}

export function Card({
  children,
  variant = "default",
  padding = "md",
  style,
}: CardProps) {
  const base = { borderRadius: 16 };
  const paddingMap = { none: 0, sm: 12, md: 16, lg: 20 };
  const pad = paddingMap[padding];
  const variantStyle =
    variant === "default"
      ? { ...base, backgroundColor: "#fff", borderWidth: 1, borderColor: "#F3F4F6" }
      : variant === "elevated"
        ? { ...base, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 4 }
        : variant === "outlined"
          ? { ...base, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" }
          : { ...base, backgroundColor: "#F9FAFB" };
  return (
    <View style={[variantStyle, pad > 0 && { padding: pad }, style]}>
      {children}
    </View>
  );
}
