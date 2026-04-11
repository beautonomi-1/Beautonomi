import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getTenantLocaleTag } from "@/lib/locale";
import { formatMoney } from "@beautonomi/utils";

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(getTenantLocaleTag());
}

export default function PaymentsScreen() {
  const { bundle } = useConfigBundle();
  const tenantCur =
    bundle?.meta?.tenant_region?.default_currency?.trim() ?? getTenantDefaultCurrency();
  const saveCardInfo = useMemo(() => {
    const example = formatMoney(1, tenantCur);
    return `We'll save your card securely when you pay. To verify your card, a small temporary charge (e.g. ${example}) may be placed and reversed—this confirms your card for future use.`;
  }, [tenantCur]);

  const [methods, setMethods] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [methodsRes, giftRes] = await Promise.all([
        api.get<any>("/api/me/payment-methods"),
        api.get<any>("/api/me/gift-cards").catch((err) => { console.warn("Failed to load gift cards:", err); return { data: null }; }),
      ]);
      if (methodsRes.error) {
        setError(methodsRes.error.message || "Failed to load");
      } else {
        const m = methodsRes.data;
        setMethods(Array.isArray(m) ? m : m?.data ?? []);
      }
      const g = giftRes.data;
      setGiftCards(Array.isArray(g) ? g : g?.gift_cards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeMethod = async (id: string) => {
    Alert.alert("Remove card", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await api.fetch<any>("/api/me/payment-methods", { method: "DELETE", body: { id } });
          if (res.error) {
            Alert.alert("Error", res.error.message ?? "Could not remove card. Please try again.");
          } else {
            load();
          }
        },
      },
    ]);
  };

  const addCard = async () => {
    setAddingCard(true);
    try {
      const res = await api.post<{ data?: { authorization_url: string } }>("/api/me/payment-methods/initialize-verification", {
        set_as_default: methods.length === 0,
      });
      const data = res?.data as { authorization_url?: string } | undefined;
      const url = data?.authorization_url;
      if (!url) {
        Alert.alert("Error", res?.error?.message ?? "Could not start card verification.");
        return;
      }
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add card.");
    } finally {
      setAddingCard(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Payment methods</Text>
            <TouchableOpacity
              onPress={() => Alert.alert("Save card", saveCardInfo)}
              accessibilityLabel="Info about saving card"
              style={{ padding: 4 }}
            >
              <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{saveCardInfo}</Text>
          </View>
          {methods.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>No payment methods saved</Text>
          ) : (
            methods.map((m) => (
              <View key={m.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{m.last4 ? `•••• ${m.last4}` : m.type || "Card"}</Text>
                <TouchableOpacity onPress={() => removeMethod(m.id)}>
                  <Text style={{ color: "#B91C1C", fontSize: 14 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
          <TouchableOpacity
            onPress={addCard}
            disabled={addingCard}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], marginTop: 8 }}
          >
            {addingCard ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontWeight: "500", color: Colors.primary }}>Add card</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Gift cards</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/gift-card-purchase")}>
              <Text style={{ color: Colors.primary, fontWeight: "500" }}>Buy gift card</Text>
            </TouchableOpacity>
          </View>
          {giftCards.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>No gift cards yet</Text>
          ) : (
            giftCards.map((g) => (
              <View key={g.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                  {g.code ? `•••• ${String(g.code).slice(-6)}` : "Gift card"}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                  Balance: {g.currency} {(g.balance ?? 0).toFixed(2)}
                  {g.expires_at ? ` · Expires ${formatDateSafe(g.expires_at)}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScreenFrame>
  );
}
