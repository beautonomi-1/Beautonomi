import { View, ScrollView, RefreshControl, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { Colors } from "@/constants/colors";

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Safe-area edges. Default none — main tab screens sit below `AppHeader` (status bar already handled).
   * Use `['top']` for stack routes without that header: `notifications`, `search`, `chat/[id]`,
   * `on-demand/incoming/[id]`, onboarding, etc. Omit bottom here; scroll padding uses insets in `contentBottomPadding`.
   */
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
  noPadding?: boolean;
  /** When false, omit tab-bar bottom reserve (stack-only flows such as onboarding or full-screen modals). Default true. */
  reserveTabBarSpace?: boolean;
}

export function ScreenContainer({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  edges = [],
  style,
  noPadding = false,
  reserveTabBarSpace = true,
}: ScreenContainerProps) {
  const { screenPadding, isTablet, contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const padding = noPadding ? 0 : screenPadding;
  const contentBottomPadding = reserveTabBarSpace
    ? tabScreenScrollBottomPadding(insets.bottom, 16)
    : Math.max(insets.bottom, 8) + 24;
  const tabletWrapperStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const, flex: 1, minHeight: 0, backgroundColor: "#ffffff" as const }
    : undefined;

  const content = scrollable ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: contentBottomPadding, backgroundColor: "#ffffff" }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: padding, backgroundColor: "#ffffff", minHeight: 0, ...style }}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: "#ffffff" }, style]}
    >
      {isTablet && tabletWrapperStyle ? (
        <View style={tabletWrapperStyle}>{content}</View>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
