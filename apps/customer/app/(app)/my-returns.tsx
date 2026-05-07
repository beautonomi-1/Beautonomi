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

function formatDateSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString();
}

const RETURN_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400E" },
  approved: { bg: "#DBEAFE", text: "#1E40AF" },
  item_received: { bg: "#E9D5FF", text: "#6B21A8" },
  refunded: { bg: "#D1FAE5", text: "#065F46" },
  rejected: { bg: "#FEE2E2", text: "#B91C1C" },
  escalated: { bg: "#FECACA", text: "#991B1B" },
  resolved_by_admin: { bg: "#F3F4F6", text: "#374151" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280" },
};

const RETURN_STATUS_I18N_KEY: Record<string, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  item_received: "statusItemReceived",
  refunded: "statusRefunded",
  rejected: "statusRejected",
  escalated: "statusEscalated",
  resolved_by_admin: "statusResolved",
  cancelled: "statusCancelled",
};

function formatReturnStatus(
  s: string,
  mr: (key: string, options?: Record<string, string | number>) => string,
): string {
  const k = RETURN_STATUS_I18N_KEY[s];
  if (k) return mr(k);
  return s.replace(/_/g, " ");
}

function returnStatusStyle(s: string) {
  const st = RETURN_STATUS_STYLE[s] ?? { bg: "#F3F4F6", text: "#374151" };
  return { backgroundColor: st.bg, color: st.text };
}

export default function MyReturnsScreen() {
  const { t } = useTranslation();
  const emDash = t("customer.chatScreen.emDash");
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const mr = useCallback(
    (key: string, options?: Record<string, string | number>) =>
      (options != null
        ? t(`customer.mobile.screens.myReturns.${key}`, options as never)
        : t(`customer.mobile.screens.myReturns.${key}`)) as string,
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
        setError(res.error.message || mr("loadFailed"));
        return;
      }
      const data = (res.data as { returns?: ReturnItem[] }) ?? res.data;
      const list = data?.returns ?? (Array.isArray(data) ? data : []);
      setReturns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : mr("loadFailed"));
      setReturns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mr]);

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
        <Stack.Screen options={{ headerShown: true, title: mr("screenTitle") }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: Colors.gray[500] }}>{t("customer.mobile.tabs.chats.loading")}</Text>
        </View>
      </>
    );
  }

  if (error && returns.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: mr("screenTitle") }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: mr("screenTitle") }} />
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: contentPadding, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.gray[100] }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{mr("headerSubtitle")}</Text>
          <TouchableOpacity onPress={() => router.push("/(app)/product-orders" as never)}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{mr("viewOrdersCta")}</Text>
          </TouchableOpacity>
        </View>

        {returns.length === 0 ? (
          <View style={{ flex: 1, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Ionicons name="arrow-undo-outline" size={32} color={Colors.gray[400]} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>{mr("emptyTitle")}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
              {mr("emptyBody")}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(app)/product-orders" as never)} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}>
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{mr("viewMyOrdersCta")}</Text>
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
              const statusSt = returnStatusStyle(r.status);
              const busy = actionId === r.id;
              const orderNavId = r.order_id ?? r.order?.id;
              const refundCur = (r.order?.currency && String(r.order.currency).trim()) || fb;
              const orderNum = r.order?.order_number ?? emDash;
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
                          accessibilityLabel={mr("openOrderA11y", { number: orderNum })}
                        >
                          <Text style={{ fontSize: 12, color: Colors.primary, marginBottom: 2, fontWeight: "600" }}>
                            {mr("orderLabel", { number: orderNum })}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 2 }}>{mr("orderLabel", { number: orderNum })}</Text>
                      )}
                      <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>{r.product_name}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                        {r.order?.provider?.business_name ?? ""} · {r.reason.replace(/_/g, " ")} · {mr("qtyLabel", { count: r.quantity })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, ...statusSt }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", ...statusSt }}>{formatReturnStatus(r.status, mr)}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginTop: 8 }}>
                        {formatMoney(Number(r.refund_amount), refundCur)}
                      </Text>
                      <Text style={{ fontSize: 11, color: Colors.gray[400] }}>{formatDateSafe(r.created_at, emDash)}</Text>
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
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>{mr("viewOrderCta")}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {r.status === "pending" && (
                      <TouchableOpacity
                        onPress={() => handleCancel(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200] }}
                      >
                        {busy ? <ActivityIndicator size="small" color={Colors.gray[600]} /> : <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700] }}>{mr("cancelRequestCta")}</Text>}
                      </TouchableOpacity>
                    )}
                    {r.status === "rejected" && (
                      <TouchableOpacity
                        onPress={() => handleEscalate(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
                      >
                        {busy ? <ActivityIndicator size="small" color="#B91C1C" /> : <Text style={{ fontSize: 13, fontWeight: "500", color: "#B91C1C" }}>{mr("escalateConfirmCta")}</Text>}
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
