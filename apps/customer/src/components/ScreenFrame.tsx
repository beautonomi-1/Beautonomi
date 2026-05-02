import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM, RADIUS_BUTTON } from "@/constants/layout";
import { Colors } from "@/constants/colors";
import { useThemedColors } from "@/hooks/useThemedColors";

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
  /**
   * When false, children are wrapped in a flex View instead of ScrollView.
   * Use for screens that contain FlatList / nested vertical scroll (ScrollView inside ScrollView breaks layout).
   */
  scrollable?: boolean;
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
  scrollable = true,
}: ScreenFrameProps) {
  // §UI-audit 2026-05: ScreenFrame is the most-reused customer screen
  // shell, so making it theme-aware is the cheapest way to give the
  // Light/Dark/System picker a real visible effect across stack screens
  // without having to rewrite every individual screen at once.
  const themed = useThemedColors();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: themed.textSecondary, marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: themed.textPrimary, marginBottom: 16 }}>{error}</Text>
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
      <View style={{ flex: 1, backgroundColor: themed.surface, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: themed.textPrimary, marginBottom: 8 }}>{empty.title}</Text>
        {empty.message && <Text style={{ textAlign: "center", color: themed.textSecondary }}>{empty.message}</Text>}
      </View>
    );
  }
  if (!scrollable) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface }}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themed.surface }}
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
