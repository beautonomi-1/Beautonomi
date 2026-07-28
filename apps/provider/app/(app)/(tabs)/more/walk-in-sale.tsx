import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  DeviceEventEmitter,
  Linking,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { BarcodeScannerModal } from "@/features/products/BarcodeScannerModal";
import {
  barcodeLookupQueryParams,
  mapApiErrorCodeToMessage,
  resolveBarcodeForWalkInSale,
  type BarcodeLookupApiPayload,
} from "@/features/products/resolveBarcodeForWalkInSale";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { PayCloudPaymentSheet } from "@/components/payments/PayCloudPaymentSheet";
import { PaycloudCollectSetupAffordance } from "@/components/payments/PaycloudCollectSetupAffordance";
import { usePaycloudCollectAvailability } from "@/hooks/usePaycloudCollectAvailability";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";
import { downloadPdf } from "@/lib/pdf-file";
import { shareProviderOrderReceipt } from "@/lib/share-receipt";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalCollectionIntentPayload,
} from "@/lib/paystack-terminal-api";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { displayRetailPriceMin, effectiveStockQuantity } from "@/lib/product-inventory-metrics";
import { trackWalkInSaleCompleted } from "@/lib/analytics";
import { percentOf, sumMoney } from "@beautonomi/utils";
import { PROVIDER_PRODUCTS_CATALOG_CHANGED } from "@/lib/provider-products-catalog-events";
import { PROVIDER_DASHBOARD_REFRESH_EVENT } from "@/lib/provider-dashboard-events";
import { useProvider } from "@/providers/ProviderContext";
import { pt } from "@/lib/provider-translate";

interface ProductVariant {
  id: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity?: number;
  sku?: string | null;
}

interface Product {
  id: string;
  name: string;
  retail_price: number;
  quantity?: number;
  sku?: string | null;
  barcode?: string | null;
  is_active?: boolean;
  retail_sales_enabled?: boolean;
  has_variants?: boolean;
  variants?: ProductVariant[];
  track_stock_quantity?: boolean;
  image_urls?: string[] | null;
}

interface ProductsResponse {
  products?: Product[];
}

interface SaleItem {
  product_name: string;
  quantity: number;
  unit_price: number | string;
}

interface WalkInSale {
  id: string;
  order_number: string;
  customer_id?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  total_amount: number | string;
  payment_method: string;
  payment_reference?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
  product_order_items?: SaleItem[];
  items?: SaleItem[];
}

interface ApiClient {
  id: string;
  customer_id: string;
  customer?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

interface SalesResponse {
  sales: WalkInSale[];
  total: number;
}

function normalizeProductsPayload(raw: unknown): Product[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.products)) return o.products as Product[];
  const inner = (raw as { data?: { products?: Product[] } }).data;
  if (inner && Array.isArray(inner.products)) return inner.products;
  return [];
}

function normalizeClientsArray(raw: unknown): ApiClient[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ApiClient[];
  if (typeof raw === "object" && raw !== null && "data" in raw) {
    const inner = (raw as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as ApiClient[];
  }
  return [];
}

function normalizeSalesPayload(raw: unknown): { sales: WalkInSale[]; total: number } {
  if (!raw || typeof raw !== "object") return { sales: [], total: 0 };
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.sales)) {
    return { sales: o.sales as WalkInSale[], total: Number(o.total ?? 0) };
  }
  const inner = o.data as SalesResponse | undefined;
  if (inner && Array.isArray(inner.sales)) {
    return { sales: inner.sales, total: Number(inner.total ?? 0) };
  }
  return { sales: [], total: 0 };
}

function saleLineTotal(it: SaleItem): number {
  const u = Number(it.unit_price);
  const q = Number(it.quantity);
  if (!Number.isFinite(u) || !Number.isFinite(q)) return 0;
  return u * q;
}

type CartLine = {
  lineId: string;
  product_id: string;
  product_variant_id: string | null;
  name: string;
  price: number;
  quantity: number;
  tax_rate_percent: number;
};

type WalkInPaymentMethod = "cash" | "yoco" | "paycloud" | "paystack_terminal" | "card" | "eft" | "other";

const WALK_IN_PAYMENT_METHODS: { id: WalkInPaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "yoco", label: "Yoco" },
  { id: "paycloud", label: "Card machine" },
  { id: "paystack_terminal", label: "Paystack Terminal" },
  { id: "card", label: "Card manual" },
  { id: "eft", label: "EFT" },
  { id: "other", label: "Other" },
];

function newLineId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatProductVariantLabel(v: ProductVariant): string {
  const vals = v.option_values ? Object.values(v.option_values).filter(Boolean) : [];
  if (vals.length) return vals.map(String).join(" / ");
  if (v.sku) return String(v.sku);
  return "Option";
}

/** Max units sellable for this product + optional variant (matches POS / ecommerce rules). */
function maxSellableUnits(p: Product, variantId: string | null): number {
  if (variantId) {
    const v = p.variants?.find((x) => x.id === variantId);
    return Math.max(0, Number(v?.quantity ?? 0));
  }
  if (p.has_variants && (p.variants?.length ?? 0) > 0) {
    return effectiveStockQuantity({
      has_variants: true,
      quantity: p.quantity,
      variants: p.variants?.map((x) => ({ quantity: x.quantity, retail_price: x.retail_price })),
    });
  }
  if (p.track_stock_quantity === false) {
    return 99_999;
  }
  return Math.max(0, Number(p.quantity ?? 0));
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function walkInSaleErrorMessage(code: string | null | undefined, message: string): string {
  switch (code) {
    case "FORBIDDEN":
      return "You don't have permission to record sales. Ask an owner to grant create_sales.";
    case "STOCK_ERROR":
      return message || "Stock issue — check quantities or refresh the product list.";
    case "YOCO_REFERENCE_REQUIRED":
      return "Yoco walk-in sales need the terminal payment reference from the receipt.";
    case "TENANT_ERROR":
      return "Workspace configuration error. Check provider/tenant settings or support.";
    case "VALIDATION_ERROR":
      return message || "Check the sale details and try again.";
    case "UNAUTHORIZED":
      return "Session expired. Sign in again and retry.";
    default:
      return message || "Could not complete sale. Please try again.";
  }
}

export default function WalkInSaleScreen() {
  const tenantCurrency = getTenantDefaultCurrency();
  const { screenPadding } = useResponsive();
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { selectedLocationId } = useProvider();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const {
    paycloudEnabled,
    collectEnabled: paycloudCollectEnabled,
    primaryBlocker: paycloudPrimaryBlocker,
    loading: paycloudLoading,
  } = usePaycloudCollectAvailability();
  const { data: permissionData } = useApi<{
    isOwner?: boolean;
    permissions?: Record<string, boolean>;
  }>("/api/provider/permissions", { staleTimeMs: 60_000 });
  const canProcessPayments =
    permissionData?.isOwner === true ||
    permissionData?.permissions?.process_payments === true;
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [barcodeScanOpen, setBarcodeScanOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLookupBusy, setBarcodeLookupBusy] = useState(false);
  const [barcodeLookupError, setBarcodeLookupError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<WalkInPaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhoneE164, setCustomerPhoneE164] = useState("");
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const [showPaycloudPayment, setShowPaycloudPayment] = useState(false);
  const [paycloudLinkedOrderId, setPaycloudLinkedOrderId] = useState<string | null>(null);
  const [paycloudLinkedTotal, setPaycloudLinkedTotal] = useState<number | null>(null);
  const [preparingPaycloud, setPreparingPaycloud] = useState(false);
  const [preparingPaystackTerminal, setPreparingPaystackTerminal] = useState(false);
  const [paystackTerminalPrompt, setPaystackTerminalPrompt] = useState<{
    code: string;
    link?: string | null;
    reference?: string | null;
    expectedAmount: number;
    pendingOrderId?: string;
  } | null>(null);
  const [variantPickProduct, setVariantPickProduct] = useState<Product | null>(null);
  const [selectedSale, setSelectedSale] = useState<WalkInSale | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [linkClientsOpen, setLinkClientsOpen] = useState(false);
  const [clientPickSearch, setClientPickSearch] = useState("");
  const [linkedClient, setLinkedClient] = useState<{ customer_id: string; full_name: string } | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: productsData, loading: loadingProducts, error: productsError, refresh: refreshProducts } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200",
  );
  const { data: salesData, loading: loadingSales, error, refresh } = useApi<SalesResponse>(
    "/api/provider/product-sales?limit=30",
  );
  const { data: taxSettingsData } = useApi<{
    tax_rate_percent?: number;
    is_vat_registered?: boolean;
    data?: { tax_rate_percent?: number; is_vat_registered?: boolean };
  }>("/api/provider/settings/sales/taxes");
  const { execute: postSale, loading: creating } = useApiMutation<{ order: WalkInSale }>("post");
  const { execute: patchOrder } = useApiMutation<{ order: WalkInSale }>("patch");

  const clientsPickPath = useMemo(() => {
    const q = clientPickSearch.trim();
    return q
      ? `/api/provider/clients?search=${encodeURIComponent(q)}&limit=40`
      : "/api/provider/clients?limit=40";
  }, [clientPickSearch]);

  const {
    data: rawPickClients,
    error: pickClientsError,
    loading: pickClientsLoading,
  } = useApi<ApiClient[]>(clientsPickPath, { enabled: createOpen && linkClientsOpen });

  const pickClients = useMemo(() => {
    const rows = normalizeClientsArray(rawPickClients);
    if (rows.length === 0) return [];
    return rows.map((c) => ({
      id: c.id,
      customer_id: c.customer_id,
      full_name: (c.customer?.full_name || "Unknown").trim() || "Unknown",
      phone: c.customer?.phone || "",
    }));
  }, [rawPickClients]);

  const products = useMemo(() => normalizeProductsPayload(productsData), [productsData]);

  const sellableProducts = useMemo(
    () =>
      products.filter(
        (p) => p.is_active !== false && p.retail_sales_enabled !== false,
      ),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return sellableProducts;
    return sellableProducts.filter((p) => {
      const hay = `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sellableProducts, productSearch]);

  const { sales, total: totalSales } = useMemo(() => normalizeSalesPayload(salesData), [salesData]);
  const walkInTaxRate = useMemo(() => {
    const raw = (taxSettingsData as any)?.data ?? taxSettingsData;
    return raw?.is_vat_registered ? Number(raw.tax_rate_percent || 0) : 0;
  }, [taxSettingsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshProducts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshProducts]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refreshProducts();
    });
    return () => sub.remove();
  }, [refreshProducts]);

  // Reset a persisted/selected method that is gated off mid-session so the
  // hidden option cannot linger as the active payment method.
  useEffect(() => {
    if (!paystackTerminalEnabled && paymentMethod === "paystack_terminal") {
      setPaymentMethod("cash");
    }
    if (!yocoEnabled && paymentMethod === "yoco") {
      setPaymentMethod("cash");
    }
    if (!paycloudCollectEnabled && paymentMethod === "paycloud") {
      setPaymentMethod("cash");
    }
  }, [paystackTerminalEnabled, yocoEnabled, paycloudCollectEnabled, paymentMethod]);

  const openNewSaleSheet = useCallback(() => {
    setSelectedSale(null);
    setCart([]);
    setCustomerName("");
    setCustomerPhoneE164("");
    setPaymentMethod("cash");
    setProductSearch("");
    setBarcodeInput("");
    setBarcodeScanOpen(false);
    setBarcodeLookupError(null);
    setVariantPickProduct(null);
    setLinkClientsOpen(false);
    setClientPickSearch("");
    setLinkedClient(null);
    setCheckoutError(null);
    setPaycloudLinkedOrderId(null);
    setPaycloudLinkedTotal(null);
    setShowPaycloudPayment(false);
    setCreateOpen(true);
    refreshProducts();
  }, [refreshProducts]);

  const handleRefundSale = useCallback(
    (sale: WalkInSale) => {
      Alert.alert(
        "Process refund",
        `Refund order ${sale.order_number} (${formatCurrency(Number(sale.total_amount), tenantCurrency)})? Stock will be returned automatically.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Refund",
            style: "destructive",
            onPress: async () => {
              setRefunding(true);
              try {
                const { error: err } = await patchOrder(
                  `/api/provider/product-orders/${sale.id}`,
                  { status: "refunded", refund_method: "cash" },
                );
                if (err) {
                  Alert.alert("Refund failed", err);
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Refunded", `Order ${sale.order_number} has been marked as refunded.`);
                  setSelectedSale(null);
                  refresh();
                }
              } finally {
                setRefunding(false);
              }
            },
          },
        ],
      );
    },
    [patchOrder, refresh, tenantCurrency],
  );

  const addLine = useCallback((product: Product, variant: ProductVariant | null) => {
    const variantId = variant?.id ?? null;
    const unit = variant ? Number(variant.retail_price ?? 0) : Number(product.retail_price ?? 0);
    const name = variant ? `${product.name} — ${formatProductVariantLabel(variant)}` : product.name;
    const max = maxSellableUnits(product, variantId);
    if (max < 1) {
      Alert.alert("Out of stock", `${name} has no available stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find(
        (c) =>
          c.product_id === product.id && (c.product_variant_id ?? null) === (variantId ?? null),
      );
      if (existing) {
        if (existing.quantity >= max) return prev;
        return prev.map((c) =>
          c.lineId === existing.lineId ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          lineId: newLineId(),
          product_id: product.id,
          product_variant_id: variantId,
          name,
          price: unit,
          quantity: 1,
          tax_rate_percent: walkInTaxRate,
        },
      ];
    });
    setVariantPickProduct(null);
  }, [walkInTaxRate]);

  const onProductRowPress = useCallback((p: Product) => {
    if (p.has_variants && (p.variants?.length ?? 0) > 0) {
      setVariantPickProduct(p);
      return;
    }
    addLine(p, null);
  }, [addLine]);

  const applyBarcodeResolve = useCallback(
    (resolved: ReturnType<typeof resolveBarcodeForWalkInSale>) => {
      if (resolved.action === "error") {
        setBarcodeLookupError(resolved.message);
        Alert.alert("Barcode lookup", resolved.message);
        return;
      }
      setBarcodeLookupError(null);
      if (resolved.action === "pick_variant") {
        setVariantPickProduct(resolved.product);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addLine(resolved.product, resolved.variant);
    },
    [addLine],
  );

  const handleBarcodeCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      setBarcodeLookupBusy(true);
      setBarcodeLookupError(null);
      try {
        const params = barcodeLookupQueryParams(code);
        const res = await api.fetch<BarcodeLookupApiPayload>(
          `/api/provider/products/by-barcode?${params.toString()}`,
        );
        if (res.error) {
          const message = mapApiErrorCodeToMessage(
            res.error.code,
            res.error.message ?? "Lookup failed",
          );
          setBarcodeLookupError(message);
          Alert.alert("Barcode lookup", message);
          return;
        }
        applyBarcodeResolve(resolveBarcodeForWalkInSale(res.data, sellableProducts));
        setBarcodeInput("");
        setBarcodeScanOpen(false);
      } finally {
        setBarcodeLookupBusy(false);
      }
    },
    [applyBarcodeResolve, sellableProducts],
  );

  const updateCartQty = useCallback((lineId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.lineId === lineId);
      if (!item) return prev;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((c) => c.lineId !== lineId);
      const max = maxSellableUnits(product, item.product_variant_id);
      if (newQty > max) return prev;
      return prev.map((c) => (c.lineId === lineId ? { ...c, quantity: newQty } : c));
    });
  }, [products]);

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((c) => c.lineId !== lineId));
  }, []);

  const { cartSubtotal, cartTax, cartTotalDue } = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const c of cart) {
      const line = c.price * c.quantity;
      sub += line;
      tax += percentOf(line, c.tax_rate_percent);
    }
    return {
      cartSubtotal: sub,
      cartTax: tax,
      cartTotalDue: sumMoney(sub, tax),
    };
  }, [cart]);

  const submitSale = useCallback(
    async (paymentRef?: string, finalizeWalkInOrderId?: string) => {
      const phoneErr = validateE164Phone(customerPhoneE164);
      if (phoneErr) {
        setCheckoutError(phoneErr);
        Alert.alert("Invalid phone", phoneErr);
        return;
      }
      setCheckoutError(null);
      const items = cart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity,
        product_variant_id: c.product_variant_id ?? undefined,
      }));
      const { data, error: err, errorCode } = await postSale("/api/provider/product-sales", {
        ...(finalizeWalkInOrderId ? {} : { items }),
        payment_method: paymentMethod,
        payment_reference: paymentRef,
        finalize_walk_in_order_id: finalizeWalkInOrderId,
        customer_id: linkedClient?.customer_id,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhoneE164.trim() || undefined,
        ...(selectedLocationId ? { location_id: selectedLocationId } : {}),
      });
      if (err) {
        const friendly = walkInSaleErrorMessage(errorCode, err);
        setCheckoutError(friendly);
        Alert.alert(pt("walkInSale.couldntCompleteSale", undefined, "Couldn't complete sale"), friendly);
        return;
      }
      const rawPayload = data as { order?: WalkInSale } | WalkInSale | null | undefined;
      const order =
        rawPayload && typeof rawPayload === "object" && "order" in rawPayload && rawPayload.order
          ? rawPayload.order
          : rawPayload && typeof rawPayload === "object" && "order_number" in rawPayload
            ? (rawPayload as WalkInSale)
            : undefined;
      if (order?.id) {
        trackWalkInSaleCompleted(order.id, cartTotalDue, paymentMethod, cart.length);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        pt("walkInSale.saleCompleteTitle", undefined, "Sale complete"),
        order?.order_number
          ? pt("walkInSale.saleCompleteBody", { orderNumber: order.order_number }, `Order ${order.order_number} recorded.`)
          : pt("walkInSale.saleCompleteBodyGeneric", undefined, "The sale has been recorded."),
      );
      setCreateOpen(false);
      setShowYocoPayment(false);
      setShowPaycloudPayment(false);
      setPaycloudLinkedOrderId(null);
      setPaycloudLinkedTotal(null);
      setPaystackTerminalPrompt(null);
      setVariantPickProduct(null);
      setCart([]);
      setCustomerName("");
      setCustomerPhoneE164("");
      setPaymentMethod("cash");
      refresh();
      refreshProducts();
      DeviceEventEmitter.emit(PROVIDER_DASHBOARD_REFRESH_EVENT);
    },
    [
      cart,
      paymentMethod,
      customerName,
      customerPhoneE164,
      linkedClient,
      postSale,
      refresh,
      refreshProducts,
      cartTotalDue,
      selectedLocationId,
    ],
  );

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert(
        pt("walkInSale.emptyCartTitle", undefined, "Empty cart"),
        pt("walkInSale.emptyCartBody", undefined, "Add at least one product."),
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (paymentMethod === "yoco") {
      setShowYocoPayment(true);
      return;
    }
    if (paymentMethod === "paycloud") {
      const phoneErr = validateE164Phone(customerPhoneE164);
      if (phoneErr) {
        setCheckoutError(phoneErr);
        Alert.alert("Invalid phone", phoneErr);
        return;
      }
      setCheckoutError(null);
      setPreparingPaycloud(true);
      try {
        const items = cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          product_variant_id: c.product_variant_id ?? undefined,
        }));
        const { data, error: err, errorCode } = await postSale("/api/provider/product-sales", {
          items,
          payment_method: "paycloud",
          customer_id: linkedClient?.customer_id,
          customer_name: customerName.trim() || undefined,
          customer_phone: customerPhoneE164.trim() || undefined,
          ...(selectedLocationId ? { location_id: selectedLocationId } : {}),
        });
        if (err) {
          const friendly = walkInSaleErrorMessage(errorCode, err);
          setCheckoutError(friendly);
          Alert.alert(pt("walkInSale.couldntCompleteSale", undefined, "Couldn't complete sale"), friendly);
          return;
        }
        const rawPayload = data as { order?: WalkInSale } | WalkInSale | null | undefined;
        const order =
          rawPayload && typeof rawPayload === "object" && "order" in rawPayload && rawPayload.order
            ? rawPayload.order
            : rawPayload && typeof rawPayload === "object" && "order_number" in rawPayload
              ? (rawPayload as WalkInSale)
              : undefined;
        if (!order?.id) {
          Alert.alert("Error", "Could not prepare card sale");
          return;
        }
        const serverTotal = Number(order.total_amount ?? cartTotalDue);
        setPaycloudLinkedOrderId(order.id);
        setPaycloudLinkedTotal(Number.isFinite(serverTotal) ? serverTotal : cartTotalDue);
        setShowPaycloudPayment(true);
      } finally {
        setPreparingPaycloud(false);
      }
      return;
    }
    if (paymentMethod === "paystack_terminal") {
      const phoneErr = validateE164Phone(customerPhoneE164);
      if (phoneErr) {
        setCheckoutError(phoneErr);
        Alert.alert("Invalid phone", phoneErr);
        return;
      }
      setCheckoutError(null);
      setPreparingPaystackTerminal(true);
      try {
        const items = cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          product_variant_id: c.product_variant_id ?? undefined,
        }));
        const { data, error: err, errorCode } = await postSale("/api/provider/product-sales", {
          items,
          payment_method: "paystack_terminal",
          customer_id: linkedClient?.customer_id,
          customer_name: customerName.trim() || undefined,
          customer_phone: customerPhoneE164.trim() || undefined,
          ...(selectedLocationId ? { location_id: selectedLocationId } : {}),
        });
        if (err) {
          const friendly = walkInSaleErrorMessage(errorCode, err);
          setCheckoutError(friendly);
          Alert.alert(pt("walkInSale.couldntCompleteSale", undefined, "Couldn't complete sale"), friendly);
          return;
        }
        const rawPayload = data as { order?: WalkInSale } | WalkInSale | null | undefined;
        const order =
          rawPayload && typeof rawPayload === "object" && "order" in rawPayload && rawPayload.order
            ? rawPayload.order
            : rawPayload && typeof rawPayload === "object" && "order_number" in rawPayload
              ? (rawPayload as WalkInSale)
              : undefined;
        if (!order?.id) {
          Alert.alert("Error", "Could not prepare card sale");
          return;
        }
        const customerReference = `walk-in-${order.id.slice(0, 8)}`;
        const res = await api.post<{
          terminal?: { terminal_code?: string; payment_link?: string | null; terminal_url?: string | null; qr_url?: string | null };
          expectedAmount?: number | null;
        }>(PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH, paystackTerminalCollectionIntentPayload({
          entity_type: "product_order",
          entity_id: order.id,
          expected_amount: Number(order.total_amount ?? cartTotalDue),
          customer_reference: customerReference,
        }));
        if (res.error) {
          Alert.alert("Paystack Terminal", res.error.message ?? "Failed to prepare terminal payment.");
          return;
        }
        const terminal = res.data?.terminal;
        if (!terminal?.terminal_code) {
          Alert.alert("Paystack Terminal", "No active Paystack Terminal is available. Create one first.");
          return;
        }
        setPaystackTerminalPrompt({
          code: terminal.terminal_code,
          link: terminal.payment_link ?? terminal.terminal_url ?? terminal.qr_url ?? null,
          reference: customerReference,
          expectedAmount: Number(res.data?.expectedAmount ?? order.total_amount ?? cartTotalDue),
          pendingOrderId: order.id,
        });
      } finally {
        setPreparingPaystackTerminal(false);
      }
      return;
    }
    await submitSale();
  }, [
    cart,
    paymentMethod,
    submitSale,
    cartTotalDue,
    customerName,
    customerPhoneE164,
    linkedClient,
    postSale,
    selectedLocationId,
  ]);

  const lineCountForSale = (sale: WalkInSale) => {
    const rows = sale.items ?? sale.product_order_items ?? [];
    return Array.isArray(rows) ? rows.length : 0;
  };

  if (loadingSales && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack onBack={handleBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack onBack={handleBack} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Walk-in Sale"
        showBack
        onBack={handleBack}
        subtitle="Products & ecommerce payments"
        rightAction={
          <TouchableOpacity
            onPress={openNewSaleSheet}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#f59e0b", paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.white }}>New sale</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[500] }}>Recent walk-in sales</Text>
          {totalSales > 0 && (
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{totalSales} total</Text>
          )}
        </View>
        {sales.length === 0 ? (
          <View style={{ alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 32 }}>
            <View style={{ marginBottom: 12, height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#fef3c7" }}>
              <Ionicons name="storefront-outline" size={28} color="#f59e0b" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.gray[900] }}>No walk-in sales yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Tap &quot;New sale&quot; to sell retail products in person.
            </Text>
          </View>
        ) : (
          sales.slice(0, 20).map((sale) => {
            const n = lineCountForSale(sale);
            return (
              <TouchableOpacity
                key={sale.id}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedSale(sale);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Sale ${sale.order_number}, view details`}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fef3c7" }}>
                  <Ionicons name="receipt-outline" size={20} color="#f59e0b" />
                </View>
                <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontWeight: "700", color: Colors.gray[900] }}>{sale.order_number}</Text>
                    {sale.customer_name?.trim() ? (
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }} numberOfLines={1}>· {sale.customer_name.trim()}</Text>
                    ) : null}
                  </View>
                  <Text style={{ marginTop: 3, fontSize: 15, fontWeight: "600", color: Colors.gray[800] }}>
                    {formatCurrency(Number(sale.total_amount), tenantCurrency)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                    {sale.payment_method.replace(/_/g, " ")} · {n > 0 ? `${n} item${n !== 1 ? "s" : ""} · ` : ""}{formatDateSafe(sale.created_at)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <BottomSheet
        visible={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title={selectedSale?.order_number ?? "Sale"}
        subtitle={selectedSale ? formatDateSafe(selectedSale.created_at) : undefined}
      >
        {selectedSale ? (
          <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
            {/* Status badges */}
            <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Ionicons name="storefront-outline" size={13} color="#92400e" />
                <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: "600", color: "#92400e" }}>Walk-in · Delivered</Text>
              </View>
              <View style={{ borderRadius: 10, backgroundColor: Colors.gray[100], paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>
                  {String(selectedSale.payment_method).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
              </View>
              {selectedSale.customer_id ? (
                <View style={{ borderRadius: 10, backgroundColor: "#e0e7ff", paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#3730a3" }}>Client linked</Text>
                </View>
              ) : null}
            </View>

            {/* Customer info */}
            {(selectedSale.customer_name?.trim() || selectedSale.customer_phone?.trim()) ? (
              <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: "#ecfdf5", padding: 12, flexDirection: "row", alignItems: "center" }}>
                <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: "#d1fae5", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                  <Ionicons name="person-outline" size={18} color="#047857" />
                </View>
                <View style={{ flex: 1 }}>
                  {selectedSale.customer_name?.trim() ? (
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#065f46" }} numberOfLines={1}>
                      {selectedSale.customer_name.trim()}
                    </Text>
                  ) : null}
                  {selectedSale.customer_phone?.trim() ? (
                    <Text style={{ fontSize: 13, color: "#047857" }} selectable>
                      {selectedSale.customer_phone.trim()}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {selectedSale.payment_reference?.trim() ? (
              <View style={{ marginBottom: 12, backgroundColor: Colors.gray[50], borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="receipt-outline" size={16} color={Colors.gray[500]} />
                <Text style={{ marginLeft: 8, fontSize: 13, color: Colors.gray[600] }} selectable numberOfLines={1}>
                  Ref: {selectedSale.payment_reference.trim()}
                </Text>
              </View>
            ) : null}

            {/* Line items */}
            <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "700", color: Colors.gray[400], letterSpacing: 0.8, textTransform: "uppercase" }}>
              Items
            </Text>
            {(selectedSale.items ?? selectedSale.product_order_items ?? []).length === 0 ? (
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>No line items returned for this sale.</Text>
            ) : (
              (selectedSale.items ?? selectedSale.product_order_items ?? []).map((it, idx) => (
                <View
                  key={`${selectedSale.id}-${idx}-${it.product_name}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.gray[100],
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={3}>
                      {it.product_name}
                    </Text>
                    <Text style={{ marginTop: 3, fontSize: 13, color: Colors.gray[500] }}>
                      {it.quantity} × {formatCurrency(Number(it.unit_price), tenantCurrency)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[800] }}>
                    {formatCurrency(saleLineTotal(it), tenantCurrency)}
                  </Text>
                </View>
              ))
            )}

            {/* Totals */}
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 12, marginBottom: 16 }}>
              {selectedSale.subtotal != null && Number(selectedSale.subtotal) > 0 ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Subtotal</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{formatCurrency(Number(selectedSale.subtotal), tenantCurrency)}</Text>
                </View>
              ) : null}
              {selectedSale.tax_amount != null && Number(selectedSale.tax_amount) > 0 ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Tax</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{formatCurrency(Number(selectedSale.tax_amount), tenantCurrency)}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Total paid</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                  {formatCurrency(Number(selectedSale.total_amount), tenantCurrency)}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={{ gap: 10, paddingBottom: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  void shareProviderOrderReceipt(
                    selectedSale.id,
                    selectedSale.order_number,
                  ).catch((e) =>
                    Alert.alert("Share", e instanceof Error ? e.message : "Could not share receipt."),
                  );
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Share order receipt"
              >
                <Ionicons name="share-outline" size={18} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Share receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  void downloadPdf({
                    router,
                    pdfPath: `/api/provider/product-orders/${encodeURIComponent(selectedSale.id)}/receipt/pdf`,
                    signedUrlPath: `/api/provider/product-orders/${encodeURIComponent(selectedSale.id)}/receipt/signed-url`,
                    filename: `order_${selectedSale.order_number || selectedSale.id}.pdf`,
                    title: `Order ${selectedSale.order_number}`,
                    label: "receipt",
                  }).catch((e) =>
                    Alert.alert(
                      "Download receipt",
                      e instanceof Error ? e.message : "Something went wrong.",
                    ),
                  );
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Download order receipt"
              >
                <Ionicons name="download-outline" size={18} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Download PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setSelectedSale(null);
                  router.push(`/(app)/(tabs)/more/orders-hub?order=${selectedSale.id}` as never);
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Manage order in orders hub"
              >
                <Ionicons name="cube-outline" size={18} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Manage in Orders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleRefundSale(selectedSale)}
                disabled={refunding}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: refunding ? "#fca5a5" : "#fee2e2",
                  paddingVertical: 12,
                  opacity: refunding ? 0.6 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Process refund for this sale"
              >
                <Ionicons name="return-down-back-outline" size={18} color="#dc2626" />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "600", color: "#dc2626" }}>
                  {refunding ? "Processing…" : "Process Refund / Return"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setVariantPickProduct(null);
        }}
        title="New walk-in sale"
        subtitle="Search products, choose variants when needed, then pay"
        snapHeight="full"
      >
        {loadingProducts && !productsData ? (
          <LoadingState />
        ) : (
          <>
            {variantPickProduct ? (
              <View style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setVariantPickProduct(null)}
                  style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to product list"
                >
                  <Ionicons name="chevron-back" size={22} color="#374151" />
                  <Text style={{ marginLeft: 4, fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Products</Text>
                </TouchableOpacity>
                <Text style={{ marginBottom: 4, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={2}>
                  {variantPickProduct.name}
                </Text>
                <Text style={{ marginBottom: 12, fontSize: 13, color: Colors.gray[500] }}>Select an option to add to the cart</Text>
                <ScrollView style={{ maxHeight: 280, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }} nestedScrollEnabled>
                  {(variantPickProduct.variants ?? []).map((v, idx) => {
                    const maxV = maxSellableUnits(variantPickProduct, v.id);
                    const disabled = maxV < 1;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => !disabled && addLine(variantPickProduct, v)}
                        disabled={disabled}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          borderBottomWidth: idx < (variantPickProduct.variants?.length ?? 0) - 1 ? 1 : 0,
                          borderBottomColor: Colors.gray[100],
                          opacity: disabled ? 0.45 : 1,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                          <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={2}>
                            {formatProductVariantLabel(v)}
                          </Text>
                          <Text style={{ marginTop: 4, fontSize: 13, color: Colors.gray[600] }}>
                            {formatCurrency(Number(v.retail_price), tenantCurrency)}
                            {` · ${maxV} available`}
                          </Text>
                        </View>
                        <Ionicons name="add-circle" size={26} color={disabled ? Colors.gray[300] : "#f59e0b"} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
                    Scan or enter barcode
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={barcodeInput}
                      onChangeText={setBarcodeInput}
                      placeholder="Barcode / SKU"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleBarcodeCode(barcodeInput)}
                      editable={!barcodeLookupBusy}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        backgroundColor: Colors.white,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => void handleBarcodeCode(barcodeInput)}
                      disabled={barcodeLookupBusy}
                      style={{
                        borderRadius: 12,
                        backgroundColor: "#4f46e5",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        opacity: barcodeLookupBusy ? 0.6 : 1,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Look up barcode"
                    >
                      <Ionicons name="search" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setBarcodeScanOpen(true)}
                      disabled={barcodeLookupBusy}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "#c4b5fd",
                        backgroundColor: "#f5f3ff",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Scan barcode with camera"
                    >
                      <Ionicons name="barcode-outline" size={22} color="#6d28d9" />
                    </TouchableOpacity>
                  </View>
                  {barcodeLookupError ? (
                    <Text style={{ marginTop: 6, fontSize: 12, color: "#B91C1C" }}>{barcodeLookupError}</Text>
                  ) : null}
                </View>
                <SearchBar
                  placeholder="Search products…"
                  value={productSearch}
                  onChangeText={setProductSearch}
                />
                <Text style={{ marginTop: 12, marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Products</Text>
                {productsError && !productsData && (
                  <View style={{ marginBottom: 12, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12 }}>
                    <Text style={{ fontSize: 13, color: "#B91C1C" }}>Could not load products. Pull down to retry.</Text>
                  </View>
                )}
                <ScrollView style={{ marginBottom: 16, maxHeight: 220, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50] }} nestedScrollEnabled>
                  {filteredProducts.length === 0 ? (
                    <Text style={{ padding: 16, fontSize: 14, color: Colors.gray[500] }}>
                      {sellableProducts.length === 0
                        ? "No retail products yet. Add products with retail sales enabled."
                        : "No matches. Try a different search."}
                    </Text>
                  ) : (
                    filteredProducts.map((p, idx) => {
                      const inCart = cart.filter((c) => c.product_id === p.id);
                      const cartQtyForProduct = inCart.reduce((s, c) => s + c.quantity, 0);
                      const hasV = Boolean(p.has_variants && (p.variants?.length ?? 0) > 0);
                      const variantMatrixBroken = Boolean(p.has_variants) && !hasV;
                      const maxSimple = maxSellableUnits(p, null);
                      const priceLabel = hasV
                        ? `From ${formatCurrency(displayRetailPriceMin(p), tenantCurrency)}`
                        : formatCurrency(Number(p.retail_price), tenantCurrency);
                      const stockLabel = hasV
                        ? `${effectiveStockQuantity({
                            has_variants: true,
                            quantity: p.quantity,
                            variants: p.variants?.map((x) => ({ quantity: x.quantity, retail_price: x.retail_price })),
                          })} units (all options)`
                        : p.track_stock_quantity === false
                          ? "Stock not tracked"
                          : `${maxSimple} in stock`;
                      const rowDisabled = variantMatrixBroken || (!hasV && maxSimple < 1);

                      return (
                        <View
                          key={p.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottomWidth: idx < filteredProducts.length - 1 ? 1 : 0,
                            borderBottomColor: Colors.gray[100],
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => onProductRowPress(p)}
                            disabled={rowDisabled}
                            style={{ flex: 1, minWidth: 0, opacity: rowDisabled ? 0.45 : 1 }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={2}>
                              {p.name}
                            </Text>
                            <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                              {priceLabel} · {stockLabel}
                            </Text>
                            {variantMatrixBroken && (
                              <Text style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>Variants not loaded — open product in catalogue to fix.</Text>
                            )}
                            {hasV && (
                              <Text style={{ marginTop: 4, fontSize: 12, color: "#b45309" }}>Tap to choose size / option</Text>
                            )}
                          </TouchableOpacity>
                          {!hasV ? (
                            inCart.length > 0 ? (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <TouchableOpacity
                                  onPress={() => {
                                    const line = inCart[0];
                                    if (line) updateCartQty(line.lineId, -1);
                                  }}
                                  style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[200], marginRight: 8 }}
                                >
                                  <Ionicons name="remove" size={18} color="#374151" />
                                </TouchableOpacity>
                                <Text style={{ minWidth: 28, textAlign: "center", fontWeight: "500", marginRight: 8 }}>
                                  {cartQtyForProduct}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    const line = inCart[0];
                                    if (line) {
                                      if (line.quantity >= maxSimple) return;
                                      updateCartQty(line.lineId, 1);
                                    } else {
                                      onProductRowPress(p);
                                    }
                                  }}
                                  disabled={cartQtyForProduct >= maxSimple}
                                  style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#f59e0b" }}
                                >
                                  <Ionicons name="add" size={18} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                onPress={() => onProductRowPress(p)}
                                disabled={rowDisabled}
                                style={{ borderRadius: 8, backgroundColor: "#f59e0b", paddingHorizontal: 12, paddingVertical: 6 }}
                              >
                                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.white }}>Add</Text>
                              </TouchableOpacity>
                            )
                          ) : (
                            <TouchableOpacity
                              onPress={() => onProductRowPress(p)}
                              style={{ borderRadius: 8, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "#fffbeb", paddingHorizontal: 12, paddingVertical: 6 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: "#b45309" }}>Options</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </>
            )}

            {cart.length > 0 && (
              <>
                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Cart</Text>
                <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                  {cart.map((c) => (
                    <View key={c.lineId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <Text style={{ fontSize: 14, color: Colors.gray[900] }} numberOfLines={2}>
                          {c.name}
                        </Text>
                        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity
                            onPress={() => updateCartQty(c.lineId, -1)}
                            style={{ height: 28, width: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: Colors.gray[200] }}
                          >
                            <Ionicons name="remove" size={16} color="#374151" />
                          </TouchableOpacity>
                          <Text style={{ minWidth: 28, textAlign: "center", fontWeight: "600", marginHorizontal: 8 }}>{c.quantity}</Text>
                          <TouchableOpacity
                            onPress={() => updateCartQty(c.lineId, 1)}
                            style={{ height: 28, width: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: Colors.gray[200] }}
                          >
                            <Ionicons name="add" size={16} color="#374151" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>
                          {formatCurrency(c.price * c.quantity, tenantCurrency)}
                        </Text>
                        <TouchableOpacity onPress={() => removeLine(c.lineId)} style={{ marginTop: 4 }} hitSlop={8}>
                          <Text style={{ fontSize: 12, color: "#dc2626" }}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 8, gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Subtotal</Text>
                      <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{formatCurrency(cartSubtotal, tenantCurrency)}</Text>
                    </View>
                    {cartTax > 0 ? (
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Tax</Text>
                        <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{formatCurrency(cartTax, tenantCurrency)}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Total</Text>
                      <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(cartTotalDue, tenantCurrency)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Payment</Text>
                <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
                  {WALK_IN_PAYMENT_METHODS.filter(
                    (method) =>
                      (paystackTerminalEnabled || method.id !== "paystack_terminal") &&
                      (yocoEnabled || method.id !== "yoco") &&
                      (canProcessPayments && paycloudEnabled && paycloudCollectEnabled || method.id !== "paycloud"),
                  ).map((method) => {
                    const active = paymentMethod === method.id;
                    return (
                      <TouchableOpacity
                        key={method.id}
                        onPress={() => setPaymentMethod(method.id)}
                        style={{
                          width: "48%",
                          marginHorizontal: "1%",
                          marginBottom: 8,
                          borderRadius: 12,
                          paddingVertical: 10,
                          backgroundColor: active ? "#f59e0b" : Colors.gray[100],
                        }}
                      >
                        <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: active ? Colors.white : Colors.gray[700] }}>
                          {method.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {canProcessPayments && paycloudEnabled && !paycloudCollectEnabled ? (
                    <View style={{ width: "100%", marginHorizontal: "1%", marginBottom: 8 }}>
                      <PaycloudCollectSetupAffordance blocker={paycloudPrimaryBlocker} compact loading={paycloudLoading} />
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    setLinkClientsOpen((o) => {
                      const next = !o;
                      if (!next) setClientPickSearch("");
                      return next;
                    });
                  }}
                  style={{
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: Colors.gray[50],
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={linkClientsOpen ? "Hide saved client picker" : "Link a saved client"}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <Ionicons name="people-outline" size={20} color={Colors.gray[600]} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>Saved client</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Attach this sale to a client profile</Text>
                    </View>
                  </View>
                  <Ionicons name={linkClientsOpen ? "chevron-up" : "chevron-down"} size={20} color={Colors.gray[500]} />
                </TouchableOpacity>

                {linkedClient ? (
                  <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#ecfdf5", padding: 12 }}>
                    <Ionicons name="checkmark-circle" size={22} color="#047857" />
                    <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, fontWeight: "600", color: "#065f46" }} numberOfLines={2}>
                      {linkedClient.full_name}
                    </Text>
                    <TouchableOpacity onPress={() => setLinkedClient(null)} hitSlop={8} accessibilityLabel="Clear linked client">
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#b91c1c" }}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {linkClientsOpen && !linkedClient ? (
                  <View style={{ marginBottom: 14 }}>
                    <SearchBar placeholder="Search saved clients…" value={clientPickSearch} onChangeText={setClientPickSearch} />
                    {pickClientsError ? (
                      <Text style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>
                        Could not load clients. You may need permission to view clients.
                      </Text>
                    ) : null}
                    {pickClientsLoading && pickClients.length === 0 ? (
                      <View style={{ paddingVertical: 16 }}>
                        <LoadingState />
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 200, marginTop: 8 }} nestedScrollEnabled>
                        {pickClients.map((c, i) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setLinkedClient({ customer_id: c.customer_id, full_name: c.full_name });
                              setCustomerName((prev) => (prev.trim() ? prev : c.full_name));
                              setLinkClientsOpen(false);
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 12,
                              borderBottomWidth: i < pickClients.length - 1 ? 1 : 0,
                              borderBottomColor: Colors.gray[100],
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Link client ${c.full_name}`}
                          >
                            <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: "#4f46e5" }}>
                                {c.full_name
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .map((w) => w[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase() || "?"}
                              </Text>
                            </View>
                            <View style={{ marginLeft: 12, flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>{c.full_name}</Text>
                              {c.phone ? <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{c.phone}</Text> : null}
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                          </TouchableOpacity>
                        ))}
                        {pickClients.length === 0 && !pickClientsLoading ? (
                          <Text style={{ paddingVertical: 12, fontSize: 14, color: Colors.gray[500] }}>No clients match.</Text>
                        ) : null}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Customer (optional)</Text>
                <TextInput
                  style={{ marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: Colors.gray[900] }}
                  placeholder="Name on receipt"
                  placeholderTextColor="#9ca3af"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <E164PhoneField
                  valueE164={customerPhoneE164}
                  onChangeE164={(v) => {
                    setCustomerPhoneE164(v);
                    if (checkoutError) setCheckoutError(null);
                  }}
                  compact
                  muted
                  accessibilityLabel="Customer phone"
                />

                {checkoutError ? (
                  <View
                    style={{
                      marginBottom: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#fecaca",
                      backgroundColor: "#fef2f2",
                      padding: 12,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#b91c1c" }}>{checkoutError}</Text>
                  </View>
                ) : null}

                <ActionButton
                  label={
                    preparingPaystackTerminal || preparingPaycloud
                      ? "Preparing terminal..."
                      : creating
                        ? "Completing…"
                        : paymentMethod === "paystack_terminal"
                          ? `Show Paystack Terminal · ${formatCurrency(cartTotalDue)}`
                          : `Complete sale · ${formatCurrency(cartTotalDue)}`
                  }
                  onPress={handleCompleteSale}
                  loading={creating || preparingPaystackTerminal || preparingPaycloud}
                  fullWidth
                />
              </>
            )}

            {cart.length === 0 && !variantPickProduct && (
              <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>Add products above to continue.</Text>
            )}
          </>
        )}
      </BottomSheet>

      <YocoPaymentSheet
        visible={showYocoPayment}
        onClose={() => setShowYocoPayment(false)}
        amountCents={Math.round(cartTotalDue * 100)}
        currency={tenantCurrency}
        description="Walk-in sale"
        onPaymentSuccess={async (result) => {
          await submitSale(result.reference);
        }}
      />

      {paycloudLinkedOrderId ? (
        <PayCloudPaymentSheet
          visible={showPaycloudPayment}
          onClose={() => setShowPaycloudPayment(false)}
          amount={paycloudLinkedTotal ?? cartTotalDue}
          currency={tenantCurrency}
          entityType="product_order"
          entityId={paycloudLinkedOrderId}
          bookingLocationId={selectedLocationId}
          onPaymentSuccess={async () => {
            await submitSale(undefined, paycloudLinkedOrderId);
          }}
        />
      ) : null}

      <BottomSheet
        visible={!!paystackTerminalPrompt}
        onClose={() => setPaystackTerminalPrompt(null)}
        title="Paystack Terminal"
      >
        {paystackTerminalPrompt ? (
          <View>
            <Text style={{ marginBottom: 12, fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>
              Ask the customer to pay using this Paystack link. Paystack generates the transaction reference; this sale is not recorded as paid until you allocate the webhooked payment.
            </Text>
            <View style={{ marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#ecfdf5", padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#047857", textTransform: "uppercase" }}>
                Terminal code
              </Text>
              <Text style={{ marginTop: 6, fontFamily: "monospace", fontSize: 24, fontWeight: "800", color: "#064e3b" }}>
                {paystackTerminalPrompt.code}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 14, color: "#047857" }}>
                Expected: {formatCurrency(paystackTerminalPrompt.expectedAmount, tenantCurrency)}
              </Text>
              {paystackTerminalPrompt.reference ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: "#047857" }}>
                  Booking/order note: {paystackTerminalPrompt.reference}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  void Share.share({
                    title: "Paystack Terminal",
                    message: paystackTerminalPrompt.link
                      ? `Pay ${formatCurrency(paystackTerminalPrompt.expectedAmount, tenantCurrency)} using this Paystack Terminal link: ${paystackTerminalPrompt.link}${paystackTerminalPrompt.reference ? ` Note: ${paystackTerminalPrompt.reference}` : ""}`
                      : `Pay ${formatCurrency(paystackTerminalPrompt.expectedAmount, tenantCurrency)} using Paystack Terminal code ${paystackTerminalPrompt.code}${paystackTerminalPrompt.reference ? `. Note: ${paystackTerminalPrompt.reference}` : ""}.`,
                  });
                }}
                style={{ flex: 1, borderRadius: 12, backgroundColor: "#16a34a", paddingVertical: 12 }}
              >
                <Text style={{ textAlign: "center", fontWeight: "700", color: "#fff" }}>Share</Text>
              </TouchableOpacity>
              {paystackTerminalPrompt.link ? (
                <TouchableOpacity
                  onPress={() => void Linking.openURL(paystackTerminalPrompt.link || "")}
                  style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#16a34a", paddingVertical: 12 }}
                >
                  <Text style={{ textAlign: "center", fontWeight: "700", color: "#15803d" }}>Open link</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {paystackTerminalPrompt.pendingOrderId ? (
              <TouchableOpacity
                onPress={() => void submitSale(undefined, paystackTerminalPrompt.pendingOrderId)}
                style={{ marginTop: 12, borderRadius: 12, backgroundColor: "#111827", paddingVertical: 14 }}
              >
                <Text style={{ textAlign: "center", fontWeight: "700", color: "#fff" }}>
                  Payment received — complete sale
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      <BarcodeScannerModal
        visible={barcodeScanOpen}
        onClose={() => setBarcodeScanOpen(false)}
        title="Scan product barcode"
        busy={barcodeLookupBusy}
        errorMessage={barcodeLookupError}
        onScanned={(code) => {
          void handleBarcodeCode(code);
        }}
      />
    </ScreenContainer>
  );
}
