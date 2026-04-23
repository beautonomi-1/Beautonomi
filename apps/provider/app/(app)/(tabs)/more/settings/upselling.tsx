import { useState, useEffect } from "react";
import { View, Text, Switch, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

/** Matches GET/PATCH `/api/provider/settings/sales/upselling` (`successResponse` body). */
interface UpsellingSettings {
  enabled: boolean;
  isUsingPlatformDefault: boolean;
}

export default function UpsellingScreen() {
  const router = useRouter();
  const { data: settings, loading, refresh } = useApi<UpsellingSettings>("/api/provider/settings/sales/upselling");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
    }
  }, [settings]);

  async function handleSave() {
    const { error } = await saveSettings("/api/provider/settings/sales/upselling", {
      upselling_enabled: enabled,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  if (loading && !settings) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Upselling" showBack />
        <LoadingState message="Loading settings..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Upselling" showBack subtitle="Increase average order value" />

      {settings?.isUsingPlatformDefault && (
        <View style={twStyle("mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3")}>
          <Ionicons name="information-circle" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text style={twStyle("ml-2 flex-1 text-xs leading-4 text-amber-700")}>
            Using platform defaults for upselling. Save to set your own preference on this device.
          </Text>
        </View>
      )}

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row items-center flex-1")}>
            <View style={twStyle("h-11 w-11 items-center justify-center rounded-xl bg-amber-50")}>
              <Ionicons name="trending-up" size={22} color="#f59e0b" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-[15px] font-semibold text-gray-900")}>Enable Upselling</Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                Suggest additional services and products to clients (subject to platform rules)
              </Text>
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>
      </View>

      {enabled && (
        <>
          <SectionHeader title="Manage" />
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white")}>
            <TouchableOpacity
              style={twStyle("flex-row items-center justify-between px-4 py-3.5 border-b border-gray-50")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/service-addons" as never)}
            >
              <View style={twStyle("flex-row items-center flex-1")}>
                <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}>
                  <Ionicons name="list-outline" size={16} color="#6b7280" />
                </View>
                <View style={twStyle("ml-3")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>Manage Addons</Text>
                  <Text style={twStyle("text-[11px] text-gray-500")}>Create and edit service addons</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity
              style={twStyle("flex-row items-center justify-between px-4 py-3.5")}
              onPress={() => router.push("/(app)/(tabs)/more/products" as never)}
            >
              <View style={twStyle("flex-row items-center flex-1")}>
                <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}>
                  <Ionicons name="cube-outline" size={16} color="#6b7280" />
                </View>
                <View style={twStyle("ml-3")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>Manage Products</Text>
                  <Text style={twStyle("text-[11px] text-gray-500")}>Products available for upselling</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
          </View>

          <View style={twStyle("mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-indigo-900")}>Upselling Tips</Text>
            <View>
              <View style={[twStyle("flex-row items-start"), { marginBottom: 8 }]}>
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text style={twStyle("ml-2 flex-1 text-xs text-indigo-700")}>
                  Keep addon prices reasonable — 20-30% of the main service price works best
                </Text>
              </View>
              <View style={[twStyle("flex-row items-start"), { marginBottom: 8 }]}>
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text style={twStyle("ml-2 flex-1 text-xs text-indigo-700")}>
                  Mark your best addons as &quot;Recommended&quot; to increase conversion
                </Text>
              </View>
              <View style={twStyle("flex-row items-start")}>
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text style={twStyle("ml-2 flex-1 text-xs text-indigo-700")}>
                  Suggest products that complement the service (e.g., hair oil after a cut)
                </Text>
              </View>
            </View>
          </View>
        </>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
