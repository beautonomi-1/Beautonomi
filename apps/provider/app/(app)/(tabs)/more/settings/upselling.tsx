import { useState, useEffect } from "react";
import { View, Text, Switch, Alert , TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface UpsellingSettings {
  enabled: boolean;
  isUsingPlatformDefault: boolean;
  show_addons_during_booking: boolean;
  show_products_after_service: boolean;
  show_related_services: boolean;
  max_suggestions: number;
}

export default function UpsellingScreen() {
  const router = useRouter();
  const { data: settings, loading, refresh } = useApi<UpsellingSettings>("/api/provider/settings/sales/upselling");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(false);
  const [showAddons, setShowAddons] = useState(true);
  const [showProducts, setShowProducts] = useState(true);
  const [showRelated, setShowRelated] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setShowAddons(settings.show_addons_during_booking ?? true);
      setShowProducts(settings.show_products_after_service ?? true);
      setShowRelated(settings.show_related_services ?? true);
    }
  }, [settings]);

  function toggle(setter: (v: boolean) => void) {
    return (v: boolean) => { setter(v); setDirty(true); };
  }

  async function handleSave() {
    const { error } = await saveSettings("/api/provider/settings/sales/upselling", {
      upselling_enabled: enabled,
      show_addons_during_booking: showAddons,
      show_products_after_service: showProducts,
      show_related_services: showRelated,
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
        <View className="mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3">
          <Ionicons name="information-circle" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text className="ml-2 flex-1 text-xs leading-4 text-amber-700">
            Using platform defaults. Save to customize upselling preferences.
          </Text>
        </View>
      )}

      {/* Main toggle */}
      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
              <Ionicons name="trending-up" size={22} color="#f59e0b" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-semibold text-gray-900">Enable Upselling</Text>
              <Text className="text-xs text-gray-500">
                Suggest additional services and products to clients
              </Text>
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => { setEnabled(v); setDirty(true); }}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>
      </View>

      {enabled && (
        <>
          {/* Upselling options */}
          <SectionHeader title="What to Show" />
          <View className="mb-4 rounded-2xl border border-gray-100 bg-white">
            <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
              <View className="flex-row items-center flex-1">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                  <Ionicons name="add-circle-outline" size={16} color="#6366f1" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-medium text-gray-900">Service Addons</Text>
                  <Text className="text-[11px] text-gray-500">
                    Show addons during booking checkout
                  </Text>
                </View>
              </View>
              <Switch
                value={showAddons}
                onValueChange={toggle(setShowAddons)}
                trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                thumbColor="#fff"
              />
            </View>

            <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
              <View className="flex-row items-center flex-1">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                  <Ionicons name="cube-outline" size={16} color="#10b981" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-medium text-gray-900">Product Suggestions</Text>
                  <Text className="text-[11px] text-gray-500">
                    Recommend products after service
                  </Text>
                </View>
              </View>
              <Switch
                value={showProducts}
                onValueChange={toggle(setShowProducts)}
                trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                thumbColor="#fff"
              />
            </View>

            <View className="flex-row items-center justify-between px-4 py-3.5">
              <View className="flex-row items-center flex-1">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                  <Ionicons name="git-compare-outline" size={16} color="#3b82f6" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-medium text-gray-900">Related Services</Text>
                  <Text className="text-[11px] text-gray-500">
                    Show complementary services
                  </Text>
                </View>
              </View>
              <Switch
                value={showRelated}
                onValueChange={toggle(setShowRelated)}
                trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Quick links */}
          <SectionHeader title="Manage" />
          <View className="mb-4 rounded-2xl border border-gray-100 bg-white">
            <TouchableOpacity
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-50"
              onPress={() => router.push("/(app)/(tabs)/more/settings/service-addons" as any)}
            >
              <View className="flex-row items-center flex-1">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
                  <Ionicons name="list-outline" size={16} color="#6b7280" />
                </View>
                <View className="ml-3">
                  <Text className="text-sm font-medium text-gray-900">Manage Addons</Text>
                  <Text className="text-[11px] text-gray-500">Create and edit service addons</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center justify-between px-4 py-3.5"
              onPress={() => router.push("/(app)/(tabs)/more/products" as any)}
            >
              <View className="flex-row items-center flex-1">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
                  <Ionicons name="cube-outline" size={16} color="#6b7280" />
                </View>
                <View className="ml-3">
                  <Text className="text-sm font-medium text-gray-900">Manage Products</Text>
                  <Text className="text-[11px] text-gray-500">Products available for upselling</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
          </View>

          {/* Tips */}
          <View className="mb-4 rounded-xl bg-gradient-to-r border border-indigo-100 bg-indigo-50 p-4">
            <Text className="mb-2 text-sm font-semibold text-indigo-900">Upselling Tips</Text>
            <View className="gap-2">
              <View className="flex-row items-start">
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-xs text-indigo-700">
                  Keep addon prices reasonable — 20-30% of the main service price works best
                </Text>
              </View>
              <View className="flex-row items-start">
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-xs text-indigo-700">
                  Mark your best addons as &quot;Recommended&quot; to increase conversion
                </Text>
              </View>
              <View className="flex-row items-start">
                <Ionicons name="checkmark-circle" size={14} color="#6366f1" style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-xs text-indigo-700">
                  Suggest products that complement the service (e.g., hair oil after a cut)
                </Text>
              </View>
            </View>
          </View>
        </>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View className="h-8" />
    </ScreenContainer>
  );
}
