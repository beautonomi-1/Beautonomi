import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ListItemProps {
  title: string;
  subtitle?: string;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  borderBottom?: boolean;
}

export function ListItem({
  title,
  subtitle,
  leftContent,
  rightContent,
  showChevron = true,
  onPress,
  borderBottom = true,
}: ListItemProps) {
  return (
    <TouchableOpacity
      className={`flex-row items-center py-3.5 ${borderBottom ? "border-b border-gray-100" : ""}`}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {leftContent && <View className="mr-3">{leftContent}</View>}
      <View className="flex-1">
        <Text className="text-base font-medium text-gray-900" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text className="mt-0.5 text-sm text-gray-500" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightContent && <View className="ml-2">{rightContent}</View>}
      {showChevron && onPress && (
        <Ionicons name="chevron-forward" size={18} color="#9ca3af" style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );
}
