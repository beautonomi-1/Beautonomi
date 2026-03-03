/**
 * Yoco Device Management Screen
 * List, add, edit, and delete Yoco Web POS and card machine devices.
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

interface Location {
  id: string;
  name: string;
}

type DeviceType = "web_pos" | "card_machine";

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
    reload: reloadIntegration,
  } = useYocoIntegration();
  const { data: locations } = useApi<Location[]>("/api/provider/locations");

  // Form state
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editDevice, setEditDevice] = useState<YocoDevice | null>(null);
  const [showConnectSheet, setShowConnectSheet] = useState(false);

  const [formName, setFormName] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formType, setFormType] = useState<DeviceType>("web_pos");
  const [formLocationId, setFormLocationId] = useState<string | null>(null);
  const [formActive, setFormActive] = useState(true);

  // Yoco API key form
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [connecting, setConnecting] = useState(false);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormSerial("");
    setFormType("web_pos");
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
    setFormSerial(device.serial_number);
    setFormType(device.device_type);
    setFormLocationId(device.location_id);
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
        serial_number: formSerial.trim(),
        device_type: formType,
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
        serial_number: formSerial.trim(),
        device_type: formType,
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
            if (ok) reloadIntegration();
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
        className="mb-4 rounded-2xl border border-gray-100 bg-white p-4"
        accessibilityLabel="Yoco integration status"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Ionicons name="card-outline" size={20} color="#3b82f6" />
            </View>
            <View className="ml-3">
              <Text className="text-base font-semibold text-gray-900">Yoco</Text>
              <Text className="text-xs text-gray-500">Card & tap-to-pay</Text>
            </View>
          </View>
          <View
            className={`rounded-full px-3 py-1 ${isConnected ? "bg-green-50" : "bg-gray-100"}`}
          >
            <View className="flex-row items-center">
              <View
                className={`mr-1.5 h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`}
              />
              <Text
                className={`text-xs font-medium ${isConnected ? "text-green-700" : "text-gray-500"}`}
              >
                {isConnected ? "Connected" : "Not connected"}
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-3 flex-row gap-2">
          {isConnected ? (
            <TouchableOpacity
              onPress={handleDisconnect}
              className="flex-1 items-center rounded-xl border border-red-200 bg-red-50 py-2.5"
              accessibilityRole="button"
              accessibilityLabel="Disconnect Yoco"
            >
              <Text className="text-sm font-medium text-red-600">Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setShowConnectSheet(true)}
              className="flex-1 items-center rounded-xl bg-indigo-600 py-2.5"
              accessibilityRole="button"
              accessibilityLabel="Connect Yoco"
            >
              <Text className="text-sm font-medium text-white">Connect Yoco</Text>
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
        <View className="items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12">
          <Ionicons name="link-outline" size={36} color="#9ca3af" />
          <Text className="mt-3 text-sm font-medium text-gray-500">
            Connect Yoco first
          </Text>
          <Text className="mt-1 text-xs text-gray-400">
            Add your API keys to manage devices
          </Text>
        </View>
      ) : devices.length === 0 ? (
        <EmptyState
          icon="phone-portrait-outline"
          title="No devices yet"
          description="Add a Yoco Web POS or card machine device"
          actionLabel="Add Device"
          onAction={openAdd}
        />
      ) : (
        <View className="gap-3">
          {devices.map((device) => (
            <View
              key={device.id}
              className="rounded-2xl border border-gray-100 bg-white p-4"
              accessibilityLabel={`${device.name} device`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <View
                    className={`h-10 w-10 items-center justify-center rounded-lg ${
                      device.is_active ? "bg-indigo-50" : "bg-gray-100"
                    }`}
                  >
                    <Ionicons
                      name={device.device_type === "web_pos" ? "phone-portrait-outline" : "card-outline"}
                      size={20}
                      color={device.is_active ? "#6366f1" : "#9ca3af"}
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-gray-900">{device.name}</Text>
                    <Text className="text-xs text-gray-500">
                      {device.device_type === "web_pos" ? "Web POS" : "Card Machine"}
                      {device.serial_number ? ` · ${device.serial_number}` : ""}
                    </Text>
                    {device.location_name && (
                      <Text className="text-xs text-gray-400">{device.location_name}</Text>
                    )}
                  </View>
                </View>

                <View className="flex-row items-center gap-2">
                  <View
                    className={`rounded-full px-2 py-0.5 ${device.is_active ? "bg-green-50" : "bg-gray-100"}`}
                  >
                    <Text className={`text-xs ${device.is_active ? "text-green-600" : "text-gray-400"}`}>
                      {device.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(device)}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${device.name}`}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(device)}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
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

      <View className="h-8" />

      {/* ─── Add/Edit Device Sheet ─── */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title={editDevice ? "Edit Device" : "Add Device"}
        snapHeight="auto"
      >
        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-gray-700">Device Name *</Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Front Desk Terminal"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Device name"
          />
        </View>

        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-gray-700">Serial Number</Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={formSerial}
            onChangeText={setFormSerial}
            placeholder="e.g. YC123456"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Serial number"
          />
        </View>

        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-gray-700">Device Type</Text>
          <View className="flex-row gap-2">
            {(["web_pos", "card_machine"] as const).map((type) => {
              const sel = formType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setFormType(type)}
                  className={`flex-1 items-center rounded-xl border py-3 ${
                    sel ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-gray-50"
                  }`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                >
                  <Ionicons
                    name={type === "web_pos" ? "phone-portrait-outline" : "card-outline"}
                    size={20}
                    color={sel ? "#6366f1" : "#6b7280"}
                  />
                  <Text
                    className={`mt-1 text-xs font-medium ${sel ? "text-indigo-700" : "text-gray-600"}`}
                  >
                    {type === "web_pos" ? "Web POS" : "Card Machine"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {Array.isArray(locations) && locations.length > 0 && (
          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Location</Text>
            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity
                onPress={() => setFormLocationId(null)}
                className={`rounded-full px-3 py-1.5 ${
                  !formLocationId ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: !formLocationId }}
              >
                <Text
                  className={`text-xs font-medium ${!formLocationId ? "text-white" : "text-gray-600"}`}
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
                    className={`rounded-full px-3 py-1.5 ${
                      sel ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <Text
                      className={`text-xs font-medium ${sel ? "text-white" : "text-gray-600"}`}
                    >
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {editDevice && (
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Active</Text>
            <Switch
              value={formActive}
              onValueChange={setFormActive}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={formActive ? "#6366f1" : "#f3f4f6"}
            />
          </View>
        )}

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
        <View className="mb-2 rounded-xl bg-blue-50 p-3">
          <Text className="text-xs text-blue-700">
            Find your API keys in your Yoco dashboard under Settings → API Keys.
          </Text>
        </View>

        <View className="mb-4">
          <Text className="mb-1.5 text-sm font-medium text-gray-700">API Key *</Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="pk_live_..."
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Yoco API key"
          />
        </View>

        <View className="mb-6">
          <Text className="mb-1.5 text-sm font-medium text-gray-700">Secret Key *</Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={secretKey}
            onChangeText={setSecretKey}
            placeholder="sk_live_..."
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Yoco secret key"
          />
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
