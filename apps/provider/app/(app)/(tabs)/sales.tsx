import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  Linking,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useFromTransactionsHub, useProviderStackBack } from "@/lib/provider-tab-navigation";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { PayCloudPaymentSheet } from "@/components/payments/PayCloudPaymentSheet";
import { usePayCloudSettings } from "@/hooks/usePayCloud";
import { PAYCLOUD_SETUP_LABEL } from "@/lib/paycloud-collect-cta";
import { getReportDateRange } from "@/lib/reportDateRanges";
import { useApi, useApiPost } from "@/hooks/useApi";
import { useFocusedApi } from "@/hooks/useFocusedApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useConfigBundle, useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatCurrency,
  formatDate,
  formatTime,
} from "@/lib/format";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { api } from "@/lib/api-client";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalCollectionIntentPayload,
} from "@/lib/paystack-terminal-api";
import { PROVIDER_PRODUCTS_CATALOG_CHANGED } from "@/lib/provider-products-catalog-events";
import { PROVIDER_SERVICES_CATALOG_CHANGED } from "@/lib/provider-services-catalog-events";
import { isProductSellable, maxSellableUnits } from "@/features/products/cartItem";
import type { ProductItem as PosProductItem } from "@/features/products/types";
import { pt } from "@/lib/provider-translate";

interface DashboardMetrics {
  revenue_today: number;
  revenue_this_month: number;
  lifetime_revenue: number;
  revenue_growth: number;
  service_earnings_total: number;
  travel_fees_total: number;
  pending_payments_amount: number;
  pending_payments_count: number;
}

interface Sale {
  id: string;
  ref_number: string;
  client_name: string | null;
  date: string;
  items: {
    id: string;
    type: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    item_id?: string | null;
    product_variant_id?: string | null;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  payment_status?: string;
  team_member_name: string | null;
}

interface SalesResponse {
  data: Sale[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface CatalogueService {
  id: string;
  title: string;
  price: number;
  currency: string;
  duration_minutes: number;
  service_type?: string;
}

interface ProductVariantRow {
  id: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity: number;
  sku?: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  retail_price: number;
  currency?: string;
  sku?: string;
  stock_quantity?: number;
  quantity?: number;
  effective_quantity?: number;
  has_variants?: boolean;
  variants?: ProductVariantRow[];
}

interface ProductsResponse {
  products: ProductItem[];
  total: number;
}

interface ApiClient {
  id: string;
  customer_id: string;
  customer?: {
    id: string;
    full_name?: string;
    email?: string;
    phone?: string;
  };
}

interface Client {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  email: string;
}

interface StaffMember {
  id: string;
  name: string;
  role?: string;
}

interface CartItem {
  /** Stable row key for quantity controls and removal */
  lineId: string;
  /** offerings.id (variant or parent) or products.id for `sale_items.item_id` */
  item_id: string;
  type: "service" | "product";
  name: string;
  price: number;
  quantity: number;
  currency?: string;
  /** When this line is a service variant, parent offering id (for UI only). */
  parent_service_id?: string | null;
  product_variant_id?: string | null;
}

interface ServiceVariantRow {
  id: string;
  title: string;
  price: number;
  currency?: string;
}

function parseServiceVariantsPayload(data: unknown): ServiceVariantRow[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as { variants?: unknown }).variants;
  if (!Array.isArray(raw)) return [];
  return raw.map((v: Record<string, unknown>) => ({
    id: String(v.id),
    title: String(v.title ?? v.variant_name ?? "Option"),
    price: Number(v.price ?? 0),
    currency: typeof v.currency === "string" ? v.currency : undefined,
  }));
}

function formatProductVariantLabel(v: ProductVariantRow): string {
  const vals = v.option_values ? Object.values(v.option_values).filter(Boolean) : [];
  if (vals.length) return vals.join(" / ");
  if (v.sku) return String(v.sku);
  return "Option";
}

function newCartLineId(): string {
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type CheckoutStep =
  | "idle"
  | "select_client"
  | "select_services"
  | "review"
  | "payment"
  | "receipt";

type PaymentMethod = "cash" | "yoco" | "paycloud" | "card" | "eft" | "paystack_terminal";

const DATE_RANGES = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All Time", value: "all" },
];

export default function SalesScreen() {
  const router = useRouter();
  const fromTransactionsHub = useFromTransactionsHub();
  const handleBack = useProviderStackBack();
  const tenantCurrency = getTenantDefaultCurrency();
  const { isTablet } = useResponsive();
  const adsModule = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsFeatureOn = useFeatureFlag("ads.enabled");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { settings: paycloudSettings } = usePayCloudSettings();
  const paycloudReady =
    paycloudEnabled &&
    Boolean(paycloudSettings?.ready);
  const paycloudInFlight = (paycloudSettings?.terminals?.inFlight ?? 0) > 0;
  const paycloudCollectEnabled = paycloudReady || paycloudInFlight;
  const { isLoading: configLoading } = useConfigBundle();
  const unifiedPosEnabled = useFeatureFlag("provider.unified_pos_checkout");

  useEffect(() => {
    if (!configLoading && !unifiedPosEnabled) {
      router.replace("/(app)/(tabs)/dashboard" as never);
    }
  }, [configLoading, unifiedPosEnabled, router]);

  const paymentMethodOptions = useMemo(() => {
    const base: { label: string; value: PaymentMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
      { label: "Cash", value: "cash", icon: "cash-outline" },
      ...(yocoEnabled
        ? [{ label: "Yoco terminal", value: "yoco" as const, icon: "card-outline" as const }]
        : []),
      ...(paycloudEnabled && paycloudCollectEnabled
        ? [{
            label: paycloudInFlight ? "Resume card machine" : "Card machine",
            value: "paycloud" as const,
            icon: "card-outline" as const,
          }]
        : []),
      { label: "Card manual", value: "card", icon: "reader-outline" },
      { label: "EFT", value: "eft", icon: "swap-horizontal-outline" },
    ];
    if (paystackTerminalEnabled) {
      const insertAt = 2 + (yocoEnabled ? 1 : 0) + (paycloudEnabled && paycloudCollectEnabled ? 1 : 0);
      base.splice(insertAt, 0, {
        label: "Paystack Terminal",
        value: "paystack_terminal",
        icon: "qr-code-outline",
      });
    }
    return base;
  }, [paystackTerminalEnabled, yocoEnabled, paycloudEnabled, paycloudCollectEnabled, paycloudInFlight]);
  const adsSelfServeAvailable = Boolean(adsModule?.enabled) || adsFeatureOn;
  const { provider, selectedLocationId } = useProvider();
  const locQ = selectedLocationId ? `&location_id=${selectedLocationId}` : "";
  const locQFirst = selectedLocationId ? `?location_id=${selectedLocationId}` : "";
  const [dateRange, setDateRange] = useState("month");
  const [refreshing, setRefreshing] = useState(false);
  // §Provider-audit 2026-04 (B2): wire the unified /api/provider/sales
  // `search` param to a debounced input so providers can quickly find a
  // specific sale by reference or client name. Previously the screen only
  // supported date + location filtering, which made scanning busy stores
  // frustrating. SearchBar debounces internally.
  const [salesSearchDebounced, setSalesSearchDebounced] = useState("");

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("idle");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [tip, setTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [cartTab, setCartTab] = useState<"services" | "products">("services");
  const variantsCacheRef = useRef<Map<string, ServiceVariantRow[]>>(new Map());
  const [variantLoadingId, setVariantLoadingId] = useState<string | null>(null);
  const [servicePick, setServicePick] = useState<{
    parent: CatalogueService;
    variants: ServiceVariantRow[];
  } | null>(null);
  const [productPick, setProductPick] = useState<ProductItem | null>(null);
  const [receiptData, setReceiptData] = useState<{
    total: number;
    items: CartItem[];
    client: string;
    method: PaymentMethod;
    date: string;
  } | null>(null);

  const yocoPendingSaleIdRef = useRef<string | null>(null);
  const [yocoLinkedSaleId, setYocoLinkedSaleId] = useState<string | null>(null);
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const paycloudPendingSaleIdRef = useRef<string | null>(null);
  const [paycloudLinkedSaleId, setPaycloudLinkedSaleId] = useState<string | null>(null);
  const [showPaycloudPayment, setShowPaycloudPayment] = useState(false);
  const [preparingPaystackTerminal, setPreparingPaystackTerminal] = useState(false);
  const [paystackTerminalPrompt, setPaystackTerminalPrompt] = useState<{
    code: string;
    link?: string | null;
    reference?: string | null;
    expectedAmount: number;
  } | null>(null);

  const { isFocused } = useFocusedApi();

  const {
    data: metrics,
    refresh: refreshMetrics,
  } = useApi<DashboardMetrics>(`/api/provider/dashboard${locQFirst}`, {
    enabled: isFocused,
    staleTimeMs: 15_000,
  });

  const dateParams = useMemo(() => {
    const tz = provider?.timezone ?? null;
    switch (dateRange) {
      case "today": {
        const { from, to } = getReportDateRange("today", { timezone: tz });
        return `&date_from=${from}&date_to=${to}`;
      }
      case "week": {
        const { from, to } = getReportDateRange("week", { timezone: tz });
        return `&date_from=${from}&date_to=${to}`;
      }
      case "month": {
        const { from, to } = getReportDateRange("month", { timezone: tz });
        return `&date_from=${from}&date_to=${to}`;
      }
      default:
        return "";
    }
  }, [dateRange, provider?.timezone]);

  const searchQ = salesSearchDebounced
    ? `&search=${encodeURIComponent(salesSearchDebounced)}`
    : "";
  const {
    data: salesResponse,
    loading: salesLoading,
    error: salesError,
    refresh: refreshSales,
  } = useApi<SalesResponse>(
    `/api/provider/sales?limit=50${dateParams}${locQ}${searchQ}`,
    { enabled: isFocused, staleTimeMs: 15_000 },
  );
  const sales = salesResponse?.data ?? [];

  const { data: catalogue, refresh: refreshCatalogue } = useApi<CatalogueService[]>(
    "/api/provider/services?is_active=true",
    { enabled: isFocused, staleTimeMs: 60_000 },
  );
  const { data: productsResponse, refresh: refreshProducts } = useApi<ProductsResponse | ProductItem[]>(
    "/api/provider/products?limit=200",
    { enabled: isFocused, staleTimeMs: 60_000 },
  );
  const products = useMemo<ProductItem[]>(() => {
    if (!productsResponse) return [];
    const raw = Array.isArray(productsResponse) ? productsResponse : productsResponse.products ?? [];
    return raw.filter((p) => isProductSellable(p as PosProductItem));
  }, [productsResponse]);

  useEffect(() => {
    const subProducts = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refreshProducts();
    });
    const subServices = DeviceEventEmitter.addListener(PROVIDER_SERVICES_CATALOG_CHANGED, () => {
      void refreshCatalogue();
    });
    return () => {
      subProducts.remove();
      subServices.remove();
    };
  }, [refreshProducts, refreshCatalogue]);

  const { data: staffMembers } = useApi<StaffMember[]>(
    selectedLocationId ? `/api/provider/staff?location_id=${selectedLocationId}` : "/api/provider/staff",
    { enabled: isFocused, staleTimeMs: 30_000 },
  );
  const { data: rawClients } = useApi<ApiClient[]>(`/api/provider/clients${locQFirst}`, {
    enabled: isFocused,
    staleTimeMs: 30_000,
  });
  const clients = useMemo<Client[] | null>(() => {
    if (!rawClients) return null;
    return rawClients.map((c) => ({
      id: c.id,
      customer_id: c.customer_id,
      full_name: c.customer?.full_name || "Unknown",
      phone: c.customer?.phone || "",
      email: c.customer?.email || "",
    }));
  }, [rawClients]);
  const { execute: createSale, loading: creatingSale } = useApiPost<
    object,
    { id: string }
  >("/api/provider/sales");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMetrics(), refreshSales()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshMetrics, refreshSales]);

  // Cart helpers
  const { data: paymentSettings } = useApi<{ taxRatePercent?: number; taxInclusive?: boolean }>(
    "/api/provider/settings/payments",
    { enabled: isFocused, staleTimeMs: 60_000 },
  );
  const taxRate = (paymentSettings?.taxRatePercent ?? 0) / 100;
  const taxInclusive = paymentSettings?.taxInclusive ?? true;

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const discountAmount = Number(discount) || 0;
  const tipAmount = Number(tip) || 0;
  const afterDiscount = Math.max(0, cartTotal - discountAmount);
  const taxAmount = taxInclusive
    ? afterDiscount - afterDiscount / (1 + taxRate)
    : afterDiscount * taxRate;
  const grandTotal = taxInclusive
    ? afterDiscount + tipAmount
    : afterDiscount + taxAmount + tipAmount;

  async function handleServiceRowPress(service: CatalogueService) {
    if (variantLoadingId) return;
    let rows = variantsCacheRef.current.get(service.id);
    if (rows === undefined) {
      setVariantLoadingId(service.id);
      const res = await api.get<{ variants?: unknown }>(
        `/api/provider/services/${service.id}/variants`,
      );
      setVariantLoadingId(null);
      if (res.error) {
        Alert.alert("Could not load options", res.error.message);
        return;
      }
      rows = parseServiceVariantsPayload(res.data);
      variantsCacheRef.current.set(service.id, rows);
    }
    if (rows.length === 0) {
      addParentServiceToCart(service);
    } else {
      setServicePick({ parent: service, variants: rows });
    }
  }

  function addParentServiceToCart(service: CatalogueService) {
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.type === "service" &&
          i.item_id === service.id &&
          !(i.parent_service_id ?? null),
      );
      if (existing) {
        return prev.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          lineId: newCartLineId(),
          item_id: service.id,
          type: "service" as const,
          name: service.title,
          price: service.price,
          quantity: 1,
          currency: service.currency,
          parent_service_id: null,
        },
      ];
    });
  }

  function addServiceVariantChoice(parent: CatalogueService, variant: ServiceVariantRow | null) {
    const name =
      variant == null
        ? parent.title
        : `${parent.title} — ${variant.title}`;
    const price = variant == null ? parent.price : variant.price;
    const itemId = variant == null ? parent.id : variant.id;
    const currency = variant?.currency ?? parent.currency;
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "service" && i.item_id === itemId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          lineId: newCartLineId(),
          item_id: itemId,
          type: "service" as const,
          name,
          price,
          quantity: 1,
          currency,
          parent_service_id: variant ? parent.id : null,
        },
      ];
    });
    setServicePick(null);
  }

  function addSimpleProductToCart(product: ProductItem) {
    const max = maxSellableUnits(product as PosProductItem, null);
    if (max <= 0) {
      Alert.alert("Out of stock", `${product.name} is out of stock.`);
      return;
    }
    const unit = Number(product.retail_price ?? 0);
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.type === "product" &&
          i.item_id === product.id &&
          !(i.product_variant_id ?? null),
      );
      if (existing) {
        if (existing.quantity >= max) return prev;
        return prev.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          lineId: newCartLineId(),
          item_id: product.id,
          type: "product" as const,
          name: product.name,
          price: unit,
          quantity: 1,
          currency: product.currency,
          product_variant_id: null,
        },
      ];
    });
  }

  function addProductVariantToCart(product: ProductItem, variant: ProductVariantRow) {
    const max = maxSellableUnits(product as PosProductItem, variant as never);
    if (max <= 0) {
      Alert.alert("Out of stock", "That variant is out of stock.");
      return;
    }
    const unit = Number(variant.retail_price ?? 0);
    const label = formatProductVariantLabel(variant);
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.type === "product" &&
          i.item_id === product.id &&
          (i.product_variant_id ?? null) === variant.id,
      );
      if (existing) {
        if (existing.quantity >= max) return prev;
        return prev.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          lineId: newCartLineId(),
          item_id: product.id,
          type: "product" as const,
          name: `${product.name} — ${label}`,
          price: unit,
          quantity: 1,
          currency: product.currency,
          product_variant_id: variant.id,
        },
      ];
    });
    setProductPick(null);
  }

  function handleProductRowPress(product: ProductItem) {
    if (product.has_variants && (product.variants?.length ?? 0) > 0) {
      setProductPick(product);
      return;
    }
    addSimpleProductToCart(product);
  }

  function removeFromCart(lineId: string) {
    setCart((prev) => prev.filter((i) => i.lineId !== lineId));
  }

  function updateQuantity(lineId: string, qty: number) {
    if (qty <= 0) {
      removeFromCart(lineId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, quantity: qty } : i)),
    );
  }

  function startNewSale() {
    setSelectedClient(null);
    setIsWalkIn(false);
    setCart([]);
    setDiscount("");
    setTip("");
    setPaymentMethod("cash");
    setClientSearch("");
    setReceiptData(null);
    setCartTab("services");
    setSelectedStaffId(null);
    setServicePick(null);
    setProductPick(null);
    setVariantLoadingId(null);
    variantsCacheRef.current.clear();
    yocoPendingSaleIdRef.current = null;
    setYocoLinkedSaleId(null);
    paycloudPendingSaleIdRef.current = null;
    setPaycloudLinkedSaleId(null);
    setCheckoutStep("select_client");
  }

  function handleSelectClient(client: Client) {
    setSelectedClient(client);
    setIsWalkIn(false);
    setCheckoutStep("select_services");
  }

  function handleWalkIn() {
    setSelectedClient(null);
    setIsWalkIn(true);
    setCheckoutStep("select_services");
  }

  function buildSalePayload(overrides: Record<string, unknown> = {}) {
    const rawMethod = (overrides.payment_method as PaymentMethod | undefined) ?? paymentMethod;
    const payment_method = rawMethod === "eft" ? "other" : rawMethod;
    return {
      customer_id: selectedClient?.customer_id ?? null,
      is_walk_in: isWalkIn,
      location_id: selectedLocationId || null,
      staff_id: selectedStaffId || null,
      items: cart.map((i) => ({
        item_id: i.item_id,
        product_variant_id: i.product_variant_id ?? null,
        type: i.type,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
      })),
      subtotal: cartTotal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      tip_amount: tipAmount,
      total_amount: grandTotal,
      ...overrides,
      payment_method,
    };
  }

  async function completeSaleWithMethod(method: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = buildSalePayload({
      payment_method: method,
      payment_status: "completed",
    });
    const { error } = await createSale(payload);
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    yocoPendingSaleIdRef.current = null;
    setYocoLinkedSaleId(null);
    paycloudPendingSaleIdRef.current = null;
    setPaycloudLinkedSaleId(null);
    setReceiptData({
      total: grandTotal,
      items: [...cart],
      client: selectedClient?.full_name ?? "Walk-in",
      method: method as PaymentMethod,
      date: new Date().toISOString(),
    });
    setCheckoutStep("receipt");
    refreshSales();
    refreshMetrics();
  }

  async function preparePaystackTerminalSale() {
    if (preparingPaystackTerminal) return;
    setPreparingPaystackTerminal(true);
    try {
      const { data, error } = await createSale(
        buildSalePayload({
          payment_method: "paystack_terminal",
          payment_status: "pending",
        }),
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      if (!data?.id) {
        Alert.alert("Error", "Could not prepare Paystack Terminal sale");
        return;
      }
      const res = await api.post<{
        terminal?: {
          terminal_code?: string;
          payment_link?: string | null;
          terminal_url?: string | null;
          qr_url?: string | null;
        };
        expectedAmount?: number | null;
      }>(
        PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
        paystackTerminalCollectionIntentPayload({
          entity_type: "sale",
          entity_id: data.id,
          expected_amount: Number(grandTotal.toFixed(2)),
          customer_reference: selectedClient?.full_name
            ? `Sale for ${selectedClient.full_name}`
            : "Walk-in sale",
        }),
      );
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
        reference: selectedClient?.full_name ? `Sale for ${selectedClient.full_name}` : "Walk-in sale",
        expectedAmount: Number(res.data?.expectedAmount ?? grandTotal),
      });
      refreshSales();
      refreshMetrics();
    } catch (err) {
      Alert.alert("Paystack Terminal", err instanceof Error ? err.message : "Failed to prepare terminal payment.");
    } finally {
      setPreparingPaystackTerminal(false);
    }
  }

  function handleClosePaystackTerminalPrompt() {
    setPaystackTerminalPrompt(null);
    setCheckoutStep("idle");
    setCart([]);
    setSelectedClient(null);
    setIsWalkIn(false);
    setDiscount("");
    setTip("");
    setPaymentMethod("cash");
    refreshSales();
    refreshMetrics();
  }

  async function handleCompleteSale() {
    if (paymentMethod === "paystack_terminal") {
      await preparePaystackTerminalSale();
      return;
    }
    if (paymentMethod === "yoco") {
      let saleId = yocoPendingSaleIdRef.current ?? yocoLinkedSaleId;
      if (!saleId) {
        const { data, error } = await createSale(
          buildSalePayload({
            payment_method: "yoco",
            payment_status: "pending",
          }),
        );
        if (error) {
          Alert.alert("Error", error);
          return;
        }
        if (!data?.id) {
          Alert.alert("Error", "Could not prepare card sale");
          return;
        }
        saleId = data.id;
        yocoPendingSaleIdRef.current = saleId;
        setYocoLinkedSaleId(saleId);
      }
      setShowYocoPayment(true);
      return;
    }
    if (paymentMethod === "paycloud") {
      let saleId = paycloudPendingSaleIdRef.current ?? paycloudLinkedSaleId;
      if (!saleId) {
        const { data, error } = await createSale(
          buildSalePayload({
            payment_method: "paycloud",
            payment_status: "pending",
          }),
        );
        if (error) {
          Alert.alert("Error", error);
          return;
        }
        if (!data?.id) {
          Alert.alert("Error", "Could not prepare card sale");
          return;
        }
        saleId = data.id;
        paycloudPendingSaleIdRef.current = saleId;
        setPaycloudLinkedSaleId(saleId);
      }
      setShowPaycloudPayment(true);
      return;
    }
    await completeSaleWithMethod(paymentMethod);
  }

  async function finalizeYocoSale(result: { reference: string }) {
    const saleId = yocoPendingSaleIdRef.current ?? yocoLinkedSaleId;
    if (!saleId || !result.reference) {
      Alert.alert("Error", "Could not finalize card sale");
      return;
    }
    const patch = await api.patch(`/api/provider/sales/${saleId}`, {
      payment_status: "completed",
      payment_provider: "yoco",
      payment_provider_id: result.reference,
    });
    if (patch.error) {
      Alert.alert(
        "Payment received — finish recording",
        "The terminal payment succeeded but this sale is still pending. Tap Finish recording to retry without charging the customer again.",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Finish recording",
            onPress: () => {
              void finalizeYocoSale(result);
            },
          },
        ],
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    yocoPendingSaleIdRef.current = null;
    setYocoLinkedSaleId(null);
    setReceiptData({
      total: grandTotal,
      items: [...cart],
      client: selectedClient?.full_name ?? "Walk-in",
      method: "yoco",
      date: new Date().toISOString(),
    });
    setCheckoutStep("receipt");
    refreshSales();
    refreshMetrics();
  }

  async function finalizePaycloudSale(result: { id: string }) {
    const saleId = paycloudPendingSaleIdRef.current ?? paycloudLinkedSaleId;
    if (!saleId) {
      Alert.alert("Error", "Could not finalize card sale");
      return;
    }
    const patch = await api.patch(`/api/provider/sales/${saleId}`, {
      payment_status: "completed",
      payment_provider: "paycloud",
      payment_provider_id: result.id,
    });
    if (patch.error) {
      Alert.alert(
        "Payment received — finish recording",
        "The terminal payment succeeded but this sale is still pending. Tap Finish recording to retry without charging the customer again.",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Finish recording",
            onPress: () => {
              void finalizePaycloudSale(result);
            },
          },
        ],
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    paycloudPendingSaleIdRef.current = null;
    setPaycloudLinkedSaleId(null);
    setShowPaycloudPayment(false);
    setReceiptData({
      total: grandTotal,
      items: [...cart],
      client: selectedClient?.full_name ?? "Walk-in",
      method: "paycloud",
      date: new Date().toISOString(),
    });
    setCheckoutStep("receipt");
    refreshSales();
    refreshMetrics();
  }

  function handleDoneReceipt() {
    setCheckoutStep("idle");
    setReceiptData(null);
  }

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  // Client selection step
  function renderClientStep() {
    return (
      <BottomSheet
        visible
        onClose={() => setCheckoutStep("idle")}
        title="Select Client"
        snapHeight="full"
      >
        <SearchBar
          placeholder="Search clients..."
          value={clientSearch}
          onChangeText={setClientSearch}
        />
        <TouchableOpacity
          style={{ marginTop: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], padding: 16 }}
          onPress={handleWalkIn}
          accessibilityLabel="Walk-in customer, no client selected"
          accessibilityRole="button"
        >
          <Ionicons name="person-outline" size={20} color={Colors.gray[500]} />
          <Text style={{ marginLeft: 12, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
            Walk-in (No client)
          </Text>
        </TouchableOpacity>
        <View style={{ marginTop: 12 }}>
          {filteredClients.map((c, i) => (
            <TouchableOpacity
              key={c.id}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16, marginTop: i === 0 ? 0 : 8 }}
              onPress={() => handleSelectClient(c)}
              accessibilityLabel={`Select client ${c.full_name}`}
              accessibilityRole="button"
            >
              <View style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#eef2ff" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#4f46e5" }}>
                  {c.full_name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                  {c.full_name}
                </Text>
                {c.phone && (
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{c.phone}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    );
  }

  function renderCartItemControls(inCart: CartItem | undefined) {
    if (inCart) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#e0e7ff", paddingHorizontal: 8, paddingVertical: 4 }}>
          <TouchableOpacity onPress={() => updateQuantity(inCart.lineId, inCart.quantity - 1)} accessibilityLabel="Decrease quantity">
            <Ionicons name="remove" size={16} color="#6366f1" />
          </TouchableOpacity>
          <Text style={{ marginHorizontal: 8, fontSize: 14, fontWeight: "600", color: "#4338ca" }}>{inCart.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(inCart.lineId, inCart.quantity + 1)} accessibilityLabel="Increase quantity">
            <Ionicons name="add" size={16} color="#6366f1" />
          </TouchableOpacity>
        </View>
      );
    }
    return <Ionicons name="add-circle" size={24} color="#6366f1" />;
  }

  function renderServiceStep() {
    return (
      <BottomSheet
        visible
        onClose={() => {
          setServicePick(null);
          setProductPick(null);
          setCheckoutStep("idle");
        }}
        title="Add Items"
        snapHeight="full"
      >
        <Text style={{ marginBottom: 8, fontSize: 12, color: Colors.gray[500] }}>
          Client: {selectedClient?.full_name ?? "Walk-in"}
        </Text>

        {servicePick ? (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setServicePick(null)}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back to services list"
            >
              <Ionicons name="chevron-back" size={22} color="#6366f1" />
              <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "600", color: "#4338ca" }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{servicePick.parent.title}</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Choose an option</Text>
            <TouchableOpacity
              style={{
                marginTop: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 16,
              }}
              onPress={() => addServiceVariantChoice(servicePick.parent, null)}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Standard</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                {formatCurrency(servicePick.parent.price, servicePick.parent.currency)}
              </Text>
            </TouchableOpacity>
            {servicePick.variants.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  padding: 16,
                }}
                onPress={() => addServiceVariantChoice(servicePick.parent, v)}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{v.title}</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                  {formatCurrency(v.price, v.currency ?? servicePick.parent.currency)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : productPick ? (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setProductPick(null)}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back to products list"
            >
              <Ionicons name="chevron-back" size={22} color="#6366f1" />
              <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "600", color: "#4338ca" }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{productPick.name}</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Select variant</Text>
            {(productPick.variants ?? []).map((v) => {
              const q = Number(v.quantity ?? 0);
              const disabled = q <= 0;
              return (
                <TouchableOpacity
                  key={v.id}
                  disabled={disabled}
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    backgroundColor: disabled ? Colors.gray[100] : Colors.white,
                    padding: 16,
                    opacity: disabled ? 0.55 : 1,
                  }}
                  onPress={() => !disabled && addProductVariantToCart(productPick, v)}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                    {formatProductVariantLabel(v)}
                  </Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{q} in stock</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                      {formatCurrency(v.retail_price)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <>
            <View style={{ marginBottom: 12, flexDirection: "row", borderRadius: 12, backgroundColor: Colors.gray[100], padding: 4 }}>
              <TouchableOpacity
                style={[ { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 }, cartTab === "services" && { backgroundColor: Colors.white, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 } ]}
                onPress={() => setCartTab("services")}
                accessibilityLabel="Services tab"
              >
                <Text style={{ fontSize: 14, fontWeight: "500", color: cartTab === "services" ? Colors.gray[900] : Colors.gray[500] }}>
                  Services
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 }, cartTab === "products" && { backgroundColor: Colors.white, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 } ]}
                onPress={() => setCartTab("products")}
                accessibilityLabel="Products tab"
              >
                <Text style={{ fontSize: 14, fontWeight: "500", color: cartTab === "products" ? Colors.gray[900] : Colors.gray[500] }}>
                  Products
                </Text>
              </TouchableOpacity>
            </View>

            {cartTab === "services" && (
              <View>
                {(catalogue ?? []).map((svc, i) => {
                  const inCart = cart.find(
                    (c) =>
                      c.type === "service" &&
                      (c.item_id === svc.id || c.parent_service_id === svc.id),
                  );
                  const loading = variantLoadingId === svc.id;
                  const cachedVariantRows = variantsCacheRef.current.get(svc.id);
                  const hasVariantOptions =
                    cachedVariantRows != null && cachedVariantRows.length > 0;
                  return (
                    <TouchableOpacity
                      key={svc.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderRadius: 12,
                        borderWidth: 1,
                        padding: 16,
                        marginTop: i === 0 ? 0 : 8,
                        ...(inCart ? { borderColor: "#a5b4fc", backgroundColor: "#eef2ff" } : { borderColor: Colors.gray[100], backgroundColor: Colors.white }),
                      }}
                      onPress={() => void handleServiceRowPress(svc)}
                      accessibilityLabel={`Add ${svc.title} to cart`}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{svc.title}</Text>
                          {svc.service_type === "package" && (
                            <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: "#f3e8ff" }}>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: "#6b21a8" }}>PACKAGE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{svc.duration_minutes} min</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ marginRight: 12, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(svc.price, svc.currency)}</Text>
                        {loading ? (
                          <ActivityIndicator size="small" color="#6366f1" />
                        ) : hasVariantOptions && !inCart ? (
                          <Ionicons name="chevron-forward" size={22} color="#6366f1" />
                        ) : (
                          renderCartItemControls(inCart)
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {(!catalogue || catalogue.length === 0) && (
                  <Text style={{ paddingVertical: 24, textAlign: "center", fontSize: 14, color: Colors.gray[400] }}>No active services</Text>
                )}
              </View>
            )}

            {cartTab === "products" && (
              <View>
                {products.map((prod, i) => {
                  const hasOpts = Boolean(prod.has_variants && (prod.variants?.length ?? 0) > 0);
                  const maxSimple = maxSellableUnits(prod as PosProductItem, null);
                  const oos = maxSimple <= 0 && !hasOpts;
                  const inCart = hasOpts
                    ? cart.find((c) => c.type === "product" && c.item_id === prod.id)
                    : cart.find(
                        (c) =>
                          c.type === "product" &&
                          c.item_id === prod.id &&
                          !(c.product_variant_id ?? null),
                      );
                  const variantPrices = (prod.variants ?? []).map((v) => Number(v.retail_price ?? 0));
                  const displayPrice =
                    hasOpts && variantPrices.length > 0
                      ? Math.min(...variantPrices)
                      : Number(prod.retail_price ?? 0);
                  const stockLabel = hasOpts
                    ? `${prod.effective_quantity ?? prod.quantity ?? 0} in stock`
                    : `${prod.quantity ?? prod.stock_quantity ?? 0} in stock`;
                  return (
                    <TouchableOpacity
                      key={prod.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderRadius: 12,
                        borderWidth: 1,
                        padding: 16,
                        marginTop: i === 0 ? 0 : 8,
                        opacity: oos ? 0.45 : 1,
                        ...(inCart ? { borderColor: "#a5b4fc", backgroundColor: "#eef2ff" } : { borderColor: Colors.gray[100], backgroundColor: Colors.white }),
                      }}
                      onPress={() => !oos && handleProductRowPress(prod)}
                      disabled={oos}
                      accessibilityLabel={`Add ${prod.name} to cart`}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{prod.name}</Text>
                          {hasOpts && (
                            <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: "#e0e7ff" }}>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: "#3730a3" }}>VARIANTS</Text>
                            </View>
                          )}
                        </View>
                        {prod.sku && !hasOpts && (
                          <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>SKU: {prod.sku}</Text>
                        )}
                        <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{stockLabel}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ marginRight: 12, alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(displayPrice)}</Text>
                          {hasOpts && variantPrices.length > 1 && (
                            <Text style={{ fontSize: 10, color: Colors.gray[500] }}>from</Text>
                          )}
                        </View>
                        {hasOpts ? <Ionicons name="chevron-forward" size={20} color="#6366f1" /> : renderCartItemControls(inCart)}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {products.length === 0 && (
                  <Text style={{ paddingVertical: 24, textAlign: "center", fontSize: 14, color: Colors.gray[400] }}>No products available</Text>
                )}
              </View>
            )}
          </>
        )}

        {!servicePick && !productPick && cart.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <ActionButton
              label={`Continue with ${cart.length} item${cart.length > 1 ? "s" : ""} (${formatCurrency(cartTotal)})`}
              variant="secondary"
              onPress={() => setCheckoutStep("review")}
              fullWidth
            />
          </View>
        )}
      </BottomSheet>
    );
  }

  // Review / payment step
  function renderReviewStep() {
    return (
      <BottomSheet
        visible
        onClose={() => setCheckoutStep("idle")}
        title="Review Order"
        snapHeight="full"
      >
        <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
          <Ionicons name="person-outline" size={18} color={Colors.gray[500]} />
          <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[700] }}>
            {selectedClient?.full_name ?? "Walk-in Customer"}
          </Text>
        </View>

        {cart.map((item) => (
          <View
            key={item.lineId}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: Colors.gray[50], paddingVertical: 12 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                {item.type === "product" ? "Product" : "Service"} · Qty: {item.quantity}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(item.price * item.quantity)}
            </Text>
          </View>
        ))}

        {staffMembers && staffMembers.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Assigned To</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <TouchableOpacity
                style={[ { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 }, !selectedStaffId ? { backgroundColor: Colors.gray[900] } : { borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white } ]}
                onPress={() => setSelectedStaffId(null)}
                accessibilityLabel="No staff assigned"
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: !selectedStaffId ? Colors.white : Colors.gray[600] }}>
                  None
                </Text>
              </TouchableOpacity>
              {staffMembers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[ { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 }, selectedStaffId === s.id ? { backgroundColor: Colors.gray[900] } : { borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white } ]}
                  onPress={() => setSelectedStaffId(s.id)}
                  accessibilityLabel={`Assign to ${s.name}`}
                >
                  <Text style={{ fontSize: 12, fontWeight: "500", color: selectedStaffId === s.id ? Colors.white : Colors.gray[600] }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
            Discount ({tenantCurrency})
          </Text>
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: Colors.gray[900] }}
            placeholder="0"
            placeholderTextColor={Colors.gray[400]}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            accessibilityLabel="Discount amount"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
            Tip ({tenantCurrency})
          </Text>
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: Colors.gray[900] }}
            placeholder="0"
            placeholderTextColor={Colors.gray[400]}
            value={tip}
            onChangeText={setTip}
            keyboardType="numeric"
            accessibilityLabel="Tip amount"
          />
        </View>

        <Text style={{ marginBottom: 8, marginTop: 16, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
          Payment Method
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
          {paymentMethodOptions.map((pm) => (
            <TouchableOpacity
              key={pm.value}
              style={[
                { width: "48%", marginHorizontal: "1%", flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, marginBottom: 8 },
                paymentMethod === pm.value ? { borderColor: "#818cf8", backgroundColor: "#eef2ff" } : { borderColor: Colors.gray[200], backgroundColor: Colors.white },
              ]}
              onPress={() => setPaymentMethod(pm.value)}
              accessibilityLabel={`Payment method: ${pm.label}`}
              accessibilityRole="button"
            >
              <Ionicons name={pm.icon} size={16} color={paymentMethod === pm.value ? "#6366f1" : Colors.gray[500]} style={{ marginRight: 6 }} />
              <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "500", color: paymentMethod === pm.value ? "#4338ca" : Colors.gray[600] }}>
                {pm.label}
              </Text>
            </TouchableOpacity>
          ))}
          {paycloudEnabled && !paycloudCollectEnabled ? (
            <TouchableOpacity
              style={[
                { width: "48%", marginHorizontal: "1%", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", paddingVertical: 12, paddingHorizontal: 8, marginBottom: 8, borderColor: Colors.gray[300], backgroundColor: Colors.white },
              ]}
              onPress={() => router.push("/(app)/(tabs)/more/card-machines" as never)}
              accessibilityLabel={PAYCLOUD_SETUP_LABEL}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>{PAYCLOUD_SETUP_LABEL}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Subtotal</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{formatCurrency(cartTotal)}</Text>
          </View>
          {discountAmount > 0 && (
            <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Discount</Text>
              <Text style={{ fontSize: 14, color: Colors.error }}>-{formatCurrency(discountAmount)}</Text>
            </View>
          )}
          <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
              VAT ({(taxRate * 100).toFixed(0)}%){taxInclusive ? " (incl.)" : ""}
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{formatCurrency(taxAmount)}</Text>
          </View>
          {tipAmount > 0 && (
            <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Tip</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>+{formatCurrency(tipAmount)}</Text>
            </View>
          )}
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Total</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{formatCurrency(grandTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <ActionButton
            label={
              paymentMethod === "paystack_terminal"
                ? `Collect via Paystack Terminal - ${formatCurrency(grandTotal)}`
                : `Complete Sale - ${formatCurrency(grandTotal)}`
            }
            variant="secondary"
            onPress={handleCompleteSale}
            loading={creatingSale || preparingPaystackTerminal}
            fullWidth
            disabled={cart.length === 0}
          />
        </View>
        <TouchableOpacity
          style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }}
          onPress={() => setCheckoutStep("select_services")}
          accessibilityLabel="Go back to item selection"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
            {pt("salesScreen.backToItems", undefined, "Back to items")}
          </Text>
        </TouchableOpacity>
      </BottomSheet>
    );
  }

  // Receipt step
  function renderReceiptStep() {
    if (!receiptData) return null;
    return (
      <BottomSheet
        visible
        onClose={handleDoneReceipt}
        title={pt("salesScreen.receiptTitle", undefined, "Receipt")}
        snapHeight="half"
      >
        <View style={{ alignItems: "center" }}>
          <View style={{ height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 32, backgroundColor: "#dcfce7" }}>
            <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
          </View>
          <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
            {pt("salesScreen.saleCompleteTitle", undefined, "Sale complete!")}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }}>
            {receiptData.client} · {formatDate(receiptData.date, "MMM d, HH:mm")}
          </Text>
        </View>

        <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 16 }}>
          {receiptData.items.map((item, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[700] }}>
                {item.name} x{item.quantity}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {formatCurrency(item.price * item.quantity)}
              </Text>
            </View>
          ))}
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                {pt("salesScreen.totalLabel", undefined, "Total")}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{formatCurrency(receiptData.total)}</Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500], textTransform: "capitalize" }}>
              {pt("salesScreen.paidVia", { method: receiptData.method }, `Paid via ${receiptData.method}`)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <ActionButton
            label={pt("salesScreen.done", undefined, "Done")}
            variant="primary"
            onPress={handleDoneReceipt}
            fullWidth
          />
        </View>
      </BottomSheet>
    );
  }

  if (!unifiedPosEnabled) {
    return null;
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Sales"
        subtitle={`${sales.length} transactions`}
        {...(fromTransactionsHub ? { showBack: true, onBack: handleBack } : {})}
        rightAction={
          <TouchableOpacity
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: Colors.gray[100] }}
            onPress={() => router.push("/(app)/(tabs)/more/finance" as never)}
            accessibilityLabel="View finance reports"
            accessibilityRole="button"
          >
            <Ionicons name="stats-chart-outline" size={20} color="#111" />
          </TouchableOpacity>
        }
      />

      {adsSelfServeAvailable ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/settings/ads" as never)}
          style={{
            marginTop: 12,
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: "#eef2ff",
            borderWidth: 1,
            borderColor: "#c7d2fe",
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
          accessibilityRole="button"
          accessibilityLabel="Sponsored listings and ads"
          accessibilityHint="Opens settings where you can buy sponsored listing packs"
        >
          <Ionicons name="megaphone-outline" size={22} color="#4338ca" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: "600", fontSize: 15, color: "#1e1b4b" }}>Grow with sponsored listings</Text>
            <Text style={{ fontSize: 12, color: "#4338ca", marginTop: 4, lineHeight: 16 }}>
              Buy a boost, reach more high-intent customers, and track the views, clicks, and bookings your ads generate.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#4338ca" />
        </TouchableOpacity>
      ) : null}

      <View style={[ isTablet ? { flexDirection: "row" } : {} ]}>
        <View style={[ isTablet ? { flex: 1 } : {}, isTablet && { marginRight: 12 } ]}>
          <StatCard
            title="Today's Revenue"
            value={formatCurrency(metrics?.revenue_today ?? 0)}
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="#f0fdf4"
          />
        </View>
        <View style={[ isTablet ? { flex: 1 } : { marginTop: 12 }, isTablet && { marginRight: 12 } ]}>
          <StatCard
            title="Monthly Revenue"
            value={formatCurrency(metrics?.revenue_this_month ?? 0)}
            icon="trending-up-outline"
            iconColor="#6366f1"
            iconBg="#eef2ff"
            trend={metrics?.revenue_growth ? { value: metrics.revenue_growth } : undefined}
          />
        </View>
        <View style={[ isTablet ? { flex: 1 } : { marginTop: 12 } ]}>
          <StatCard
            title="Pending"
            value={formatCurrency(metrics?.pending_payments_amount ?? 0)}
            subtitle={`${metrics?.pending_payments_count ?? 0} payments`}
            icon="time-outline"
            iconColor="#f59e0b"
            iconBg="#fffbeb"
          />
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <FilterChipGroup
          options={DATE_RANGES}
          selected={dateRange}
          onSelect={setDateRange}
        />
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ marginBottom: 12, fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
          Transactions ({salesResponse?.total ?? sales.length})
        </Text>

        <View style={{ marginBottom: 12 }}>
          <SearchBar
            value={salesSearchDebounced}
            onChangeText={setSalesSearchDebounced}
            placeholder="Search by reference or client name"
          />
        </View>

        {salesLoading && sales.length === 0 ? (
          <SkeletonList rows={5} />
        ) : salesError && sales.length === 0 ? (
          <ErrorState message={salesError} onRetry={refreshSales} />
        ) : sales.length === 0 ? (
          salesSearchDebounced ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              description={`No transactions match "${salesSearchDebounced}". Try a different reference or name.`}
              actionLabel="Clear search"
              onAction={() => setSalesSearchDebounced("")}
            />
          ) : dateRange !== "all" ? (
            <EmptyState
              icon="calendar-outline"
              title="No sales in this range"
              description="Try expanding the date range or switch to All time."
              actionLabel="Show all time"
              onAction={() => setDateRange("all")}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No sales yet"
              description="Sales created via POS will appear here"
            />
          )
        ) : (
          <View style={[ isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {} ]}>
            {sales.map((sale) => (
              <View
                key={sale.id}
                style={[
                  { borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
                  isTablet ? { width: "48.5%", marginRight: 12, marginBottom: 12 } : { marginBottom: 8 },
                ]}
                accessibilityLabel={`Sale: ${sale.client_name ?? "Walk-in"}, ${formatCurrency(sale.total)}`}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                      {sale.client_name ?? "Walk-in"}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                      {sale.ref_number} · {formatDate(sale.date, "MMM d")} at {formatTime(sale.date)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                    {formatCurrency(sale.total)}
                  </Text>
                </View>
                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }} numberOfLines={1}>
                    {sale.items?.map((i) => i.name).join(", ") || "Items"}
                  </Text>
                  <Badge status={sale.payment_method} size="sm" />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={{ position: "absolute", bottom: 96, right: 20, height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: "#4f46e5", elevation: 8 }}
        onPress={startNewSale}
        accessibilityLabel="New sale"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Checkout Steps */}
      {checkoutStep === "select_client" && renderClientStep()}
      {checkoutStep === "select_services" && renderServiceStep()}
      {checkoutStep === "review" && renderReviewStep()}
      {checkoutStep === "receipt" && renderReceiptStep()}

      {/* Yoco Card Payment */}
      <YocoPaymentSheet
        visible={showYocoPayment}
        onClose={() => setShowYocoPayment(false)}
        amountCents={Math.round(grandTotal * 100)}
        currency={tenantCurrency}
        saleId={yocoLinkedSaleId ?? undefined}
        description={`POS Sale for ${selectedClient?.full_name ?? "Walk-in"}`}
        onPaymentSuccess={(result) => finalizeYocoSale(result)}
      />

      <PayCloudPaymentSheet
        visible={showPaycloudPayment}
        onClose={() => setShowPaycloudPayment(false)}
        amount={grandTotal}
        currency={tenantCurrency}
        entityType="sale"
        entityId={paycloudLinkedSaleId ?? ""}
        saleId={paycloudLinkedSaleId ?? undefined}
        bookingLocationId={selectedLocationId}
        onPaymentSuccess={(result) => void finalizePaycloudSale(result)}
      />

      <BottomSheet
        visible={!!paystackTerminalPrompt}
        onClose={handleClosePaystackTerminalPrompt}
        title="Paystack Terminal"
      >
        {paystackTerminalPrompt ? (
          <View>
            <Text style={{ marginBottom: 12, fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>
              Ask the customer to pay using this Paystack link. Paystack generates the transaction reference; this sale stays pending until you allocate the webhooked payment.
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
                  Note: {paystackTerminalPrompt.reference}
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
            <TouchableOpacity
              style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }}
              onPress={handleClosePaystackTerminalPrompt}
            >
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </BottomSheet>

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}
