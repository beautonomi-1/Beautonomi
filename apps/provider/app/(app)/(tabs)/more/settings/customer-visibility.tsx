import { useState, useEffect, useCallback } from "react";
import { View, Text, Alert, Switch, TouchableOpacity } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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

const MODE_OPTIONS: { labelKey: string; value: string; descKey: string; icon: string }[] = [
  { labelKey: "modeEveryone", value: "all", descKey: "modeEveryoneDesc", icon: "globe-outline" },
  { labelKey: "modeBookedOnly", value: "booked_only", descKey: "modeBookedOnlyDesc", icon: "people-outline" },
  { labelKey: "modeHidden", value: "none", descKey: "modeHiddenDesc", icon: "eye-off-outline" },
];

export default function CustomerVisibilityScreen() {
  const { t } = useTranslation();
  const cv = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.customerVisibility.${key}`, opts) as string,
    [t],
  );
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
    if (error) Alert.alert(cv("errorTitle"), error);
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
  const modeLabel = (mode: string) => {
    const opt = MODE_OPTIONS.find((o) => o.value === mode);
    return opt ? cv(opt.labelKey) : mode;
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={cv("title")} showBack subtitle={cv("subtitle")} />

      {/* Preview cards */}
      <View style={twStyle("mb-4 flex-row")}>
        <View style={[twStyle("flex-1 items-center rounded-2xl border border-gray-100 bg-white p-4"), { marginEnd: 12 }]}>
          <Ionicons name={customerVis.icon as keyof typeof Ionicons.glyphMap} size={28} color={customerVis.color} />
          <Text style={twStyle("mt-2 text-xs font-semibold text-gray-900")}>{cv("clientVisibility")}</Text>
          <Text style={twStyle("text-[10px] text-gray-500")}>{modeLabel(customerMode)}</Text>
        </View>
        <View style={twStyle("flex-1 items-center rounded-2xl border border-gray-100 bg-white p-4")}>
          <Ionicons name={salonVis.icon as keyof typeof Ionicons.glyphMap} size={28} color={salonVis.color} />
          <Text style={twStyle("mt-2 text-xs font-semibold text-gray-900")}>{cv("salonVisibility")}</Text>
          <Text style={twStyle("text-[10px] text-gray-500")}>{modeLabel(salonMode)}</Text>
        </View>
      </View>

      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        {cv("accessControls")}
      </Text>
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-indigo-50")}>
              <Ionicons name="list-outline" size={18} color="#6366f1" />
            </View>
            <View style={twStyle("ms-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{cv("showClientList")}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{cv("showClientListHint")}</Text>
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
            <View style={twStyle("ms-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{cv("showSalon")}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{cv("showSalonHint")}</Text>
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
        {cv("whoCanSeeClients")}
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
              <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={18} color="#6b7280" />
            </View>
            <View style={twStyle("ms-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{cv(opt.labelKey)}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{cv(opt.descKey)}</Text>
            </View>
            {customerMode === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        {cv("whoCanSeeSalon")}
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
              <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={18} color="#6b7280" />
            </View>
            <View style={twStyle("ms-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{cv(opt.labelKey)}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{cv(opt.descKey)}</Text>
            </View>
            {salonMode === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ActionButton label={cv("saveSettings")} onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
