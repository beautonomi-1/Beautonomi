import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";

interface ReceiptSettings {
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_prefix: string;
  receipt_next_number: number;
  isUsingPlatformDefault: boolean;
}

export default function ReceiptTemplateScreen() {
  const { t } = useTranslation();
  const rt = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.receiptTemplate.${key}`, opts) as string,
    [t],
  );
  const { data: settings, loading, error: loadError, refresh } = useApi<ReceiptSettings>("/api/provider/settings/sales/receipt");
  const { execute: saveReceipt, loading: saving } = useApiMutation("patch");

  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [prefix, setPrefix] = useState("REC");
  const [nextNumber, setNextNumber] = useState("1");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setHeader(settings.receipt_header ?? "");
      setFooter(settings.receipt_footer ?? "");
      setPrefix(settings.receipt_prefix || "REC");
      setNextNumber(String(settings.receipt_next_number || 1));
    }
  }, [settings]);

  function update(setter: (v: string) => void) {
    return (v: string) => { setter(v); setDirty(true); };
  }

  async function handleSave() {
    if (prefix.length > 20) {
      Alert.alert(rt("invalidTitle"), rt("prefixTooLong"));
      return;
    }
    const num = parseInt(nextNumber);
    if (isNaN(num) || num < 1) {
      Alert.alert(rt("invalidTitle"), rt("nextNumberMin"));
      return;
    }
    if (header.length > 2000) {
      Alert.alert(rt("invalidTitle"), rt("headerTooLong"));
      return;
    }
    if (footer.length > 2000) {
      Alert.alert(rt("invalidTitle"), rt("footerTooLong"));
      return;
    }

    const { error } = await saveReceipt("/api/provider/settings/sales/receipt", {
      receipt_header: header.trim() || null,
      receipt_footer: footer.trim() || null,
      receipt_prefix: prefix.trim() || "REC",
      receipt_next_number: num,
    });

    if (error) {
      Alert.alert(rt("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  const previewNumber = `${prefix}-${String(parseInt(nextNumber) || 1).padStart(5, "0")}`;

  if (loading && !settings) {
    return (
      <ScreenContainer>
        <ScreenHeader title={rt("title")} showBack />
        <LoadingState message={rt("loading")} />
      </ScreenContainer>
    );
  }

  if (loadError && !settings) {
    return (
      <ScreenContainer>
        <ScreenHeader title={rt("title")} showBack />
        <ErrorState message={rt("loadFailed")} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={rt("title")} showBack subtitle={rt("subtitle")} />

      {settings?.isUsingPlatformDefault && (
        <View style={twStyle("mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3")}>
          <Ionicons name="information-circle" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text style={twStyle("ms-2 flex-1 text-xs leading-4 text-amber-700")}>
            {rt("platformDefaultsBanner")}
          </Text>
        </View>
      )}

      {/* Receipt Preview */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-200 bg-white p-5")}>
        <View style={twStyle("items-center border-b border-dashed border-gray-200 pb-3")}>
          {header ? (
            <Text style={twStyle("text-center text-xs text-gray-600")}>{header}</Text>
          ) : (
            <Text style={twStyle("text-center text-xs italic text-gray-300")}>{rt("headerPlaceholderPreview")}</Text>
          )}
        </View>
        <View style={twStyle("items-center py-4")}>
          <Text style={twStyle("text-lg font-bold text-gray-900")}>{rt("receiptHeading")}</Text>
          <Text style={twStyle("mt-1 text-sm font-mono text-gray-600")}>{previewNumber}</Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400")}>
            {new Date().toLocaleDateString()}
          </Text>
        </View>
        <View style={twStyle("border-t border-dashed border-gray-200 pt-3")}>
          <View style={twStyle("flex-row justify-between mb-1")}>
            <Text style={twStyle("text-xs text-gray-500")}>{rt("serviceExample")}</Text>
            <Text style={twStyle("text-xs text-gray-700")}>{formatCurrency(250)}</Text>
          </View>
          <View style={twStyle("flex-row justify-between border-t border-gray-100 pt-1 mt-1")}>
            <Text style={twStyle("text-xs font-medium text-gray-700")}>{rt("total")}</Text>
            <Text style={twStyle("text-xs font-bold text-gray-900")}>{formatCurrency(250)}</Text>
          </View>
        </View>
        <View style={twStyle("mt-3 items-center border-t border-dashed border-gray-200 pt-3")}>
          {footer ? (
            <Text style={twStyle("text-center text-xs text-gray-600")}>{footer}</Text>
          ) : (
            <Text style={twStyle("text-center text-xs italic text-gray-300")}>{rt("footerPlaceholderPreview")}</Text>
          )}
        </View>
      </View>

      {/* Header & Footer */}
      <SectionHeader title={rt("headerFooterSection")} />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rt("headerText")}</Text>
        <TextInput
          style={twStyle("mb-1 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={header}
          onChangeText={update(setHeader)}
          placeholder={rt("headerPlaceholder")}
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text style={twStyle("mb-4 text-xs text-gray-400")}>{rt("charCount", { count: header.length })}</Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rt("footerText")}</Text>
        <TextInput
          style={twStyle("mb-1 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={footer}
          onChangeText={update(setFooter)}
          placeholder={rt("footerPlaceholder")}
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text style={twStyle("text-xs text-gray-400")}>{rt("charCount", { count: footer.length })}</Text>
      </View>

      {/* Numbering */}
      <SectionHeader title={rt("numberingSection")} />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rt("prefix")}</Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={prefix}
          onChangeText={update(setPrefix)}
          placeholder={rt("prefixPlaceholder")}
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          maxLength={20}
        />
        <Text style={twStyle("mb-4 text-xs text-gray-400")}>{rt("prefixHint")}</Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rt("nextNumber")}</Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={nextNumber}
          onChangeText={update(setNextNumber)}
          placeholder={rt("nextNumberPlaceholder")}
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
        />
        <Text style={twStyle("text-xs text-gray-400")}>
          {rt("nextWillBe", { number: previewNumber })}
        </Text>
      </View>

      <ActionButton label={rt("saveCta")} onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
