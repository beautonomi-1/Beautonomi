import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface GroupBookingSettings {
  enableGroupBooking: boolean;
  allowOnlineGroupBooking: boolean;
  maxGroupSize: number;
  enabledLocations: string[];
  excludedServices: string[];
}

interface Location {
  id: string;
  name: string;
  address_line1?: string;
  city?: string;
}

interface Service {
  id: string;
  title: string;
  price: number;
}

export default function GroupAppointmentsSettingsScreen() {
  useResponsive();
  const {
    data: settings,
    loading,
    error,
    refresh,
  } = useApi<GroupBookingSettings>("/api/provider/settings/group-bookings");
  const { data: locations } = useApi<Location[]>("/api/provider/locations");
  const { data: services } = useApi<Service[]>("/api/provider/services");
  const { execute: updateSettings, loading: saving } = useApiMutation("patch");

  const [form, setForm] = useState<GroupBookingSettings>({
    enableGroupBooking: false,
    allowOnlineGroupBooking: false,
    maxGroupSize: 10,
    enabledLocations: [],
    excludedServices: [],
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enableGroupBooking: settings.enableGroupBooking,
        allowOnlineGroupBooking: settings.allowOnlineGroupBooking,
        maxGroupSize: settings.maxGroupSize,
        enabledLocations: settings.enabledLocations ?? [],
        excludedServices: settings.excludedServices ?? [],
      });
    }
  }, [settings]);

  async function handleSave() {
    const { error: err } = await updateSettings("/api/provider/settings/group-bookings", {
      enable_group_booking: form.enableGroupBooking,
      allow_online_group_booking: form.allowOnlineGroupBooking,
      max_group_size: form.maxGroupSize,
      enabled_locations: form.enabledLocations,
      excluded_services: form.excludedServices,
    });
    if (err) {
      Alert.alert("Error", err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  function toggleLocation(locationId: string) {
    setForm((p) => {
      const has = p.enabledLocations.includes(locationId);
      return {
        ...p,
        enabledLocations: has
          ? p.enabledLocations.filter((id) => id !== locationId)
          : [...p.enabledLocations, locationId],
      };
    });
  }

  function toggleExcludedService(serviceId: string) {
    setForm((p) => {
      const has = p.excludedServices.includes(serviceId);
      return {
        ...p,
        excludedServices: has
          ? p.excludedServices.filter((id) => id !== serviceId)
          : [...p.excludedServices, serviceId],
      };
    });
  }

  if (loading && !settings) return <LoadingState />;
  if (error && !settings) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Group Appointments" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Group Appointments" showBack subtitle="Configure group booking settings" />

      {/* Main toggles */}
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between py-2")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Enable Group Bookings</Text>
            <Text style={twStyle("text-xs text-gray-500")}>Allow multiple clients in one appointment</Text>
          </View>
          <Switch
            value={form.enableGroupBooking}
            onValueChange={(v) => setForm((p) => ({ ...p, enableGroupBooking: v }))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={form.enableGroupBooking ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {form.enableGroupBooking && (
          <>
            <View style={twStyle("my-2 border-t border-gray-100")} />

            <View style={twStyle("flex-row items-center justify-between py-2")}>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>Online Group Booking</Text>
                <Text style={twStyle("text-xs text-gray-500")}>Clients can book group sessions online</Text>
              </View>
              <Switch
                value={form.allowOnlineGroupBooking}
                onValueChange={(v) => setForm((p) => ({ ...p, allowOnlineGroupBooking: v }))}
                trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                thumbColor={form.allowOnlineGroupBooking ? "#6366f1" : "#f4f4f5"}
              />
            </View>

            <View style={twStyle("my-2 border-t border-gray-100")} />

            <View style={twStyle("py-2")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Maximum Group Size</Text>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>Max participants per group session</Text>
              <View style={twStyle("flex-row items-center")}>
                <TouchableOpacity
                  style={[twStyle("h-10 w-10 items-center justify-center rounded-lg bg-gray-100"), { marginRight: 12 }]}
                  onPress={() => setForm((p) => ({ ...p, maxGroupSize: Math.max(2, p.maxGroupSize - 1) }))}
                >
                  <Ionicons name="remove" size={20} color="#374151" />
                </TouchableOpacity>
                <TextInput
                  style={[twStyle("h-10 w-16 rounded-lg border border-gray-200 bg-gray-50 text-center text-base font-semibold text-gray-900"), { marginRight: 12 }]}
                  value={String(form.maxGroupSize)}
                  onChangeText={(t) => {
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n >= 2 && n <= 10) setForm((p) => ({ ...p, maxGroupSize: n }));
                  }}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-gray-100")}
                  onPress={() => setForm((p) => ({ ...p, maxGroupSize: Math.min(10, p.maxGroupSize + 1) }))}
                >
                  <Ionicons name="add" size={20} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Enabled Locations */}
      {form.enableGroupBooking && (locations?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Enabled Locations" />
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {(locations ?? []).map((loc, i, arr) => {
              const enabled = form.enabledLocations.includes(loc.id);
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={twStyle(`flex-row items-center justify-between px-4 py-3.5 ${
                    i < arr.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                  onPress={() => toggleLocation(loc.id)}
                >
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{loc.name}</Text>
                    {loc.city && <Text style={twStyle("text-xs text-gray-500")}>{loc.city}</Text>}
                  </View>
                  <Ionicons
                    name={enabled ? "checkbox" : "square-outline"}
                    size={22}
                    color={enabled ? "#6366f1" : "#d1d5db"}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Excluded Services */}
      {form.enableGroupBooking && (services?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Excluded Services" />
          <Text style={twStyle("mb-2 text-xs text-gray-500 px-1")}>
            Services that cannot be booked as group appointments
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {(services ?? []).map((svc, i, arr) => {
              const excluded = form.excludedServices.includes(svc.id);
              return (
                <TouchableOpacity
                  key={svc.id}
                  style={twStyle(`flex-row items-center justify-between px-4 py-3.5 ${
                    i < arr.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                  onPress={() => toggleExcludedService(svc.id)}
                >
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{svc.title}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>R{svc.price}</Text>
                  </View>
                  <Ionicons
                    name={excluded ? "checkbox" : "square-outline"}
                    size={22}
                    color={excluded ? "#ef4444" : "#d1d5db"}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={twStyle("mt-6")}>
        <ActionButton label="Save Settings" onPress={handleSave} loading={saving} fullWidth />
      </View>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
