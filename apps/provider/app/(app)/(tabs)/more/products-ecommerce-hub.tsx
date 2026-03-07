import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  retail_price?: number;
  stock_quantity?: number;
};

type ProductsResponse = {
  products?: Product[];
  total?: number;
};

export default function ProductsEcommerceHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<ProductsResponse>(
    "/api/provider/products?limit=100"
  );

  const products: Product[] = (data as ProductsResponse)?.products ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Products & e-commerce"
        subtitle="Inventory, orders & sales"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row" }}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
              style={{ flex: 1, marginRight: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#ede9fe" }}>
                <Ionicons name="cube-outline" size={22} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Products & inventory</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Manage catalog & stock</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-orders" as never)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16, marginBottom: 12 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#ccfbf1" }}>
                <Ionicons name="receipt-outline" size={22} color="#0d9488" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Product orders</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>View & fulfill orders</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/shipping-config" as never)}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            activeOpacity={0.7}
          >
            <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#f1f5f9" }}>
              <Ionicons name="car-outline" size={22} color="#475569" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Shipping & collection</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Delivery and collection options</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        {products.length === 0 ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="cube-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No products yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              Add your first product in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}
              style={{ borderRadius: 12, backgroundColor: "#7c3aed", paddingHorizontal: 24, paddingVertical: 12 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            <Text style={{ marginBottom: 8, paddingHorizontal: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[500] }}>Recent products</Text>
            {products.slice(0, 10).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: p.id } } as never)}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{p.name}</Text>
                  {p.sku && (
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>SKU: {p.sku}</Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {typeof p.retail_price === "number" && (
                    <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>
                      ZAR {p.retail_price.toLocaleString()}
                    </Text>
                  )}
                  {p.stock_quantity != null && (
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Stock: {p.stock_quantity}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#9ca3af" style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
            ))}
            {products.length > 10 && (
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ textAlign: "center", fontWeight: "500", color: "#7c3aed" }}>View all products</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
