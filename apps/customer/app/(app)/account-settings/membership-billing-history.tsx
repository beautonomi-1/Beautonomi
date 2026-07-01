import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform, Alert, Share } from "react-native";
import { useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";
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
  receipt_url: string;
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

export default function MembershipBillingHistoryScreen() {
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
      const res = await api.get<{ items?: BillingItem[] }>("/api/me/membership/billing-history");
      if (res.error) setError(getApiErrorMessage(res.error, "Failed to load billing history"));
      else setItems(res.data?.items ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e as Error, "Failed to load billing history"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openReceipt = async (item: BillingItem) => {
    try {
      const base = getBackendUrl().replace(/\/$/, "");
      const pdfPath = item.receipt_url; // already starts with /api/...
      const filename = `membership-receipt-${item.id}.pdf`.replace(/[^\w.-]+/g, "_");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!base) {
        Alert.alert("Download failed", "Could not determine API URL.");
        return;
      }

      const pdfUrl = `${base}${pdfPath}`;

      if (Platform.OS === "web") {
        const init = withWebApiTenantHeaders({
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "omit",
        });
        const response = await fetch(pdfUrl, init);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }

      if (!FileSystem.cacheDirectory) {
        Alert.alert("Download failed", "Storage is unavailable on this device.");
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const tenantInit = withWebApiTenantHeaders({ headers, credentials: "omit" });
      const allHeaders: Record<string, string> = Object.assign(
        {},
        headers,
        tenantInit.headers as Record<string, string> | undefined,
      );
      const dl = await FileSystem.downloadAsync(pdfUrl, fileUri, { headers: allHeaders });
      if (dl.status !== 200) {
        Alert.alert("Download failed", `The server returned status ${dl.status}.`);
        return;
      }
      await Share.share({ url: fileUri, title: "Membership receipt", message: filename });
    } catch (e) {
      Alert.alert("Download failed", getApiErrorMessage(e as Error, "Could not download receipt."));
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>Billing history</Text>

        {items.length === 0 ? (
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
            <Text style={{ color: Colors.gray[600] }}>No billing history yet.</Text>
          </View>
        ) : (
          items.map((item) => (
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
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "700", color: Colors.gray[900], fontSize: 15 }}>{formatMoney(item.amount)}</Text>
                  <View style={{ backgroundColor: "#D1FAE5", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: "#065F46", fontWeight: "600" }}>Paid</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openReceipt(item)}
                style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>Download receipt</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
