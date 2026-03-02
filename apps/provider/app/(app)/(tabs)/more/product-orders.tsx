import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_variant?: { option_values?: Record<string, string> } | null;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number | string;
  status: string;
  payment_status?: string;
  fulfillment_type?: string;
  created_at: string;
  items?: OrderItem[];
  customer?: { full_name?: string | null; email?: string | null };
}

interface OrdersListResponse {
  orders: Order[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "ready_for_collection", label: "Ready" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
];

/** Content-only for use in Orders hub (Orders tab). */
export function ProductOrdersContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const url = `/api/provider/product-orders?limit=50${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error, refresh } = useApi<OrdersListResponse>(url);
  const { execute: patchOrder } = useApiMutation<{ order: Order }>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const orders = data?.orders ?? [];

  const openOrder = useCallback(async (order: Order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewOrder(order);
    setOrderDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<{ order: Order }>(`/api/provider/product-orders/${order.id}`);
      if (res.data?.order) setOrderDetail(res.data.order);
      else setOrderDetail(order);
    } catch {
      setOrderDetail(order);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const updateStatus = useCallback(
    async (orderId: string, status: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error: err } = await patchOrder(`/api/provider/product-orders/${orderId}`, {
        status,
      });
      if (err) {
        Alert.alert("Error", err);
      } else {
        setViewOrder(null);
        setOrderDetail(null);
        refresh();
      }
    },
    [patchOrder, refresh]
  );

  const getNextStatusOptions = (current: string): string[] => {
    const map: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["processing", "cancelled"],
      processing: ["ready_for_collection", "shipped", "cancelled"],
      ready_for_collection: ["delivered", "cancelled"],
      shipped: ["delivered"],
    };
    return map[current] ?? [];
  };

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <View className="mb-2 flex-row flex-wrap gap-2 px-4">
        {STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value || "all"}
            onPress={() => setStatusFilter(opt.value)}
            className={`rounded-full px-3 py-1.5 ${statusFilter === opt.value ? "bg-pink-600" : "bg-gray-100"}`}
          >
            <Text
              className={`text-xs font-medium ${statusFilter === opt.value ? "text-white" : "text-gray-700"}`}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {orders.length === 0 ? (
          <View className="items-center py-16">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-pink-100">
              <Ionicons name="bag-handle-outline" size={32} color="#ec4899" />
            </View>
            <Text className="text-center font-semibold text-gray-900">No orders</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              {statusFilter ? `No orders with status "${statusFilter}".` : "Customer product orders will appear here."}
            </Text>
          </View>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              onPress={() => openOrder(order)}
              activeOpacity={0.7}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-pink-100">
                <Ionicons name="receipt-outline" size={20} color="#ec4899" />
              </View>
              <View className="ml-3 flex-1 min-w-0">
                <Text className="font-semibold text-gray-900" numberOfLines={1}>
                  {order.order_number}
                </Text>
                <Text className="mt-0.5 text-sm text-gray-600">
                  {order.customer?.full_name ?? "Customer"} · R {Number(order.total_amount).toFixed(2)}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">{order.status}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {viewOrder && (
        <BottomSheet
          visible={!!viewOrder}
          onClose={() => setViewOrder(null)}
          title={viewOrder.order_number}
          subtitle={orderDetail?.customer?.full_name ?? viewOrder.customer?.full_name ?? "Order"}
        >
          {loadingDetail ? (
            <View className="items-center py-6">
              <LoadingState />
            </View>
          ) : orderDetail ? (
            <>
              <View className="mb-3 flex-row flex-wrap gap-2">
                <View className="rounded-full bg-gray-100 px-2.5 py-1">
                  <Text className="text-xs font-medium text-gray-700">{orderDetail.status}</Text>
                </View>
                {orderDetail.payment_status && (
                  <View className="rounded-full bg-emerald-100 px-2.5 py-1">
                    <Text className="text-xs font-medium text-emerald-800">
                      {orderDetail.payment_status}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mb-2 text-sm font-medium text-gray-700">Items</Text>
              {(orderDetail.items ?? []).map((item) => {
                const variantLabel =
                  item.product_variant?.option_values &&
                  Object.keys(item.product_variant.option_values).length > 0
                    ? " · " + Object.values(item.product_variant.option_values).join(", ")
                    : "";
                return (
                  <View key={item.id} className="mb-2 flex-row justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <Text className="flex-1 text-sm text-gray-900" numberOfLines={2}>
                      {item.product_name}
                      {variantLabel}
                      {" × "}
                      {item.quantity}
                    </Text>
                    <Text className="text-sm font-medium text-gray-700">
                      R {Number(item.total_price).toFixed(2)}
                    </Text>
                  </View>
                );
              })}
              <Text className="mb-3 text-right text-base font-semibold text-gray-900">
                Total R {Number(orderDetail.total_amount).toFixed(2)}
              </Text>
              {getNextStatusOptions(orderDetail.status).length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {getNextStatusOptions(orderDetail.status).map((status) => (
                    <TouchableOpacity
                      key={status}
                      onPress={() => updateStatus(orderDetail.id, status)}
                      className={`rounded-xl px-4 py-2 ${status === "cancelled" ? "bg-red-50" : "bg-pink-100"}`}
                    >
                      <Text
                        className={`text-sm font-medium ${status === "cancelled" ? "text-red-600" : "text-pink-800"}`}
                      >
                        Mark {status.replace(/_/g, " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : null}
        </BottomSheet>
      )}
    </>
  );
}

export default function ProductOrdersScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Product Orders" showBack subtitle="Customer orders" />
      <ProductOrdersContent />
    </ScreenContainer>
  );
}
