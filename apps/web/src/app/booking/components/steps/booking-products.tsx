"use client";

import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Minus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { BookingState } from "../booking-flow";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTranslation } from "@beautonomi/i18n";

interface ProductVariant {
  id: string;
  option_values: Record<string, string>;
  retail_price: number;
  quantity: number;
}

interface VariantOptionType {
  name: string;
  values: string[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  /** From GET …/products — used for grouping & deep-link focus */
  category?: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity: boolean;
  hasVariants?: boolean;
  variantOptionTypes?: Array<VariantOptionType | string>;
  variants?: ProductVariant[];
}

interface BookingProductsProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  providerSlug: string;
}

const PRODUCT_PAGE_SIZE = 24;
const MANY_PRODUCTS_IN_CATEGORY = 10;
const MANY_PRODUCT_CATEGORIES = 8;

function categoryKey(p: Product): string {
  const c = p.category?.trim();
  return c && c.length > 0 ? c : "Other";
}

export default function BookingProducts({
  bookingState,
  updateBookingState,
  providerSlug,
}: BookingProductsProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCT_PAGE_SIZE);
  const [scrollFocusProductId, setScrollFocusProductId] = useState<string | null>(null);
  const categoryBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const productCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastScrolledProductRef = useRef<string | null>(null);

  const productsByCategory = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      const k = categoryKey(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    for (const [, list] of m) {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return m;
  }, [products]);

  const categoryNames = useMemo(() => {
    const keys = [...productsByCategory.keys()];
    keys.sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return keys;
  }, [productsByCategory]);

  const displayedCategoryTabs = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    let list = categoryNames;
    if (q && categoryNames.length >= MANY_PRODUCT_CATEGORIES) {
      list = categoryNames.filter((c) => c.toLowerCase().includes(q));
    }
    if (activeCategory && !list.includes(activeCategory)) {
      list = [activeCategory, ...list];
    }
    return list;
  }, [categoryNames, categorySearchQuery, activeCategory]);

  const filteredProductsInCategory = useMemo(() => {
    if (!activeCategory) return [];
    const inCat = productsByCategory.get(activeCategory) ?? [];
    const q = productSearchQuery.trim().toLowerCase();
    if (!q) return inCat;
    return inCat.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)),
    );
  }, [activeCategory, productsByCategory, productSearchQuery]);

  const pagedProducts = useMemo(
    () => filteredProductsInCategory.slice(0, visibleProductCount),
    [filteredProductsInCategory, visibleProductCount],
  );

  const hasMoreProducts = visibleProductCount < filteredProductsInCategory.length;
  const showProductSearch =
    (productsByCategory.get(activeCategory ?? "")?.length ?? 0) >= MANY_PRODUCTS_IN_CATEGORY ||
    products.length >= 24;
  const showCategorySearch = categoryNames.length >= MANY_PRODUCT_CATEGORIES;

  const requestScrollToProduct = useCallback((id: string | null) => {
    if (id) {
      lastScrolledProductRef.current = null;
      setScrollFocusProductId(id);
    }
  }, []);

  useEffect(() => {
    if (categoryNames.length === 0) {
      setActiveCategory(null);
      return;
    }
    if (activeCategory && !categoryNames.includes(activeCategory)) {
      setActiveCategory(categoryNames[0] ?? null);
    } else if (!activeCategory) {
      setActiveCategory(categoryNames[0] ?? null);
    }
  }, [categoryNames, activeCategory]);

  useEffect(() => {
    setVisibleProductCount(PRODUCT_PAGE_SIZE);
  }, [activeCategory, productSearchQuery]);

  useLayoutEffect(() => {
    if (!activeCategory || categoryNames.length <= 1) return;
    const btn = categoryBtnRefs.current.get(activeCategory);
    btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCategory, categoryNames.length, displayedCategoryTabs.length]);

  useLayoutEffect(() => {
    if (!scrollFocusProductId) return;
    const idx = filteredProductsInCategory.findIndex((p) => p.id === scrollFocusProductId);
    if (idx !== -1 && idx >= visibleProductCount) {
      setVisibleProductCount((prev) =>
        Math.min(filteredProductsInCategory.length, Math.max(prev, idx + 6)),
      );
      return;
    }
    const el = productCardRefs.current.get(scrollFocusProductId);
    if (!el) return;
    if (lastScrolledProductRef.current === scrollFocusProductId) return;
    lastScrolledProductRef.current = scrollFocusProductId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => {
      setScrollFocusProductId(null);
      lastScrolledProductRef.current = null;
    }, 2200);
    return () => window.clearTimeout(t);
  }, [scrollFocusProductId, filteredProductsInCategory, visibleProductCount, pagedProducts.length]);

  // Auto-select the first in-stock variant for every variant product on load
  useEffect(() => {
    if (products.length === 0) return;
    setSelectedVariant((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of products) {
        if (p.hasVariants && p.variants && p.variants.length > 0 && !next[p.id]) {
          const sortedVars = [...p.variants].sort(
            (a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0),
          );
          const firstInStock =
            sortedVars.find((v) => !p.track_stock_quantity || (v.quantity || 0) > 0) ?? sortedVars[0];
          next[p.id] = firstInStock.id;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [products]);

  useEffect(() => {
    loadProducts();
  }, [providerSlug]);

  // Deep link: ?product_id= & optional ?product_variant_id=
  useEffect(() => {
    if (products.length === 0) return;
    const pid = (searchParams.get("product_id") || searchParams.get("product") || "").trim();
    if (!pid) return;
    const prod = products.find((p) => p.id === pid);
    if (!prod) return;
    const cat = categoryKey(prod);
    setActiveCategory(cat);
    const vid = (searchParams.get("product_variant_id") || searchParams.get("productVariantId") || "").trim();
    if (vid && prod.variants?.some((v) => v.id === vid)) {
      setSelectedVariant((prev) => ({ ...prev, [pid]: vid }));
    }
    const idx = (productsByCategory.get(cat) ?? []).findIndex((p) => p.id === pid);
    if (idx >= 0) {
      setVisibleProductCount(
        Math.min(
          (productsByCategory.get(cat) ?? []).length,
          Math.max(PRODUCT_PAGE_SIZE, idx + 6),
        ),
      );
    }
    requestScrollToProduct(pid);
  }, [products, productsByCategory, searchParams, requestScrollToProduct]);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/public/providers/${encodeURIComponent(providerSlug)}/products`);
      const data = await response.json();
      if (data.data) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const cartKey = (product: Product): string => {
    const vid = selectedVariant[product.id];
    return vid ? `${product.id}:${vid}` : product.id;
  };

  const effectivePrice = (product: Product): number => {
    const vid = selectedVariant[product.id];
    if (vid && product.variants) {
      const v = product.variants.find((pv) => pv.id === vid);
      if (v) return v.retail_price;
    }
    return product.price;
  };

  const availableStock = (product: Product): number => {
    const vid = selectedVariant[product.id];
    if (vid && product.variants) {
      const v = product.variants.find((pv) => pv.id === vid);
      if (v) return v.quantity;
    }
    return product.quantity;
  };

  const updateProductQuantity = (product: Product, delta: number) => {
    const key = cartKey(product);
    const vid = selectedVariant[product.id];
    const currentSelection = bookingState.selectedProducts.find((p) => p.id === key);
    const currentQuantity = currentSelection?.quantity || 0;
    const newQuantity = Math.max(0, currentQuantity + delta);

    const stock = availableStock(product);
    if (product.track_stock_quantity && newQuantity > stock) return;

    if (newQuantity === 0) {
      updateBookingState({
        selectedProducts: bookingState.selectedProducts.filter((p) => p.id !== key),
      });
    } else if (currentSelection) {
      updateBookingState({
        selectedProducts: bookingState.selectedProducts.map((p) =>
          p.id === key ? { ...p, quantity: newQuantity } : p,
        ),
      });
    } else {
      const variantName =
        vid && product.variants
          ? (() => {
              const v = product.variants.find((pv) => pv.id === vid);
              return v ? Object.values(v.option_values).join(" / ") : undefined;
            })()
          : undefined;
      updateBookingState({
        selectedProducts: [
          ...bookingState.selectedProducts,
          {
            id: key,
            name: variantName ? `${product.name} — ${variantName}` : product.name,
            price: effectivePrice(product),
            quantity: newQuantity,
            currency: product.currency,
          },
        ],
      });
    }
  };

  const getProductQuantity = (product: Product): number => {
    const selected = bookingState.selectedProducts.find((p) => p.id === cartKey(product));
    return selected?.quantity || 0;
  };

  const formatCurrency = (amount: number, currency: string = tenantCurrency) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Loading products...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Add Products</h2>
        <p className="text-sm text-gray-600">
          Purchase products to take home with your service
        </p>
      </div>

      {categoryNames.length > 1 && (
        <div className="space-y-2">
          {showCategorySearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
              <Input
                type="search"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder={t("booking.filterCategoriesPlaceholder")}
                className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
                autoComplete="off"
                aria-label={t("booking.filterCategoriesPlaceholder")}
              />
            </div>
          )}
          <div
            className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
            role="tablist"
            aria-label={t("booking.searchProductsPlaceholder")}
          >
            {displayedCategoryTabs.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                ref={(el) => {
                  if (el) categoryBtnRefs.current.set(cat, el);
                  else categoryBtnRefs.current.delete(cat);
                }}
                onClick={() => {
                  setActiveCategory(cat);
                  setProductSearchQuery("");
                  setVisibleProductCount(PRODUCT_PAGE_SIZE);
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap touch-target transition-colors ${
                  activeCategory === cat ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {showProductSearch && activeCategory && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            placeholder={t("booking.searchProductsPlaceholder")}
            className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
            autoComplete="off"
            aria-label={t("booking.searchProductsPlaceholder")}
          />
        </div>
      )}

      {filteredProductsInCategory.length > 0 && pagedProducts.length < filteredProductsInCategory.length && (
        <p className="text-xs text-gray-500">
          {t("booking.servicesPaginationSummary", {
            shown: pagedProducts.length,
            total: filteredProductsInCategory.length,
          })}
        </p>
      )}

      <div className="space-y-3">
        {pagedProducts.map((product) => {
          const quantity = getProductQuantity(product);
          const isSelected = quantity > 0;
          const stock = availableStock(product);
          const isOutOfStock = product.track_stock_quantity && stock === 0;
          const chosenVariantId = selectedVariant[product.id];
          const currentPrice = effectivePrice(product);

          return (
            <div
              key={product.id}
              ref={(el) => {
                if (el) productCardRefs.current.set(product.id, el);
                else productCardRefs.current.delete(product.id);
              }}
              className={cn(
                "border rounded-lg p-4 transition-colors",
                isSelected ? "border-primary bg-pink-50" : "border-gray-200 bg-white",
                scrollFocusProductId === product.id && "ring-2 ring-primary ring-offset-2 ring-offset-white",
              )}
            >
              <div className="flex gap-4">
                {product.imageUrl && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{product.name}</h3>
                  {product.description && (
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{product.description}</p>
                  )}
                  {product.hasVariants && product.variants && product.variants.length > 0 && product.variantOptionTypes && (
                    <div className="mt-2 space-y-2">
                      {product.variantOptionTypes.map((rawOptType) => {
                        const optTypeName = typeof rawOptType === "string" ? rawOptType : rawOptType.name;
                        const uniqueVals = Array.from(
                          new Set(
                            product
                              .variants!.map((v) => v.option_values?.[optTypeName])
                              .filter((x): x is string => Boolean(x)),
                          ),
                        );
                        if (uniqueVals.length === 0) return null;
                        return (
                          <div key={optTypeName}>
                            <p className="text-xs font-medium text-gray-600 mb-1 capitalize">{optTypeName}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {uniqueVals.map((val) => {
                                const matchingVariant = product.variants!.find(
                                  (v) => v.option_values?.[optTypeName] === val,
                                );
                                const isChosen = chosenVariantId
                                  ? product.variants!.find((v) => v.id === chosenVariantId)?.option_values?.[optTypeName] ===
                                    val
                                  : matchingVariant?.id === product.variants![0]?.id;
                                const outOfStock =
                                  product.track_stock_quantity && (matchingVariant?.quantity || 0) === 0;
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    disabled={outOfStock}
                                    onClick={() => {
                                      const target = product.variants!.find(
                                        (v) => v.option_values?.[optTypeName] === val,
                                      );
                                      if (target) {
                                        setSelectedVariant((prev) => ({ ...prev, [product.id]: target.id }));
                                      }
                                    }}
                                    className={cn(
                                      "px-3 py-1 rounded-full border text-xs font-medium transition-all",
                                      isChosen
                                        ? "border-primary bg-pink-50 text-primary"
                                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                                      outOfStock && "opacity-40 cursor-not-allowed line-through",
                                    )}
                                  >
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <p className="font-semibold text-gray-900">{formatCurrency(currentPrice, product.currency)}</p>
                      {product.track_stock_quantity && (
                        <p className="text-xs text-gray-500 mt-1">
                          {stock > 0 ? `${stock} in stock` : "Out of stock"}
                        </p>
                      )}
                    </div>

                    {isOutOfStock ? (
                      <Button variant="outline" size="sm" disabled className="text-gray-400">
                        Out of Stock
                      </Button>
                    ) : product.hasVariants && !chosenVariantId && (product.variants?.length ?? 0) > 0 ? (
                      <Button variant="outline" size="sm" disabled className="text-gray-400 text-xs">
                        Select option
                      </Button>
                    ) : isSelected ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateProductQuantity(product, -1)}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-medium text-gray-900 w-8 text-center">{quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateProductQuantity(product, 1)}
                          disabled={product.track_stock_quantity && quantity >= stock}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateProductQuantity(product, 1)}
                        className="text-primary border-primary hover:bg-primary hover:text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <Button
          type="button"
          variant="outline"
          className="w-full max-w-sm touch-target mx-auto block"
          onClick={() =>
            setVisibleProductCount((c) => Math.min(c + PRODUCT_PAGE_SIZE, filteredProductsInCategory.length))
          }
        >
          {t("booking.loadMoreProducts")}
        </Button>
      )}

      {filteredProductsInCategory.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-500">{t("common.noResults")}</p>
      )}

      {bookingState.selectedProducts.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-2">Selected Products</h3>
          <div className="space-y-1">
            {bookingState.selectedProducts.map((product) => (
              <div key={product.id} className="flex justify-between text-sm text-gray-600">
                <span>
                  {product.name} × {product.quantity}
                </span>
                <span className="font-medium">{formatCurrency(product.price * product.quantity, product.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>
              {formatCurrency(
                bookingState.selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0),
                bookingState.selectedProducts[0]?.currency || tenantCurrency,
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
