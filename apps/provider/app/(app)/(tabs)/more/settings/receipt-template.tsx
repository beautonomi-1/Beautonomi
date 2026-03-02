import { useState, useEffect } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface ReceiptSettings {
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_prefix: string;
  receipt_next_number: number;
  isUsingPlatformDefault: boolean;
}

export default function ReceiptTemplateScreen() {
  const { data: settings, loading, refresh } = useApi<ReceiptSettings>("/api/provider/settings/sales/receipt");
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
      Alert.alert("Invalid", "Receipt prefix must be 20 characters or less");
      return;
    }
    const num = parseInt(nextNumber);
    if (isNaN(num) || num < 1) {
      Alert.alert("Invalid", "Next receipt number must be at least 1");
      return;
    }
    if (header.length > 2000) {
      Alert.alert("Invalid", "Receipt header must be 2000 characters or less");
      return;
    }
    if (footer.length > 2000) {
      Alert.alert("Invalid", "Receipt footer must be 2000 characters or less");
      return;
    }

    const { error } = await saveReceipt("/api/provider/settings/sales/receipt", {
      receipt_header: header.trim() || null,
      receipt_footer: footer.trim() || null,
      receipt_prefix: prefix.trim() || "REC",
      receipt_next_number: num,
    });

    if (error) {
      Alert.alert("Error", error);
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
        <ScreenHeader title="Receipt Template" showBack />
        <LoadingState message="Loading receipt settings..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Receipt Template" showBack subtitle="Customize your receipts" />

      {settings?.isUsingPlatformDefault && (
        <View className="mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3">
          <Ionicons name="information-circle" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text className="ml-2 flex-1 text-xs leading-4 text-amber-700">
            Using platform defaults. Save to customize your receipts.
          </Text>
        </View>
      )}

      {/* Receipt Preview */}
      <View className="mb-4 rounded-2xl border border-gray-200 bg-white p-5">
        <View className="items-center border-b border-dashed border-gray-200 pb-3">
          {header ? (
            <Text className="text-center text-xs text-gray-600">{header}</Text>
          ) : (
            <Text className="text-center text-xs italic text-gray-300">Receipt header text</Text>
          )}
        </View>
        <View className="items-center py-4">
          <Text className="text-lg font-bold text-gray-900">RECEIPT</Text>
          <Text className="mt-1 text-sm font-mono text-gray-600">{previewNumber}</Text>
          <Text className="mt-1 text-xs text-gray-400">
            {new Date().toLocaleDateString()}
          </Text>
        </View>
        <View className="border-t border-dashed border-gray-200 pt-3">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-500">Service Example</Text>
            <Text className="text-xs text-gray-700">R 250.00</Text>
          </View>
          <View className="flex-row justify-between border-t border-gray-100 pt-1 mt-1">
            <Text className="text-xs font-medium text-gray-700">Total</Text>
            <Text className="text-xs font-bold text-gray-900">R 250.00</Text>
          </View>
        </View>
        <View className="mt-3 items-center border-t border-dashed border-gray-200 pt-3">
          {footer ? (
            <Text className="text-center text-xs text-gray-600">{footer}</Text>
          ) : (
            <Text className="text-center text-xs italic text-gray-300">Receipt footer text</Text>
          )}
        </View>
      </View>

      {/* Header & Footer */}
      <SectionHeader title="Header & Footer" />
      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <Text className="mb-1 text-sm font-medium text-gray-700">Header Text</Text>
        <TextInput
          className="mb-1 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={header}
          onChangeText={update(setHeader)}
          placeholder="Business name, address, registration details..."
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text className="mb-4 text-xs text-gray-400">{header.length}/2000 characters</Text>

        <Text className="mb-1 text-sm font-medium text-gray-700">Footer Text</Text>
        <TextInput
          className="mb-1 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={footer}
          onChangeText={update(setFooter)}
          placeholder="Thank you message, return policy, terms..."
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text className="text-xs text-gray-400">{footer.length}/2000 characters</Text>
      </View>

      {/* Numbering */}
      <SectionHeader title="Receipt Numbering" />
      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <Text className="mb-1 text-sm font-medium text-gray-700">Prefix</Text>
        <TextInput
          className="mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={prefix}
          onChangeText={update(setPrefix)}
          placeholder="REC"
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          maxLength={20}
        />
        <Text className="mb-4 text-xs text-gray-400">Up to 20 characters</Text>

        <Text className="mb-1 text-sm font-medium text-gray-700">Next Number</Text>
        <TextInput
          className="mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={nextNumber}
          onChangeText={update(setNextNumber)}
          placeholder="1"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
        />
        <Text className="text-xs text-gray-400">
          Next receipt will be numbered: {previewNumber}
        </Text>
      </View>

      <ActionButton label="Save Receipt Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View className="h-8" />
    </ScreenContainer>
  );
}
