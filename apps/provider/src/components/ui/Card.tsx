import { View, type ViewStyle } from "react-native";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "outlined" | "filled";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  style?: ViewStyle;
}

const variantClasses = {
  default: "rounded-2xl bg-white border border-gray-100",
  elevated: "rounded-2xl bg-white shadow-md shadow-black/5",
  outlined: "rounded-2xl bg-white border border-gray-200",
  filled: "rounded-2xl bg-gray-50",
};

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({
  children,
  variant = "default",
  padding = "md",
  className = "",
  style,
}: CardProps) {
  return (
    <View
      className={`${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      style={style}
    >
      {children}
    </View>
  );
}
