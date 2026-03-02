import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "folder-open-outline", title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Ionicons name={icon} size={28} color="#9ca3af" />
      </View>
      <Text className="text-center text-lg font-semibold text-gray-900">{title}</Text>
      {description && (
        <Text className="mt-2 text-center text-sm leading-5 text-gray-500">{description}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          className="mt-6 rounded-xl bg-gray-900 px-6 py-3"
          onPress={onAction}
        >
          <Text className="font-medium text-white">{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
