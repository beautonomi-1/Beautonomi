import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useCart } from "@/features/shop/useCart";

const PRIMARY = Colors.primary;

export default function ShopScreen() {
  const router = useRouter();
  const { contentPadding } = useResponsive();
  const cart = useCart();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: contentPadding,
          paddingVertical: 12,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/home" as any))}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>Shop</Text>
        <TouchableOpacity
          onPress={() => router.push("/cart" as any)}
          style={{ position: "relative" }}
          accessibilityLabel="Cart"
        >
          <Ionicons name="bag-outline" size={24} color="#111827" />
          {cart.itemCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: -6,
                right: -8,
                backgroundColor: PRIMARY,
                borderRadius: 10,
                minWidth: 18,
                height: 18,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                {cart.itemCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Message: products only per provider */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
        <View style={{ alignItems: "center", maxWidth: 320 }}>
          <Ionicons name="storefront-outline" size={56} color="#D1D5DB" />
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16, textAlign: "center" }}>
            Shop by provider
          </Text>
          <Text style={{ fontSize: 15, color: "#6B7280", marginTop: 8, textAlign: "center" }}>
            Browse providers and open their profile to see their products and shop.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/explore" as any)}
            style={{
              marginTop: 24,
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: PRIMARY,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="compass-outline" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Find a provider</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
