import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Alert, Switch } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface TipSettings { tips_enabled: boolean }
interface TaxSettings { tax_rate_percent: number; is_vat_registered: boolean; vat_number: string | null }
interface ReceiptSettings { receipt_prefix: string; receipt_next_number: number; receipt_header: string | null; receipt_footer: string | null }

export default function SalesSettingsScreen() {
  const { t } = useTranslation();
  const ss = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.salesSettings.${key}`, opts) as string,
    [t],
  );
  const { data: tips, loading: loadingTips, refresh: refreshTips } = useApi<TipSettings>("/api/provider/settings/sales/tips");
  const { data: taxes, loading: loadingTaxes, refresh: refreshTaxes } = useApi<TaxSettings>("/api/provider/settings/sales/taxes");
  const { data: receipt, loading: loadingReceipt, refresh: refreshReceipt } = useApi<ReceiptSettings>("/api/provider/settings/sales/receipt");
  const { execute: saveTips, loading: savingTips } = useApiMutation("patch");
  const { execute: saveTaxes, loading: savingTaxes } = useApiMutation("patch");
  const { execute: saveReceipt, loading: savingReceipt } = useApiMutation("patch");

  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [receiptPrefix, setReceiptPrefix] = useState("REC");
  const [receiptNextNumber, setReceiptNextNumber] = useState("1");
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  useEffect(() => {
    if (tips) setTipsEnabled(tips.tips_enabled);
  }, [tips]);

  useEffect(() => {
    if (taxes) {
      setVatRegistered(taxes.is_vat_registered);
      setVatNumber(taxes.vat_number ?? "");
      setTaxRate(String(taxes.tax_rate_percent));
    }
  }, [taxes]);

  useEffect(() => {
    if (receipt) {
      setReceiptPrefix(receipt.receipt_prefix);
      setReceiptNextNumber(String(receipt.receipt_next_number));
      setReceiptHeader(receipt.receipt_header ?? "");
      setReceiptFooter(receipt.receipt_footer ?? "");
    }
  }, [receipt]);

  async function handleSaveTips() {
    const { error } = await saveTips("/api/provider/settings/sales/tips", { tips_enabled: tipsEnabled });
    if (error) Alert.alert(ss("errorTitle"), error);
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refreshTips(); }
  }

  async function handleSaveTaxes() {
    const payload: Record<string, unknown> = { is_vat_registered: vatRegistered };
    if (vatRegistered) payload.vat_number = vatNumber.trim();
    else payload.tax_rate_percent = Number(taxRate) || 0;
    const { error } = await saveTaxes("/api/provider/settings/sales/taxes", payload);
    if (error) Alert.alert(ss("errorTitle"), error);
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refreshTaxes(); }
  }

  async function handleSaveReceipt() {
    const { error } = await saveReceipt("/api/provider/settings/sales/receipt", {
      receipt_prefix: receiptPrefix.trim(),
      receipt_next_number: Number(receiptNextNumber) || 1,
      receipt_header: receiptHeader.trim() || null,
      receipt_footer: receiptFooter.trim() || null,
    });
    if (error) Alert.alert(ss("errorTitle"), error);
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refreshReceipt(); }
  }

  const loading = loadingTips || loadingTaxes || loadingReceipt;
  if (loading && !tips && !taxes && !receipt) return <LoadingState />;

  return (
    <ScreenContainer>
      <ScreenHeader title={ss("title")} showBack subtitle={ss("subtitle")} />

      {/* Tips */}
      <SectionHeader title={ss("tips")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>{ss("enableTips")}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{ss("enableTipsDesc")}</Text>
          </View>
          <Switch value={tipsEnabled} onValueChange={setTipsEnabled} trackColor={{ false: "#d1d5db", true: "#818cf8" }} thumbColor={tipsEnabled ? "#6366f1" : "#f4f4f5"} />
        </View>
        <View style={twStyle("mt-3")}>
          <ActionButton label={ss("save")} onPress={handleSaveTips} loading={savingTips} variant="outline" fullWidth />
        </View>
      </View>

      {/* Taxes */}
      <SectionHeader title={ss("taxSettings")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between mb-3")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>{ss("vatRegistered")}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{ss("vatRegisteredDesc")}</Text>
          </View>
          <Switch value={vatRegistered} onValueChange={setVatRegistered} trackColor={{ false: "#d1d5db", true: "#818cf8" }} thumbColor={vatRegistered ? "#6366f1" : "#f4f4f5"} />
        </View>
        {vatRegistered ? (
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("vatNumber")}</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={vatNumber}
              onChangeText={setVatNumber}
              placeholder={ss("vatNumberPlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
          </View>
        ) : (
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("taxRate")}</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={taxRate}
              onChangeText={setTaxRate}
              placeholder={ss("taxRatePlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
        )}
        <ActionButton label={ss("saveTaxSettings")} onPress={handleSaveTaxes} loading={savingTaxes} variant="outline" fullWidth />
      </View>

      {/* Receipt */}
      <SectionHeader title={ss("receiptTemplate")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("prefix")}</Text>
            <TextInput style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")} value={receiptPrefix} onChangeText={setReceiptPrefix} placeholder={ss("prefixPlaceholder")} placeholderTextColor="#9ca3af" />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("nextNumber")}</Text>
            <TextInput style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")} value={receiptNextNumber} onChangeText={setReceiptNextNumber} placeholder={ss("nextNumberPlaceholder")} placeholderTextColor="#9ca3af" keyboardType="number-pad" />
          </View>
        </View>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("receiptHeader")}</Text>
        <TextInput style={twStyle("mb-3 min-h-[60px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")} value={receiptHeader} onChangeText={setReceiptHeader} placeholder={ss("receiptHeaderPlaceholder")} placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("receiptFooter")}</Text>
        <TextInput style={twStyle("mb-3 min-h-[60px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")} value={receiptFooter} onChangeText={setReceiptFooter} placeholder={ss("receiptFooterPlaceholder")} placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
        <ActionButton label={ss("saveReceiptSettings")} onPress={handleSaveReceipt} loading={savingReceipt} variant="outline" fullWidth />
      </View>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
