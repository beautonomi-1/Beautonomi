import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useYocoIntegration } from "@/hooks/useYoco";
import { twStyle } from "@/lib/twStyle";

/* ─── types ─── */
interface PaymentSettings {
  yoco_connected: boolean;
  yoco_merchant_id: string | null;
  accept_cash: boolean;
  accept_card: boolean;
  accept_online: boolean;
  vat_registered: boolean;
  vat_number: string | null;
  tax_rate: number;
  tax_inclusive: boolean;
  currency: string;
  receipt_auto_send: boolean;
  tips_enabled: boolean;
  tip_presets: number[];
  tips_distribution: string;
}

const DEFAULT_SETTINGS: PaymentSettings = {
  yoco_connected: false,
  yoco_merchant_id: null,
  accept_cash: true,
  accept_card: true,
  accept_online: false,
  vat_registered: false,
  vat_number: null,
  tax_rate: 15,
  tax_inclusive: true,
  currency: "ZAR",
  receipt_auto_send: true,
  tips_enabled: true,
  tip_presets: [10, 15, 20, 25],
  tips_distribution: "staff",
};

const PRESET_OPTIONS = [10, 15, 20, 25, 30];

/* ─── components ─── */
function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  accessibilityLabel,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
      <View style={twStyle("mr-3 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#d1d5db", true: "#818cf8" }}
        thumbColor={value ? "#6366f1" : "#f3f4f6"}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
  );
}

/* ─── screen ─── */
export default function PaymentSettingsScreen() {
  const router = useRouter();
  const {
    data: settings,
    loading,
    error: fetchError,
    refresh,
  } = useApi<PaymentSettings>("/api/provider/settings/payments");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");
  const { integration } = useYocoIntegration();
  const yocoConnected = integration?.is_enabled && integration?.api_key_set;

  const [form, setForm] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      const raw = settings as any;
      setForm({
        ...DEFAULT_SETTINGS,
        currency: raw.currency ?? DEFAULT_SETTINGS.currency,
        tax_rate: raw.taxRatePercent ?? DEFAULT_SETTINGS.tax_rate,
        vat_registered: raw.isVatRegistered ?? DEFAULT_SETTINGS.vat_registered,
        vat_number: raw.vatNumber ?? DEFAULT_SETTINGS.vat_number,
        yoco_connected: raw.yoco?.isEnabled ?? DEFAULT_SETTINGS.yoco_connected,
        accept_cash: raw.acceptCash ?? DEFAULT_SETTINGS.accept_cash,
        accept_card: raw.acceptCard ?? DEFAULT_SETTINGS.accept_card,
        accept_online: raw.acceptOnline ?? DEFAULT_SETTINGS.accept_online,
        receipt_auto_send: raw.receiptAutoSend ?? DEFAULT_SETTINGS.receipt_auto_send,
        tips_enabled: raw.tipsEnabled ?? DEFAULT_SETTINGS.tips_enabled,
        tip_presets: raw.tipPresets ?? DEFAULT_SETTINGS.tip_presets,
        tips_distribution: raw.tipsDistribution ?? DEFAULT_SETTINGS.tips_distribution,
        tax_inclusive: raw.taxInclusive ?? DEFAULT_SETTINGS.tax_inclusive,
      });
    }
  }, [settings]);

  function update<K extends keyof PaymentSettings>(
    key: K,
    value: PaymentSettings[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  function togglePreset(preset: number) {
    setForm((prev) => {
      const current = prev.tip_presets;
      const next = current.includes(preset)
        ? current.filter((p) => p !== preset)
        : [...current, preset].sort((a, b) => a - b);
      return { ...prev, tip_presets: next };
    });
    setHasChanges(true);
  }

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      currency: form.currency,
      taxRatePercent: form.tax_rate,
      isVatRegistered: form.vat_registered,
      vatNumber: form.vat_number,
      acceptCash: form.accept_cash,
      acceptCard: form.accept_card,
      acceptOnline: form.accept_online,
      taxInclusive: form.tax_inclusive,
      tipsEnabled: form.tips_enabled,
      tipPresets: form.tip_presets,
      receiptAutoSend: form.receipt_auto_send,
      tipsDistribution: form.tips_distribution,
    };
    const { error } = await saveSettings(
      "/api/provider/settings/payments",
      payload,
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Payment settings updated successfully.");
      setHasChanges(false);
      refresh();
    }
  }, [saveSettings, form, refresh]);

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Payment Settings" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (fetchError && !settings) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Payment Settings" showBack />
        <ErrorState message={fetchError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Payment Settings" showBack />

      {/* ─── Yoco Integration ─── */}
      <SectionHeader title="Payment Gateway" />
      <TouchableOpacity
        style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}
        onPress={() => router.push("/(app)/(tabs)/more/settings/yoco-devices")}
        accessibilityLabel="Yoco payment gateway — tap to manage"
        accessibilityRole="button"
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-blue-50")}>
              <Ionicons name="card-outline" size={20} color="#3b82f6" />
            </View>
            <View style={twStyle("ml-3")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>
                Yoco
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>Card & tap-to-pay</Text>
            </View>
          </View>
          <View style={twStyle("flex-row items-center")}>
            <View
              style={twStyle(`mr-2 flex-row items-center rounded-full px-3 py-1 ${yocoConnected ? "bg-green-50" : "bg-gray-100"}`)}
            >
              <View
                style={twStyle(`mr-1.5 h-2 w-2 rounded-full ${yocoConnected ? "bg-green-500" : "bg-gray-400"}`)}
              />
              <Text
                style={twStyle(`text-xs font-medium ${yocoConnected ? "text-green-700" : "text-gray-500"}`)}
              >
                {yocoConnected ? "Connected" : "Not connected"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </View>
        </View>
        {!yocoConnected && (
          <Text style={twStyle("mt-2 text-xs text-indigo-600")}>
            Tap to connect your Yoco account →
          </Text>
        )}
      </TouchableOpacity>

      {/* ─── Accepted Payment Methods ─── */}
      <SectionHeader title="Accepted Payment Methods" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label="Accept Cash"
          description="Allow cash payments at point of sale"
          value={form.accept_cash}
          onValueChange={(v) => update("accept_cash", v)}
          accessibilityLabel="Toggle accept cash payments"
        />
        <ToggleRow
          label="Accept Card (Yoco)"
          description="Accept card payments via Yoco terminal"
          value={form.accept_card}
          onValueChange={(v) => update("accept_card", v)}
          accessibilityLabel="Toggle accept card payments"
        />
        <View style={twStyle("px-4 py-3.5")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("mr-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                Accept Online Payments
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                Allow clients to pay online when booking
              </Text>
            </View>
            <Switch
              value={form.accept_online}
              onValueChange={(v) => update("accept_online", v)}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.accept_online ? "#6366f1" : "#f3f4f6"}
              accessibilityLabel="Toggle accept online payments"
            />
          </View>
        </View>
      </View>

      {/* ─── Tax Settings ─── */}
      <SectionHeader title="Tax Settings" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label="VAT Registered"
          description="Is your business VAT registered?"
          value={form.vat_registered}
          onValueChange={(v) => update("vat_registered", v)}
          accessibilityLabel="Toggle VAT registered"
        />

        {form.vat_registered && (
          <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
              VAT Number
            </Text>
            <TextInput
              style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
              value={form.vat_number ?? ""}
              onChangeText={(v) => update("vat_number", v)}
              placeholder="Enter VAT number"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="VAT number input"
            />
          </View>
        )}

        <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
            Tax Rate (%)
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={twStyle("flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
              value={form.tax_rate.toString()}
              onChangeText={(v) => {
                const num = parseFloat(v) || 0;
                update("tax_rate", Math.min(100, Math.max(0, num)));
              }}
              keyboardType="decimal-pad"
              placeholder="15"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Tax rate percentage"
            />
            <Text style={twStyle("ml-2 text-lg font-semibold text-gray-400")}>%</Text>
          </View>
        </View>

        <View style={twStyle("px-4 py-3.5")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("mr-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                Prices Include Tax
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                Service prices are tax-inclusive
              </Text>
            </View>
            <Switch
              value={form.tax_inclusive}
              onValueChange={(v) => update("tax_inclusive", v)}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.tax_inclusive ? "#6366f1" : "#f3f4f6"}
              accessibilityLabel="Toggle prices include tax"
            />
          </View>
        </View>
      </View>

      {/* ─── Tips ─── */}
      <SectionHeader title="Tip Settings" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label="Enable Tips"
          description="Allow clients to add tips"
          value={form.tips_enabled}
          onValueChange={(v) => update("tips_enabled", v)}
          accessibilityLabel="Toggle enable tips"
        />

        {form.tips_enabled && (
          <>
            <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
                Tip Presets
              </Text>
              <View style={twStyle("flex-row flex-wrap")}>
                {PRESET_OPTIONS.map((p) => {
                  const selected = form.tip_presets.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[twStyle(`rounded-full px-4 py-2 ${selected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginRight: 8, marginBottom: 8 }]}
                      onPress={() => togglePreset(p)}
                      accessibilityLabel={`${p}% tip preset ${selected ? "selected" : "not selected"}`}
                      accessibilityRole="button"
                    >
                      <Text
                        style={twStyle(`text-sm font-medium ${selected ? "text-white" : "text-gray-600"}`)}
                      >
                        {p}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={twStyle("px-4 py-3.5")}>
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm text-gray-700")}>
                  Auto-send Receipts
                </Text>
                <Switch
                  value={form.receipt_auto_send}
                  onValueChange={(v) => update("receipt_auto_send", v)}
                  trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                  thumbColor={form.receipt_auto_send ? "#6366f1" : "#f3f4f6"}
                  accessibilityLabel="Toggle auto-send receipts"
                />
              </View>
            </View>
          </>
        )}
      </View>

      {/* ─── Currency ─── */}
      <SectionHeader title="Currency" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3.5")}>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Currency</Text>
        <View style={twStyle("flex-row flex-wrap")}>
          {(["ZAR", "USD", "GBP", "EUR", "BWP", "NAD", "MZN"] as const).map((c) => {
            const symbols: Record<string, string> = {
              ZAR: "R",
              USD: "$",
              GBP: "£",
              EUR: "€",
              BWP: "P",
              NAD: "N$",
              MZN: "MT",
            };
            const selected = form.currency === c;
            return (
              <TouchableOpacity
                key={c}
                style={[twStyle(`rounded-full px-4 py-2 ${selected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginRight: 8, marginBottom: 8 }]}
                onPress={() => update("currency", c)}
                accessibilityLabel={`Select currency ${c}`}
                accessibilityRole="button"
              >
                <Text
                  style={twStyle(`text-sm font-medium ${selected ? "text-white" : "text-gray-600"}`)}
                >
                  {c} ({symbols[c]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Save ─── */}
      <View style={twStyle("mt-6")}>
        <ActionButton
          label={saving ? "Saving…" : "Save Payment Settings"}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          You have unsaved changes
        </Text>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
