import { useState, useEffect } from "react";
import { View, Text, TextInput, Alert, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface DistanceSettings {
  max_service_distance_km: number;
  is_distance_filter_enabled: boolean;
  at_home_distance_km?: number | null;
  in_salon_distance_km?: number | null;
  show_distance_to_clients?: boolean;
}

const PRESET_DISTANCES = [5, 10, 15, 25, 50, 100];

export default function DistanceSettingsScreen() {
  const { data: settings, loading, refresh } = useApi<DistanceSettings>("/api/provider/distance-settings");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(false);
  const [maxDistance, setMaxDistance] = useState("10");
  const [atHomeDistance, setAtHomeDistance] = useState("");
  const [showToClients, setShowToClients] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.is_distance_filter_enabled);
      setMaxDistance(String(settings.max_service_distance_km));
      setAtHomeDistance(settings.at_home_distance_km != null ? String(settings.at_home_distance_km) : "");
      setShowToClients(settings.show_distance_to_clients ?? true);
    }
  }, [settings]);

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  async function handleSave() {
    const dist = parseFloat(maxDistance);
    if (isNaN(dist) || dist < 1 || dist > 200) {
      Alert.alert("Invalid", "Distance must be between 1 and 200 km");
      return;
    }
    const payload: Record<string, unknown> = {
      is_distance_filter_enabled: enabled,
      max_service_distance_km: dist,
      show_distance_to_clients: showToClients,
    };
    if (atHomeDistance) {
      const ahDist = parseFloat(atHomeDistance);
      if (!isNaN(ahDist) && ahDist > 0) payload.at_home_distance_km = ahDist;
    }
    const { error } = await saveSettings("/api/provider/distance-settings", payload);
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      refresh();
    }
  }

  if (loading && !settings) return <LoadingState />;

  const dist = parseFloat(maxDistance) || 0;

  return (
    <ScreenContainer>
      <ScreenHeader title="Distance Settings" showBack subtitle="Service area radius" />

      {/* Visual radius indicator */}
      {enabled && dist > 0 && (
        <View className="mb-4 items-center rounded-2xl border border-gray-100 bg-white p-6">
          <View className="h-24 w-24 items-center justify-center rounded-full border-4 border-indigo-200 bg-indigo-50">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
              <Ionicons name="location" size={24} color="#6366f1" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-bold text-gray-900">{dist} km</Text>
          <Text className="text-xs text-gray-500">Service area radius</Text>
          {atHomeDistance && parseFloat(atHomeDistance) > 0 && (
            <Text className="mt-1 text-xs text-indigo-500">
              At-home services: {atHomeDistance} km
            </Text>
          )}
        </View>
      )}

      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Enable Distance Filter</Text>
            <Text className="text-xs text-gray-500">Only show to clients within your area</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => update(() => setEnabled(v))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {enabled && (
          <>
            <View className="mb-3 border-t border-gray-100 pt-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Max Service Distance (km)
              </Text>
              <TextInput
                className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={maxDistance}
                onChangeText={(t) => update(() => setMaxDistance(t))}
                keyboardType="decimal-pad"
                placeholder="10"
                placeholderTextColor="#9ca3af"
              />
              <View className="flex-row flex-wrap gap-2">
                {PRESET_DISTANCES.map((d) => (
                  <TouchableOpacity
                    key={d}
                    className={`rounded-full px-3 py-1.5 ${
                      dist === d ? "bg-indigo-600" : "bg-gray-100"
                    }`}
                    onPress={() => update(() => setMaxDistance(String(d)))}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        dist === d ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {d} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="mb-3 border-t border-gray-100 pt-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                At-Home Service Distance (km)
              </Text>
              <Text className="mb-2 text-xs text-gray-400">
                Separate limit for at-home services. Leave blank to use main distance.
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={atHomeDistance}
                onChangeText={(t) => update(() => setAtHomeDistance(t))}
                keyboardType="decimal-pad"
                placeholder="Same as above"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="border-t border-gray-100 pt-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">
                    Show Distance to Clients
                  </Text>
                  <Text className="text-xs text-gray-500">
                    Clients see how far you are from them
                  </Text>
                </View>
                <Switch
                  value={showToClients}
                  onValueChange={(v) => update(() => setShowToClients(v))}
                  trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                  thumbColor={showToClients ? "#6366f1" : "#f4f4f5"}
                />
              </View>
            </View>
          </>
        )}
      </View>

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View className="h-8" />
    </ScreenContainer>
  );
}
