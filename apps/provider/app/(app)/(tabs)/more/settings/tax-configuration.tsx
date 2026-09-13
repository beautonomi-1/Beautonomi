import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface TaxSettings {
  tax_rate_percent: number;
  is_vat_registered: boolean;
  vat_number: string | null;
  isUsingPlatformDefault: boolean;
}

export default function TaxConfigurationScreen() {
  const { t } = useTranslation();
  const tx = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.taxConfiguration." + key, opts) as string,
    [t],
  );
  const { data: settings, loading, refresh } = useApi<TaxSettings>("/api/provider/settings/sales/taxes");
  const { execute: saveTaxes, loading: saving } = useApiMutation("patch");

  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setIsVatRegistered(settings.is_vat_registered);
      setVatNumber(settings.vat_number ?? "");
      setTaxRate(String(settings.tax_rate_percent));
    }
  }, [settings]);

  function handleVatToggle(value: boolean) {
    setIsVatRegistered(value);
    setTaxRate(value ? "15" : "0");
    setDirty(true);
  }

  function validateVatNumber(num: string): boolean {
    if (!num) return true;
    return /^4\d{9}$/.test(num.replace(/\s/g, ""));
  }

  async function handleSave() {
    if (isVatRegistered && vatNumber && !validateVatNumber(vatNumber)) {
      Alert.alert(tx("invalidVatTitle"), tx("invalidVatBody"));
      return;
    }

    const rate = parseFloat(taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      Alert.alert(tx("invalidRateTitle"), tx("invalidRateBody"));
      return;
    }

    const { error } = await saveTaxes("/api/provider/settings/sales/taxes", {
      is_vat_registered: isVatRegistered,
      vat_number: isVatRegistered && vatNumber ? vatNumber.replace(/\s/g, "") : null,
      tax_rate_percent: rate,
    });

    if (error) {
      Alert.alert(tx("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  if (loading && !settings) {
    return (
      <ScreenContainer>
        <ScreenHeader title={tx("title")} showBack />
        <LoadingState message={tx("loading")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={tx("title")} showBack subtitle={tx("subtitle")} />

      {settings?.isUsingPlatformDefault && (
        <View style={twStyle("mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3")}>
          <Ionicons name="information-circle" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text style={twStyle("ms-2 flex-1 text-xs leading-4 text-amber-700")}>
            {tx("platformDefault")}
          </Text>
        </View>
      )}

      <SectionHeader title={tx("vatRegistration")} />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>{tx("vatRegistered")}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{tx("vatRegisteredHint")}</Text>
          </View>
          <Switch
            value={isVatRegistered}
            onValueChange={handleVatToggle}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={isVatRegistered ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {isVatRegistered && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{tx("vatNumber")}</Text>
            <TextInput
              style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={vatNumber}
              onChangeText={(text) => { setVatNumber(text); setDirty(true); }}
              placeholder={tx("vatPlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={10}
            />
            <Text style={twStyle("mb-1 text-xs text-gray-400")}>
              {tx("vatFormatHint")}
            </Text>
            {vatNumber && !validateVatNumber(vatNumber) && (
              <View style={twStyle("mt-1 flex-row items-center")}>
                <Ionicons name="alert-circle" size={12} color="#ef4444" />
                <Text style={twStyle("ms-1 text-xs text-red-600")}>{tx("invalidVatFormat")}</Text>
              </View>
            )}
          </>
        )}
      </View>

      <SectionHeader title={tx("taxRate")} />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{tx("taxRatePercent")}</Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={taxRate}
          onChangeText={(text) => { setTaxRate(text); setDirty(true); }}
          placeholder="15"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
        />
        <Text style={twStyle("text-xs text-gray-400")}>
          {isVatRegistered ? tx("taxRateHintVat") : tx("taxRateHintNoVat")}
        </Text>

        {isVatRegistered && (
          <View style={twStyle("mt-3 rounded-xl bg-indigo-50 p-3")}>
            <Text style={twStyle("text-xs text-indigo-700")}>
              {tx("vatPassThrough")}
            </Text>
          </View>
        )}
      </View>

      <ActionButton label={tx("saveCta")} onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
