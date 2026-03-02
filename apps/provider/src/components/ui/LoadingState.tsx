import { View, Text, ActivityIndicator } from "react-native";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message = "Loading...", fullScreen = true }: LoadingStateProps) {
  return (
    <View className={`items-center justify-center ${fullScreen ? "flex-1" : "py-12"}`}>
      <ActivityIndicator size="large" color="#111" />
      <Text className="mt-3 text-sm text-gray-500">{message}</Text>
    </View>
  );
}
