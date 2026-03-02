import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

const SAVE_CARD_INFO =
  "We&apos;ll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.";

export default function PaymentsScreen() {
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
        api.get<any>("/api/me/gift-cards").catch(() => ({ data: null })),
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
          if (!res.error) load();
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
      <View className="gap-6">
        <View>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-semibold text-gray-900">Payment methods</Text>
            <TouchableOpacity
              onPress={() => Alert.alert("Save card", SAVE_CARD_INFO)}
              accessibilityLabel="Info about saving card"
              className="p-1"
            >
              <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View className="bg-gray-50 rounded-xl p-3 mb-3">
            <Text className="text-xs text-gray-600">
              We&apos;ll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.
            </Text>
          </View>
          {methods.length === 0 ? (
            <Text className="text-gray-500 py-4">No payment methods saved</Text>
          ) : (
            methods.map((m) => (
              <View key={m.id} className="bg-gray-50 rounded-xl p-4 mb-2 flex-row justify-between items-center">
                <Text className="font-medium text-gray-900">{m.last4 ? `•••• ${m.last4}` : m.type || "Card"}</Text>
                <TouchableOpacity onPress={() => removeMethod(m.id)}>
                  <Text className="text-red-600 text-sm">Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
          <TouchableOpacity
            onPress={addCard}
            disabled={addingCard}
            className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 border-dashed mt-2"
          >
            {addingCard ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                <Text className="font-medium text-primary">Add card</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="font-semibold text-gray-900">Gift cards</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/gift-card-purchase")}>
              <Text className="text-primary font-medium">Buy gift card</Text>
            </TouchableOpacity>
          </View>
          {giftCards.length === 0 ? (
            <Text className="text-gray-500 py-4">No gift cards yet</Text>
          ) : (
            giftCards.map((g) => (
              <View key={g.id} className="bg-gray-50 rounded-xl p-4 mb-2">
                <Text className="font-medium text-gray-900">
                  {g.code ? `•••• ${String(g.code).slice(-6)}` : "Gift card"}
                </Text>
                <Text className="text-sm text-gray-500">
                  Balance: {g.currency} {(g.balance ?? 0).toFixed(2)}
                  {g.expires_at ? ` · Expires ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScreenFrame>
  );
}
