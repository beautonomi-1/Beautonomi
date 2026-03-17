/**
 * YocoPaymentSheet – Bottom sheet for processing card payments via Yoco device.
 * Provider selects a device, amount is shown, and payment is processed via API.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  useYocoIntegration,
  useYocoDevices,
  useYocoPayment,
  type YocoDevice,
  type YocoPaymentResult,
} from "@/hooks/useYoco";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface YocoPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  amountCents: number;
  currency?: string;
  bookingId?: string;
  saleId?: string;
  description?: string;
  onPaymentSuccess: (result: YocoPaymentResult) => void;
}

export function YocoPaymentSheet({
  visible,
  onClose,
  amountCents,
  currency = "ZAR",
  bookingId,
  saleId,
  description,
  onPaymentSuccess,
}: YocoPaymentSheetProps) {
  const { integration: yocoIntegration, loading: integrationLoading } = useYocoIntegration();
  const { devices, loading: devicesLoading } = useYocoDevices();
  const { processPayment, processing } = useYocoPayment();
  const [selectedDevice, setSelectedDevice] = useState<YocoDevice | null>(null);

  const isConnected = yocoIntegration?.is_enabled === true;
  const activeDevices = devices.filter((d) => d.is_active);
  const loading = integrationLoading || devicesLoading;

  useEffect(() => {
    if (activeDevices.length === 1 && !selectedDevice) {
      setSelectedDevice(activeDevices[0]);
    }
  }, [activeDevices, selectedDevice]);

  const handleProcess = useCallback(async () => {
    if (!selectedDevice) {
      Alert.alert("Select Device", "Please select a Yoco device to process the payment.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await processPayment({
      amount_cents: amountCents,
      currency,
      device_id: selectedDevice.id,
      booking_id: bookingId,
      sale_id: saleId,
      description,
    });

    if (result) {
      if (result.status === "successful") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (result.receipt_url) {
          Alert.alert(
            "Payment successful",
            "Would you like to view the receipt?",
            [
              { text: "Done", onPress: () => { onPaymentSuccess(result); onClose(); } },
              { text: "View receipt", onPress: () => {
                Linking.openURL(result.receipt_url!);
                onPaymentSuccess(result);
                onClose();
              } },
            ]
          );
        } else {
          onPaymentSuccess(result);
          onClose();
        }
      } else if (result.status === "pending") {
        // Hook normally polls until success/fail; this is edge case (e.g. no payment id)
        Alert.alert(
          "Payment Pending",
          "The payment is being processed. Please check the device.",
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Payment Failed", "The card payment was declined. Please try again.");
      }
    }
  }, [selectedDevice, amountCents, currency, bookingId, saleId, description, processPayment, onPaymentSuccess, onClose]);

  const displayAmount = formatCurrency(amountCents / 100, currency);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Card Payment"
      subtitle={`Process ${displayAmount} via Yoco`}
      snapHeight="half"
    >
      {/* Amount display */}
      <View style={twStyle("mb-6 items-center rounded-2xl bg-gray-50 py-6")}>
        <Text style={twStyle("text-sm text-gray-500")}>Amount to charge</Text>
        <Text style={twStyle("mt-1 text-3xl font-bold text-gray-900")}>{displayAmount}</Text>
      </View>

      {/* Device selection */}
      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Select Device</Text>
      {loading ? (
        <View style={twStyle("items-center py-8")}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>Loading…</Text>
        </View>
      ) : !isConnected ? (
        <View style={twStyle("items-center rounded-2xl border border-amber-200 bg-amber-50 py-8 px-4")}>
          <Ionicons name="link-outline" size={32} color="#d97706" />
          <Text style={twStyle("mt-2 text-sm font-medium text-amber-800")}>Yoco not connected</Text>
          <Text style={twStyle("mt-1 text-xs text-center text-amber-700")}>
            Connect Yoco in More → Settings → Payment Settings → Yoco devices
          </Text>
        </View>
      ) : activeDevices.length === 0 ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 py-8")}>
          <Ionicons name="card-outline" size={32} color="#9ca3af" />
          <Text style={twStyle("mt-2 text-sm text-gray-500")}>No Yoco devices configured</Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400")}>
            Add a device in Settings → Payment Settings → Yoco devices
          </Text>
        </View>
      ) : (
        <View style={twStyle("mb-6")}>
          {activeDevices.map((device, idx) => {
            const isSelected = selectedDevice?.id === device.id;
            return (
              <TouchableOpacity
                key={device.id}
                onPress={() => setSelectedDevice(device)}
                style={[twStyle(`flex-row items-center rounded-xl border p-3 ${
                  isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                }`), idx > 0 ? { marginTop: 8 } : undefined]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${device.name} ${device.device_type === "web_pos" ? "Web POS" : "Card Machine"}`}
              >
                <View
                  style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                    isSelected ? "bg-indigo-100" : "bg-gray-100"
                  }`)}
                >
                  <Ionicons
                    name={device.device_type === "web_pos" ? "phone-portrait-outline" : "card-outline"}
                    size={20}
                    color={isSelected ? "#6366f1" : "#6b7280"}
                  />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <Text
                    style={twStyle(`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`)}
                  >
                    {device.name}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {device.device_type === "web_pos" ? "Web POS" : "Card Machine"}
                    {device.serial_number ? ` · ${device.serial_number}` : ""}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Process button */}
      <ActionButton
        label={processing ? "Processing…" : `Charge ${displayAmount}`}
        onPress={handleProcess}
        loading={processing}
        disabled={!selectedDevice || processing || activeDevices.length === 0 || !isConnected}
        fullWidth
      />
    </BottomSheet>
  );
}
