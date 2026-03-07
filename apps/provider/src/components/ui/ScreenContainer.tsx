import { View, ScrollView, RefreshControl, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { TAB_BAR_BASE_HEIGHT } from "@/constants/layout";

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
  noPadding?: boolean;
}

export function ScreenContainer({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  edges = ["top"],
  style,
  noPadding = false,
}: ScreenContainerProps) {
  const { screenPadding, isTablet, contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const padding = noPadding ? 0 : screenPadding;
  const contentBottomPadding = TAB_BAR_BASE_HEIGHT + 24 + insets.bottom;
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111" />
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
