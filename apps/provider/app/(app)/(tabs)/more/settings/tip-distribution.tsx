import { useState, useEffect } from "react";
import { View, Text, Alert, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

/**
 * §Provider-audit 2026-04: previously this screen collected a
 * `distribution_method` (equal / by_service / custom) and `pool_percentage`,
 * but neither field is stored server-side: the PATCH handler only reads
 * `keep_all_tips` / `distribute_to_staff`, and `provider_tip_settings` has
 * no columns for the other two. Providers would toggle a radio, see a happy
 * toast, and the choice would silently evaporate. The UI has been trimmed to
 * match reality; a banner explains what's currently supported.
 */

interface TipDistribution {
  keep_all_tips: boolean;
  distribute_to_staff: boolean;
  tip_stats?: {
    total_tips_this_month: number;
    total_distributed: number;
    avg_tip_amount: number;
  };
}

export default function TipDistributionScreen() {
  const { data: settings, loading, refresh } = useApi<TipDistribution>("/api/provider/tips/distribution");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [keepAll, setKeepAll] = useState(true);
  const [distribute, setDistribute] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setKeepAll(settings.keep_all_tips);
      setDistribute(settings.distribute_to_staff);
    }
  }, [settings]);

  async function handleSave() {
    const { error } = await saveSettings("/api/provider/tips/distribution", {
      keep_all_tips: keepAll,
      distribute_to_staff: distribute,
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
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard
              title="This Month"
              value={formatCurrency(stats.total_tips_this_month)}
              icon="cash-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard
              title="Distributed"
              value={formatCurrency(stats.total_distributed)}
              icon="people-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Avg Tip"
              value={formatCurrency(stats.avg_tip_amount)}
              icon="trending-up-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Keep All Tips</Text>
            <Text style={twStyle("text-xs text-gray-500")}>Business keeps 100% of tips</Text>
          </View>
          <Switch
            value={keepAll}
            onValueChange={(v) => update(() => { setKeepAll(v); if (v) setDistribute(false); })}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={keepAll ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <View style={twStyle(`flex-row items-center justify-between ${keepAll ? "opacity-40" : ""}`)}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Distribute to Staff</Text>
            <Text style={twStyle("text-xs text-gray-500")}>Tips go to staff members</Text>
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

      {!keepAll && distribute && (
        <View style={twStyle("mb-4 rounded-xl bg-indigo-50 p-3")}>
          <View style={twStyle("flex-row items-start")}>
            <Ionicons name="information-circle" size={16} color="#6366f1" style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={twStyle("flex-1 text-xs text-indigo-700")}>
              Tips will be allocated to the staff member who performed the service. Advanced
              split methods (equal split, custom pool) can be configured per-team in the
              provider portal.
            </Text>
          </View>
        </View>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
