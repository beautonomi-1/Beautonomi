import { View, Text } from "react-native";

interface DividerProps {
  label?: string;
  className?: string;
}

export function Divider({ label, className = "" }: DividerProps) {
  if (label) {
    return (
      <View className={`flex-row items-center ${className}`}>
        <View className="h-px flex-1 bg-gray-100" />
        <Text className="mx-3 text-xs font-medium text-gray-400">
          {label}
        </Text>
        <View className="h-px flex-1 bg-gray-100" />
      </View>
    );
  }

  return <View className={`h-px bg-gray-100 ${className}`} />;
}
