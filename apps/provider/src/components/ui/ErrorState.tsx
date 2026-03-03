import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message = "Something went wrong", onRetry, retryLabel = "Try Again" }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
      </View>
      <Text className="text-center text-base font-medium text-gray-900">Error</Text>
      <Text className="mt-1 text-center text-sm text-gray-500">{message}</Text>
      {onRetry && (
        <TouchableOpacity
          className="mt-6 rounded-xl bg-gray-900 px-6 py-3"
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Text className="font-medium text-white">{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
