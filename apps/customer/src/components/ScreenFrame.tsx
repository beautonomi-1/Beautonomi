import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM, RADIUS_BUTTON } from "@/constants/layout";
import { Colors } from "@/constants/colors";
import { useThemedColors } from "@/hooks/useThemedColors";
import { useTranslation } from "@beautonomi/i18n";
import { MiniBrandLoader } from "@/components/MiniBrandLoader";

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
  /** Optional page-shaped skeleton shown while `loading` instead of the brand loader. */
  skeleton?: React.ReactNode;
  /** Optional chrome (e.g. TrustScreenShell) kept visible during loading/error/empty. */
  header?: React.ReactNode;
}

function FrameShell({
  themed,
  header,
  scrollable,
  paddingBottom,
  refreshing,
  onRefresh,
  children,
}: {
  themed: ReturnType<typeof useThemedColors>;
  header?: React.ReactNode;
  scrollable: boolean;
  paddingBottom: number;
  refreshing: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  const bodyPadding = { padding: SCREEN_PADDING, paddingBottom };
  if (!scrollable) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface }}>
        {header}
        <View style={{ flex: 1, ...bodyPadding }}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themed.surface }}
      contentContainerStyle={bodyPadding}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        ) : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  );
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
  skeleton,
  header,
}: ScreenFrameProps) {
  const themed = useThemedColors();
  const { t } = useTranslation();

  if (loading) {
    if (skeleton) {
      return (
        <View style={{ flex: 1, backgroundColor: themed.surface }}>
          {header}
          {scrollable ? (
            <ScrollView
              contentContainerStyle={{ padding: SCREEN_PADDING, paddingBottom }}
              keyboardShouldPersistTaps="handled"
            >
              {skeleton}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, padding: SCREEN_PADDING, paddingBottom }}>{skeleton}</View>
          )}
        </View>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <MiniBrandLoader />
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ textAlign: "center", color: themed.textPrimary, marginBottom: 16 }}>{error}</Text>
          {onRetry && (
            <TouchableOpacity
              onPress={onRetry}
              style={{
                backgroundColor: Colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: RADIUS_BUTTON,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
              accessibilityHint={t("customer.mobile.screens.screenFrame.retryHint")}
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("common.retry")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
  if (isEmpty && empty) {
    return (
      <View style={{ flex: 1, backgroundColor: themed.surface }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ textAlign: "center", fontWeight: "600", color: themed.textPrimary, marginBottom: 8 }}>
            {empty.title}
          </Text>
          {empty.message && (
            <Text style={{ textAlign: "center", color: themed.textSecondary }}>{empty.message}</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <FrameShell
      themed={themed}
      header={header}
      scrollable={scrollable}
      paddingBottom={paddingBottom}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {children}
    </FrameShell>
  );
}
