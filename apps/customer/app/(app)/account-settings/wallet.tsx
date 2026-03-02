import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";

const PRESET_AMOUNTS = [100, 200, 500, 1000];

export default function WalletScreen() {
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/wallet");
      if (res.error) setError(res.error.message || "Failed to load");
      else {
        const d = res.data;
        setWallet(d?.wallet ?? d);
        setTxs(d?.transactions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? "ZAR";

  const startTopup = async () => {
    const amount = Number(topupAmount?.replace(/,/g, "."));
    if (!amount || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount to top up.");
      return;
    }
    setToppingUp(true);
    try {
      const res = await api.post<{ payment_url?: string; topup_id?: string }>("/api/me/wallet/topup", { amount });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to start top-up");
        return;
      }
      const paymentUrl = res.data?.payment_url;
      if (!paymentUrl) {
        Alert.alert("Error", "No payment link received");
        return;
      }
      setTopupAmount("");
      await WebBrowser.openBrowserAsync(paymentUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View className="gap-6">
        <View className="bg-pink-50 rounded-2xl p-6 items-center">
          <Text className="text-sm text-gray-600">Wallet balance</Text>
          <Text className="text-3xl font-bold text-gray-900 mt-1">{currency} {Number(balance).toFixed(2)}</Text>
        </View>

        <View>
          <Text className="font-semibold text-gray-900 mb-2">Top up</Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {PRESET_AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => setTopupAmount(String(a))}
                className="bg-white border border-gray-200 rounded-xl px-4 py-2"
              >
                <Text className="text-gray-900 font-medium">{currency} {a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={topupAmount}
            onChangeText={setTopupAmount}
            placeholder={`Amount (${currency})`}
            keyboardType="decimal-pad"
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 mb-2"
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity
            onPress={startTopup}
            disabled={toppingUp || !topupAmount.trim()}
            className="bg-[#FF0077] rounded-xl py-3 items-center"
          >
            {toppingUp ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Top up with Paystack</Text>
            )}
          </TouchableOpacity>
        </View>

        <View>
          <Text className="font-semibold text-gray-900 mb-2">Recent transactions</Text>
          {txs.length === 0 ? (
            <Text className="text-gray-500 py-4">No transactions yet</Text>
          ) : (
            txs.slice(0, 10).map((t) => (
              <View key={t.id} className="bg-gray-50 rounded-xl p-4 mb-2 flex-row justify-between">
                <Text className="text-gray-900">{t.description || t.type || "Transaction"}</Text>
                <Text className={Number(t.amount) >= 0 ? "text-green-600" : "text-red-600"}>
                  {Number(t.amount) >= 0 ? "+" : ""}{currency} {Math.abs(Number(t.amount)).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScreenFrame>
  );
}
