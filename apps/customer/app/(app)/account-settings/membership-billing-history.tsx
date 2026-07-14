import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform, Alert } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { downloadPdf } from "@/lib/pdf-file";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

type BillingItem = {
  id: string;
  date: string;
  amount: number;
  fees: number;
  net: number;
  status: string;
  kind: string | undefined;
  is_renewal: boolean;
  plan_name: string;
  provider_name: string;
  provider_id: string | null;
  reference: string | null;
  receipt_url: string | null;
  failure_reason?: string | null;
};

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(amount: number, currency?: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency ?? "ZAR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function statusStyle(status: string): { bg: string; text: string; label: string } {
  const s = status.toLowerCase();
  if (s === "paid") return { bg: "#D1FAE5", text: "#065F46", label: "Paid" };
  if (s === "failed") return { bg: "#FEE2E2", text: "#991B1B", label: "Failed" };
  if (s === "pending") return { bg: "#FEF3C7", text: "#92400E", label: "Pending" };
  return { bg: Colors.gray[100], text: Colors.gray[700], label: status };
}

export default function MembershipBillingHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    membership_id?: string;
    provider_id?: string;
    provider_name?: string;
    plan_id?: string;
  }>();
  const providerId = typeof params.provider_id === "string" ? params.provider_id : undefined;
  const planId = typeof params.plan_id === "string" ? params.plan_id : undefined;
  const providerName = typeof params.provider_name === "string" ? params.provider_name : undefined;

  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web")
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};

  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (providerId) q.set("provider_id", providerId);
      if (planId) q.set("plan_id", planId);
      const qs = q.toString();
      const path = `/api/me/membership/billing-history${qs ? `?${qs}` : ""}`;
      const res = await api.get<{ items?: BillingItem[] }>(path);
      if (res.error) setError(getApiErrorMessage(res.error, "Failed to load billing history"));
      else setItems(res.data?.items ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e as Error, "Failed to load billing history"));
    } finally {
      setLoading(false);
    }
  }, [providerId, planId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openReceipt = async (item: BillingItem) => {
    if (!item.receipt_url) return;
    try {
      await downloadPdf({
        router,
        pdfPath: item.receipt_url,
        filename: `membership-receipt-${item.id}.pdf`,
        title: "Membership receipt",
        label: "receipt",
      });
    } catch (e) {
      Alert.alert("Download failed", getApiErrorMessage(e as Error, "Could not download receipt."));
    }
  };

  const title = providerName ? `Billing history · ${providerName}` : "Billing history";

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>{title}</Text>

        {items.length === 0 ? (
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
            <Text style={{ color: Colors.gray[600] }}>No billing history yet.</Text>
          </View>
        ) : (
          items.map((item) => {
            const badge = statusStyle(item.status);
            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: Colors.white,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900], fontSize: 15 }}>
                      {item.plan_name}
                      {item.is_renewal ? " (renewal)" : " (initial)"}
                    </Text>
                    <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>{item.provider_name}</Text>
                    <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{formatDateSafe(item.date)}</Text>
                    {item.failure_reason ? (
                      <Text style={{ fontSize: 12, color: "#B91C1C", marginTop: 4 }}>{item.failure_reason}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontWeight: "700", color: Colors.gray[900], fontSize: 15 }}>{formatMoney(item.amount)}</Text>
                    <View style={{ backgroundColor: badge.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: badge.text, fontWeight: "600" }}>{badge.label}</Text>
                    </View>
                  </View>
                </View>

                {item.receipt_url && item.status === "paid" ? (
                  <TouchableOpacity
                    onPress={() => openReceipt(item)}
                    style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>Download receipt</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
