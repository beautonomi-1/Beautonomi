import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  requested_at?: string;
  notes?: string | null;
}

interface PayoutAccount {
  id: string;
  account_name?: string;
  bank_name?: string;
  account_number?: string;
}

/** Content-only for use in Finance hub (Payouts tab). */
export function PayoutsContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);

  const { data: payoutsList, loading, error, refresh } = useApi<Payout[]>("/api/provider/payouts");
  const { data: accountsList } = useApi<PayoutAccount[]>("/api/provider/payout-accounts");
  const { execute: postPayout, loading: requesting } = useApiMutation<Payout>("post");

  const payouts: Payout[] = Array.isArray(payoutsList) ? payoutsList : [];
  const accounts: PayoutAccount[] = Array.isArray(accountsList) ? accountsList : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleRequestPayout = useCallback(async () => {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (Number.isNaN(num) || num <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount greater than 0.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {
      amount: num,
      notes: notes.trim() || undefined,
    };
    if (bankAccountId) body.bank_account_id = bankAccountId;
    const { error: err } = await postPayout("/api/provider/payouts", body);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRequestOpen(false);
    setAmount("");
    setNotes("");
    setBankAccountId(null);
    refresh();
  }, [amount, notes, bankAccountId, postPayout, refresh]);

  if (loading && !payoutsList) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !payoutsList) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {payouts.length === 0 ? (
          <View className="items-center py-16">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Ionicons name="wallet-outline" size={32} color="#059669" />
            </View>
            <Text className="text-center font-semibold text-gray-900">No payouts yet</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Request a payout to withdraw your available balance to your bank account.
            </Text>
            <TouchableOpacity
              onPress={() => setRequestOpen(true)}
              className="mt-6 flex-row items-center justify-center rounded-xl bg-emerald-600 px-6 py-3"
            >
              <Ionicons name="cash-outline" size={20} color="#fff" />
              <Text className="ml-2 font-medium text-white">Request payout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => {
                setAmount("");
                setNotes("");
                setBankAccountId(null);
                setRequestOpen(true);
              }}
              className="mb-3 flex-row items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 py-3"
            >
              <Ionicons name="cash-outline" size={18} color="#059669" />
              <Text className="ml-2 font-medium text-emerald-700">Request payout</Text>
            </TouchableOpacity>
            {payouts.map((p) => (
            <View
              key={p.id}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <Ionicons name="cash-outline" size={20} color="#059669" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-semibold text-gray-900">
                  {p.currency} {Number(p.amount).toFixed(2)}
                </Text>
                <Text className="mt-0.5 text-sm text-gray-600">{p.status}</Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {new Date(p.requested_at ?? p.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View
                className={`rounded-full px-2.5 py-1 ${
                  p.status === "completed" ? "bg-green-100" : p.status === "pending" ? "bg-amber-100" : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    p.status === "completed" ? "text-green-800" : p.status === "pending" ? "text-amber-800" : "text-gray-700"
                  }`}
                >
                  {p.status}
                </Text>
              </View>
            </View>
          ))}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request payout"
        subtitle="Withdraw to your bank account"
      >
        <Text className="mb-2 text-sm font-medium text-gray-700">Amount (ZAR) *</Text>
        <TextInput
          className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="0.00"
          placeholderTextColor="#9ca3af"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        {accounts.length > 0 && (
          <>
            <Text className="mb-2 text-sm font-medium text-gray-700">Bank account</Text>
            <ScrollView className="mb-4 max-h-32" nestedScrollEnabled>
              {accounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setBankAccountId(bankAccountId === a.id ? null : a.id)}
                  className={`mb-2 rounded-xl border px-4 py-3 ${bankAccountId === a.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <Text className="font-medium text-gray-900">{a.account_name ?? "Bank account"}</Text>
                  {a.account_number && (
                    <Text className="text-xs text-gray-500">***{String(a.account_number).slice(-4)}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
        <Text className="mb-2 text-sm font-medium text-gray-700">Notes (optional)</Text>
        <TextInput
          className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="Reference or note"
          placeholderTextColor="#9ca3af"
          value={notes}
          onChangeText={setNotes}
        />
        <ActionButton
          label={requesting ? "Submitting…" : "Request payout"}
          onPress={handleRequestPayout}
          loading={requesting}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function PayoutsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Payouts" showBack subtitle="Withdraw earnings" />
      <PayoutsContent />
    </ScreenContainer>
  );
}
