/**
 * Native Receipt sequencing – receipt number prefix and next number.
 * GET/PATCH /api/provider/settings/sales/receipt
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";

interface ReceiptSettings {
  receipt_prefix: string;
  receipt_next_number: number;
  receipt_header: string | null;
  receipt_footer: string | null;
  isUsingPlatformDefault?: boolean;
}

export default function ReceiptSequencingScreen() {
  const { t } = useTranslation();
  const rs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.receiptSequencing.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [prefix, setPrefix] = useState("REC");
  const [nextNumber, setNextNumber] = useState("1");
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");

  const { data, loading, error, refresh } = useApi<ReceiptSettings>("/api/provider/settings/sales/receipt");
  const { execute: patch, loading: saving } = useApiMutation<ReceiptSettings>("patch");

  useEffect(() => {
    if (data) {
      setPrefix(data.receipt_prefix ?? "REC");
      setNextNumber(String(data.receipt_next_number ?? 1));
      setHeader(data.receipt_header ?? "");
      setFooter(data.receipt_footer ?? "");
    }
  }, [data]);

  const handleSave = async () => {
    const num = parseInt(nextNumber, 10);
    if (isNaN(num) || num < 1) {
      Alert.alert(rs("invalidTitle"), rs("invalidNextNumber"));
      return;
    }
    if (!/^[A-Za-z0-9-]+$/.test(prefix.trim())) {
      Alert.alert(rs("invalidTitle"), rs("invalidPrefix"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await patch("/api/provider/settings/sales/receipt", {
      receipt_prefix: prefix.trim() || "REC",
      receipt_next_number: num,
      receipt_header: header.trim() || null,
      receipt_footer: footer.trim() || null,
    });
    if (err) {
      Alert.alert(rs("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rs("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={rs("title")}
        subtitle={rs("subtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={twStyle("rounded-xl bg-red-50 border border-red-200 p-3 mb-4")}>
            <Text style={twStyle("text-sm text-red-800")}>{error}</Text>
            <TouchableOpacity onPress={() => refresh()} style={twStyle("mt-2")}>
              <Text style={twStyle("text-sm font-medium text-red-600")}>{rs("retry")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{rs("prefixLabel")}</Text>
          <TextInput
            value={prefix}
            onChangeText={setPrefix}
            placeholder={rs("prefixPlaceholder")}
            placeholderTextColor="#9ca3af"
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            autoCapitalize="characters"
          />
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{rs("nextNumberLabel")}</Text>
          <TextInput
            value={nextNumber}
            onChangeText={setNextNumber}
            placeholder={rs("nextNumberPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
          />
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{rs("headerLabel")}</Text>
          <TextInput
            value={header}
            onChangeText={setHeader}
            placeholder={rs("headerPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]")}
          />
        </View>

        <View style={twStyle("mb-6")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{rs("footerLabel")}</Text>
          <TextInput
            value={footer}
            onChangeText={setFooter}
            placeholder={rs("footerPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]")}
          />
        </View>

        <ActionButton label={saving ? rs("saving") : rs("save")} onPress={handleSave} loading={saving} fullWidth />
      </ScrollView>
    </ScreenContainer>
  );
}
