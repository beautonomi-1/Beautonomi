import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@beautonomi/i18n";
import {
  bookingCheckoutLineDisplayName,
  findSelectedLine,
  isCatalogLineOutOfStock,
  labelForVariantOptionValues,
  stockForCatalogLine,
  unitPriceForCatalogLine,
  variantOptionTypeLabel,
  type CheckoutCatalogProduct,
  type SelectedCheckoutProduct,
} from "@/lib/booking-checkout-products";

const PRODUCT_PAGE = 12;
const MANY_PRODUCTS = 12;
const MANY_CATEGORY_PILLS = 10;

type BookingProductPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  productsList: CheckoutCatalogProduct[];
  selectedProducts: SelectedCheckoutProduct[];
  onSelectedProductsChange: React.Dispatch<React.SetStateAction<SelectedCheckoutProduct[]>>;
  selectedVariantIdByProduct: Record<string, string>;
  onSelectedVariantIdByProductChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formatCurrency: (amount: number, currency?: string) => string;
  focusProductId?: string | null;
  focusProductVariantId?: string | null;
};

function ProductVariantEditor({
  prod,
  chosenVid,
  selectedProducts,
  onSelectedProductsChange,
  onSelectedVariantIdByProductChange,
  formatCurrency,
  onBack,
  onClose,
  t,
}: {
  prod: CheckoutCatalogProduct;
  chosenVid: string | null;
  selectedProducts: SelectedCheckoutProduct[];
  onSelectedProductsChange: React.Dispatch<React.SetStateAction<SelectedCheckoutProduct[]>>;
  onSelectedVariantIdByProductChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formatCurrency: (amount: number, currency?: string) => string;
  onBack: () => void;
  onClose: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const lineVariantKey = prod.hasVariants ? chosenVid : null;
  const cur = findSelectedLine(selectedProducts, prod.id, lineVariantKey);
  const qty = cur?.quantity ?? 0;
  const unitPrice = unitPriceForCatalogLine(prod, chosenVid);
  const track = prod.track_stock_quantity;
  const stock = stockForCatalogLine(prod, chosenVid);
  const isOut = isCatalogLineOutOfStock(prod, chosenVid);
  const atMax = track && qty > 0 && qty >= stock;

  const adjustQty = (delta: number) => {
    haptic.selection();
    if (delta < 0) {
      if (qty <= 0) return;
      onSelectedProductsChange((prev) => {
        const key = String(lineVariantKey ?? "");
        const matchesLine = (s: SelectedCheckoutProduct) =>
          s.productId === prod.id && String(s.productVariantId ?? "") === key;
        const line = prev.find(matchesLine);
        if (!line || line.quantity <= 0) return prev;
        if (line.quantity === 1) return prev.filter((s) => !matchesLine(s));
        return prev.map((s) => (matchesLine(s) ? { ...s, quantity: s.quantity - 1 } : s));
      });
      return;
    }
    if (isOut || atMax) return;
    if (qty === 0) {
      const vidForLine = prod.hasVariants ? (chosenVid ?? prod.defaultVariantId) : null;
      const priceAdd = unitPriceForCatalogLine(prod, vidForLine);
      onSelectedProductsChange((prev) => [
        ...prev,
        {
          productId: prod.id,
          productVariantId: vidForLine ?? null,
          name: bookingCheckoutLineDisplayName(prod.name, vidForLine, prod.variants),
          price: priceAdd,
          quantity: 1,
          currency: prod.currency,
        },
      ]);
    } else {
      onSelectedProductsChange((prev) => {
        const key = String(lineVariantKey ?? "");
        const matchesLine = (s: SelectedCheckoutProduct) =>
          s.productId === prod.id && String(s.productVariantId ?? "") === key;
        return prev.map((s) => (matchesLine(s) ? { ...s, quantity: s.quantity + 1 } : s));
      });
    }
  };

  return (
    <View>
      <TouchableOpacity
        onPress={onBack}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, marginLeft: 2 }}>
          {t("common.back")}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
        {prod.name}
      </Text>
      <Text style={{ fontSize: 15, color: "#6B7280", marginBottom: 12 }}>
        {formatCurrency(unitPrice, prod.currency)}
        {track && stock > 0 ? (
          <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
            {` · ${t("booking.productInStock", { count: stock })}`}
          </Text>
        ) : null}
      </Text>

      {prod.hasVariants && prod.variants && prod.variants.length > 0 && prod.variantOptionTypes.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          {prod.variantOptionTypes.map((rawOpt) => {
            const optTypeName = variantOptionTypeLabel(rawOpt);
            if (!optTypeName) return null;
            const uniqueVals = Array.from(
              new Set(
                prod
                  .variants!.map((v) => v.option_values?.[optTypeName])
                  .filter((x): x is string => Boolean(x)),
              ),
            );
            if (uniqueVals.length === 0) return null;
            return (
              <View key={optTypeName} style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "#6B7280",
                    marginBottom: 8,
                    textTransform: "capitalize",
                  }}
                >
                  {optTypeName}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {uniqueVals.map((val) => {
                    const matchingVariant = prod.variants!.find(
                      (v) => v.option_values?.[optTypeName] === val,
                    );
                    const isChosen = chosenVid
                      ? prod.variants!.find((v) => v.id === chosenVid)?.option_values?.[optTypeName] ===
                        val
                      : matchingVariant?.id === prod.variants![0]?.id;
                    const variantOos =
                      track && (matchingVariant?.quantity ?? 0) === 0;
                    return (
                      <TouchableOpacity
                        key={`${optTypeName}-${val}`}
                        disabled={variantOos}
                        onPress={() => {
                          haptic.selection();
                          const target = prod.variants!.find(
                            (v) => v.option_values?.[optTypeName] === val,
                          );
                          if (target) {
                            onSelectedVariantIdByProductChange((prev) => ({
                              ...prev,
                              [prod.id]: target.id,
                            }));
                          }
                        }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: isChosen ? Colors.primary : "#E5E7EB",
                          backgroundColor: isChosen ? Colors.primaryLight : "#FFF",
                          marginRight: 8,
                          marginBottom: 8,
                          opacity: variantOos ? 0.4 : 1,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "500",
                            color: isChosen ? Colors.primary : "#374151",
                          }}
                        >
                          {val}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : prod.hasVariants && prod.variants && prod.variants.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 8 }}>
            {t("booking.productVariantOptionsHeading")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row" }}>
              {prod.variants.map((v) => {
                const lab =
                  labelForVariantOptionValues(v.option_values) ||
                  t("booking.productVariantFallback");
                const isChosen = chosenVid === v.id;
                const variantOos = track && (v.quantity ?? 0) === 0;
                return (
                  <TouchableOpacity
                    key={v.id}
                    disabled={variantOos}
                    onPress={() => {
                      haptic.selection();
                      onSelectedVariantIdByProductChange((prev) => ({ ...prev, [prod.id]: v.id }));
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isChosen ? Colors.primary : "#E5E7EB",
                      backgroundColor: isChosen ? Colors.primaryLight : "#FFF",
                      marginRight: 8,
                      opacity: variantOos ? 0.4 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "500",
                        color: isChosen ? Colors.primary : "#374151",
                      }}
                    >
                      {lab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        {isOut ? (
          <Text style={{ fontSize: 14, color: "#9CA3AF", fontWeight: "600" }}>
            {t("booking.productOutOfStock")}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => adjustQty(-1)}
              disabled={qty <= 0}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "#E5E7EB",
                alignItems: "center",
                justifyContent: "center",
                opacity: qty <= 0 ? 0.5 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("checkout.decreaseQuantity")}
            >
              <Ionicons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <Text
              style={{
                minWidth: 40,
                textAlign: "center",
                fontSize: 18,
                fontWeight: "700",
                color: "#111827",
                marginHorizontal: 16,
              }}
            >
              {qty}
            </Text>
            <TouchableOpacity
              onPress={() => adjustQty(1)}
              disabled={isOut || atMax}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                opacity: isOut || atMax ? 0.45 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("checkout.increaseQuantity")}
            >
              <Ionicons name="add" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => {
          haptic.success();
          onClose();
        }}
        style={{
          marginTop: 16,
          paddingVertical: 14,
          borderRadius: 12,
          backgroundColor: Colors.primary,
          alignItems: "center",
        }}
        accessibilityRole="button"
        accessibilityLabel={t("checkout.productPickerDone")}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>
          {t("checkout.productPickerDone")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function BookingProductPickerSheet({
  visible,
  onClose,
  productsList,
  selectedProducts,
  onSelectedProductsChange,
  selectedVariantIdByProduct,
  onSelectedVariantIdByProductChange,
  formatCurrency,
  focusProductId,
  focusProductVariantId,
}: BookingProductPickerSheetProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PRODUCT_PAGE);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

  const categoryPills = useMemo(() => {
    const named = new Set<string>();
    let hasUncat = false;
    for (const p of productsList) {
      const c = p.category?.trim();
      if (c) named.add(c);
      else hasUncat = true;
    }
    const sorted = [...named].sort((a, b) => a.localeCompare(b));
    return ["All", ...sorted, ...(hasUncat ? ["Other"] : [])] as string[];
  }, [productsList]);

  const filteredProducts = useMemo(() => {
    let list =
      category === "All"
        ? productsList
        : category === "Other"
          ? productsList.filter((p) => !p.category?.trim())
          : productsList.filter((p) => (p.category || "").trim() === category);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [productsList, category, search]);

  const displayedCategoryPills = useMemo(() => {
    const q = categoryFilter.trim().toLowerCase();
    let list = categoryPills;
    if (q && categoryPills.length >= MANY_CATEGORY_PILLS) {
      list = categoryPills.filter((label) => label.toLowerCase().includes(q));
    }
    if (category !== "All" && !list.includes(category)) {
      list = [category, ...list];
    }
    return list;
  }, [categoryPills, categoryFilter, category]);

  const visibleRows = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  );

  const showSearch =
    productsList.length >= MANY_PRODUCTS || filteredProducts.length >= MANY_PRODUCTS;
  const showCategoryFilter = categoryPills.length >= MANY_CATEGORY_PILLS;

  const detailProduct = detailProductId
    ? productsList.find((p) => p.id === detailProductId)
    : undefined;

  useEffect(() => {
    if (!visible) {
      setDetailProductId(null);
      setSearch("");
      setCategoryFilter("");
      setCategory("All");
      setVisibleCount(PRODUCT_PAGE);
      return;
    }
    if (focusProductId) {
      const prod = productsList.find((p) => p.id === focusProductId);
      if (prod) {
        setDetailProductId(prod.id);
        if (focusProductVariantId && prod.variants?.some((v) => v.id === focusProductVariantId)) {
          onSelectedVariantIdByProductChange((prev) => ({
            ...prev,
            [prod.id]: focusProductVariantId,
          }));
        }
        const cat = prod.category?.trim();
        if (cat) setCategory(cat);
        else if (categoryPills.includes("Other")) setCategory("Other");
      }
    }
  }, [
    visible,
    focusProductId,
    focusProductVariantId,
    productsList,
    categoryPills,
    onSelectedVariantIdByProductChange,
  ]);

  useEffect(() => {
    if (categoryPills.length <= 1) return;
    if (!categoryPills.includes(category)) setCategory("All");
  }, [categoryPills, category]);

  useEffect(() => {
    setVisibleCount(PRODUCT_PAGE);
  }, [category, search]);

  const quickAddSimple = useCallback(
    (prod: CheckoutCatalogProduct) => {
      haptic.selection();
      if (isCatalogLineOutOfStock(prod, null)) return;
      const existing = findSelectedLine(selectedProducts, prod.id, null);
      if (existing) {
        const stock = stockForCatalogLine(prod, null);
        if (prod.track_stock_quantity && existing.quantity >= stock) return;
        onSelectedProductsChange((prev) =>
          prev.map((s) =>
            s.productId === prod.id && String(s.productVariantId ?? "") === ""
              ? { ...s, quantity: s.quantity + 1 }
              : s,
          ),
        );
      } else {
        onSelectedProductsChange((prev) => [
          ...prev,
          {
            productId: prod.id,
            productVariantId: null,
            name: prod.name,
            price: prod.retail_price,
            quantity: 1,
            currency: prod.currency,
          },
        ]);
      }
    },
    [onSelectedProductsChange, selectedProducts],
  );

  const openProduct = useCallback((prod: CheckoutCatalogProduct) => {
    haptic.selection();
    if (prod.hasVariants) {
      setDetailProductId(prod.id);
      return;
    }
    quickAddSimple(prod);
  }, [quickAddSimple]);

  const selectedCount = selectedProducts.reduce((s, p) => s + p.quantity, 0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={detailProduct ? detailProduct.name : t("checkout.productPickerTitle")}
      subtitle={
        detailProduct
          ? undefined
          : selectedCount > 0
            ? t("checkout.productsInCart", { count: selectedCount })
            : t("checkout.browseProducts", { count: productsList.length })
      }
      snapHeight="full"
    >
      {detailProduct ? (
        <ProductVariantEditor
          prod={detailProduct}
          chosenVid={
            selectedVariantIdByProduct[detailProduct.id] ?? detailProduct.defaultVariantId ?? null
          }
          selectedProducts={selectedProducts}
          onSelectedProductsChange={onSelectedProductsChange}
          onSelectedVariantIdByProductChange={onSelectedVariantIdByProductChange}
          formatCurrency={formatCurrency}
          onBack={() => setDetailProductId(null)}
          onClose={onClose}
          t={t}
        />
      ) : (
        <View>
          {categoryPills.length > 1 && (
            <View style={{ marginBottom: 12 }}>
              {showCategoryFilter && (
                <TextInput
                  value={categoryFilter}
                  onChangeText={setCategoryFilter}
                  placeholder={t("booking.filterCategoriesPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  style={{
                    backgroundColor: "#FFF",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: "#111827",
                    marginBottom: 10,
                  }}
                />
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {displayedCategoryPills.map((label) => {
                  const active = category === label;
                  return (
                    <TouchableOpacity
                      key={label}
                      onPress={() => {
                        haptic.selection();
                        setCategory(label);
                        setSearch("");
                      }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 999,
                        marginRight: 8,
                        backgroundColor: active ? Colors.primary : "#FFF",
                        borderWidth: 1,
                        borderColor: active ? Colors.primary : "#E5E7EB",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: active ? "#FFF" : "#374151",
                        }}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {showSearch && (
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("booking.searchProductsPlaceholder")}
              placeholderTextColor="#9CA3AF"
              style={{
                backgroundColor: "#FFF",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: "#111827",
                marginBottom: 12,
              }}
            />
          )}

          {filteredProducts.length === 0 ? (
            <Text style={{ fontSize: 13, color: "#6B7280", paddingVertical: 16, textAlign: "center" }}>
              {t("checkout.noMatchingProducts")}
            </Text>
          ) : (
            <>
              {visibleRows.length < filteredProducts.length && (
                <Text style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                  {t("booking.servicesPaginationSummary", {
                    shown: visibleRows.length,
                    total: filteredProducts.length,
                  })}
                </Text>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
                {visibleRows.map((prod) => {
                  const simpleLine = !prod.hasVariants
                    ? findSelectedLine(selectedProducts, prod.id, null)
                    : undefined;
                  const simpleQty = simpleLine?.quantity ?? 0;
                  const chosenVid =
                    selectedVariantIdByProduct[prod.id] ?? prod.defaultVariantId ?? null;
                  const unitPrice = unitPriceForCatalogLine(prod, prod.hasVariants ? chosenVid : null);
                  const isOut = isCatalogLineOutOfStock(
                    prod,
                    prod.hasVariants ? chosenVid : null,
                  );

                  return (
                    <Pressable
                      key={prod.id}
                      onPress={() => openProduct(prod)}
                      style={{
                        width: "50%",
                        paddingHorizontal: 6,
                        marginBottom: 12,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t("checkout.addProductA11y", { name: prod.name })}
                    >
                      <View
                        style={{
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: simpleQty > 0 ? Colors.primary : "#E5E7EB",
                          backgroundColor: "#FFF",
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            aspectRatio: 1,
                            backgroundColor: "#F9FAFB",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {prod.imageUrl ? (
                            <Image
                              source={{ uri: prod.imageUrl }}
                              style={{ width: "100%", height: "100%" }}
                              contentFit="contain"
                            />
                          ) : (
                            <Ionicons name="bag-outline" size={32} color="#D1D5DB" />
                          )}
                          {isOut && (
                            <View
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: "rgba(0,0,0,0.45)",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "600" }}>
                                {t("booking.productOutOfStock")}
                              </Text>
                            </View>
                          )}
                          {simpleQty > 0 && (
                            <View
                              style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                minWidth: 22,
                                height: 22,
                                borderRadius: 11,
                                backgroundColor: Colors.primary,
                                alignItems: "center",
                                justifyContent: "center",
                                paddingHorizontal: 6,
                              }}
                            >
                              <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "700" }}>
                                {simpleQty}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ padding: 10 }}>
                          <Text
                            style={{ fontSize: 13, fontWeight: "600", color: "#111827", minHeight: 36 }}
                            numberOfLines={2}
                          >
                            {prod.name}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginTop: 6,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>
                              {formatCurrency(unitPrice, prod.currency)}
                            </Text>
                            {!prod.hasVariants && !isOut && (
                              <TouchableOpacity
                                onPress={() => quickAddSimple(prod)}
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  backgroundColor: Colors.primaryLight,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t("checkout.addProductA11y", { name: prod.name })}
                              >
                                <Ionicons name="add" size={18} color={Colors.primary} />
                              </TouchableOpacity>
                            )}
                            {prod.hasVariants && (
                              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                            )}
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {visibleCount < filteredProducts.length && (
                <TouchableOpacity
                  onPress={() => {
                    haptic.selection();
                    setVisibleCount((c) => Math.min(c + PRODUCT_PAGE, filteredProducts.length));
                  }}
                  style={{
                    marginTop: 4,
                    marginBottom: 12,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>
                    {t("booking.loadMoreProducts")}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <TouchableOpacity
            onPress={() => {
              haptic.success();
              onClose();
            }}
            style={{
              marginTop: 8,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: Colors.primary,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={t("checkout.productPickerDone")}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>
              {t("checkout.productPickerDone")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}
