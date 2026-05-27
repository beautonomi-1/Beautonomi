import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatCurrency } from "@/lib/format";
import { displayRetailPriceMin, effectiveStockQuantity } from "@/lib/product-inventory-metrics";
import { Colors } from "@/constants/colors";
import type { ProductItem, StockMovement } from "@/features/products/types";
import { StockAdjustSheet } from "@/features/products/StockAdjustSheet";
import { variantLabel } from "@/features/products/cartItem";
import { emitProviderProductsCatalogChanged } from "@/lib/provider-products-catalog-events";

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Sale",
  booking: "Booking",
  manual_in: "Manual in",
  manual_out: "Manual out",
  stock_count: "Stock count",
  damaged: "Damaged",
  returned: "Returned",
  received: "Received",
  sale_refund: "Refund",
  booking_revert: "Booking revert",
  initial: "Initial",
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const { data: product, loading, error, refresh } = useApi<ProductItem>(
    id ? `/api/provider/products/${id}` : "",
    { enabled: !!id },
  );
  const { data: movementsData, refresh: refreshMovements } = useApi<{ movements?: StockMovement[] }>(
    id ? `/api/provider/products/${id}/stock-movements?limit=50` : "",
    { enabled: !!id },
  );
  const { execute: deleteProduct } = useApiMutation("delete");

  const onRefresh = useCallback(() => {
    refresh();
    refreshMovements();
  }, [refresh, refreshMovements]);

  const handleDelete = () => {
    if (!product) return;
    Alert.alert("Delete product", `Delete "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await deleteProduct(`/api/provider/products/${product.id}`);
          if (err?.includes("booking")) {
            Alert.alert("Cannot delete", "Product is on bookings. Archive instead?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Archive",
                onPress: async () => {
                  await deleteProduct(`/api/provider/products/${product.id}?archive=true`);
                  emitProviderProductsCatalogChanged();
                  router.back();
                },
              },
            ]);
            return;
          }
          if (err) Alert.alert("Error", err);
          else {
            emitProviderProductsCatalogChanged();
            router.back();
          }
        },
      },
    ]);
  };

  if (loading && !product) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Product" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (error || !product) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Product" showBack />
        <ErrorState message={error ?? "Product not found"} onRetry={onRefresh} />
      </ScreenContainer>
    );
  }

  const images = product.image_urls ?? [];
  const stockQty = effectiveStockQuantity({
    has_variants: product.has_variants,
    quantity: product.quantity,
    variants: product.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
  });
  const displayPrice = displayRetailPriceMin({
    has_variants: product.has_variants,
    retail_price: product.retail_price,
    quantity: product.quantity,
    variants: product.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
  });
  const movements = movementsData?.movements ?? [];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={product.name}
        showBack
        rightAction={
          <TouchableOpacity onPress={() => router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: product.id } } as never)}>
            <Text style={{ color: "#6366f1", fontWeight: "600" }}>Edit</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        {images.length > 0 ? (
          <View>
            <Image source={{ uri: images[carouselIndex] }} style={{ width: "100%", height: 220, backgroundColor: "#f3f4f6" }} contentFit="contain" />
            {images.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: 12 }}>
                {images.map((url, idx) => (
                  <TouchableOpacity key={url} onPress={() => setCarouselIndex(idx)}>
                    <Image source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: 8, marginRight: 8, borderWidth: idx === carouselIndex ? 2 : 0, borderColor: "#6366f1" }} contentFit="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {product.brand ? <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{product.brand}</Text> : null}
            {product.sku ? <Text style={{ fontSize: 12, color: Colors.gray[500] }}>SKU {product.sku}</Text> : null}
            {product.barcode ? <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Barcode {product.barcode}</Text> : null}
            {product.is_active === false && <Text style={{ fontSize: 10, fontWeight: "700", color: "#b45309" }}>INACTIVE</Text>}
            {product.has_variants && <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338ca" }}>VARIANTS</Text>}
          </View>

          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], padding: 14, marginBottom: 16 }}>
            <Text style={{ fontWeight: "600", marginBottom: 8 }}>Pricing & inventory</Text>
            <Text style={{ color: Colors.gray[700] }}>Retail: {formatCurrency(displayPrice)}</Text>
            <Text style={{ color: Colors.gray[700] }}>Supply: {formatCurrency(Number(product.supply_price) || 0)}</Text>
            {product.markup != null && <Text style={{ color: Colors.gray[700] }}>Markup: {product.markup}%</Text>}
            <Text style={{ color: Colors.gray[700] }}>Stock: {stockQty}</Text>
            <Text style={{ color: Colors.gray[700] }}>
              Sellable: {product.retail_sales_enabled !== false && product.is_active !== false ? "Yes" : "No"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setAdjustOpen(true)}
            style={{ marginBottom: 16, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Adjust stock</Text>
          </TouchableOpacity>

          {product.has_variants && (product.variants?.length ?? 0) > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontWeight: "600", marginBottom: 8 }}>Variants</Text>
              {(product.variants ?? []).map((v, idx) => (
                <View key={v.id ?? idx} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  {v.image_url ? <Image source={{ uri: v.image_url }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }} contentFit="contain" /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "500" }}>{variantLabel(v)}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Qty {v.quantity ?? 0} · {formatCurrency(Number(v.retail_price) || 0)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: "600", marginBottom: 8 }}>Stock history</Text>
            {movements.length === 0 ? (
              <Text style={{ color: Colors.gray[500] }}>No movements yet.</Text>
            ) : (
              movements.map((m) => (
                <View key={m.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "500" }}>{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</Text>
                    <Text style={{ fontWeight: "600", color: m.quantity_delta >= 0 ? "#16a34a" : "#dc2626" }}>
                      {m.quantity_delta >= 0 ? "+" : ""}{m.quantity_delta}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                    After: {m.quantity_after}
                    {m.reason ? ` · ${m.reason}` : ""}
                    {m.created_at ? ` · ${formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity onPress={() => setMenuOpen(true)} style={{ alignItems: "center", paddingVertical: 12 }}>
            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <StockAdjustSheet
        visible={adjustOpen}
        product={product}
        onClose={() => setAdjustOpen(false)}
        onSuccess={() => { onRefresh(); emitProviderProductsCatalogChanged(); }}
      />

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Actions">
        <TouchableOpacity onPress={() => { setMenuOpen(false); handleDelete(); }} style={{ paddingVertical: 14 }}>
          <Text style={{ color: "#dc2626", fontSize: 16 }}>Delete product</Text>
        </TouchableOpacity>
      </BottomSheet>
    </ScreenContainer>
  );
}
