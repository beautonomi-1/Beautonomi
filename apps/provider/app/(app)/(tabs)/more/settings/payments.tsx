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
import { usePayCloudSettings } from "@/hooks/usePayCloud";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { LAST_RESORT_CURRENCY } from "@beautonomi/utils";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

/* ─── types ─── */
interface PaymentSettings {
  yoco_connected: boolean;
  yoco_merchant_id: string | null;
  accept_cash: boolean;
  accept_card: boolean;
  accept_online: boolean;
  accept_paystack_terminal: boolean;
  vat_registered: boolean;
  vat_number: string | null;
  tax_rate: number;
  tax_inclusive: boolean;
  currency: string;
  receipt_auto_send: boolean;
  tips_enabled: boolean;
  tip_presets: number[];
  tips_distribution: string;
  no_show_fee_enabled: boolean;
  no_show_fee_amount: number;
}

/** GET /api/provider/settings/payments — camelCase fields from web API. */
type PaymentsSettingsApi = Partial<PaymentSettings> & {
  taxRatePercent?: number;
  isVatRegistered?: boolean;
  vatNumber?: string | null;
  yoco?: { isEnabled?: boolean };
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptOnline?: boolean;
  acceptPaystackTerminal?: boolean;
  receiptAutoSend?: boolean;
  tipsEnabled?: boolean;
  tipPresets?: number[];
  tipsDistribution?: string;
  taxInclusive?: boolean;
  noShowFeeEnabled?: boolean;
  noShowFeeAmount?: number;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  yoco_connected: false,
  yoco_merchant_id: null,
  accept_cash: true,
  accept_card: true,
  accept_online: false,
  accept_paystack_terminal: false,
  vat_registered: false,
  vat_number: null,
  tax_rate: 15,
  tax_inclusive: true,
  currency: getTenantDefaultCurrency(),
  receipt_auto_send: true,
  tips_enabled: true,
  tip_presets: [10, 15, 20, 25],
  tips_distribution: "staff",
  no_show_fee_enabled: false,
  no_show_fee_amount: 0,
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
      <View style={twStyle("me-3 flex-1")}>
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
  const { t } = useTranslation();
  const ps = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.paymentsSettings.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const { settings: paycloudSettings } = usePayCloudSettings();
  const {
    data: settings,
    loading,
    error: fetchError,
    refresh,
  } = useApi<PaymentsSettingsApi>("/api/provider/settings/payments");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");
  const { integration } = useYocoIntegration();
  const yocoCredentialMode = integration?.credential_mode ?? "none";
  const yocoConnected =
    integration?.is_enabled === true &&
    (integration?.oauth_connected === true ||
      yocoCredentialMode === "oauth" ||
      yocoCredentialMode === "checkout" ||
      integration?.api_key_set === true);
  const yocoStatusLabel =
    integration?.oauth_connected === true || yocoCredentialMode === "oauth"
      ? ps("yocoStatusWebPos")
      : yocoCredentialMode === "checkout"
        ? ps("yocoStatusCheckout")
        : ps("yocoStatusNotConnected");
  const yocoSubtitle =
    integration?.oauth_connected === true || yocoCredentialMode === "oauth"
      ? ps("yocoSubWebPos")
      : yocoCredentialMode === "checkout"
        ? ps("yocoSubCheckout")
        : ps("yocoSubDefault");
  const paycloudStatusLabel = paycloudSettings?.ready
    ? ps("paycloudStatusReady")
    : paycloudSettings?.accept_paycloud
      ? ps("paycloudStatusSetup")
      : ps("paycloudStatusOff");
  const paycloudConnected = paycloudSettings?.ready === true;
  const paycloudSubtitle = paycloudSettings?.ready
    ? ps("paycloudSubReady")
    : paycloudSettings?.accept_paycloud
      ? ps("paycloudSubSetup")
      : ps("paycloudSubDefault");

  const [form, setForm] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      const raw = settings;
      setForm({
        ...DEFAULT_SETTINGS,
        currency: raw.currency ?? DEFAULT_SETTINGS.currency,
        tax_rate: raw.taxRatePercent ?? DEFAULT_SETTINGS.tax_rate,
        vat_registered: raw.isVatRegistered ?? DEFAULT_SETTINGS.vat_registered,
        vat_number: raw.vatNumber ?? DEFAULT_SETTINGS.vat_number,
        yoco_connected: yocoEnabled && (raw.yoco?.isEnabled ?? DEFAULT_SETTINGS.yoco_connected),
        accept_cash: raw.acceptCash ?? DEFAULT_SETTINGS.accept_cash,
        accept_card: yocoEnabled && (raw.acceptCard ?? DEFAULT_SETTINGS.accept_card),
        accept_online: raw.acceptOnline ?? DEFAULT_SETTINGS.accept_online,
        accept_paystack_terminal:
          paystackTerminalEnabled &&
          (raw.acceptPaystackTerminal ?? DEFAULT_SETTINGS.accept_paystack_terminal),
        receipt_auto_send: raw.receiptAutoSend ?? DEFAULT_SETTINGS.receipt_auto_send,
        tips_enabled: raw.tipsEnabled ?? DEFAULT_SETTINGS.tips_enabled,
        tip_presets: raw.tipPresets ?? DEFAULT_SETTINGS.tip_presets,
        tips_distribution: raw.tipsDistribution ?? DEFAULT_SETTINGS.tips_distribution,
        tax_inclusive: raw.taxInclusive ?? DEFAULT_SETTINGS.tax_inclusive,
        no_show_fee_enabled: raw.noShowFeeEnabled ?? DEFAULT_SETTINGS.no_show_fee_enabled,
        no_show_fee_amount: raw.noShowFeeAmount ?? DEFAULT_SETTINGS.no_show_fee_amount,
      });
    }
  }, [settings, yocoEnabled, paystackTerminalEnabled]);

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
      acceptCard: yocoEnabled ? form.accept_card : false,
      acceptOnline: form.accept_online,
      acceptPaystackTerminal: paystackTerminalEnabled ? form.accept_paystack_terminal : false,
      taxInclusive: form.tax_inclusive,
      tipsEnabled: form.tips_enabled,
      tipPresets: form.tip_presets,
      receiptAutoSend: form.receipt_auto_send,
      tipsDistribution: form.tips_distribution,
      noShowFeeEnabled: form.no_show_fee_enabled,
      noShowFeeAmount: form.no_show_fee_amount,
    };
    const { error } = await saveSettings(
      "/api/provider/settings/payments",
      payload,
    );
    if (error) {
      Alert.alert(ps("errorTitle"), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ps("savedTitle"), ps("savedBody"));
      setHasChanges(false);
      refresh();
    }
  }, [saveSettings, form, refresh, paystackTerminalEnabled, yocoEnabled]);

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ps("title")} showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (fetchError && !settings) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ps("title")} showBack />
        <ErrorState message={fetchError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={ps("title")} showBack />

      {(yocoEnabled || paycloudEnabled || paystackTerminalEnabled) && (
        <>
          {/* ─── Payment Gateway ─── */}
          <SectionHeader title={ps("sectionGateway")} />
          {yocoEnabled && (
            <TouchableOpacity
              style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/yoco-devices")}
              accessibilityLabel={ps("yocoA11y")}
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-row items-center")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-blue-50")}>
                    <Ionicons name="card-outline" size={20} color="#3b82f6" />
                  </View>
                  <View style={twStyle("ms-3")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")}>{ps("yoco")}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{yocoSubtitle}</Text>
                  </View>
                </View>
                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={twStyle(`me-2 flex-row items-center rounded-full px-3 py-1 ${yocoConnected ? "bg-green-50" : "bg-gray-100"}`)}
                  >
                    <View
                      style={twStyle(`me-1.5 h-2 w-2 rounded-full ${yocoConnected ? "bg-green-500" : "bg-gray-400"}`)}
                    />
                    <Text
                      style={twStyle(`text-xs font-medium ${yocoConnected ? "text-green-700" : "text-gray-500"}`)}
                    >
                      {yocoStatusLabel}
                    </Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              </View>
              {!yocoConnected && (
                <Text style={twStyle("mt-2 text-xs text-indigo-600")}>
                  {ps("yocoConnectHint")}
                </Text>
              )}
            </TouchableOpacity>
          )}
          {paycloudEnabled && (
            <TouchableOpacity
              style={twStyle(`${yocoEnabled ? "mt-3 " : ""}rounded-2xl border border-gray-100 bg-white p-4`)}
              onPress={() => router.push("/(app)/(tabs)/more/card-machines")}
              accessibilityLabel={ps("cardMachinesA11y")}
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-row items-center")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-violet-50")}>
                    <Ionicons name="hardware-chip-outline" size={20} color="#7c3aed" />
                  </View>
                  <View style={twStyle("ms-3")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")}>{ps("cardMachines")}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{paycloudSubtitle}</Text>
                  </View>
                </View>
                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={twStyle(`me-2 flex-row items-center rounded-full px-3 py-1 ${paycloudConnected ? "bg-green-50" : "bg-gray-100"}`)}
                  >
                    <View
                      style={twStyle(`me-1.5 h-2 w-2 rounded-full ${paycloudConnected ? "bg-green-500" : "bg-gray-400"}`)}
                    />
                    <Text
                      style={twStyle(`text-xs font-medium ${paycloudConnected ? "text-green-700" : "text-gray-500"}`)}
                    >
                      {paycloudStatusLabel}
                    </Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              </View>
            </TouchableOpacity>
          )}
          {paystackTerminalEnabled && (
            <TouchableOpacity
              style={twStyle("mt-3 rounded-2xl border border-emerald-100 bg-white p-4")}
              onPress={() => router.push("/(app)/(tabs)/more/paystack-terminal")}
              accessibilityLabel={ps("paystackA11y")}
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-row items-center flex-1")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-emerald-50")}>
                    <Ionicons name="qr-code-outline" size={20} color="#16a34a" />
                  </View>
                  <View style={twStyle("ms-3 flex-1")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")}>{ps("paystackTerminal")}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{ps("paystackSub")}</Text>
                  </View>
                </View>
                <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" />
              </View>
              <Text style={twStyle("mt-2 text-xs text-emerald-700")}>
                {ps("paystackHint")}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ─── Accepted Payment Methods ─── */}
      <SectionHeader title={ps("sectionAcceptedMethods")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label={ps("acceptCash")}
          description={ps("acceptCashDesc")}
          value={form.accept_cash}
          onValueChange={(v) => update("accept_cash", v)}
          accessibilityLabel={ps("acceptCashA11y")}
        />
        {yocoEnabled && (
          <ToggleRow
            label={ps("acceptCard")}
            description={ps("acceptCardDesc")}
            value={form.accept_card}
            onValueChange={(v) => update("accept_card", v)}
            accessibilityLabel={ps("acceptCardA11y")}
          />
        )}
        {paystackTerminalEnabled && (
          <ToggleRow
            label={ps("acceptPaystack")}
            description={ps("acceptPaystackDesc")}
            value={form.accept_paystack_terminal}
            onValueChange={(v) => update("accept_paystack_terminal", v)}
            accessibilityLabel={ps("acceptPaystackA11y")}
          />
        )}
        <View style={twStyle("px-4 py-3.5")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("me-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                {ps("acceptOnline")}
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                {ps("acceptOnlineDesc")}
              </Text>
            </View>
            <Switch
              value={form.accept_online}
              onValueChange={(v) => update("accept_online", v)}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.accept_online ? "#6366f1" : "#f3f4f6"}
              accessibilityLabel={ps("acceptOnlineA11y")}
            />
          </View>
        </View>
      </View>

      {/* ─── Tax Settings ─── */}
      <SectionHeader title={ps("sectionTax")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label={ps("vatRegistered")}
          description={ps("vatRegisteredDesc")}
          value={form.vat_registered}
          onValueChange={(v) => update("vat_registered", v)}
          accessibilityLabel={ps("vatRegisteredA11y")}
        />

        {form.vat_registered && (
          <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
              {ps("vatNumber")}
            </Text>
            <TextInput
              style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
              value={form.vat_number ?? ""}
              onChangeText={(v) => update("vat_number", v)}
              placeholder={ps("vatNumberPlaceholder")}
              placeholderTextColor="#9ca3af"
              accessibilityLabel={ps("vatNumberA11y")}
            />
          </View>
        )}

        <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
            {ps("taxRate")}
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
              placeholder={ps("taxRatePlaceholder")}
              placeholderTextColor="#9ca3af"
              accessibilityLabel={ps("taxRateA11y")}
            />
            <Text style={twStyle("ms-2 text-lg font-semibold text-gray-400")}>%</Text>
          </View>
        </View>

        <View style={twStyle("px-4 py-3.5")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("me-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                {ps("pricesIncludeTax")}
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                {ps("pricesIncludeTaxDesc")}
              </Text>
            </View>
            <Switch
              value={form.tax_inclusive}
              onValueChange={(v) => update("tax_inclusive", v)}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.tax_inclusive ? "#6366f1" : "#f3f4f6"}
              accessibilityLabel={ps("pricesIncludeTaxA11y")}
            />
          </View>
        </View>
      </View>

      {/* ─── No-show fees ─── */}
      <SectionHeader title={ps("sectionNoShow")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label={ps("noShowFee")}
          description={ps("noShowFeeDesc")}
          value={form.no_show_fee_enabled}
          onValueChange={(v) => update("no_show_fee_enabled", v)}
          accessibilityLabel={ps("noShowFeeA11y")}
        />
        {form.no_show_fee_enabled && (
          <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
              {ps("noShowFeeAmount")}
            </Text>
            <TextInput
              style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
              value={String(form.no_show_fee_amount)}
              onChangeText={(v) => {
                const num = parseFloat(v.replace(/[^0-9.]/g, "")) || 0;
                update("no_show_fee_amount", Math.max(0, num));
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              accessibilityLabel={ps("noShowFeeAmountA11y")}
            />
          </View>
        )}
        <TouchableOpacity
          style={twStyle("flex-row items-center px-4 py-3.5")}
          onPress={() => router.push("/(app)/(tabs)/more/settings/cancellation-policies" as never)}
          accessibilityLabel={ps("openCancellationPoliciesA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="document-text-outline" size={18} color="#6366f1" />
          <Text style={twStyle("ms-2 flex-1 text-sm text-indigo-700")}>
            {ps("manageLateCancel")}
          </Text>
          <DirectionalIcon name="chevron-forward" size={16} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {/* ─── Tips ─── */}
      <SectionHeader title={ps("sectionTips")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        <ToggleRow
          label={ps("enableTips")}
          description={ps("enableTipsDesc")}
          value={form.tips_enabled}
          onValueChange={(v) => update("tips_enabled", v)}
          accessibilityLabel={ps("enableTipsA11y")}
        />

        {form.tips_enabled && (
          <>
            <View style={twStyle("border-b border-gray-50 px-4 py-3.5")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
                {ps("tipPresets")}
              </Text>
              <View style={twStyle("flex-row flex-wrap")}>
                {PRESET_OPTIONS.map((p) => {
                  const selected = form.tip_presets.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[twStyle(`rounded-full px-4 py-2 ${selected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginEnd: 8, marginBottom: 8 }]}
                      onPress={() => togglePreset(p)}
                      accessibilityLabel={ps("tipPresetA11y", { percent: p, state: selected ? ps("tipPresetSelected") : ps("tipPresetNotSelected") })}
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
                  {ps("autoSendReceipts")}
                </Text>
                <Switch
                  value={form.receipt_auto_send}
                  onValueChange={(v) => update("receipt_auto_send", v)}
                  trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                  thumbColor={form.receipt_auto_send ? "#6366f1" : "#f3f4f6"}
                  accessibilityLabel={ps("autoSendReceiptsA11y")}
                />
              </View>
            </View>
          </>
        )}
      </View>

      {/* ─── Currency ─── */}
      <SectionHeader title={ps("sectionCurrency")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3.5")}>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ps("currencyLabel")}</Text>
        <View style={twStyle("flex-row flex-wrap")}>
          {([LAST_RESORT_CURRENCY, "USD", "GBP", "EUR", "BWP", "NAD", "MZN"] as const).map((c) => {
            const symbols: Record<string, string> = {
              [LAST_RESORT_CURRENCY]: "R",
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
                style={[twStyle(`rounded-full px-4 py-2 ${selected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginEnd: 8, marginBottom: 8 }]}
                onPress={() => update("currency", c)}
                accessibilityLabel={ps("selectCurrencyA11y", { code: c })}
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
          label={saving ? ps("saving") : ps("savePaymentSettings")}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          {ps("unsavedChanges")}
        </Text>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
