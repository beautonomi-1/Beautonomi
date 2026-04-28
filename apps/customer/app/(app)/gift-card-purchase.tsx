import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";

const AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function GiftCardPurchaseScreen() {
  useScreenTracking("Gift Card Purchase");
  const router = useRouter();
  const { provider_id, provider_name } = useLocalSearchParams<{ provider_id?: string; provider_name?: string }>();
  const tenantCurrency = getTenantDefaultCurrency();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const [amount, setAmount] = useState<number>(250);
  const [customAmount, setCustomAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const finalAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
  const total = finalAmount * quantity;

  const purchase = async () => {
    if (finalAmount <= 0 || loading) return;
    setLoading(true);
    try {
      const beforeCards = await api.get<{ gift_cards?: { id?: string }[] }>("/api/me/gift-cards").catch(() => null);
      const existingGiftCardIds = new Set(
        (beforeCards?.data?.gift_cards ?? [])
          .map((card) => card.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      const body: Record<string, unknown> = { amount: finalAmount, quantity, currency: tenantCurrency };
      if (provider_id) body.provider_id = provider_id;
      if (Platform.OS !== "web") {
        body.callback_url = ExpoLinking.createURL("account-settings/payments");
      }
      const res = await api.post<{ order_id: string; payment_url: string; reference: string }>(
        "/api/public/gift-cards/purchase",
        body
      );
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to start purchase"));
        return;
      }
      const data = res.data as any;
      const paymentUrl = data?.payment_url ?? data?.data?.payment_url;
      if (!paymentUrl) {
        Alert.alert("Error", "Payment link not available");
        return;
      }
      let reference =
        typeof data?.reference === "string"
          ? data.reference
          : typeof data?.data?.reference === "string"
            ? data.data.reference
            : null;
      if (Platform.OS !== "web") {
        const returnUrl = ExpoLinking.createURL("account-settings/payments");
        const browserResult = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
        if (browserResult.type === "success" && browserResult.url) {
          try {
            const parsed = ExpoLinking.parse(browserResult.url);
            const query = parsed.queryParams ?? {};
            const returnedRef = query.reference ?? query.trxref;
            reference = Array.isArray(returnedRef)
              ? returnedRef[0] ?? reference
              : typeof returnedRef === "string" && returnedRef.trim()
                ? returnedRef.trim()
                : reference;
          } catch {
            // Keep the server-issued reference fallback.
          }
        }
      } else {
        await WebBrowser.openBrowserAsync(paymentUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      }
      if (reference) {
        await api.get(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`).catch(() => {});
      }
      let issued = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const cards = await api.get<{ gift_cards?: { id?: string }[] }>("/api/me/gift-cards").catch(() => null);
        const list = cards?.data?.gift_cards;
        if (
          Array.isArray(list) &&
          list.some((card) => typeof card.id === "string" && !existingGiftCardIds.has(card.id))
        ) {
          issued = true;
          break;
        }
        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      Alert.alert(
        issued ? "Gift card ready" : "Payment pending",
        issued
          ? "Your gift card has been issued and is available under Payments."
          : "If you completed your payment, the gift card will appear in your account shortly.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to purchase"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: provider_name ? `Gift Card — ${provider_name}` : "Buy Gift Card", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.white }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
          {provider_name ? (
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              For: <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>{provider_name}</Text>
            </Text>
          ) : null}
          <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Select amount ({tenantCurrency})</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
            {AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => { setAmount(a); setCustomAmount(""); }}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, backgroundColor: amount === a && !customAmount ? Colors.primary : Colors.white, borderColor: amount === a && !customAmount ? Colors.primary : Colors.gray[200], marginRight: 8, marginBottom: 8 }}
              >
                <Text style={{ fontWeight: "500", color: amount === a && !customAmount ? Colors.white : Colors.gray[700] }}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Or enter custom amount</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 16 }}
            placeholder="e.g. 350"
            placeholderTextColor={Colors.gray[400]}
            value={customAmount}
            onChangeText={(t) => { setCustomAmount(t); if (t) setAmount(0); }}
            keyboardType="number-pad"
          />
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Quantity</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
            <TouchableOpacity onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginRight: 16 }}>
              <Text style={{ fontSize: 20, color: Colors.gray[700] }}>−</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginRight: 16 }}>{quantity}</Text>
            <TouchableOpacity onPress={() => setQuantity((q) => Math.min(10, q + 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, color: Colors.gray[700] }}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <Text style={{ color: Colors.gray[600] }}>Total</Text>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{formatMoney(total, tenantCurrency)}</Text>
          </View>
          <TouchableOpacity onPress={purchase} disabled={finalAmount <= 0 || loading} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: finalAmount <= 0 || loading ? 0.5 : 1 }}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>Pay with card</Text>}
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 16 }}>You will be redirected to complete payment securely.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
