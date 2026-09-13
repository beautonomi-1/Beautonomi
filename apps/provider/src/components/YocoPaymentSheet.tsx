/**
 * YocoPaymentSheet – Bottom sheet for processing card payments via Yoco device.
 * Provider selects a device, amount is shown, and payment is processed via API.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  useYocoIntegration,
  useYocoDevices,
  useYocoPayment,
  type YocoDevice,
  type YocoPaymentResult,
} from "@/hooks/useYoco";
import { useTranslation } from "@beautonomi/i18n";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";

interface YocoPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  amountCents: number;
  currency?: string;
  bookingId?: string;
  saleId?: string;
  /**
   * §Yoco-synergy 2026-05: location of the booking/sale so we preselect a
   * device assigned to that location (matches the per-device location_id
   * stored on `provider_yoco_devices`). When no device matches, the
   * picker still works but warns that none of the active devices belong
   * to this location.
   */
  bookingLocationId?: string | null;
  description?: string;
  onPaymentSuccess: (result: YocoPaymentResult) => void;
}

export function YocoPaymentSheet({
  visible,
  onClose,
  amountCents,
  currency = getTenantDefaultCurrency(),
  bookingId,
  saleId,
  bookingLocationId,
  description,
  onPaymentSuccess,
}: YocoPaymentSheetProps) {
  const { t } = useTranslation();
  const yp = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.yocoPaymentSheet.${key}`, opts) as string;
  const formatLastUsed = (iso: string): string => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return yp("lastUsedRecent");
    const diff = Math.max(0, Date.now() - ms);
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return yp("lastUsedJustNow");
    if (mins < 60) return yp("lastUsedMinutes", { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return yp("lastUsedHours", { count: hours });
    const days = Math.round(hours / 24);
    if (days < 30) return yp("lastUsedDays", { count: days });
    const months = Math.round(days / 30);
    return yp("lastUsedMonths", { count: months });
  };
  const router = useRouter();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const { integration: yocoIntegration, loading: integrationLoading, reload: reloadIntegration } = useYocoIntegration();
  const { devices, loading: devicesLoading, error: devicesError, reload: reloadDevices } = useYocoDevices();
  const { processPayment, processing } = useYocoPayment();
  const [selectedDevice, setSelectedDevice] = useState<YocoDevice | null>(null);
  const [hostedCheckout, setHostedCheckout] = useState<YocoPaymentResult | null>(null);

  const isIntegrationConnected =
    yocoIntegration?.is_enabled === true && yocoIntegration?.api_key_set === true;
  const activeDevices = devices.filter((d) => d.is_active);
  const isConnected = isIntegrationConnected || activeDevices.length > 0;
  const loading = integrationLoading || devicesLoading;

  useEffect(() => {
    if (!visible || !yocoEnabled) return;
    void reloadIntegration();
    void reloadDevices();
  }, [visible, yocoEnabled, reloadIntegration, reloadDevices]);

  // §Yoco-synergy 2026-05: a device with location_id === null is set to
  // "All Locations" in settings, i.e. a portable Web POS that travels with
  // the provider. For at-home bookings (no salon location_id) this is the
  // device the provider physically carries to the client, so it should be
  // the default. For at-salon bookings it's a sensible fallback when no
  // device is explicitly assigned to that salon yet.
  const isMobileBooking = !bookingLocationId;

  useEffect(() => {
    if (!selectedDevice && activeDevices.length > 0) {
      const sortedByRecency = [...activeDevices].sort((a, b) => {
        const ta = a.last_used_at ? Date.parse(a.last_used_at) : 0;
        const tb = b.last_used_at ? Date.parse(b.last_used_at) : 0;
        return tb - ta;
      });
      const portable = sortedByRecency.find((d) => d.location_id == null);
      const locationMatch = bookingLocationId
        ? sortedByRecency.find((d) => d.location_id === bookingLocationId)
        : undefined;
      // Mobile booking → portable first, then most-recent.
      // At-salon booking → exact location match → portable fallback → most-recent.
      const preferred = isMobileBooking
        ? (portable ?? sortedByRecency[0])
        : (locationMatch ?? portable ?? sortedByRecency[0]);
      setSelectedDevice(preferred);
      return;
    }
    if (selectedDevice && !activeDevices.some((d) => d.id === selectedDevice.id)) {
      setSelectedDevice(activeDevices.length > 0 ? activeDevices[0] : null);
    }
  }, [activeDevices, selectedDevice, bookingLocationId, isMobileBooking]);

  const handleProcess = useCallback(async () => {
    if (!selectedDevice) {
      Alert.alert(yp("selectDeviceTitle"), yp("selectDeviceBody"));
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHostedCheckout(null);

    const result = await processPayment({
      amount_cents: amountCents,
      currency,
      device_id: selectedDevice.id,
      booking_id: bookingId,
      sale_id: saleId,
      description,
    });

    if (result) {
      // §Yoco-OAuth 2026-05: virtual_checkout devices return a hosted-checkout
      // URL the customer pays at. Hand them the link (open in-app browser
      // so the staff member's phone can show the page) — the webhook will
      // flip the status server-side; the staff member can either wait for a
      // notification or open the booking again to confirm.
      if (result.credential_mode === "virtual_checkout" && result.checkout_url) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setHostedCheckout(result);
        onPaymentSuccess(result);
        return;
      }
      if (result.status === "successful") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (result.receipt_url) {
          Alert.alert(
            yp("paymentSuccessful"),
            yp("viewReceiptPrompt"),
            [
              { text: yp("done"), onPress: () => { onPaymentSuccess(result); onClose(); } },
              { text: yp("viewReceipt"), onPress: () => {
                pushInAppBrowser(router, result.receipt_url!, yp("receiptTitle"));
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
          yp("paymentPendingTitle"),
          yp("paymentPendingBody"),
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(yp("paymentFailedTitle"), yp("paymentFailedBody"));
      }
    }
  }, [selectedDevice, amountCents, currency, bookingId, saleId, description, processPayment, onPaymentSuccess, onClose, router]);

  const displayAmount = formatCurrency(amountCents / 100, currency);

  if (!yocoEnabled) {
    return null;
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={yp("title")}
      subtitle={yp("subtitle", { amount: displayAmount })}
      snapHeight="half"
    >
      {/* Amount display */}
      <View style={twStyle("mb-6 items-center rounded-2xl bg-gray-50 py-6")}>
        <Text style={twStyle("text-sm text-gray-500")}>{yp("amountToCharge")}</Text>
        <Text style={twStyle("mt-1 text-3xl font-bold text-gray-900")}>{displayAmount}</Text>
      </View>

      {hostedCheckout?.checkout_url ? (
        <View style={twStyle("mb-6 items-center rounded-2xl border border-blue-100 bg-blue-50 p-4")}>
          <Text style={twStyle("mb-3 text-sm font-semibold text-blue-900")}>
            {yp("scanQr")}
          </Text>
          <View style={twStyle("rounded-xl bg-white p-3")}>
            <QRCode value={hostedCheckout.qr_payload || hostedCheckout.checkout_url} size={180} />
          </View>
          <View style={twStyle("mt-3 flex-row")}>
            <TouchableOpacity
              onPress={() => pushInAppBrowser(router, hostedCheckout.checkout_url!, yp("payWithYoco"))}
              style={[twStyle("rounded-full bg-blue-600 px-4 py-2"), { marginEnd: 8 }]}
            >
              <Text style={twStyle("text-xs font-semibold text-white")}>{yp("openLink")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                await Clipboard.setStringAsync(hostedCheckout.checkout_url!);
                Alert.alert(yp("copiedTitle"), yp("copiedBody"));
              }}
              style={twStyle("rounded-full border border-blue-200 bg-white px-4 py-2")}
            >
              <Text style={twStyle("text-xs font-semibold text-blue-700")}>{yp("copyLink")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Device selection */}
      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>{yp("selectDevice")}</Text>
      {loading ? (
        <View style={twStyle("items-center py-8")}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>{yp("loading")}</Text>
        </View>
      ) : !isConnected ? (
        // §Yoco-synergy 2026-05: deep-link to the settings device list so the
        // provider can connect Yoco in one tap instead of hunting through More.
        <View style={twStyle("items-center rounded-2xl border border-amber-200 bg-amber-50 py-8 px-4")}>
          <Ionicons name="link-outline" size={32} color="#d97706" />
          <Text style={twStyle("mt-2 text-sm font-medium text-amber-800")}>{yp("notConnected")}</Text>
          <Text style={twStyle("mt-1 text-xs text-center text-amber-700")}>
            {yp("notConnectedHint")}
          </Text>
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push("/(app)/(tabs)/more/settings/yoco-devices" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-amber-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel={yp("openYocoSettingsA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>{yp("connectYoco")}</Text>
          </TouchableOpacity>
        </View>
      ) : activeDevices.length === 0 ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 py-8 px-4")}>
          <Ionicons name="card-outline" size={32} color="#9ca3af" />
          <Text style={twStyle("mt-2 text-sm text-gray-500")}>
            {devices.length > 0 ? yp("noActiveDevices") : yp("noDevicesConfigured")}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400 text-center")}>
            {devices.length > 0
              ? yp("activateDeviceHint")
              : yp("addDeviceHint")}
          </Text>
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push("/(app)/(tabs)/more/settings/yoco-devices" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-indigo-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel={yp("manageDevicesA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>
              {devices.length > 0 ? yp("manageDevices") : yp("addDevice")}
            </Text>
          </TouchableOpacity>
          {devicesError ? (
            <Text style={twStyle("mt-2 text-center text-xs text-rose-600")}>{devicesError}</Text>
          ) : null}
        </View>
      ) : (
        <View style={twStyle("mb-6")}>
          {/* §Yoco-synergy 2026-05: contextual banners.
            - At-home booking with a portable device: confirm we're using it.
            - At-home booking with no portable device: hint the provider to
              flag a device as "All Locations" for mobile work.
            - At-salon booking with no device assigned to that salon AND no
              portable fallback: warn so they don't quietly charge from the
              wrong store. */}
          {(() => {
            const hasPortable = activeDevices.some((d) => d.location_id == null);
            const hasExactMatch = !!bookingLocationId
              && activeDevices.some((d) => d.location_id === bookingLocationId);
            if (isMobileBooking) {
              if (hasPortable) {
                return (
                  <View style={twStyle("mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2")}>
                    <Text style={twStyle("text-xs text-emerald-800")}>
                      {yp("mobileUsingPortable")}
                    </Text>
                  </View>
                );
              }
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    {yp("mobileNoPortable")}
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && !hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    {yp("noLocationDevice")}
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-indigo-800")}>
                    {yp("usingPortableFallback")}
                  </Text>
                </View>
              );
            }
            return null;
          })()}
          {activeDevices.map((device, idx) => {
            const isSelected = selectedDevice?.id === device.id;
            const matchesBookingLocation = !!bookingLocationId && device.location_id === bookingLocationId;
            const isPortable = device.location_id == null;
            const lastUsedLabel = device.last_used_at
              ? yp("lastUsed", { when: formatLastUsed(device.last_used_at) })
              : yp("neverUsed");
            return (
              <TouchableOpacity
                key={device.id}
                onPress={() => setSelectedDevice(device)}
                style={[twStyle(`flex-row items-center rounded-xl border p-3 ${
                  isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                }`), idx > 0 ? { marginTop: 8 } : undefined]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${device.name} ${
                  device.device_type === "virtual_checkout"
                    ? yp("typeHostedCheckout")
                    : device.device_type === "web_pos"
                      ? yp("typeWebPos")
                      : yp("typeCardMachine")
                }`}
              >
                <View
                  style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                    isSelected ? "bg-indigo-100" : "bg-gray-100"
                  }`)}
                >
                  <Ionicons
                    name={
                      device.device_type === "virtual_checkout"
                        ? "qr-code-outline"
                        : device.device_type === "web_pos"
                          ? "phone-portrait-outline"
                          : "card-outline"
                    }
                    size={20}
                    color={isSelected ? "#6366f1" : "#6b7280"}
                  />
                </View>
                <View style={twStyle("ms-3 flex-1")}>
                  <View style={twStyle("flex-row flex-wrap items-center")}>
                    <Text
                      style={twStyle(`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`)}
                    >
                      {device.name}
                    </Text>
                    {matchesBookingLocation ? (
                      <View style={twStyle("ms-2 rounded-full bg-emerald-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-emerald-700")}>
                          {yp("thisLocation")}
                        </Text>
                      </View>
                    ) : null}
                    {isPortable ? (
                      <View style={twStyle("ms-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                          {yp("portable")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {device.device_type === "virtual_checkout"
                      ? yp("typeHostedCheckoutQr")
                      : device.device_type === "web_pos"
                        ? yp("typeWebPos")
                        : yp("typeCardMachine")}
                    {device.location_name
                      ? ` · ${device.location_name}`
                      : isPortable
                        ? ` · ${yp("allLocations")}`
                        : ""}
                  </Text>
                  <Text style={twStyle("text-[11px] text-gray-400")}>
                    {lastUsedLabel}
                    {typeof device.total_transactions === "number" && device.total_transactions > 0
                      ? yp("txnCount", { count: device.total_transactions })
                      : ""}
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
        label={processing ? yp("processing") : yp("chargeAmount", { amount: displayAmount })}
        onPress={handleProcess}
        loading={processing}
        disabled={!selectedDevice || processing || activeDevices.length === 0 || !isConnected}
        fullWidth
      />
    </BottomSheet>
  );
}
