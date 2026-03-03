import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

interface PayoutAccount {
  id: string;
  account_name: string;
  bank_name: string | null;
  account_number_last4: string;
  currency: string;
  active: boolean;
  is_primary: boolean;
  created_at: string;
}

interface BankOption {
  id: number | string;
  code: string;
  name: string;
  country: string;
  currency: string;
}

const SUPPORTED_COUNTRIES = [
  { code: "ZA", label: "South Africa", currency: "ZAR" },
  { code: "NG", label: "Nigeria", currency: "NGN" },
  { code: "GH", label: "Ghana", currency: "GHS" },
  { code: "KE", label: "Kenya", currency: "KES" },
];

export default function PayoutAccountsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [form, setForm] = useState({
    country: "ZA",
    currency: "ZAR",
    account_number: "",
    bank_code: "",
    bank_name: "",
    account_name: "",
  });

  const { data: accounts, loading, refresh } = useApi<PayoutAccount[]>(
    "/api/provider/payout-accounts"
  );
  const { data: banksData, loading: banksLoading, refresh: refreshBanks } = useApi<{
    banks: BankOption[];
    country: string;
    currency: string;
  }>(`/api/provider/payout-accounts/banks?country=${form.country}`);
  const banks = banksData?.banks ?? [];
  const { execute: addAccount, loading: adding } = useApiPost<any, any>(
    "/api/provider/payout-accounts"
  );
  const { execute: verifyAccount, loading: verifying } = useApiPost<
    { account_number: string; bank_code: string },
    { account_name: string; account_number: string }
  >("/api/provider/payout-accounts/verify");
  const { execute: updateAccount } = useApiMutation("patch");
  const { execute: deleteAccount } = useApiMutation("delete");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const activeCount = useMemo(
    () => accounts?.filter((a) => a.active).length ?? 0,
    [accounts]
  );
  const primaryAccount = useMemo(
    () => accounts?.find((a) => a.is_primary),
    [accounts]
  );

  async function handleVerify() {
    const accountNumber = form.account_number.trim();
    const bankCode = form.bank_code.trim();
    if (accountNumber.length < 8 || accountNumber.length > 15) {
      Alert.alert("Invalid", "Account number must be 8–15 digits");
      return;
    }
    if (!bankCode) {
      Alert.alert("Invalid", "Please select a bank");
      return;
    }
    setVerifyError(null);
    setVerifiedName(null);
    const { data, error } = await verifyAccount({
      account_number: accountNumber,
      bank_code: bankCode,
    });
    if (error) {
      setVerifyError(error);
      return;
    }
    if (data?.account_name) {
      setVerifiedName(data.account_name);
      setForm((p) => ({ ...p, account_name: data.account_name }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function resetVerifyState() {
    setVerifiedName(null);
    setVerifyError(null);
  }

  async function handleAdd() {
    if (
      !form.account_number.trim() ||
      !form.bank_code.trim() ||
      !form.account_name.trim()
    ) {
      Alert.alert("Required", "Please fill in all fields. You can verify the account first to auto-fill the name.");
      return;
    }
    const payload = {
      type: "nuban" as const,
      account_number: form.account_number.trim(),
      bank_code: form.bank_code.trim(),
      account_name: form.account_name.trim(),
      currency: form.currency,
      country: form.country,
      ...(verifiedName ? { verified_account_name: verifiedName } : {}),
    };
    const { error } = await addAccount(payload);
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdd(false);
    setForm({
      country: "ZA",
      currency: "ZAR",
      account_number: "",
      bank_code: "",
      bank_name: "",
      account_name: "",
    });
    resetVerifyState();
    refresh();
  }

  async function handleSetPrimary(account: PayoutAccount) {
    if (account.is_primary) return;
    const { error } = await updateAccount(
      `/api/provider/payout-accounts/${account.id}`,
      { is_primary: true }
    );
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  async function handleToggleActive(account: PayoutAccount) {
    const { error } = await updateAccount(
      `/api/provider/payout-accounts/${account.id}`,
      { active: !account.active }
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(account: PayoutAccount) {
    if (account.is_primary) {
      Alert.alert(
        "Cannot Delete",
        "Set another account as primary before deleting this one"
      );
      return;
    }
    Alert.alert(
      "Remove Account",
      `Remove account ending in ${account.account_number_last4}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteAccount(
              `/api/provider/payout-accounts/${account.id}`
            );
            if (error) Alert.alert("Error", error);
            else refresh();
          },
        },
      ]
    );
  }

  function selectCountry(countryCode: string) {
    const c = SUPPORTED_COUNTRIES.find((x) => x.code === countryCode);
    setForm((p) => ({
      ...p,
      country: countryCode,
      currency: c?.currency ?? "ZAR",
      bank_code: "",
      bank_name: "",
    }));
    resetVerifyState();
    refreshBanks();
  }

  function selectBank(bank: BankOption) {
    setForm((p) => ({
      ...p,
      bank_code: bank.code,
      bank_name: bank.name,
    }));
    setShowBankPicker(false);
    resetVerifyState();
  }

  if (loading && !accounts) return <LoadingState />;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Payout Accounts"
        showBack
        subtitle="Bank accounts for payouts"
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
onPress={() => {
              setForm((p) => ({
                ...p,
                account_number: "",
                bank_code: "",
                bank_name: "",
                account_name: "",
              }));
              resetVerifyState();
              setShowAdd(true);
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {accounts && accounts.length > 0 && (
        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Total"
              value={String(accounts.length)}
              icon="wallet-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Active"
              value={String(activeCount)}
              icon="checkmark-circle-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
        </View>
      )}

      {/* Primary account banner */}
      {primaryAccount && (
        <View className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="star" size={14} color="#6366f1" />
            <Text className="text-xs font-medium text-indigo-700">
              Primary: {primaryAccount.account_name} (
              {primaryAccount.bank_name ?? "Bank"} ····{" "}
              {primaryAccount.account_number_last4})
            </Text>
          </View>
        </View>
      )}

      {!accounts || accounts.length === 0 ? (
        <EmptyState
          icon="wallet-outline"
          title="No payout accounts"
          description="Add a bank account to receive payouts"
        />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a: PayoutAccount) => a.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: account }: { item: PayoutAccount }) => (
            <TouchableOpacity
              className={`rounded-xl border bg-white p-4 ${
                account.is_primary
                  ? "border-indigo-200"
                  : "border-gray-100"
              }`}
              onPress={() => handleSetPrimary(account)}
              onLongPress={() =>
                Alert.alert(account.account_name, undefined, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Set as Primary",
                    onPress: () => handleSetPrimary(account),
                  },
                  {
                    text: account.active ? "Deactivate" : "Activate",
                    onPress: () => handleToggleActive(account),
                  },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => handleDelete(account),
                  },
                ])
              }
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                <View
                  className={`h-10 w-10 items-center justify-center rounded-lg ${
                    account.is_primary ? "bg-indigo-100" : "bg-gray-100"
                  }`}
                >
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color={account.is_primary ? "#6366f1" : "#6b7280"}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-gray-900">
                      {account.account_name}
                    </Text>
                    {account.is_primary && (
                      <View className="rounded-full bg-indigo-100 px-2 py-0.5">
                        <Text className="text-[9px] font-bold text-indigo-700">
                          PRIMARY
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500">
                    {account.bank_name ?? "Bank"} ····{" "}
                    {account.account_number_last4}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View
                    className={`rounded-full px-2 py-0.5 ${
                      account.active ? "bg-green-50" : "bg-gray-100"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-medium ${
                        account.active ? "text-green-700" : "text-gray-500"
                      }`}
                    >
                      {account.active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(account)}>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color="#ef4444"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add account form */}
      <BottomSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Bank Account"
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Country *
          </Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {SUPPORTED_COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                className={`rounded-xl border px-4 py-2.5 ${
                  form.country === c.code
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 bg-white"
                }`}
                onPress={() => selectCountry(c.code)}
              >
                <Text
                  className={`text-sm font-medium ${
                    form.country === c.code ? "text-indigo-700" : "text-gray-600"
                  }`}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">
            Bank * (Paystack)
          </Text>
          <TouchableOpacity
            className="mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
            onPress={() => setShowBankPicker(true)}
            disabled={banksLoading}
          >
            <Text
              className={`text-base ${
                form.bank_name ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {banksLoading
                ? "Loading banks…"
                : form.bank_name || "Select your bank"}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>

          {showBankPicker && (
            <View className="mb-3 max-h-48 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {banks.length === 0 && !banksLoading ? (
                <View className="p-4">
                  <Text className="text-sm text-gray-500">
                    No banks returned for this country. Check your Paystack setup.
                  </Text>
                </View>
              ) : (
                banks.map((bank) => (
                  <TouchableOpacity
                    key={`${bank.code}-${bank.id}`}
                    className={`flex-row items-center justify-between border-b border-gray-50 px-4 py-3 ${
                      form.bank_code === bank.code ? "bg-indigo-50" : ""
                    }`}
                    onPress={() => selectBank(bank)}
                  >
                    <Text className="text-sm text-gray-900">{bank.name}</Text>
                    {form.bank_code === bank.code && (
                      <Ionicons name="checkmark" size={16} color="#6366f1" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <Text className="mb-1 text-sm font-medium text-gray-700">
            Account Number * (8–15 digits)
          </Text>
          <TextInput
            className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.account_number}
            onChangeText={(t) => {
              setForm((p) => ({ ...p, account_number: t.replace(/\D/g, "").slice(0, 15) }));
              resetVerifyState();
            }}
            placeholder="Digits only"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />
          <TouchableOpacity
            className="mb-3 flex-row items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-2.5"
            onPress={handleVerify}
            disabled={
              form.account_number.trim().length < 8 ||
              !form.bank_code ||
              verifying
            }
          >
            {verifying ? (
              <Text className="text-sm font-medium text-indigo-700">Verifying…</Text>
            ) : (
              <>
                <Ionicons name="shield-checkmark-outline" size={18} color="#6366f1" />
                <Text className="ml-2 text-sm font-medium text-indigo-700">
                  Verify with Paystack (auto-fill name)
                </Text>
              </>
            )}
          </TouchableOpacity>
          {verifiedName && (
            <View className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3">
              <Text className="text-xs font-medium text-green-800">Verified account name</Text>
              <Text className="text-sm font-medium text-green-900">{verifiedName}</Text>
            </View>
          )}
          {verifyError && (
            <View className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <Text className="text-sm text-red-700">{verifyError}</Text>
            </View>
          )}

          <Text className="mb-1 text-sm font-medium text-gray-700">
            Account Holder Name *
          </Text>
          <TextInput
            className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.account_name}
            onChangeText={(t) => setForm((p) => ({ ...p, account_name: t }))}
            placeholder="Full name as on account"
            placeholderTextColor="#9ca3af"
          />

          <ActionButton
            label="Add Account"
            onPress={handleAdd}
            loading={adding}
            fullWidth
          />

          <Text className="mt-3 text-center text-xs text-gray-400">
            Uses Paystack: verify then create transfer recipient. Stored securely.
          </Text>
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
