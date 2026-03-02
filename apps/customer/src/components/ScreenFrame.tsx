import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Colors } from "@/constants/colors";

interface ScreenFrameProps {
  title?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  empty?: { title: string; message?: string };
  isEmpty?: boolean;
  /** Override bottom padding (default: STACK_CONTENT_PADDING_BOTTOM) */
  paddingBottom?: number;
  /** Pull-to-refresh state */
  refreshing?: boolean;
  /** Pull-to-refresh callback */
  onRefresh?: () => void;
}

export function ScreenFrame({
  loading,
  error,
  onRetry,
  children,
  empty,
  isEmpty,
  paddingBottom = STACK_CONTENT_PADDING_BOTTOM,
  refreshing = false,
  onRefresh,
}: ScreenFrameProps) {
  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            className="bg-primary px-6 py-3 rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityHint="Attempts to reload the content"
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if (isEmpty && empty) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center font-semibold text-gray-900 mb-2">{empty.title}</Text>
        {empty.message && <Text className="text-center text-gray-600">{empty.message}</Text>}
      </View>
    );
  }
  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: SCREEN_PADDING, paddingBottom }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
