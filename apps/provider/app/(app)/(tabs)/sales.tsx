import { useState, useCallback, useMemo } from "react";
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
import {
  formatCurrency,
  formatDate,
  formatTime,
} from "@/lib/format";

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

  const {
    data: metrics,
    refresh: refreshMetrics,
  } = useApi<DashboardMetrics>(`/api/provider/dashboard${locQFirst}`);

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
    refresh: refreshSales,
  } = useApi<SalesResponse>(
    `/api/provider/sales?limit=50${dateParams}${locQ}`
  );
  const sales = salesResponse?.data ?? [];

  const { data: catalogue } = useApi<CatalogueService[]>(
    "/api/provider/services?is_active=true"
  );
  const { data: productsResponse } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200"
  );
  const products = useMemo<ProductItem[]>(() => {
    if (!productsResponse) return [];
    const raw = productsResponse as any;
    return raw.products ?? raw ?? [];
  }, [productsResponse]);
  const { data: staffMembers } = useApi<StaffMember[]>(
    selectedLocationId ? `/api/provider/staff?location_id=${selectedLocationId}` : "/api/provider/staff"
  );
  const { data: rawClients } = useApi<ApiClient[]>(`/api/provider/clients${locQFirst}`);
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
    await Promise.all([refreshMetrics(), refreshSales()]);
    setRefreshing(false);
  }, [refreshMetrics, refreshSales]);

  // Cart helpers
  const { data: paymentSettings } = useApi<{ taxRatePercent?: number; taxInclusive?: boolean }>(
    "/api/provider/settings/payments"
  );
  const taxRate = (paymentSettings?.taxRatePercent ?? 15) / 100;
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

  const [showYocoPayment, setShowYocoPayment] = useState(false);

  async function completeSaleWithMethod(method: string, yocoReference?: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload: Record<string, unknown> = {
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
      payment_method: method,
      total_amount: grandTotal,
      payment_status: "completed",
    };
    if (yocoReference) {
      payload.payment_reference = yocoReference;
    }
    const { error } = await createSale(payload);
    if (error) {
      Alert.alert("Error", error);
      return;
    }
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
      setShowYocoPayment(true);
      return;
    }
    await completeSaleWithMethod(paymentMethod);
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
          className="mt-3 flex-row items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4"
          onPress={handleWalkIn}
          accessibilityLabel="Walk-in customer, no client selected"
          accessibilityRole="button"
        >
          <Ionicons name="person-outline" size={20} color="#6b7280" />
          <Text className="ml-3 text-sm font-medium text-gray-700">
            Walk-in (No client)
          </Text>
        </TouchableOpacity>
        <View className="mt-3 gap-2">
          {filteredClients.map((c) => (
            <TouchableOpacity
              key={c.id}
              className="flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
              onPress={() => handleSelectClient(c)}
              accessibilityLabel={`Select client ${c.full_name}`}
              accessibilityRole="button"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-indigo-50">
                <Text className="text-sm font-semibold text-indigo-600">
                  {c.full_name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-medium text-gray-900">
                  {c.full_name}
                </Text>
                {c.phone && (
                  <Text className="text-xs text-gray-500">{c.phone}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    );
  }

  function renderCartItemControls(itemId: string, inCart: CartItem | undefined) {
    if (inCart) {
      return (
        <View className="flex-row items-center rounded-lg bg-indigo-100 px-2 py-1">
          <TouchableOpacity onPress={() => updateQuantity(itemId, inCart.quantity - 1)} accessibilityLabel="Decrease quantity">
            <Ionicons name="remove" size={16} color="#6366f1" />
          </TouchableOpacity>
          <Text className="mx-2 text-sm font-semibold text-indigo-700">{inCart.quantity}</Text>
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
        <Text className="mb-2 text-xs text-gray-500">
          Client: {selectedClient?.full_name ?? "Walk-in"}
        </Text>

        {/* Tab toggle: Services / Products */}
        <View className="mb-3 flex-row rounded-xl bg-gray-100 p-1">
          <TouchableOpacity
            className={`flex-1 items-center rounded-lg py-2 ${cartTab === "services" ? "bg-white shadow-sm" : ""}`}
            onPress={() => setCartTab("services")}
            accessibilityLabel="Services tab"
          >
            <Text className={`text-sm font-medium ${cartTab === "services" ? "text-gray-900" : "text-gray-500"}`}>
              Services
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 items-center rounded-lg py-2 ${cartTab === "products" ? "bg-white shadow-sm" : ""}`}
            onPress={() => setCartTab("products")}
            accessibilityLabel="Products tab"
          >
            <Text className={`text-sm font-medium ${cartTab === "products" ? "text-gray-900" : "text-gray-500"}`}>
              Products
            </Text>
          </TouchableOpacity>
        </View>

        {/* Services list */}
        {cartTab === "services" && (
          <View className="gap-2">
            {(catalogue ?? []).map((svc) => {
              const inCart = cart.find((i) => i.item_id === svc.id && i.type === "service");
              return (
                <TouchableOpacity
                  key={svc.id}
                  className={`flex-row items-center justify-between rounded-xl border p-4 ${inCart ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"}`}
                  onPress={() => addServiceToCart(svc)}
                  accessibilityLabel={`Add ${svc.title} to cart`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">{svc.title}</Text>
                    <Text className="mt-0.5 text-xs text-gray-500">{svc.duration_minutes}min</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="mr-3 text-sm font-semibold text-gray-900">{formatCurrency(svc.price, svc.currency)}</Text>
                    {renderCartItemControls(svc.id, inCart)}
                  </View>
                </TouchableOpacity>
              );
            })}
            {(!catalogue || catalogue.length === 0) && (
              <Text className="py-6 text-center text-sm text-gray-400">No active services</Text>
            )}
          </View>
        )}

        {/* Products list */}
        {cartTab === "products" && (
          <View className="gap-2">
            {products.map((prod) => {
              const inCart = cart.find((i) => i.item_id === prod.id && i.type === "product");
              return (
                <TouchableOpacity
                  key={prod.id}
                  className={`flex-row items-center justify-between rounded-xl border p-4 ${inCart ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"}`}
                  onPress={() => addProductToCart(prod)}
                  accessibilityLabel={`Add ${prod.name} to cart`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">{prod.name}</Text>
                    {prod.sku && <Text className="mt-0.5 text-xs text-gray-500">SKU: {prod.sku}</Text>}
                  </View>
                  <View className="flex-row items-center">
                    <Text className="mr-3 text-sm font-semibold text-gray-900">{formatCurrency(prod.retail_price)}</Text>
                    {renderCartItemControls(prod.id, inCart)}
                  </View>
                </TouchableOpacity>
              );
            })}
            {products.length === 0 && (
              <Text className="py-6 text-center text-sm text-gray-400">No products available</Text>
            )}
          </View>
        )}

        {cart.length > 0 && (
          <View className="mt-4">
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
        {/* Client */}
        <View className="mb-4 flex-row items-center rounded-xl bg-gray-50 p-3">
          <Ionicons name="person-outline" size={18} color="#6b7280" />
          <Text className="ml-2 text-sm text-gray-700">
            {selectedClient?.full_name ?? "Walk-in Customer"}
          </Text>
        </View>

        {/* Cart Items */}
        {cart.map((item) => (
          <View
            key={`${item.type}-${item.item_id}`}
            className="flex-row items-center justify-between border-b border-gray-50 py-3"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900">
                {item.name}
              </Text>
              <Text className="text-xs text-gray-500">
                {item.type === "product" ? "Product" : "Service"} · Qty: {item.quantity}
              </Text>
            </View>
            <Text className="text-sm font-semibold text-gray-900">
              {formatCurrency(item.price * item.quantity)}
            </Text>
          </View>
        ))}

        {/* Team Member */}
        {staffMembers && staffMembers.length > 0 && (
          <View className="mt-4">
            <Text className="mb-2 text-sm font-medium text-gray-700">Assigned To</Text>
            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity
                className={`rounded-full px-3 py-1.5 ${!selectedStaffId ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
                onPress={() => setSelectedStaffId(null)}
                accessibilityLabel="No staff assigned"
              >
                <Text className={`text-xs font-medium ${!selectedStaffId ? "text-white" : "text-gray-600"}`}>
                  None
                </Text>
              </TouchableOpacity>
              {staffMembers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  className={`rounded-full px-3 py-1.5 ${selectedStaffId === s.id ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
                  onPress={() => setSelectedStaffId(s.id)}
                  accessibilityLabel={`Assign to ${s.name}`}
                >
                  <Text className={`text-xs font-medium ${selectedStaffId === s.id ? "text-white" : "text-gray-600"}`}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Discount */}
        <View className="mt-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Discount (R)
          </Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            accessibilityLabel="Discount amount"
          />
        </View>

        {/* Tip */}
        <View className="mt-3">
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Tip (R)
          </Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            value={tip}
            onChangeText={setTip}
            keyboardType="numeric"
            accessibilityLabel="Tip amount"
          />
        </View>

        {/* Payment Method */}
        <Text className="mb-2 mt-4 text-sm font-medium text-gray-700">
          Payment Method
        </Text>
        <View className="flex-row gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <TouchableOpacity
              key={pm.value}
              className={`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                paymentMethod === pm.value
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 bg-white"
              }`}
              onPress={() => setPaymentMethod(pm.value)}
              accessibilityLabel={`Payment method: ${pm.label}`}
              accessibilityRole="button"
            >
              <Ionicons
                name={pm.icon}
                size={16}
                color={paymentMethod === pm.value ? "#6366f1" : "#6b7280"}
              />
              <Text
                className={`ml-1.5 text-sm font-medium ${
                  paymentMethod === pm.value
                    ? "text-indigo-700"
                    : "text-gray-600"
                }`}
              >
                {pm.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Totals */}
        <View className="mt-4 rounded-xl bg-gray-50 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-600">Subtotal</Text>
            <Text className="text-sm text-gray-900">
              {formatCurrency(cartTotal)}
            </Text>
          </View>
          {discountAmount > 0 && (
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-sm text-gray-600">Discount</Text>
              <Text className="text-sm text-red-600">
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-sm text-gray-600">
              VAT ({(taxRate * 100).toFixed(0)}%){taxInclusive ? " (incl.)" : ""}
            </Text>
            <Text className="text-sm text-gray-500">
              {formatCurrency(taxAmount)}
            </Text>
          </View>
          {tipAmount > 0 && (
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-sm text-gray-600">Tip</Text>
              <Text className="text-sm text-gray-900">
                +{formatCurrency(tipAmount)}
              </Text>
            </View>
          )}
          <View className="mt-2 border-t border-gray-200 pt-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-gray-900">Total</Text>
              <Text className="text-lg font-bold text-gray-900">
                {formatCurrency(grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-4">
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
          className="mt-3 items-center py-2"
          onPress={() => setCheckoutStep("select_services")}
          accessibilityLabel="Go back to item selection"
          accessibilityRole="button"
        >
          <Text className="text-sm text-gray-500">Back to items</Text>
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
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
          </View>
          <Text className="mt-3 text-lg font-bold text-gray-900">
            Sale Complete!
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {receiptData.client} &middot;{" "}
            {format(new Date(receiptData.date), "MMM d, HH:mm")}
          </Text>
        </View>

        <View className="mt-4 rounded-xl bg-gray-50 p-4">
          {receiptData.items.map((item, idx) => (
            <View
              key={idx}
              className="flex-row items-center justify-between py-1.5"
            >
              <Text className="text-sm text-gray-700">
                {item.name} x{item.quantity}
              </Text>
              <Text className="text-sm text-gray-900">
                {formatCurrency(item.price * item.quantity)}
              </Text>
            </View>
          ))}
          <View className="mt-2 border-t border-gray-200 pt-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-gray-900">Total</Text>
              <Text className="text-lg font-bold text-gray-900">
                {formatCurrency(receiptData.total)}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500 capitalize">
              Paid via {receiptData.method}
            </Text>
          </View>
        </View>

        <View className="mt-4">
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
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100"
            onPress={() => router.push("/(app)/(tabs)/more/finance" as any)}
            accessibilityLabel="View finance reports"
            accessibilityRole="button"
          >
            <Ionicons name="stats-chart-outline" size={20} color="#111" />
          </TouchableOpacity>
        }
      />

      {/* Revenue Stats */}
      <View className={`gap-3 ${isTablet ? "flex-row" : ""}`}>
        <View className={isTablet ? "flex-1" : ""}>
          <StatCard
            title="Today's Revenue"
            value={formatCurrency(metrics?.revenue_today ?? 0)}
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
          />
        </View>
        <View className={isTablet ? "flex-1" : ""}>
          <StatCard
            title="Monthly Revenue"
            value={formatCurrency(metrics?.revenue_this_month ?? 0)}
            icon="trending-up-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            trend={
              metrics?.revenue_growth
                ? { value: metrics.revenue_growth }
                : undefined
            }
          />
        </View>
        {isTablet && (
          <View className="flex-1">
            <StatCard
              title="Pending"
              value={formatCurrency(metrics?.pending_payments_amount ?? 0)}
              subtitle={`${metrics?.pending_payments_count ?? 0} payments`}
              icon="time-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
            />
          </View>
        )}
      </View>

      {/* Date filter */}
      <View className="mt-4">
        <FilterChipGroup
          options={DATE_RANGES}
          selected={dateRange}
          onSelect={setDateRange}
        />
      </View>

      {/* Transactions */}
      <View className="mt-4">
        <Text className="mb-3 text-base font-semibold text-gray-900">
          Transactions ({sales.length})
        </Text>

        {salesLoading && sales.length === 0 ? (
          <LoadingState fullScreen={false} />
        ) : sales.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No sales yet"
            description="Sales created via POS will appear here"
          />
        ) : (
          <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-2"}>
            {sales.map((sale) => (
              <View
                key={sale.id}
                className={`rounded-xl border border-gray-100 bg-white p-4 ${
                  isTablet ? "w-[48.5%]" : ""
                }`}
                accessibilityLabel={`Sale: ${sale.client_name ?? "Walk-in"}, ${formatCurrency(sale.total)}`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text
                      className="text-sm font-semibold text-gray-900"
                      numberOfLines={1}
                    >
                      {sale.client_name ?? "Walk-in"}
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {sale.ref_number} · {formatDate(sale.date, "MMM d")} at{" "}
                      {formatTime(sale.date)}
                    </Text>
                  </View>
                  <Text className="text-base font-bold text-gray-900">
                    {formatCurrency(sale.total)}
                  </Text>
                </View>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text
                    className="text-xs text-gray-500"
                    numberOfLines={1}
                  >
                    {sale.items?.map((i) => i.name).join(", ") || "Items"}
                  </Text>
                  <Badge
                    status={sale.payment_method}
                    size="sm"
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* New Sale FAB */}
      <TouchableOpacity
        className="absolute bottom-24 right-5 h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg"
        style={{ elevation: 8 }}
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
        currency="ZAR"
        description={`POS Sale for ${selectedClient?.full_name ?? "Walk-in"}`}
        onPaymentSuccess={async (result) => {
          await completeSaleWithMethod("card", result.reference);
        }}
      />

      <View className="h-8" />
    </ScreenContainer>
  );
}
