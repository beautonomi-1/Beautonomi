import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import { useRouter, useFocusEffect } from "expo-router";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useProductOrders, type ProductOrder } from "@/features/shop/useProductOrders";
import { getTenantLocaleTag } from "@/lib/locale";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { horizontalFlatListPerf, verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

const PRIMARY = Colors.primary;

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(getTenantLocaleTag(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; icon: string }> = {
  pending: { labelKey: "statusPending", color: "#F59E0B", icon: "time-outline" },
  confirmed: { labelKey: "statusConfirmed", color: "#3B82F6", icon: "checkmark-circle-outline" },
  processing: { labelKey: "statusProcessing", color: "#8B5CF6", icon: "construct-outline" },
  ready_for_collection: { labelKey: "statusReady", color: "#22C55E", icon: "storefront-outline" },
  shipped: { labelKey: "statusShipped", color: "#3B82F6", icon: "airplane-outline" },
  delivered: { labelKey: "statusDelivered", color: "#22C55E", icon: "checkmark-done-circle-outline" },
  cancelled: { labelKey: "statusCancelled", color: "#EF4444", icon: "close-circle-outline" },
  refunded: { labelKey: "statusRefunded", color: "#9CA3AF", icon: "arrow-undo-outline" },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? { labelKey: "", color: "#6B7280", icon: "help-outline" };
  const label = cfg.labelKey
    ? (t(`customer.mobile.screens.productOrders.${cfg.labelKey}`) as string)
    : status;
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
      <Text style={{ fontSize: 12, fontWeight: "600", color: cfg.color, marginStart: 4 }}>
        {label}
      </Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: ProductOrder; onPress: () => void }) {
  const { t } = useTranslation();
  const { contentPadding } = useResponsive();
  const fb = getTenantDefaultCurrency();
  const totalLabel = formatMoney(Number(order.total_amount), order.currency ?? fb);
  const firstImage = order.items?.[0]?.product_image_url;
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const date = formatDateSafe(order.created_at);

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
        <View style={{ flex: 1, marginStart: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
              {order.order_number}
            </Text>
            <StatusBadge status={order.status} />
          </View>
          <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 2 }}>
            {order.provider?.business_name}
          </Text>
          {order.fulfillment_type === "collection" && order.collection_location ? (
            <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }} numberOfLines={1}>
              {t("customer.mobile.screens.productOrders.collectAt", {
                name: order.collection_location.name,
                city: order.collection_location.city,
              })}
            </Text>
          ) : order.fulfillment_type === "delivery" && order.delivery_address?.city ? (
            <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }} numberOfLines={1}>
              {t("customer.mobile.screens.productOrders.deliverTo", {
                city: order.delivery_address.city,
              })}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
              {t(
                itemCount === 1
                  ? "customer.mobile.screens.productOrders.itemCountOne"
                  : "customer.mobile.screens.productOrders.itemCountOther",
                { count: itemCount },
              )}{" "}
              · {date}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: PRIMARY }}>
              {totalLabel}
            </Text>
          </View>
          {order.returns && order.returns.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Ionicons name="arrow-undo-outline" size={14} color="#EF4444" />
              <Text style={{ fontSize: 12, color: "#EF4444", marginStart: 4, fontWeight: "600" }}>
                {t("customer.mobile.screens.productOrders.returnLabel", {
                  status: order.returns[0].status,
                })}
              </Text>
            </View>
          )}
          {order.tracking_number && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Ionicons name="location-outline" size={14} color="#3B82F6" />
              <Text style={{ fontSize: 12, color: "#3B82F6", marginStart: 4 }}>
                {t("customer.mobile.screens.productOrders.tracking", {
                  number: order.tracking_number,
                })}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ProductOrdersScreen() {
  const { t } = useTranslation();
  const po = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.productOrders.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const router = useRouter();
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const { orders, loading, error: loadError, fetchOrders } = useProductOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // §Customer-audit 2026-04: after product-checkout -> Paystack -> in-app
  // browser dismiss, the user lands back here. Previously the list was
  // frozen at its mount-time snapshot, so the order they just paid for
  // still showed as "pending" and appeared to have no status update.
  // Refetch whenever the screen regains focus so the newly paid order
  // reflects the latest webhook state. Skip the very first focus (we
  // already fetch on mount) to avoid a duplicate in-flight request.
  const hasHandledInitialFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasHandledInitialFocus.current) {
        hasHandledInitialFocus.current = true;
        return;
      }
      fetchOrders(statusFilter ?? undefined);
    }, [fetchOrders, statusFilter]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders(statusFilter ?? undefined);
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, statusFilter]);

  const handleFilterChange = useCallback(
    (status: string | null) => {
      setStatusFilter(status);
      fetchOrders(status ?? undefined);
    },
    [fetchOrders],
  );

  const FILTER_TABS = useMemo(
    () => [
      { key: null, label: po("filterAll") },
      { key: "pending", label: po("statusPending") },
      { key: "confirmed,processing,ready_for_collection,shipped", label: po("filterActive") },
      { key: "delivered", label: po("filterCompleted") },
      { key: "cancelled", label: po("statusCancelled") },
    ],
    [po],
  );

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
        <TouchableOpacity onPress={() => router.back()} style={{ marginEnd: 12 }}>
          <DirectionalIcon name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          {po("title")}
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={{ backgroundColor: "#fff", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
        <FlatList
          {...horizontalFlatListPerf}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: contentPadding }}
          data={FILTER_TABS}
          keyExtractor={(tab) => tab.key ?? "all"}
          renderItem={({ item: tab }) => {
            const active = statusFilter === tab.key;
            return (
              <TouchableOpacity
                onPress={() => handleFilterChange(tab.key)}
                style={{
                  paddingHorizontal: contentPadding,
                  paddingVertical: 8,
                  borderRadius: 20,
                  marginEnd: 8,
                  backgroundColor: active ? PRIMARY : "#F3F4F6",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : "#6B7280" }}>
                  {tab.label}
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
      ) : loadError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
          <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#374151", marginTop: 12 }}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => fetchOrders(statusFilter ?? undefined)}
            style={{ marginTop: 20, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, backgroundColor: PRIMARY }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{po("retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
          <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16 }}>
            {po("emptyTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
            {po("emptyBody")}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/explore" as any)}
            style={{ marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, backgroundColor: PRIMARY }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{po("findProviderCta")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          {...verticalFlatListPerf}
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
              onPress={() =>
                router.push({ pathname: "/(app)/product-order-detail", params: { id: order.id } } as never)
              }
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
