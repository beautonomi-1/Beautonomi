import { View, Text } from "react-native";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * Cart tab uses a custom tabBarButton that pushes (app)/cart on press,
 * so this screen is not normally shown. Shown only if navigated here directly.
 */
export default function CartTabScreen() {
  const { contentPadding } = useResponsive();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff", padding: contentPadding }}>
      <Text style={{ fontSize: 15, color: "#6B7280", textAlign: "center" }}>
        Tap the Cart icon in the tab bar to open your cart.
      </Text>
    </View>
  );
}
