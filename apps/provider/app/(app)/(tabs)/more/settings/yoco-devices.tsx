/**
 * Yoco Device Management Screen
 * List, add, edit, and delete Yoco Web POS devices (created via Yoco's API).
 */
import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useYocoDevices, useYocoIntegration, type YocoDevice } from "@/hooks/useYoco";
import { useApi } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";

interface Location {
  id: string;
  name: string;
}

// §Yoco-synergy 2026-05: same relative-time format as YocoPaymentSheet so the
// device's "Last used X ago" string reads identically on settings and picker.
function formatLastUsedShort(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "recently";
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function YocoDevicesScreen() {
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
    reload: reloadDevices,
    addDevice,
    updateDevice,
    deleteDevice,
  } = useYocoDevices();
  const {
    integration,
    loading: integrationLoading,
    connect,
    disconnect,
    connectOauth,
    disconnectOauth,
    dismissReconnectBanner,
    reload: reloadIntegration,
  } = useYocoIntegration();
  const { data: locations } = useApi<Location[]>("/api/provider/locations");

  // Form state
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editDevice, setEditDevice] = useState<YocoDevice | null>(null);
  const [showConnectSheet, setShowConnectSheet] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLocationId, setFormLocationId] = useState<string | null>(null);
  const [formActive, setFormActive] = useState(true);
  const [formCredentialMode, setFormCredentialMode] = useState<"web_pos" | "virtual_checkout">("web_pos");

  // Yoco API key form
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormLocationId(null);
    setFormActive(true);
    setFormCredentialMode("web_pos");
  }, []);

  // §Yoco-OAuth 2026-05: when the provider returns to the app from the Yoco
  // OAuth flow (web browser), refetch the integration so the UI flips to
  // "Connected" without a manual pull-to-refresh.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void reloadIntegration();
        void reloadDevices();
      }
    });
    return () => sub.remove();
  }, [reloadIntegration, reloadDevices]);

  function openAdd() {
    resetForm();
    setEditDevice(null);
    setShowAddSheet(true);
  }

  function openEdit(device: YocoDevice) {
    setFormName(device.name);
    setFormLocationId(device.location_id ?? null);
    setFormActive(device.is_active);
    setEditDevice(device);
    setShowAddSheet(true);
  }

  async function handleSaveDevice() {
    if (!formName.trim()) {
      Alert.alert("Required", "Device name is required.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (editDevice) {
      const ok = await updateDevice(editDevice.id, {
        name: formName.trim(),
        location_id: formLocationId,
        is_active: formActive,
      });
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddSheet(false);
        reloadDevices();
      }
    } else {
      const result = await addDevice({
        name: formName.trim(),
        location_id: formLocationId,
        is_active: formActive,
        credential_mode: formCredentialMode,
      });
      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddSheet(false);
        reloadDevices();
      }
    }
  }

  async function handleDelete(device: YocoDevice) {
    Alert.alert(
      "Delete Device",
      `Are you sure you want to delete "${device.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            await deleteDevice(device.id);
            reloadDevices();
          },
        },
      ],
    );
  }

  async function handleConnect() {
    if (!secretKey.trim()) {
      Alert.alert("Required", "Yoco secret key is required for hosted checkout.");
      return;
    }
    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await connect(apiKey.trim() || undefined, secretKey.trim(), webhookSecret.trim() || undefined);
    setConnecting(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowConnectSheet(false);
      setApiKey("");
      setSecretKey("");
      setWebhookSecret("");
      setShowSecretKey(false);
      setShowWebhookSecret(false);
    }
  }

  async function handleDisconnect() {
    Alert.alert(
      "Disconnect Yoco",
      "This will remove your Yoco integration. Card payments will no longer be processed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const ok = await disconnect();
            if (ok) {
              reloadDevices();
            }
          },
        },
      ],
    );
  }

  const loading = devicesLoading || integrationLoading;
  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Yoco Devices" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (devicesError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Yoco Devices" showBack />
        <ErrorState message={devicesError} onRetry={reloadDevices} />
      </ScreenContainer>
    );
  }

  if (!yocoEnabled) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Yoco Devices" showBack />
        <EmptyState
          icon="card-outline"
          title="Yoco payments are disabled"
          description="Yoco card terminals and hosted checkout are not available for this market right now."
        />
      </ScreenContainer>
    );
  }

  // §Yoco-OAuth 2026-05: the "primary" connected state is OAuth — only that
  // unlocks adding real Web POS terminals. credential_mode='checkout' lets the
  // provider take *online* payments via hosted checkout but cannot add
  // physical terminals.
  const credentialMode = integration?.credential_mode ?? "none";
  const oauthConnected = integration?.oauth_connected === true;
  const isAnyConnected =
    Boolean(integration?.is_enabled) &&
    (credentialMode === "oauth" || credentialMode === "checkout");
  const canAddRealDevices = oauthConnected && integration?.is_enabled === true;
  // §Yoco-OAuth 2026-05: only surface the OAuth CTA when the rollout flag is
  // on for this tenant — except for providers who are already connected, who
  // keep the Reconnect/Disconnect controls regardless.
  const oauthV2Enabled = integration?.oauth_v2_enabled === true;
  const showOauthCta = oauthV2Enabled || oauthConnected;
  const showReconnectBanner =
    oauthV2Enabled &&
    credentialMode === "checkout" &&
    !oauthConnected &&
    !integration?.reconnect_banner_dismissed_at;
  const statusLabel = oauthConnected
    ? "Web POS connected"
    : credentialMode === "checkout"
      ? "Checkout only"
      : "Not connected";
  const statusTone = oauthConnected
    ? { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50" }
    : credentialMode === "checkout"
      ? { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" }
      : { dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-100" };

  return (
    <ScreenContainer>
      <ScreenHeader title="Yoco Devices" showBack />

      {/* ─── Integration Status ─── */}
      <SectionHeader title="Integration" />
      <View
        style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}
        accessibilityLabel="Yoco integration status"
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row items-center flex-1")}>
            <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-blue-50")}>
              <Ionicons name="card-outline" size={20} color="#3b82f6" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Yoco</Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {oauthConnected
                  ? `Connected as ${integration?.oauth_business_name || "Yoco account"}`
                  : credentialMode === "checkout"
                    ? "Hosted checkout keys saved"
                    : "Card & tap-to-pay"}
              </Text>
            </View>
          </View>
          <View style={twStyle(`rounded-full px-3 py-1 ${statusTone.bg}`)}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle(`mr-1.5 h-2 w-2 rounded-full ${statusTone.dot}`)} />
              <Text style={twStyle(`text-xs font-medium ${statusTone.text}`)}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* §Yoco-OAuth 2026-05: surface "reconnect needed" when the provider
            only has Checkout keys saved (legacy flow). Dismissible — the
            server records reconnect_banner_dismissed_at so the banner stays
            gone until they actively want it back. */}
        {showReconnectBanner ? (
          <View style={twStyle("mt-3 rounded-xl bg-amber-50 p-3")}>
            <Text style={twStyle("text-xs text-amber-900")}>
              You have Yoco hosted-checkout keys, but Web POS terminals require an OAuth connection. Tap{" "}
              <Text style={twStyle("font-semibold")}>Connect Yoco</Text> below to fix.
            </Text>
            <TouchableOpacity
              onPress={dismissReconnectBanner}
              style={twStyle("mt-2 self-start")}
              accessibilityRole="button"
              accessibilityLabel="Dismiss reconnect banner"
            >
              <Text style={twStyle("text-xs font-semibold text-amber-700")}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {oauthConnected && integration?.oauth_last_refresh_error ? (
          <View style={twStyle("mt-3 rounded-xl bg-red-50 p-3")}>
            <Text style={twStyle("text-xs text-red-700")}>
              Yoco refused our last token refresh ({integration.oauth_last_refresh_error}). Tap{" "}
              <Text style={twStyle("font-semibold")}>Reconnect</Text> to restore Web POS.
            </Text>
          </View>
        ) : null}

        {showOauthCta ? (
          <View style={twStyle("mt-3 flex-row")}>
            {oauthConnected ? (
              <>
                <TouchableOpacity
                  onPress={connectOauth}
                  style={[twStyle("flex-1 items-center rounded-xl border border-gray-200 bg-white py-2.5"), { marginRight: 8 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Reconnect Yoco"
                >
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>Reconnect</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    Alert.alert(
                      "Disconnect Yoco",
                      "You'll need to reconnect to add new card terminals.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Disconnect",
                          style: "destructive",
                          onPress: async () => {
                            const ok = await disconnectOauth();
                            if (ok) reloadDevices();
                          },
                        },
                      ],
                    );
                  }}
                  style={twStyle("flex-1 items-center rounded-xl border border-red-200 bg-red-50 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect Yoco"
                >
                  <Text style={twStyle("text-sm font-medium text-red-600")}>Disconnect</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={connectOauth}
                style={twStyle("flex-1 items-center rounded-xl bg-indigo-600 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Connect Yoco via OAuth"
              >
                <Text style={twStyle("text-sm font-medium text-white")}>
                  {credentialMode === "checkout" ? "Connect Yoco for terminals" : "Connect Yoco"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Advanced: paste-keys fallback (hosted checkout only, no terminals). */}
        <TouchableOpacity
          onPress={() => {
            setShowSecretKey(false);
            setShowConnectSheet(true);
          }}
          style={twStyle("mt-3 items-center py-2")}
          accessibilityRole="button"
          accessibilityLabel="Use Checkout API keys instead"
        >
          <Text style={twStyle("text-xs text-indigo-600")}>
            {credentialMode === "checkout"
              ? "Update Checkout API keys"
              : "Use Checkout API keys instead (online payments only)"}
          </Text>
        </TouchableOpacity>

        {isAnyConnected && credentialMode === "checkout" ? (
          <TouchableOpacity
            onPress={handleDisconnect}
            style={twStyle("mt-1 items-center py-2")}
            accessibilityRole="button"
            accessibilityLabel="Remove Checkout API keys"
          >
            <Text style={twStyle("text-xs text-red-500")}>Remove Checkout API keys</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ─── Devices ─── */}
      <SectionHeader
        title="Devices"
        actionLabel={canAddRealDevices ? "Add" : undefined}
        onAction={canAddRealDevices ? openAdd : undefined}
      />

      {!isAnyConnected ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12")}>
          <Ionicons name="link-outline" size={36} color="#9ca3af" />
          <Text style={twStyle("mt-3 text-sm font-medium text-gray-500")}>
            Connect Yoco first
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400")}>
            Tap Connect Yoco above to add Web POS terminals.
          </Text>
        </View>
      ) : !canAddRealDevices ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-amber-200 bg-amber-50 py-12")}>
          <Ionicons name="warning-outline" size={36} color="#d97706" />
          <Text style={twStyle("mt-3 text-sm font-medium text-amber-700")}>
            {showOauthCta
              ? "OAuth required to add card terminals"
              : "Hosted checkout only"}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-amber-600 text-center px-6")}>
            {showOauthCta
              ? "You can still take online payments via hosted checkout. Tap Connect Yoco above to unlock physical terminals."
              : "Your account is configured for online hosted checkout only. Contact support to enable physical Web POS terminals."}
          </Text>
        </View>
      ) : devices.length === 0 ? (
        <EmptyState
          icon="phone-portrait-outline"
          title="No devices yet"
          description="Add a Web POS device; Yoco assigns the device ID"
          actionLabel="Add Device"
          onAction={openAdd}
        />
      ) : (
        <View>
          {devices.map((device, idx) => (
            <View
              key={device.id}
              style={[twStyle("rounded-2xl border border-gray-100 bg-white p-4"), idx > 0 ? { marginTop: 12 } : undefined]}
              accessibilityLabel={`${device.name} device`}
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-row items-center flex-1")}>
                  <View
                    style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                      device.is_active ? "bg-indigo-50" : "bg-gray-100"
                    }`)}
                  >
                    <Ionicons name="phone-portrait-outline" size={20} color={device.is_active ? "#6366f1" : "#9ca3af"} />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <View style={twStyle("flex-row flex-wrap items-center")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{device.name}</Text>
                      {/* §Yoco-synergy 2026-05: surface portable / All-Locations
                        status here too so providers running mobile bookings
                        can confirm the device they take with them. */}
                      {device.location_id == null ? (
                        <View style={twStyle("ml-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                            portable
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {device.credential_mode === "virtual_checkout"
                        ? "Hosted checkout"
                        : "Web POS"}
                      {device.credential_mode !== "virtual_checkout" && device.serial_number
                        ? ` · ${device.serial_number}`
                        : ""}
                    </Text>
                    {device.location_name ? (
                      <Text style={twStyle("text-xs text-gray-400")}>{device.location_name}</Text>
                    ) : device.location_id == null ? (
                      <Text style={twStyle("text-xs text-gray-400")}>All locations · travels with you</Text>
                    ) : null}
                    {/* §Yoco-synergy 2026-05: usage hint mirrors the picker
                      so providers see the same "Last used / N txns" line
                      everywhere a device appears. */}
                    {(device.last_used_at || (device.total_transactions ?? 0) > 0) ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        {device.last_used_at ? `Last used ${formatLastUsedShort(device.last_used_at)}` : "Never used yet"}
                        {(device.total_transactions ?? 0) > 0
                          ? ` · ${device.total_transactions} txn${device.total_transactions === 1 ? "" : "s"}`
                          : ""}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={[twStyle(`rounded-full px-2 py-0.5 ${device.is_active ? "bg-green-50" : "bg-gray-100"}`), { marginRight: 8 }]}
                  >
                    <Text style={twStyle(`text-xs ${device.is_active ? "text-green-600" : "text-gray-400"}`)}>
                      {device.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(device)}
                    style={[twStyle("min-h-[44px] min-w-[44px] items-center justify-center"), { marginRight: 8 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${device.name}`}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(device)}
                    style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${device.name}`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={twStyle("h-8")} />

      {/* ─── Add/Edit Device Sheet ─── */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title={editDevice ? "Edit Device" : "Add Device"}
        snapHeight="auto"
      >
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Device Name *</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Front Desk Terminal"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Device name"
          />
        </View>

        {!editDevice && (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Device type</Text>
            <View style={twStyle("flex-row")}>
              {[
                { value: "web_pos" as const, label: "Web POS terminal" },
                { value: "virtual_checkout" as const, label: "Virtual checkout" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setFormCredentialMode(option.value)}
                  style={[
                    twStyle(`rounded-full px-3 py-1.5 ${
                      formCredentialMode === option.value
                        ? "bg-indigo-600"
                        : "border border-gray-200 bg-gray-50"
                    }`),
                    { marginRight: 8 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: formCredentialMode === option.value }}
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${
                      formCredentialMode === option.value ? "text-white" : "text-gray-600"
                    }`)}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={twStyle("mt-2 text-xs text-gray-500")}>
              Virtual checkout creates hosted payment links and QR codes without a physical terminal.
            </Text>
          </View>
        )}

        {editDevice && editDevice.serial_number ? (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Yoco device ID</Text>
            <Text style={twStyle("rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-xs text-gray-600")} selectable>
              {editDevice.serial_number}
            </Text>
          </View>
        ) : null}

        {Array.isArray(locations) && locations.length > 0 && (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Location</Text>
            {/* §Yoco-synergy 2026-05: explain what "All Locations" means so
              providers know to pick it for the device they take to client
              homes (at-home / mobile bookings). */}
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              &quot;All Locations&quot; marks this device as portable — used by default for at-home bookings and anywhere a salon doesn&apos;t yet have its own device.
            </Text>
            <View style={twStyle("flex-row flex-wrap")}>
              <TouchableOpacity
                onPress={() => setFormLocationId(null)}
                style={[twStyle(`rounded-full px-3 py-1.5 ${
                  !formLocationId ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                }`), { marginRight: 8, marginBottom: 8 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: !formLocationId }}
              >
                <Text
                  style={twStyle(`text-xs font-medium ${!formLocationId ? "text-white" : "text-gray-600"}`)}
                >
                  All Locations
                </Text>
              </TouchableOpacity>
              {locations.map((loc) => {
                const sel = formLocationId === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => setFormLocationId(loc.id)}
                    style={[twStyle(`rounded-full px-3 py-1.5 ${
                      sel ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                    }`), { marginRight: 8, marginBottom: 8 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <Text
                      style={twStyle(`text-xs font-medium ${sel ? "text-white" : "text-gray-600"}`)}
                    >
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
          <Switch
            value={formActive}
            onValueChange={setFormActive}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={formActive ? "#6366f1" : "#f3f4f6"}
          />
        </View>

        <ActionButton
          label={editDevice ? "Save Changes" : "Add Device"}
          onPress={handleSaveDevice}
          fullWidth
        />
      </BottomSheet>

      {/* ─── Connect Yoco Sheet ─── */}
      <BottomSheet
        visible={showConnectSheet}
        onClose={() => setShowConnectSheet(false)}
        title="Connect Yoco"
        subtitle="Enter your Yoco API credentials"
        snapHeight="auto"
      >
        <TouchableOpacity
          onPress={() => setShowKeyHelp((v) => !v)}
          style={twStyle("mb-2 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5")}
          accessibilityRole="button"
          accessibilityLabel="How to find Yoco keys"
        >
          <Text style={twStyle("text-sm font-medium text-gray-800")}>How to find your keys</Text>
          <Ionicons name={showKeyHelp ? "chevron-up-outline" : "chevron-down-outline"} size={16} color="#6b7280" />
        </TouchableOpacity>

        {showKeyHelp ? (
          <View style={twStyle("mb-2 rounded-xl bg-blue-50 p-3")}>
            <Text style={twStyle("text-xs text-blue-700")}>
              1) Sign in to Yoco dashboard.{"\n"}
              2) Open API credentials / developer settings.{"\n"}
              3) Copy your live secret key. Add the webhook secret too if you use hosted checkout.
            </Text>
          </View>
        ) : null}

        <View style={twStyle("mb-2 rounded-xl bg-blue-50 p-3")}>
          <Text style={twStyle("text-xs text-blue-700")}>
            The secret key enables Yoco hosted checkout links and QR payments. Web POS card terminals still require
            the Connect Yoco OAuth button above.
          </Text>
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Public Key (optional)</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="pk_live_..."
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Yoco API key"
          />
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>Stored for reference. Hosted checkout only needs the secret key.</Text>
        </View>

        <View style={twStyle("mb-6")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Secret Key *</Text>
          <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-1.5")}>
            <TextInput
              style={twStyle("flex-1 py-3 text-sm text-gray-900")}
              value={secretKey}
              onChangeText={setSecretKey}
              placeholder="sk_live_..."
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showSecretKey}
              accessibilityLabel="Yoco secret key"
            />
            <TouchableOpacity
              onPress={() => setShowSecretKey((v) => !v)}
              style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
              accessibilityRole="button"
              accessibilityLabel={showSecretKey ? "Hide secret key" : "Show secret key"}
            >
              <Ionicons
                name={showSecretKey ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#6b7280"
              />
            </TouchableOpacity>
          </View>
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>Used server-side to create Yoco hosted checkout links.</Text>
        </View>

        <View style={twStyle("mb-6")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Webhook Secret (recommended)</Text>
          <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-1.5")}>
            <TextInput
              style={twStyle("flex-1 py-3 text-sm text-gray-900")}
              value={webhookSecret}
              onChangeText={setWebhookSecret}
              placeholder="whsec_..."
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showWebhookSecret}
              accessibilityLabel="Yoco webhook secret"
            />
            <TouchableOpacity
              onPress={() => setShowWebhookSecret((v) => !v)}
              style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
              accessibilityRole="button"
              accessibilityLabel={showWebhookSecret ? "Hide webhook secret" : "Show webhook secret"}
            >
              <Ionicons
                name={showWebhookSecret ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#6b7280"
              />
            </TouchableOpacity>
          </View>
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            Lets Beautonomi verify Yoco payment webhooks and mark hosted checkout payments as paid automatically.
          </Text>
        </View>

        <ActionButton
          label={connecting ? "Connecting…" : "Connect"}
          onPress={handleConnect}
          loading={connecting}
          disabled={!secretKey.trim()}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
