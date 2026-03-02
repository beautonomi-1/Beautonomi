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
import { useScreenTracking } from "@/hooks/useScreenTracking";

const AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function GiftCardPurchaseScreen() {
  useScreenTracking("Gift Card Purchase");
  const router = useRouter();
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
        Alert.alert("Error", res.error.message || "Failed to start purchase");
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
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to purchase");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Buy Gift Card", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <Text className="text-lg font-semibold text-gray-900 mb-2">Select amount (ZAR)</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => {
                  setAmount(a);
                  setCustomAmount("");
                }}
                className={`px-4 py-3 rounded-xl border ${
                  amount === a && !customAmount
                    ? "bg-primary border-primary"
                    : "bg-white border-gray-200"
                }`}
              >
                <Text
                  className={`font-medium ${amount === a && !customAmount ? "text-white" : "text-gray-700"}`}
                >
                  {a}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-sm text-gray-600 mb-2">Or enter custom amount</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-base mb-4"
            placeholder="e.g. 350"
            value={customAmount}
            onChangeText={(t) => {
              setCustomAmount(t);
              if (t) setAmount(0);
            }}
            keyboardType="number-pad"
          />

          <Text className="text-sm text-gray-600 mb-2">Quantity</Text>
          <View className="flex-row items-center gap-4 mb-6">
            <TouchableOpacity
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center"
            >
              <Text className="text-xl text-gray-700">−</Text>
            </TouchableOpacity>
            <Text className="text-xl font-semibold text-gray-900">{quantity}</Text>
            <TouchableOpacity
              onPress={() => setQuantity((q) => q + 1)}
              className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center"
            >
              <Text className="text-xl text-gray-700">+</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-gray-50 rounded-xl p-4 mb-6">
            <Text className="text-gray-600">Total</Text>
            <Text className="text-2xl font-bold text-gray-900">
              ZAR {total.toLocaleString()}
            </Text>
          </View>

          <TouchableOpacity
            onPress={purchase}
            disabled={finalAmount <= 0 || loading}
            className="bg-primary py-4 rounded-xl items-center disabled:opacity-50"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-lg">Pay with Paystack</Text>
            )}
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 text-center mt-4">
            You will be redirected to complete payment securely.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
