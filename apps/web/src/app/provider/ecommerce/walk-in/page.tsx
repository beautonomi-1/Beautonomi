"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { percentOf, sumMoney } from "@beautonomi/utils";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  Banknote,
  CreditCard,
  X,
  User,
  History,
  ChevronRight,
} from "lucide-react";
import { BarcodeLookup, type BarcodeLookupResult, type BarcodeVariant } from "@/components/provider-portal/BarcodeLookup";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { isCompleteE164 } from "@/lib/phone";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import Link from "next/link";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { PAYCLOUD_SETUP_LABEL } from "@/lib/payments/paycloud-collect-cta";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

interface Variant {
  id: string;
  variant_name: string;
  retail_price: number;
  quantity: number;
  sku?: string | null;
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  sku?: string | null;
  barcode?: string | null;
  retail_price: number;
  /** Percentage; matches `POST /api/provider/product-sales` line tax. */
  tax_rate: number;
  /** Parent-level stock (0 for variant-based products). */
  quantity: number;
  /** Authoritative stock: sum of variant quantities when has_variants, else quantity. */
  effective_quantity: number;
  has_variants: boolean;
  variants: Variant[];
  image_urls: string[];
  is_active: boolean;
  track_stock_quantity?: boolean;
}

interface CartItem {
  product: Product;
  qty: number;
  /** Populated when the product has variants and the user chose one. */
  variantId?: string;
  variantName?: string;
  /** Unit price resolved from the variant (may differ from parent retail_price). */
  unitPrice: number;
  /** Available stock for this specific line (variant or parent). */
  availableQty: number;
}

/** Unique key per cart line (product + optional variant). */
function cartLineKey(productId: string, variantId?: string) {
  return variantId ? `${productId}::${variantId}` : productId;
}

function formatBarcodeVariantName(v: BarcodeVariant): string {
  const vals = v.option_values ? Object.values(v.option_values).filter(Boolean) : [];
  if (vals.length) return vals.map(String).join(" / ");
  if (v.sku?.trim()) return v.sku.trim();
  return "Variant";
}

function buildWalkInProductFromBarcodeHit(
  result: BarcodeLookupResult,
  existing: Product | undefined,
  taxRate: number,
): Product {
  if (existing) return existing;
  const { product, variant, variants: apiVariants } = result;
  const mappedVariants: Variant[] = (apiVariants ?? []).map((v) => ({
    id: v.id,
    variant_name: formatBarcodeVariantName(v),
    retail_price: Number(v.retail_price ?? product.retail_price ?? 0),
    quantity: Number(v.quantity ?? 0),
    sku: v.sku ?? null,
  }));
  const effectiveQty = variant
    ? Number(variant.quantity ?? 0)
    : mappedVariants.length > 0
      ? mappedVariants.reduce((sum, v) => sum + v.quantity, 0)
      : Number(product.quantity ?? 0);
  const untracked = product.track_stock_quantity === false;
  return {
    id: product.id,
    name: product.name ?? "Product",
    brand: null,
    retail_price: Number(variant?.retail_price ?? product.retail_price ?? 0),
    tax_rate: taxRate,
    quantity: Number(product.quantity ?? 0),
    effective_quantity: untracked ? 99_999 : effectiveQty,
    has_variants: Boolean(product.has_variants || result.needs_variant),
    variants: mappedVariants,
    image_urls: product.image_urls ?? [],
    is_active: true,
    track_stock_quantity: product.track_stock_quantity ?? true,
  };
}

function walkInCartTotals(cart: CartItem[], taxRatePercent = 0) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const c of cart) {
    const line = c.unitPrice * c.qty;
    subtotal += line;
    taxAmount += percentOf(line, taxRatePercent);
  }
  return {
    subtotal,
    taxAmount,
    grandTotal: sumMoney(subtotal, taxAmount),
  };
}

interface WalkInOrder {
  id: string;
  order_number: string;
  total_amount: number;
  payment_method: string;
  customer_name: string | null;
  created_at: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
}

export default function WalkInSalePage() {
  const { format: formatMoney, locale } = useProviderMoneyFormat();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready: paycloudReady, blockers, terminals } = usePaycloudCollectReady();
  const paycloudInFlight = (terminals?.inFlight ?? 0) > 0;
  const paycloudCollectVisible = paycloudEnabled && (paycloudReady || paycloudInFlight);
  const { selectedLocationId } = useProviderPortal();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "yoco" | "paycloud">("cash");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; total: number } | null>(null);
  const [error, setError] = useState("");
  const [recentSales, setRecentSales] = useState<WalkInOrder[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showYocoDialog, setShowYocoDialog] = useState(false);
  const [showPaycloudDialog, setShowPaycloudDialog] = useState(false);
  const [paycloudLinkedOrderId, setPaycloudLinkedOrderId] = useState<string | null>(null);
  const [paycloudLinkedTotal, setPaycloudLinkedTotal] = useState<number | null>(null);
  const [walkInTaxRate, setWalkInTaxRate] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [barcodeScanError, setBarcodeScanError] = useState("");

  /** Product awaiting variant selection before being added to the cart. */
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetcher.get<{ data: { products: Product[] } }>("/api/provider/products?limit=200");
      if (res?.data?.products) {
        setProducts(
          res.data.products
            // Use effective_quantity (sums variant stock for variant-based products)
            // so variant-only catalogs appear in the grid.
            .filter(
              (p) =>
                p.is_active &&
                ((p as { track_stock_quantity?: boolean }).track_stock_quantity === false ||
                  (p.effective_quantity ?? p.quantity) > 0),
            )
            .map((p) => ({
              ...p,
              retail_price: Number(p.retail_price),
              effective_quantity: Number(p.effective_quantity ?? p.quantity),
              tax_rate: Number((p as { tax_rate?: unknown }).tax_rate ?? 0),
              track_stock_quantity: (p as { track_stock_quantity?: boolean }).track_stock_quantity ?? true,
              variants: (p.variants || []).map((v: any) => ({
                id: v.id,
                variant_name: v.variant_name || v.name || "Variant",
                retail_price: Number(v.retail_price ?? p.retail_price),
                quantity: Number(v.quantity ?? 0),
                sku: v.sku ?? null,
              })),
            })),
        );
      }
    } catch (err: any) {
      console.error("Failed to load products:", err);
      setLoadError(err?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: { sales: WalkInOrder[] } }>(
        "/api/provider/product-sales?limit=20",
      );
      if (res?.data?.sales) setRecentSales(res.data.sales);
    } catch {
      // non-fatal
    }
  }, []);

  const fetchTaxSettings = useCallback(async () => {
    try {
      const res = await fetcher.get<{
        data?: { tax_rate_percent?: number; is_vat_registered?: boolean };
        tax_rate_percent?: number;
        is_vat_registered?: boolean;
      }>("/api/provider/settings/sales/taxes");
      const raw = (res as any)?.data ?? res;
      setWalkInTaxRate(raw?.is_vat_registered ? Number(raw.tax_rate_percent || 0) : 0);
    } catch {
      setWalkInTaxRate(0);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchProducts(), 0);
    return () => clearTimeout(id);
  }, [fetchProducts]);

  useEffect(() => { void fetchTaxSettings(); }, [fetchTaxSettings]);

  const filtered = useMemo(() =>
    products.filter(
      (p) => {
        const q = (search ?? "").toLowerCase();
        if (!q) return true;
        return (
          (p?.name ?? "").toLowerCase().includes(q) ||
          (p?.brand ?? "").toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
        );
      },
    ),
  [products, search]);

  /** Add a product (or a specific variant) to the cart. */
  const addToCart = useCallback((product: Product, variant?: Variant) => {
    const key = cartLineKey(product.id, variant?.id);
    const unitPrice = variant ? variant.retail_price : product.retail_price;
    const untracked = product.track_stock_quantity === false;
    const availableQty = untracked
      ? 99_999
      : variant
        ? variant.quantity
        : (product.effective_quantity ?? product.quantity);

    setCart((prev) => {
      const existing = prev.find((c) => cartLineKey(c.product.id, c.variantId) === key);
      if (existing) {
        if (existing.qty >= availableQty) return prev;
        return prev.map((c) =>
          cartLineKey(c.product.id, c.variantId) === key ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          product,
          qty: 1,
          variantId: variant?.id,
          variantName: variant?.variant_name,
          unitPrice,
          availableQty,
        },
      ];
    });
  }, []);

  /** Handle clicking a product tile — opens variant picker if needed, else direct add. */
  const handleProductClick = (product: Product) => {
    if (product.has_variants && product.variants.length > 0) {
      setVariantPickerProduct(product);
    } else {
      addToCart(product);
    }
  };

  const handleBarcodeSelect = useCallback(
    (result: BarcodeLookupResult) => {
      const full = products.find((p) => p.id === result.product.id);
      const target = buildWalkInProductFromBarcodeHit(result, full, walkInTaxRate);

      if (result.needs_variant || (target.has_variants && !result.variant)) {
        setBarcodeScanError("");
        setVariantPickerProduct(target);
        return;
      }

      const untrackedStock =
        result.product.track_stock_quantity === false || target.track_stock_quantity === false;

      if (result.variant) {
        const v: Variant = {
          id: result.variant.id,
          variant_name: formatBarcodeVariantName(result.variant),
          retail_price: Number(result.variant.retail_price ?? target.retail_price),
          quantity: Number(result.variant.quantity ?? 0),
          sku: result.variant.sku ?? null,
        };
        if (!untrackedStock && v.quantity <= 0) {
          setBarcodeScanError(`${target.name} — ${v.variant_name} is out of stock`);
          return;
        }
        setBarcodeScanError("");
        addToCart(target, v);
        return;
      }

      const stock = target.effective_quantity ?? target.quantity;
      if (!untrackedStock && stock <= 0) {
        setBarcodeScanError(`${target.name} is out of stock`);
        return;
      }
      setBarcodeScanError("");
      addToCart(target);
    },
    [products, addToCart, walkInTaxRate],
  );

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (cartLineKey(c.product.id, c.variantId) !== key) return c;
          const newQty = c.qty + delta;
          if (newQty <= 0) return null;
          if (newQty > c.availableQty) return c;
          return { ...c, qty: newQty };
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((c) => cartLineKey(c.product.id, c.variantId) !== key));
  };

  const { subtotal, taxAmount, grandTotal } = useMemo(
    () => walkInCartTotals(cart, walkInTaxRate),
    [cart, walkInTaxRate],
  );

  const buildWalkInSalePayload = (overrides?: {
    payment_method?: "cash" | "yoco" | "paycloud";
    payment_reference?: string;
    finalize_paycloud_order_id?: string;
  }) => ({
    items: cart.map((c) => ({
      product_id: c.product.id,
      quantity: c.qty,
      ...(c.variantId ? { product_variant_id: c.variantId } : {}),
    })),
    payment_method: overrides?.payment_method ?? paymentMethod,
    payment_reference: overrides?.payment_reference,
    finalize_paycloud_order_id: overrides?.finalize_paycloud_order_id,
    customer_name: customerName || undefined,
    customer_phone: customerPhone || undefined,
    location_id: selectedLocationId || undefined,
  });

  const submitWalkInOrder = async (paymentReference?: string, finalizePaycloudOrderId?: string) => {
    const res = await fetcher.post<{
      data: { order: { id?: string; order_number: string; total_amount?: string | number } };
      error?: string;
    }>("/api/provider/product-sales", buildWalkInSalePayload({
      payment_reference: paymentReference,
      finalize_paycloud_order_id: finalizePaycloudOrderId,
    }));

    if (res?.data?.order) {
      const serverTotal = parseFloat(String(res.data.order.total_amount ?? ""));
      const fallback = walkInCartTotals(cart, walkInTaxRate).grandTotal;
      setSuccess({
        orderNumber: res.data.order.order_number,
        total: Number.isFinite(serverTotal) ? serverTotal : fallback,
      });
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      fetchProducts();
    } else {
      setError(res?.error ?? "Failed to process sale");
    }
  };

  const handleSale = async () => {
    if (cart.length === 0 || processing) return;
    if (customerPhone.trim() && !isCompleteE164(customerPhone)) {
      setError("Enter a valid phone number or clear the phone field.");
      return;
    }
    if (paymentMethod === "yoco") {
      setError("");
      setShowYocoDialog(true);
      return;
    }
    if (paymentMethod === "paycloud") {
      setError("");
      setProcessing(true);
      try {
        const res = await fetcher.post<{
          data?: { order?: { id: string; order_number: string; total_amount?: string | number } };
          error?: string;
        }>("/api/provider/product-sales", buildWalkInSalePayload({ payment_method: "paycloud" }));
        const order = res?.data?.order;
        if (!order?.id) {
          setError(res?.error ?? "Failed to prepare card sale");
          return;
        }
        const serverTotal = parseFloat(String(order.total_amount ?? ""));
        setPaycloudLinkedOrderId(order.id);
        setPaycloudLinkedTotal(Number.isFinite(serverTotal) ? serverTotal : grandTotal);
        setShowPaycloudDialog(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to prepare card sale");
      } finally {
        setProcessing(false);
      }
      return;
    }
    setProcessing(true);
    setError("");
    try {
      await submitWalkInOrder();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setProcessing(false);
  };

  const handleYocoWalkInSuccess = async (payment: { yoco_payment_id: string }) => {
    setShowYocoDialog(false);
    setProcessing(true);
    setError("");
    try {
      await submitWalkInOrder(payment.yoco_payment_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setProcessing(false);
  };

  const handlePaycloudWalkInSuccess = async () => {
    if (!paycloudLinkedOrderId) return;
    setShowPaycloudDialog(false);
    setProcessing(true);
    setError("");
    try {
      await submitWalkInOrder(undefined, paycloudLinkedOrderId);
      setPaycloudLinkedOrderId(null);
      setPaycloudLinkedTotal(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Payment succeeded but completing the sale failed.");
    }
    setProcessing(false);
  };

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Sale Complete!</h2>
        <p className="mb-1 text-gray-600">Order: {success.orderNumber}</p>
        <p className="mb-6 text-2xl font-bold text-pink-600">
          {formatMoney(success.total)}
        </p>
        <button
          onClick={() => setSuccess(null)}
          className="rounded-xl bg-pink-600 px-8 py-3 font-semibold text-white hover:bg-pink-700 transition-colors"
        >
          New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 min-w-0 max-w-full overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Walk-in Sale</h1>
            <p className="text-sm text-gray-500">
              Process in-person product sales
              {paycloudEnabled || yocoEnabled
                ? ` (cash${paycloudEnabled ? ", card machine" : ""}${yocoEnabled ? ", Yoco" : ""})`
                : " (cash)"}
            </p>
          </div>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            {showHistory ? "Back to POS" : "Sales History"}
          </button>
        </div>

        {showHistory ? (
          <div className="space-y-4">
            {recentSales.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <History className="mx-auto mb-4 h-12 w-12" />
                <p>No walk-in sales yet</p>
              </div>
            ) : (
              recentSales.map((sale) => (
                <div key={sale.id} className="rounded-xl bg-white border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold text-gray-900">{sale.order_number}</span>
                      {sale.customer_name && (
                        <span className="ml-3 text-sm text-gray-500">{sale.customer_name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-pink-600">
                        {formatMoney(Number(sale.total_amount))}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(sale.created_at).toLocaleString(locale)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {sale.payment_method === "cash" ? (
                      <Banknote className="h-3.5 w-3.5" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    <span className="capitalize">{sale.payment_method}</span>
                    <span className="text-gray-300">·</span>
                    <span>{sale.items?.length ?? 0} item(s)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Product catalog - left */}
            <div className="lg:col-span-3">
              <div className="mb-4">
                <BarcodeLookup
                  label="Scan or enter barcode"
                  placeholder="Barcode / SKU"
                  onSelect={handleBarcodeSelect}
                />
                {barcodeScanError ? (
                  <p className="mt-1.5 text-xs text-red-600">{barcodeScanError}</p>
                ) : null}
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
                </div>
              ) : loadError ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-red-600 mb-3">{loadError}</p>
                  <button
                    onClick={fetchProducts}
                    className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 min-h-[44px] touch-manipulation"
                  >
                    Retry
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400">No products in stock</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {filtered.map((product) => {
                    const stock = product.effective_quantity ?? product.quantity;
                    const inCartQty = cart
                      .filter((c) => c.product.id === product.id)
                      .reduce((s, c) => s + c.qty, 0);
                    return (
                      <button
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className="group relative overflow-hidden rounded-xl border bg-white p-3 text-left transition hover:border-pink-300 hover:shadow-sm"
                      >
                        {inCartQty > 0 && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-pink-600 text-xs font-bold text-white">
                            {inCartQty}
                          </span>
                        )}
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2 pr-7">
                          {product.name}
                        </p>
                        {product.brand && (
                          <p className="text-xs text-gray-400">{product.brand}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-bold text-pink-600">
                            {product.has_variants && product.variants.length > 0
                              ? `From ${formatMoney(Math.min(...product.variants.map((v) => v.retail_price)))}`
                              : formatMoney(product.retail_price)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {stock} in stock
                          </span>
                        </div>
                        {product.has_variants && product.variants.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-pink-500 font-medium">
                            <ChevronRight className="h-3 w-3" />
                            {product.variants.length} option{product.variants.length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart - right */}
            <div className="lg:col-span-2">
              <div className="sticky top-6 rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-5 py-4">
                  <h2 className="flex items-center gap-2 font-bold text-gray-900">
                    <ShoppingCart className="h-5 w-5" />
                    Sale ({cart.reduce((s, c) => s + c.qty, 0)})
                  </h2>
                </div>

                {cart.length === 0 ? (
                  <div className="px-5 py-10 text-center text-gray-400 text-sm">
                    Tap products to add them
                  </div>
                ) : (
                  <div className="max-h-[320px] divide-y overflow-y-auto px-5">
                    {cart.map((item) => {
                      const key = cartLineKey(item.product.id, item.variantId);
                      return (
                        <div key={key} className="flex items-center gap-3 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.product.name}
                              {item.variantName && (
                                <span className="ml-1 text-xs text-gray-400">· {item.variantName}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatMoney(item.unitPrice)} each
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQty(key, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-50"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold">{item.qty}</span>
                            <button
                              onClick={() => updateQty(key, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="w-20 text-right text-sm font-semibold text-gray-900">
                            {formatMoney(item.unitPrice * item.qty)}
                          </span>
                          <button
                            onClick={() => removeFromCart(key)}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Customer info (optional) */}
                <div className="border-t px-5 py-4 space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 z-10" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name (optional)"
                      className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="walk-in-sale-customer-phone"
                      className="text-xs font-medium text-gray-600"
                    >
                      Phone (optional)
                    </Label>
                    <PhoneInput
                      label=""
                      inputId="walk-in-sale-customer-phone"
                      value={customerPhone}
                      onChange={setCustomerPhone}
                      className="space-y-1"
                    />
                  </div>

                  {/* Payment method */}
                  <div className={`grid gap-2 ${paycloudEnabled && yocoEnabled ? "grid-cols-3" : paycloudEnabled || yocoEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                        paymentMethod === "cash"
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Banknote className="h-4 w-4" />
                      Cash
                    </button>
                    {paycloudEnabled && paycloudCollectVisible ? (
                      <button
                        onClick={() => setPaymentMethod("paycloud")}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === "paycloud"
                            ? "border-pink-500 bg-pink-50 text-pink-700"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <CreditCard className="h-4 w-4" />
                        {paycloudInFlight ? "Resume card machine" : "Card machine"}
                      </button>
                    ) : paycloudEnabled ? (
                      <Link
                        href={blockers[0]?.href ?? "/provider/settings/sales/card-machines"}
                        className="flex items-center justify-center gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 py-2.5 text-sm font-medium text-amber-900 transition-colors hover:border-amber-300"
                      >
                        <CreditCard className="h-4 w-4" />
                        {PAYCLOUD_SETUP_LABEL}
                      </Link>
                    ) : null}
                    {yocoEnabled && (
                      <button
                        onClick={() => setPaymentMethod("yoco")}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === "yoco"
                            ? "border-pink-500 bg-pink-50 text-pink-700"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <CreditCard className="h-4 w-4" />
                        Yoco Card
                      </button>
                    )}
                  </div>
                </div>

                {/* Total + confirm */}
                <div className="border-t px-5 py-4">
                  <div className="mb-3 space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>{walkInTaxRate > 0 ? "Subtotal (excl. VAT)" : "Subtotal"}</span>
                      <span className="font-medium text-gray-900">{formatMoney(subtotal)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between">
                        <span>VAT ({walkInTaxRate}%)</span>
                        <span className="font-medium text-gray-900">{formatMoney(taxAmount)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mb-4 flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-lg font-semibold text-gray-900">Total due</span>
                    <span className="text-2xl font-extrabold text-pink-600">
                      {formatMoney(grandTotal)}
                    </span>
                  </div>

                  {error && (
                    <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSale}
                    disabled={cart.length === 0 || processing}
                    className="w-full rounded-xl bg-pink-600 py-3.5 text-center font-bold text-white transition-colors hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Complete Sale — ${formatMoney(grandTotal)}`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Variant picker ─────────────────────────────────────────────── */}
      {variantPickerProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setVariantPickerProduct(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{variantPickerProduct.name}</h3>
                {variantPickerProduct.brand && (
                  <p className="text-xs text-gray-400">{variantPickerProduct.brand}</p>
                )}
              </div>
              <button
                onClick={() => setVariantPickerProduct(null)}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">Choose a variant to add to the sale:</p>
            <div className="space-y-2">
              {variantPickerProduct.variants.map((v) => {
                const isInCart = cart.some(
                  (c) => c.product.id === variantPickerProduct.id && c.variantId === v.id,
                );
                const cartItem = cart.find(
                  (c) => c.product.id === variantPickerProduct.id && c.variantId === v.id,
                );
                return (
                  <button
                    key={v.id}
                    disabled={v.quantity <= 0}
                    onClick={() => {
                      addToCart(variantPickerProduct, v);
                      setVariantPickerProduct(null);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl border-2 p-3 text-left transition-colors ${
                      v.quantity <= 0
                        ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                        : isInCart
                          ? "border-pink-300 bg-pink-50"
                          : "border-gray-200 hover:border-pink-300 hover:bg-pink-50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{v.variant_name}</p>
                      {v.sku && <p className="text-xs text-gray-400">SKU: {v.sku}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-pink-600">{formatMoney(v.retail_price)}</p>
                      <p className="text-xs text-gray-400">
                        {v.quantity <= 0 ? "Out of stock" : `${v.quantity} in stock`}
                        {isInCart && cartItem ? ` · ${cartItem.qty} in cart` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showYocoDialog && (
        <YocoPaymentDialog
          open={showYocoDialog}
          onOpenChange={setShowYocoDialog}
          amount={grandTotal}
          onSuccess={(p) => void handleYocoWalkInSuccess(p)}
        />
      )}

      {showPaycloudDialog && paycloudLinkedOrderId && (
        <PayCloudPaymentDialog
          open={showPaycloudDialog}
          onOpenChange={setShowPaycloudDialog}
          amount={paycloudLinkedTotal ?? grandTotal}
          entityType="product_order"
          entityId={paycloudLinkedOrderId}
          bookingLocationId={selectedLocationId}
          onSuccess={() => void handlePaycloudWalkInSuccess()}
        />
      )}
    </div>
  );
}
