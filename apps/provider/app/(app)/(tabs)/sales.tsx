import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { format, subDays } from "date-fns";
import { useApi, useApiPost } from "@/hooks/useApi";
import { useFocusedApi } from "@/hooks/useFocusedApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
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
  items: { id: string; type: string; name: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
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
}

interface ProductItem {
  id: string;
  name: string;
  retail_price: number;
  currency?: string;
  sku?: string;
  stock_quantity?: number;
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
  item_id: string;
  type: "service" | "product";
  name: string;
  price: number;
  quantity: number;
}

type CheckoutStep =
  | "idle"
  | "select_client"
  | "select_services"
  | "review"
  | "payment"
  | "receipt";

type PaymentMethod = "cash" | "card" | "online";

const DATE_RANGES = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All Time", value: "all" },
];

const PAYMENT_METHODS: { label: string; value: PaymentMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "Card (Yoco)", value: "card", icon: "card-outline" },
  { label: "Online", value: "online", icon: "globe-outline" },
];

export default function SalesScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const { isTablet } = useResponsive();
  const { selectedLocationId } = useProvider();
  const locQ = selectedLocationId ? `&location_id=${selectedLocationId}` : "";
  const locQFirst = selectedLocationId ? `?location_id=${selectedLocationId}` : "";
  const [dateRange, setDateRange] = useState("month");
  const [refreshing, setRefreshing] = useState(false);

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

  const { isFocused } = useFocusedApi();

  const {
    data: metrics,
    refresh: refreshMetrics,
  } = useApi<DashboardMetrics>(`/api/provider/dashboard${locQFirst}`, {
    enabled: isFocused,
    staleTimeMs: 15_000,
  });

  const dateParams = useMemo(() => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    switch (dateRange) {
      case "today":
        return `&date_from=${today}&date_to=${today}`;
      case "week":
        return `&date_from=${format(subDays(now, 7), "yyyy-MM-dd")}&date_to=${today}`;
      case "month":
        return `&date_from=${format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd")}&date_to=${today}`;
      default:
        return "";
    }
  }, [dateRange]);

  const {
    data: salesResponse,
    loading: salesLoading,
    error: salesError,
    refresh: refreshSales,
  } = useApi<SalesResponse>(
    `/api/provider/sales?limit=50${dateParams}${locQ}`,
    { enabled: isFocused, staleTimeMs: 15_000 },
  );
  const sales = salesResponse?.data ?? [];

  const { data: catalogue } = useApi<CatalogueService[]>(
    "/api/provider/services?is_active=true",
    { enabled: isFocused, staleTimeMs: 60_000 },
  );
  const { data: productsResponse } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200",
    { enabled: isFocused, staleTimeMs: 60_000 },
  );
  const products = useMemo<ProductItem[]>(() => {
    if (!productsResponse) return [];
    const raw = productsResponse as any;
    return raw.products ?? raw ?? [];
  }, [productsResponse]);
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

  function addServiceToCart(service: CatalogueService) {
    setCart((prev) => {
      const existing = prev.find((i) => i.item_id === service.id && i.type === "service");
      if (existing) {
        return prev.map((i) =>
          i.item_id === service.id && i.type === "service"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        { item_id: service.id, type: "service", name: service.title, price: service.price, quantity: 1 },
      ];
    });
  }

  function addProductToCart(product: ProductItem) {
    setCart((prev) => {
      const existing = prev.find((i) => i.item_id === product.id && i.type === "product");
      if (existing) {
        return prev.map((i) =>
          i.item_id === product.id && i.type === "product"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        { item_id: product.id, type: "product", name: product.name, price: product.retail_price, quantity: 1 },
      ];
    });
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((i) => i.item_id !== itemId));
  }

  function updateQuantity(itemId: string, qty: number) {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        i.item_id === itemId ? { ...i, quantity: qty } : i
      )
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
    yocoPendingSaleIdRef.current = null;
    setYocoLinkedSaleId(null);
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
    return {
      customer_id: selectedClient?.customer_id ?? null,
      is_walk_in: isWalkIn,
      location_id: selectedLocationId || null,
      staff_id: selectedStaffId || null,
      items: cart.map((i) => ({
        item_id: i.item_id,
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

  async function handleCompleteSale() {
    if (paymentMethod === "card") {
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
        "Update failed",
        "Payment succeeded but the sale could not be marked complete. Check Sales for a pending entry.",
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
      method: "card",
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

  function renderCartItemControls(itemId: string, inCart: CartItem | undefined) {
    if (inCart) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#e0e7ff", paddingHorizontal: 8, paddingVertical: 4 }}>
          <TouchableOpacity onPress={() => updateQuantity(itemId, inCart.quantity - 1)} accessibilityLabel="Decrease quantity">
            <Ionicons name="remove" size={16} color="#6366f1" />
          </TouchableOpacity>
          <Text style={{ marginHorizontal: 8, fontSize: 14, fontWeight: "600", color: "#4338ca" }}>{inCart.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(itemId, inCart.quantity + 1)} accessibilityLabel="Increase quantity">
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
        onClose={() => setCheckoutStep("idle")}
        title="Add Items"
        snapHeight="full"
      >
        <Text style={{ marginBottom: 8, fontSize: 12, color: Colors.gray[500] }}>
          Client: {selectedClient?.full_name ?? "Walk-in"}
        </Text>

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
              const inCart = cart.find((i) => i.item_id === svc.id && i.type === "service");
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
                  onPress={() => addServiceToCart(svc)}
                  accessibilityLabel={`Add ${svc.title} to cart`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{svc.title}</Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{svc.duration_minutes}min</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ marginRight: 12, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(svc.price, svc.currency)}</Text>
                    {renderCartItemControls(svc.id, inCart)}
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
              const inCart = cart.find((i) => i.item_id === prod.id && i.type === "product");
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
                    ...(inCart ? { borderColor: "#a5b4fc", backgroundColor: "#eef2ff" } : { borderColor: Colors.gray[100], backgroundColor: Colors.white }),
                  }}
                  onPress={() => addProductToCart(prod)}
                  accessibilityLabel={`Add ${prod.name} to cart`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{prod.name}</Text>
                    {prod.sku && <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>SKU: {prod.sku}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ marginRight: 12, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(prod.retail_price)}</Text>
                    {renderCartItemControls(prod.id, inCart)}
                  </View>
                </TouchableOpacity>
              );
            })}
            {products.length === 0 && (
              <Text style={{ paddingVertical: 24, textAlign: "center", fontSize: 14, color: Colors.gray[400] }}>No products available</Text>
            )}
          </View>
        )}

        {cart.length > 0 && (
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
            key={`${item.type}-${item.item_id}`}
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
        <View style={{ flexDirection: "row" }}>
          {PAYMENT_METHODS.map((pm, idx) => (
            <TouchableOpacity
              key={pm.value}
              style={[
                { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
                idx > 0 && { marginLeft: 8 },
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
            label={`Complete Sale - ${formatCurrency(grandTotal)}`}
            variant="secondary"
            onPress={handleCompleteSale}
            loading={creatingSale}
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
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Back to items</Text>
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
        title="Receipt"
        snapHeight="half"
      >
        <View style={{ alignItems: "center" }}>
          <View style={{ height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 32, backgroundColor: "#dcfce7" }}>
            <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
          </View>
          <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
            Sale Complete!
          </Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }}>
            {receiptData.client} · {format(new Date(receiptData.date), "MMM d, HH:mm")}
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
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Total</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{formatCurrency(receiptData.total)}</Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500], textTransform: "capitalize" }}>
              Paid via {receiptData.method}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <ActionButton
            label="Done"
            variant="primary"
            onPress={handleDoneReceipt}
            fullWidth
          />
        </View>
      </BottomSheet>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Sales"
        subtitle={`${sales.length} transactions`}
        rightAction={
          <TouchableOpacity
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: Colors.gray[100] }}
            onPress={() => router.push("/(app)/(tabs)/more/finance" as any)}
            accessibilityLabel="View finance reports"
            accessibilityRole="button"
          >
            <Ionicons name="stats-chart-outline" size={20} color="#111" />
          </TouchableOpacity>
        }
      />

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
          Transactions ({sales.length})
        </Text>

        {salesLoading && sales.length === 0 ? (
          <LoadingState fullScreen={false} />
        ) : salesError && sales.length === 0 ? (
          <ErrorState message={salesError} onRetry={refreshSales} />
        ) : sales.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No sales yet"
            description="Sales created via POS will appear here"
          />
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

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}
