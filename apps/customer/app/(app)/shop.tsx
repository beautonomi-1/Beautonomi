import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Shadows } from "@/constants/colors";
import {
  useProductCatalog,
  type CatalogProduct,
  type CatalogFilters,
} from "@/features/shop/useProductCatalog";
import { useCart } from "@/features/shop/useCart";

const PRIMARY = Colors.primary;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low" },
  { value: "price_desc", label: "Price: High" },
  { value: "name", label: "A-Z" },
] as const;

function formatPrice(price: number) {
  return `R${price.toFixed(2)}`;
}

function ProductCard({
  product,
  onPress,
  onAddToCart,
}: {
  product: CatalogProduct;
  onPress: () => void;
  onAddToCart: () => void;
}) {
  const imageUri = product.image_urls?.[0];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        margin: 6,
        borderRadius: 16,
        backgroundColor: "#fff",
        overflow: "hidden",
        ...Shadows.card,
      }}
      activeOpacity={0.85}
      accessibilityLabel={product.name}
    >
      <View style={{ aspectRatio: 1, backgroundColor: "#F3F4F6" }}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="cube-outline" size={40} color="#D1D5DB" />
          </View>
        )}
      </View>
      <View style={{ padding: 12 }}>
        {product.brand ? (
          <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 2 }}>
            {product.brand}
          </Text>
        ) : null}
        <Text
          style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 4 }}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <Text
          style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}
          numberOfLines={1}
        >
          {product.provider?.business_name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: PRIMARY }}>
            {formatPrice(product.retail_price)}
          </Text>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onAddToCart();
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: PRIMARY,
              alignItems: "center",
              justifyContent: "center",
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Add to cart"
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const catalog = useProductCatalog();
  const cart = useCart();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CatalogFilters["sort"]>("newest");

  useEffect(() => {
    catalog.initialLoad();
  }, []);

  const handleFilter = useCallback(
    (overrides?: Partial<CatalogFilters>) => {
      catalog.applyFilters({
        search: (overrides?.search ?? search) ?? null,
        category: overrides?.category !== undefined ? overrides.category : selectedCategory,
        sort: overrides?.sort ?? sortBy,
      });
    },
    [search, selectedCategory, sortBy, catalog.applyFilters],
  );

  const handleCategoryPress = useCallback(
    (cat: string | null) => {
      setSelectedCategory(cat);
      handleFilter({ category: cat });
    },
    [handleFilter],
  );

  const handleSearch = useCallback(() => {
    handleFilter({ search: search || null });
  }, [search, handleFilter]);

  const handleSort = useCallback(
    (s: CatalogFilters["sort"]) => {
      setSortBy(s);
      handleFilter({ sort: s });
    },
    [handleFilter],
  );

  const handleAddToCart = useCallback(
    async (product: CatalogProduct) => {
      const result = await cart.addToCart(product.id, 1);
      if (result.error) {
        // Could show toast here
      }
    },
    [cart.addToCart],
  );

  const renderItem = useCallback(
    ({ item }: { item: CatalogProduct }) => (
      <ProductCard
        product={item}
        onPress={() => router.push(`/product-detail?id=${item.id}` as any)}
        onAddToCart={() => handleAddToCart(item)}
      />
    ),
    [router, handleAddToCart],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
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

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#fff" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#F3F4F6",
            borderRadius: 12,
            paddingHorizontal: 14,
          }}
        >
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder="Search products..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity
              onPress={() => {
                setSearch("");
                handleFilter({ search: null });
              }}
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category chips */}
      <View style={{ backgroundColor: "#fff", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          data={[null, ...catalog.categories]}
          keyExtractor={(c) => c ?? "all"}
          renderItem={({ item: cat }) => {
            const active = cat === selectedCategory || (cat === null && !selectedCategory);
            return (
              <TouchableOpacity
                onPress={() => handleCategoryPress(cat)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  marginRight: 8,
                  backgroundColor: active ? PRIMARY : "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: active ? "#fff" : "#6B7280",
                  }}
                >
                  {cat ?? "All"}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Sort chips */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, marginTop: 8 }}
          data={SORT_OPTIONS}
          keyExtractor={(s) => s.value}
          renderItem={({ item: s }) => {
            const active = sortBy === s.value;
            return (
              <TouchableOpacity
                onPress={() => handleSort(s.value as CatalogFilters["sort"])}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor: active ? PRIMARY : "#E5E7EB",
                  backgroundColor: active ? "rgba(255,0,119,0.06)" : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "500",
                    color: active ? PRIMARY : "#6B7280",
                  }}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Product grid */}
      {catalog.loading && !catalog.refreshing ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : catalog.error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 15, color: "#6B7280", marginTop: 12, textAlign: "center" }}>
            {catalog.error}
          </Text>
          <TouchableOpacity
            onPress={catalog.refetch}
            style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: PRIMARY }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : catalog.products.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 15, color: "#6B7280", marginTop: 12 }}>No products found</Text>
        </View>
      ) : (
        <FlatList
          data={catalog.products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={{
            padding: 10,
            ...(Platform.OS === "web" ? { maxWidth: 800, alignSelf: "center", width: "100%" } as any : {}),
          }}
          renderItem={renderItem}
          onEndReached={catalog.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={catalog.refreshing} onRefresh={catalog.refetch} tintColor={PRIMARY} />
          }
          ListFooterComponent={
            catalog.loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 20 }} color={PRIMARY} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
