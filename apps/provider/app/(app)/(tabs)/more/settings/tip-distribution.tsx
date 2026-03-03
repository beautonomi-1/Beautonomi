import { useState, useEffect } from "react";
import { View, Text, TextInput, Alert, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";

interface TipDistribution {
  keep_all_tips: boolean;
  distribute_to_staff: boolean;
  distribution_method: "equal" | "by_service" | "custom";
  pool_percentage: number;
  tip_stats?: {
    total_tips_this_month: number;
    total_distributed: number;
    avg_tip_amount: number;
  };
}

const DISTRIBUTION_METHODS = [
  { value: "equal", label: "Equal Split", desc: "Tips split equally among all staff" },
  { value: "by_service", label: "By Service", desc: "Tips go to staff who performed the service" },
  { value: "custom", label: "Custom Pool", desc: "Set a pool percentage, rest goes to service provider" },
];

export default function TipDistributionScreen() {
  const { data: settings, loading, refresh } = useApi<TipDistribution>("/api/provider/tips/distribution");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [keepAll, setKeepAll] = useState(true);
  const [distribute, setDistribute] = useState(false);
  const [method, setMethod] = useState<"equal" | "by_service" | "custom">("by_service");
  const [poolPct, setPoolPct] = useState("0");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setKeepAll(settings.keep_all_tips);
      setDistribute(settings.distribute_to_staff);
      setMethod(settings.distribution_method ?? "by_service");
      setPoolPct(String(settings.pool_percentage ?? 0));
    }
  }, [settings]);

  async function handleSave() {
    const pct = Number(poolPct);
    if (method === "custom" && (isNaN(pct) || pct < 0 || pct > 100)) {
      Alert.alert("Invalid", "Pool percentage must be between 0 and 100");
      return;
    }
    const { error } = await saveSettings("/api/provider/tips/distribution", {
      keep_all_tips: keepAll,
      distribute_to_staff: distribute,
      distribution_method: method,
      pool_percentage: method === "custom" ? pct : 0,
    });
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      refresh();
    }
  }

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  if (loading && !settings) return <LoadingState />;

  const stats = settings?.tip_stats;

  return (
    <ScreenContainer>
      <ScreenHeader title="Tip Distribution" showBack subtitle="How tips are shared" />

      {stats && (
        <View className="mb-4 flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="This Month"
              value={`R ${stats.total_tips_this_month.toFixed(0)}`}
              icon="cash-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Distributed"
              value={`R ${stats.total_distributed.toFixed(0)}`}
              icon="people-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Avg Tip"
              value={`R ${stats.avg_tip_amount.toFixed(0)}`}
              icon="trending-up-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Keep All Tips</Text>
            <Text className="text-xs text-gray-500">Business keeps 100% of tips</Text>
          </View>
          <Switch
            value={keepAll}
            onValueChange={(v) => update(() => { setKeepAll(v); if (v) setDistribute(false); })}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={keepAll ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <View className={`flex-row items-center justify-between ${keepAll ? "opacity-40" : ""}`}>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Distribute to Staff</Text>
            <Text className="text-xs text-gray-500">Tips go to staff members</Text>
          </View>
          <Switch
            value={distribute}
            onValueChange={(v) => update(() => setDistribute(v))}
            disabled={keepAll}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={distribute ? "#6366f1" : "#f4f4f5"}
          />
        </View>
      </View>

      {distribute && !keepAll && (
        <>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Distribution Method
          </Text>
          <View className="mb-4 gap-2">
            {DISTRIBUTION_METHODS.map((m) => (
              <TouchableOpacity
                key={m.value}
                className={`flex-row items-center rounded-xl border p-4 ${
                  method === m.value ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"
                }`}
                onPress={() => update(() => setMethod(m.value as typeof method))}
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                    method === m.value ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
                  }`}
                >
                  {method === m.value && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-medium text-gray-900">{m.label}</Text>
                  <Text className="text-xs text-gray-500">{m.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {method === "custom" && (
            <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
              <Text className="mb-1 text-sm font-medium text-gray-700">Pool Percentage (%)</Text>
              <TextInput
                className="mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={poolPct}
                onChangeText={(t) => { setPoolPct(t); setDirty(true); }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#9ca3af"
              />
              <Text className="text-xs text-gray-400">
                {poolPct && !isNaN(Number(poolPct))
                  ? `${poolPct}% goes to tip pool, ${100 - Number(poolPct)}% to service provider`
                  : "Enter a percentage between 0 and 100"}
              </Text>
            </View>
          )}
        </>
      )}

      {!keepAll && distribute && (
        <View className="mb-4 rounded-xl bg-indigo-50 p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="information-circle" size={16} color="#6366f1" />
            <Text className="flex-1 text-xs text-indigo-700">
              {method === "equal"
                ? "All tips will be split equally among on-duty staff at the time of payment."
                : method === "by_service"
                ? "Tips will go directly to the staff member who provided the service."
                : `${poolPct}% of tips go to a shared pool, the remainder goes to the service provider.`}
            </Text>
          </View>
        </View>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View className="h-8" />
    </ScreenContainer>
  );
}
