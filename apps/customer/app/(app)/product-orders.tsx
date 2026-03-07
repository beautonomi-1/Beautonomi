import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useProductOrders, type ProductOrder } from "@/features/shop/useProductOrders";

const PRIMARY = Colors.primary;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Pending", color: "#F59E0B", icon: "time-outline" },
  confirmed: { label: "Confirmed", color: "#3B82F6", icon: "checkmark-circle-outline" },
  processing: { label: "Processing", color: "#8B5CF6", icon: "construct-outline" },
  ready_for_collection: { label: "Ready", color: "#22C55E", icon: "storefront-outline" },
  shipped: { label: "Shipped", color: "#3B82F6", icon: "airplane-outline" },
  delivered: { label: "Delivered", color: "#22C55E", icon: "checkmark-done-circle-outline" },
  cancelled: { label: "Cancelled", color: "#EF4444", icon: "close-circle-outline" },
  refunded: { label: "Refunded", color: "#9CA3AF", icon: "arrow-undo-outline" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "#6B7280", icon: "help-outline" };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: `${cfg.color}15`,
      }}
    >
      <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: cfg.color, marginLeft: 4 }}>
        {cfg.label}
      </Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: ProductOrder; onPress: () => void }) {
  const { contentPadding } = useResponsive();
  const firstImage = order.items?.[0]?.product_image_url;
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const date = new Date(order.created_at).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        marginHorizontal: contentPadding,
        marginBottom: 12,
        overflow: "hidden",
        ...Shadows.card,
      }}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: "row", padding: contentPadding }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "#F3F4F6",
          }}
        >
          {firstImage ? (
            <Image source={{ uri: firstImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="cube-outline" size={24} color="#D1D5DB" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
              {order.order_number}
            </Text>
            <StatusBadge status={order.status} />
          </View>
          <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 2 }}>
            {order.provider?.business_name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
              {itemCount} item{itemCount !== 1 ? "s" : ""} · {date}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: PRIMARY }}>
              R{Number(order.total_amount).toFixed(2)}
            </Text>
          </View>
          {order.tracking_number && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Ionicons name="location-outline" size={14} color="#3B82F6" />
              <Text style={{ fontSize: 12, color: "#3B82F6", marginLeft: 4 }}>
                Tracking: {order.tracking_number}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ProductOrdersScreen() {
  const router = useRouter();
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const { orders, loading, fetchOrders } = useProductOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders(statusFilter ?? undefined);
    setRefreshing(false);
  }, [fetchOrders, statusFilter]);

  const handleFilterChange = useCallback(
    (status: string | null) => {
      setStatusFilter(status);
      fetchOrders(status ?? undefined);
    },
    [fetchOrders],
  );

  const FILTER_TABS = [
    { key: null, label: "All" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Active" },
    { key: "delivered", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          My Orders
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={{ backgroundColor: "#fff", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: contentPadding }}
          data={FILTER_TABS}
          keyExtractor={(t) => t.key ?? "all"}
          renderItem={({ item: t }) => {
            const active = statusFilter === t.key;
            return (
              <TouchableOpacity
                onPress={() => handleFilterChange(t.key)}
                style={{
                  paddingHorizontal: contentPadding,
                  paddingVertical: 8,
                  borderRadius: 20,
                  marginRight: 8,
                  backgroundColor: active ? PRIMARY : "#F3F4F6",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : "#6B7280" }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
          <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16 }}>
            No orders yet
          </Text>
          <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
            Your product orders will appear here
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/shop" as any)}
            style={{ marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, backgroundColor: PRIMARY }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Shop Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: 24,
            paddingHorizontal: contentPadding,
            ...((isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {}),
          }}
          renderItem={({ item: order }) => (
            <OrderCard
              order={order}
              onPress={() => router.push(`/product-order-detail?id=${order.id}` as any)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PRIMARY} />
          }
        />
      )}
    </SafeAreaView>
  );
}
