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
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";

const AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function GiftCardPurchaseScreen() {
  useScreenTracking("Gift Card Purchase");
  const router = useRouter();
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
      const res = await api.post<{ order_id: string; payment_url: string; reference: string }>(
        "/api/public/gift-cards/purchase",
        {
          amount: finalAmount,
          quantity,
          currency: "ZAR",
        }
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
      const result = await WebBrowser.openBrowserAsync(paymentUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
      if (result.type === "cancel" || result.type === "dismiss") {
        // User closed – they may have completed payment on web
        router.back();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to purchase"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Buy Gift Card", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.white }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Select amount (ZAR)</Text>
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
            <TouchableOpacity onPress={() => setQuantity((q) => q + 1)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, color: Colors.gray[700] }}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <Text style={{ color: Colors.gray[600] }}>Total</Text>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>ZAR {total.toLocaleString()}</Text>
          </View>
          <TouchableOpacity onPress={purchase} disabled={finalAmount <= 0 || loading} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: finalAmount <= 0 || loading ? 0.5 : 1 }}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>Pay with Paystack</Text>}
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 16 }}>You will be redirected to complete payment securely.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
