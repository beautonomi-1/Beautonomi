import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StockAdjustSheet } from "@/features/products/StockAdjustSheet";
import type { ProductItem } from "@/features/products/types";
import { Colors } from "@/constants/colors";
import { formatCurrency } from "@/lib/format";
import {
  PROVIDER_PRODUCTS_CATALOG_CHANGED,
  emitProviderProductsCatalogChanged,
} from "@/lib/provider-products-catalog-events";

interface InventoryProduct {
  id: string;
  name: string;
  category?: string | null;
  retail_price: number;
  quantity?: number;
  low_stock_level?: number;
  track_stock_quantity?: boolean;
  is_active?: boolean;
  /** When true, quantity is per variant — use full product editor */
  has_variants?: boolean;
}

interface InventoryResponse {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalStockValue: number;
  lowStockProducts: InventoryProduct[];
  outOfStockProducts: InventoryProduct[];
  categoryBreakdown: { category: string; count: number; stockValue: number }[];
  allProducts?: InventoryProduct[];
}

/** Content-only for use in Products hub (Inventory tab). */
export function InventoryContent() {
  const { t } = useTranslation();
  const inv = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.inventory.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<ProductItem | null>(null);

  const { data, loading, error, refresh } = useApi<InventoryResponse>(
    "/api/provider/reports/products/inventory"
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const openAdjust = useCallback(
    (p: InventoryProduct) => {
      if (p.has_variants) {
        Alert.alert(
          inv("variantsTitle"),
          inv("variantsBody"),
          [
            { text: inv("cancel"), style: "cancel" },
            {
              text: inv("openEditor"),
              onPress: () =>
                router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: p.id } } as never),
            },
          ]
        );
        return;
      }
      setAdjustProduct(p as ProductItem);
    },
    [inv, router]
  );

  const closeAdjust = useCallback(() => {
    setAdjustProduct(null);
  }, []);

  if (loading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const totalProducts = data?.totalProducts ?? 0;
  const totalStockValue = data?.totalStockValue ?? 0;
  const lowStock = data?.lowStockProducts ?? [];
  const outOfStock = data?.outOfStockProducts ?? [];
  const categories = data?.categoryBreakdown ?? [];

  return (
    <>
    <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 24, flexDirection: "row" }}>
          <View style={{ flex: 1, marginEnd: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ marginBottom: 4, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#d1fae5" }}>
              <Ionicons name="cube-outline" size={18} color="#059669" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{totalProducts}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{inv("totalProducts")}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ marginBottom: 4, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#dbeafe" }}>
              <Ionicons name="cash-outline" size={18} color="#2563eb" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{formatCurrency(Number(totalStockValue))}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{inv("stockValue")}</Text>
          </View>
        </View>

        {outOfStock.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: "#b91c1c" }}>{inv("outOfStock")}</Text>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "rgba(254,242,242,0.5)", padding: 12 }}>
              {outOfStock.slice(0, 10).map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => openAdjust(p)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 8,
                    borderBottomWidth: idx < Math.min(10, outOfStock.length) - 1 ? 1 : 0,
                    borderBottomColor: "rgba(254,202,202,0.5)",
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>{p.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: "#dc2626", marginEnd: 6 }}>{inv("zeroLeft")}</Text>
                    <Ionicons name="create-outline" size={14} color="#6b7280" />
                  </View>
                </TouchableOpacity>
              ))}
              {outOfStock.length > 10 && (
                <Text style={{ paddingTop: 4, fontSize: 12, color: Colors.gray[500] }}>{inv("moreCount", { count: outOfStock.length - 10 })}</Text>
              )}
            </View>
          </View>
        )}

        {lowStock.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: "#b45309" }}>{inv("lowStock")}</Text>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#fef3c7", backgroundColor: "rgba(255,251,235,0.5)", padding: 12 }}>
              {lowStock.slice(0, 10).map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => openAdjust(p)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 8,
                    borderBottomWidth: idx < Math.min(10, lowStock.length) - 1 ? 1 : 0,
                    borderBottomColor: "rgba(254,243,199,0.5)",
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>{p.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: "#b45309", marginEnd: 6 }}>
                      {inv("lowStockAlert", { quantity: Number(p.quantity ?? 0), level: Number(p.low_stock_level ?? 5) })}
                    </Text>
                    <Ionicons name="create-outline" size={14} color="#6b7280" />
                  </View>
                </TouchableOpacity>
              ))}
              {lowStock.length > 10 && (
                <Text style={{ paddingTop: 4, fontSize: 12, color: Colors.gray[500] }}>{inv("moreCount", { count: lowStock.length - 10 })}</Text>
              )}
            </View>
          </View>
        )}

        {categories.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>{inv("byCategory")}</Text>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}>
              {categories.slice(0, 15).map((c, idx) => (
                <View
                  key={c.category}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottomWidth: idx < Math.min(15, categories.length) - 1 ? 1 : 0,
                    borderBottomColor: Colors.gray[100],
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{c.category}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginEnd: 12 }}>{inv("itemsCount", { count: c.count })}</Text>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{formatCurrency(Number(c.stockValue))}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {totalProducts === 0 && (
          <View style={{ alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 32 }}>
            <View style={{ marginBottom: 12, height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#d1fae5" }}>
              <Ionicons name="archive-outline" size={28} color="#059669" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.gray[900] }}>{inv("emptyTitle")}</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {inv("emptyBody")}
            </Text>
          </View>
        )}
      </ScrollView>

      <StockAdjustSheet
        visible={!!adjustProduct}
        product={adjustProduct}
        onClose={closeAdjust}
        onSuccess={async () => {
          emitProviderProductsCatalogChanged();
          await refresh();
        }}
      />
    </>
  );
}

export default function InventoryScreen() {
  const { t } = useTranslation();
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={t("provider.mobile.screens.inventory.title") as string}
        showBack
        subtitle={t("provider.mobile.screens.inventory.subtitle") as string}
      />
      <InventoryContent />
    </ScreenContainer>
  );
}
