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
  const { screenPadding, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const padding = noPadding ? 0 : screenPadding;
  const contentBottomPadding = TAB_BAR_BASE_HEIGHT + 24 + insets.bottom;

  const content = scrollable ? (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: "#ffffff" }}
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
    <View className="flex-1" style={{ paddingHorizontal: padding, backgroundColor: "#ffffff", minHeight: 0, ...style }}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      edges={edges}
      style={[{ backgroundColor: "#ffffff" }, style]}
    >
      {isTablet ? <View className="mx-auto w-full max-w-[1200px] flex-1 min-h-0" style={{ backgroundColor: "#ffffff", minHeight: 0 }}>{content}</View> : content}
    </SafeAreaView>
  );
}
