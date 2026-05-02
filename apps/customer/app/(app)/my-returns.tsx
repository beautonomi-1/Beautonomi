import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";

interface ReturnItem {
  id: string;
  order_id?: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order?: {
    id?: string;
    order_number?: string;
    currency?: string | null;
    provider?: { business_name?: string };
  };
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "#FEF3C7", text: "#92400E" },
  approved: { label: "Approved", bg: "#DBEAFE", text: "#1E40AF" },
  item_received: { label: "Item received", bg: "#E9D5FF", text: "#6B21A8" },
  refunded: { label: "Refunded", bg: "#D1FAE5", text: "#065F46" },
  rejected: { label: "Rejected", bg: "#FEE2E2", text: "#B91C1C" },
  escalated: { label: "Escalated", bg: "#FECACA", text: "#991B1B" },
  resolved_by_admin: { label: "Resolved", bg: "#F3F4F6", text: "#374151" },
  cancelled: { label: "Cancelled", bg: "#F3F4F6", text: "#6B7280" },
};

function formatStatus(s: string): string {
  return (STATUS_LABELS[s] ?? { label: s.replace(/_/g, " ") }).label;
}

function statusStyle(s: string) {
  const st = STATUS_LABELS[s] ?? { bg: "#F3F4F6", text: "#374151" };
  return { backgroundColor: st.bg, color: st.text };
}

export default function MyReturnsScreen() {
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const mr = useCallback(
    (key: string) => t(`customer.mobile.screens.myReturns.${key}`) as string,
    [t],
  );
  const { contentPadding } = useResponsive();
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fb = getTenantDefaultCurrency();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ returns?: ReturnItem[] }>("/api/me/returns");
      if (res.error) {
        setError(res.error.message || "Failed to load returns");
        return;
      }
      const data = (res.data as { returns?: ReturnItem[] }) ?? res.data;
      const list = data?.returns ?? (Array.isArray(data) ? data : []);
      setReturns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load returns");
      setReturns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = useCallback(
    (id: string) => {
      Alert.alert(mr("cancelReturnTitle"), mr("cancelReturnBody"), [
        { text: mr("keepCta"), style: "cancel" },
        {
          text: mr("cancelRequestCta"),
          style: "destructive",
          onPress: async () => {
            setActionId(id);
            try {
              const res = await api.patch(`/api/me/returns/${id}`, { action: "cancel" });
              if (res.error) {
                Alert.alert(errTitle, (res.error as { message?: string })?.message ?? mr("cancelFailed"));
              } else await load();
            } catch {
              Alert.alert(errTitle, mr("cancelReturnFailed"));
            } finally {
              setActionId(null);
            }
          },
        },
      ]);
    },
    [load, mr, errTitle]
  );

  const handleEscalate = useCallback(
    (id: string) => {
      Alert.alert(mr("escalateTitle"), mr("escalateBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: mr("escalateConfirmCta"),
          style: "destructive",
          onPress: async () => {
            setActionId(id);
            try {
              const res = await api.patch(`/api/me/returns/${id}`, { action: "escalate" });
              if (res.error) {
                Alert.alert(errTitle, (res.error as { message?: string })?.message ?? mr("escalateFailed"));
              } else await load();
            } catch {
              Alert.alert(errTitle, mr("escalateFailed"));
            } finally {
                setActionId(null);
              }
            },
          },
        ],
      );
    },
    [load, mr, errTitle, t]
  );

  if (loading && returns.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: Colors.gray[500] }}>Loading…</Text>
        </View>
      </>
    );
  }

  if (error && returns.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: contentPadding, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.gray[100] }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Track return requests and refunds</Text>
          <TouchableOpacity onPress={() => router.push("/(app)/product-orders" as never)}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>View orders</Text>
          </TouchableOpacity>
        </View>

        {returns.length === 0 ? (
          <View style={{ flex: 1, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Ionicons name="arrow-undo-outline" size={32} color={Colors.gray[400]} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>No return requests</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
              You can request a return from your order details within 14 days of delivery.
            </Text>
            <TouchableOpacity onPress={() => router.push("/(app)/product-orders" as never)} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}>
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>View my orders</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            {...verticalFlatListPerf}
            data={returns}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: contentPadding, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
            renderItem={({ item: r }) => {
              const statusSt = statusStyle(r.status);
              const busy = actionId === r.id;
              const orderNavId = r.order_id ?? r.order?.id;
              const refundCur = (r.order?.currency && String(r.order.currency).trim()) || fb;
              return (
                <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      {orderNavId ? (
                        <TouchableOpacity
                          onPress={() =>
                            router.push({
                              pathname: "/(app)/product-order-detail",
                              params: { id: orderNavId },
                            } as never)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Open order ${r.order?.order_number ?? ""}`}
                        >
                          <Text style={{ fontSize: 12, color: Colors.primary, marginBottom: 2, fontWeight: "600" }}>
                            Order {r.order?.order_number ?? "—"}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 2 }}>Order {r.order?.order_number ?? "—"}</Text>
                      )}
                      <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>{r.product_name}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                        {r.order?.provider?.business_name ?? ""} · {r.reason.replace(/_/g, " ")} · Qty {r.quantity}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, ...statusSt }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", ...statusSt }}>{formatStatus(r.status)}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginTop: 8 }}>
                        {formatMoney(Number(r.refund_amount), refundCur)}
                      </Text>
                      <Text style={{ fontSize: 11, color: Colors.gray[400] }}>{formatDateSafe(r.created_at)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {orderNavId ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: "/(app)/product-order-detail",
                            params: { id: orderNavId },
                          } as never)
                        }
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[200] }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>View order</Text>
                      </TouchableOpacity>
                    ) : null}
                    {r.status === "pending" && (
                      <TouchableOpacity
                        onPress={() => handleCancel(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200] }}
                      >
                        {busy ? <ActivityIndicator size="small" color={Colors.gray[600]} /> : <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700] }}>Cancel request</Text>}
                      </TouchableOpacity>
                    )}
                    {r.status === "rejected" && (
                      <TouchableOpacity
                        onPress={() => handleEscalate(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
                      >
                        {busy ? <ActivityIndicator size="small" color="#B91C1C" /> : <Text style={{ fontSize: 13, fontWeight: "500", color: "#B91C1C" }}>Escalate</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

      </View>
    </>
  );
}
