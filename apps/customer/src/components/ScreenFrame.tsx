import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM, RADIUS_BUTTON } from "@/constants/layout";
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
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS_BUTTON }}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityHint="Attempts to reload the content"
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if (isEmpty && empty) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{empty.title}</Text>
        {empty.message && <Text style={{ textAlign: "center", color: Colors.gray[600] }}>{empty.message}</Text>}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.white }}
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
