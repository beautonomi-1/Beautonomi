import { useState, useEffect } from "react";
import { View, Text, Alert, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface VisibilitySettings {
  show_customer_list_to_salon: boolean;
  show_salon_list_to_customer: boolean;
  customer_visibility_mode: "all" | "booked_only" | "none";
  salon_visibility_mode: "all" | "booked_only" | "none";
}

const MODE_OPTIONS: { label: string; value: string; description: string; icon: string }[] = [
  { label: "Everyone", value: "all", description: "Visible to all users", icon: "globe-outline" },
  { label: "Booked Only", value: "booked_only", description: "Only clients who have booked", icon: "people-outline" },
  { label: "Hidden", value: "none", description: "Not visible to anyone", icon: "eye-off-outline" },
];

export default function CustomerVisibilityScreen() {
  const { data: settings, loading, refresh } = useApi<VisibilitySettings>("/api/provider/customer-visibility");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [showToSalon, setShowToSalon] = useState(false);
  const [showToCustomer, setShowToCustomer] = useState(false);
  const [customerMode, setCustomerMode] = useState("none");
  const [salonMode, setSalonMode] = useState("none");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setShowToSalon(settings.show_customer_list_to_salon);
      setShowToCustomer(settings.show_salon_list_to_customer);
      setCustomerMode(settings.customer_visibility_mode);
      setSalonMode(settings.salon_visibility_mode);
    }
  }, [settings]);

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  async function handleSave() {
    const { error } = await saveSettings("/api/provider/customer-visibility", {
      show_customer_list_to_salon: showToSalon,
      show_salon_list_to_customer: showToCustomer,
      customer_visibility_mode: customerMode,
      salon_visibility_mode: salonMode,
    });
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      refresh();
    }
  }

  if (loading && !settings) return <LoadingState />;

  function visibilityIcon(mode: string): { color: string; icon: string } {
    switch (mode) {
      case "all":
        return { color: "#22c55e", icon: "globe-outline" };
      case "booked_only":
        return { color: "#f59e0b", icon: "people-outline" };
      default:
        return { color: "#ef4444", icon: "eye-off-outline" };
    }
  }

  const customerVis = visibilityIcon(customerMode);
  const salonVis = visibilityIcon(salonMode);

  return (
    <ScreenContainer>
      <ScreenHeader title="Customer Visibility" showBack subtitle="Control what's visible" />

      {/* Preview cards */}
      <View style={twStyle("mb-4 flex-row")}>
        <View style={[twStyle("flex-1 items-center rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12 }]}>
          <Ionicons name={customerVis.icon as any} size={28} color={customerVis.color} />
          <Text style={twStyle("mt-2 text-xs font-semibold text-gray-900")}>Client Visibility</Text>
          <Text style={twStyle("text-[10px] capitalize text-gray-500")}>{customerMode.replace("_", " ")}</Text>
        </View>
        <View style={twStyle("flex-1 items-center rounded-2xl border border-gray-100 bg-white p-4")}>
          <Ionicons name={salonVis.icon as any} size={28} color={salonVis.color} />
          <Text style={twStyle("mt-2 text-xs font-semibold text-gray-900")}>Salon Visibility</Text>
          <Text style={twStyle("text-[10px] capitalize text-gray-500")}>{salonMode.replace("_", " ")}</Text>
        </View>
      </View>

      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        Access Controls
      </Text>
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-indigo-50")}>
              <Ionicons name="list-outline" size={18} color="#6366f1" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Show Client List to Staff</Text>
              <Text style={twStyle("text-xs text-gray-500")}>Staff can see the full client list</Text>
            </View>
          </View>
          <Switch
            value={showToSalon}
            onValueChange={(v) => update(() => setShowToSalon(v))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={showToSalon ? "#6366f1" : "#f4f4f5"}
          />
        </View>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-green-50")}>
              <Ionicons name="storefront-outline" size={18} color="#22c55e" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Show Salon on Client App</Text>
              <Text style={twStyle("text-xs text-gray-500")}>Appear in client searches</Text>
            </View>
          </View>
          <Switch
            value={showToCustomer}
            onValueChange={(v) => update(() => setShowToCustomer(v))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={showToCustomer ? "#6366f1" : "#f4f4f5"}
          />
        </View>
      </View>

      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        Who Can See Your Clients
      </Text>
      <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
        {MODE_OPTIONS.map((opt, idx) => (
          <TouchableOpacity
            key={opt.value}
            style={twStyle(`flex-row items-center px-4 py-3.5 ${
              idx < MODE_OPTIONS.length - 1 ? "border-b border-gray-50" : ""
            } ${customerMode === opt.value ? "bg-indigo-50/50" : ""}`)}
            onPress={() => update(() => setCustomerMode(opt.value))}
          >
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-100")}>
              <Ionicons name={opt.icon as any} size={18} color="#6b7280" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{opt.label}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{opt.description}</Text>
            </View>
            {customerMode === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        Who Can See Your Salon
      </Text>
      <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
        {MODE_OPTIONS.map((opt, idx) => (
          <TouchableOpacity
            key={opt.value}
            style={twStyle(`flex-row items-center px-4 py-3.5 ${
              idx < MODE_OPTIONS.length - 1 ? "border-b border-gray-50" : ""
            } ${salonMode === opt.value ? "bg-indigo-50/50" : ""}`)}
            onPress={() => update(() => setSalonMode(opt.value))}
          >
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-100")}>
              <Ionicons name={opt.icon as any} size={18} color="#6b7280" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{opt.label}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{opt.description}</Text>
            </View>
            {salonMode === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
