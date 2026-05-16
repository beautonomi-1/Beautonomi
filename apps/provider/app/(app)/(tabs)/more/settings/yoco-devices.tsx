/**
 * Yoco Device Management Screen
 * List, add, edit, and delete Yoco Web POS devices (created via Yoco's API).
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
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

interface Location {
  id: string;
  name: string;
}

export default function YocoDevicesScreen() {
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

  // Yoco API key form
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormLocationId(null);
    setFormActive(true);
  }, []);

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
    if (!apiKey.trim() || !secretKey.trim()) {
      Alert.alert("Required", "Both API key and secret key are required.");
      return;
    }
    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await connect(apiKey.trim(), secretKey.trim());
    setConnecting(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowConnectSheet(false);
      setApiKey("");
      setSecretKey("");
      setShowSecretKey(false);
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

  const isConnected = integration?.is_enabled && integration?.api_key_set;

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
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-blue-50")}>
              <Ionicons name="card-outline" size={20} color="#3b82f6" />
            </View>
            <View style={twStyle("ml-3")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Yoco</Text>
              <Text style={twStyle("text-xs text-gray-500")}>Card & tap-to-pay</Text>
            </View>
          </View>
          <View
            style={twStyle(`rounded-full px-3 py-1 ${isConnected ? "bg-green-50" : "bg-gray-100"}`)}
          >
            <View style={twStyle("flex-row items-center")}>
              <View
                style={twStyle(`mr-1.5 h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`)}
              />
              <Text
                style={twStyle(`text-xs font-medium ${isConnected ? "text-green-700" : "text-gray-500"}`)}
              >
                {isConnected ? "Connected" : "Not connected"}
              </Text>
            </View>
          </View>
        </View>

        <View style={twStyle("mt-3 flex-row")}>
          {isConnected ? (
            <TouchableOpacity
              onPress={handleDisconnect}
              style={[twStyle("flex-1 items-center rounded-xl border border-red-200 bg-red-50 py-2.5"), { marginRight: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Disconnect Yoco"
            >
              <Text style={twStyle("text-sm font-medium text-red-600")}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setShowSecretKey(false);
                setShowConnectSheet(true);
              }}
              style={twStyle("flex-1 items-center rounded-xl bg-indigo-600 py-2.5")}
              accessibilityRole="button"
              accessibilityLabel="Connect Yoco"
            >
              <Text style={twStyle("text-sm font-medium text-white")}>Connect Yoco</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Devices ─── */}
      <SectionHeader
        title="Devices"
        actionLabel={isConnected ? "Add" : undefined}
        onAction={isConnected ? openAdd : undefined}
      />

      {!isConnected ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12")}>
          <Ionicons name="link-outline" size={36} color="#9ca3af" />
          <Text style={twStyle("mt-3 text-sm font-medium text-gray-500")}>
            Connect Yoco first
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400")}>
            Add your API keys to manage devices
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
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{device.name}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      Web POS
                      {device.serial_number ? ` · ${device.serial_number}` : ""}
                    </Text>
                    {device.location_name && (
                      <Text style={twStyle("text-xs text-gray-400")}>{device.location_name}</Text>
                    )}
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
          <View style={twStyle("mb-4 rounded-xl bg-violet-50 px-3 py-2")}>
            <Text style={twStyle("text-xs text-violet-900")}>
              Beautonomi calls Yoco&apos;s Create Web POS device API with this name. Yoco assigns the device ID used for
              card charges.
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
              3) Copy your live public key and live secret key into these fields.
            </Text>
          </View>
        ) : null}

        <View style={twStyle("mb-2 rounded-xl bg-blue-50 p-3")}>
          <Text style={twStyle("text-xs text-blue-700")}>
            Use your Yoco API credentials for Web POS. Dashboard menus can change, so open Yoco docs from your portal if
            you cannot find the keys quickly.
          </Text>
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Public Key *</Text>
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
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>Use your live public key for production.</Text>
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
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>Used for secure server-side Web POS requests.</Text>
        </View>

        <ActionButton
          label={connecting ? "Connecting…" : "Connect"}
          onPress={handleConnect}
          loading={connecting}
          disabled={!apiKey.trim() || !secretKey.trim()}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
