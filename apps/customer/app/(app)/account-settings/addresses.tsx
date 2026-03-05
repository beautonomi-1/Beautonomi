import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { AddressPicker, type AddressPickerSelection } from "@/components/AddressPicker";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
}

export default function AddressesScreen() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [addLabel, setAddLabel] = useState("Home");
  const [pendingAddress, setPendingAddress] = useState<AddressPickerSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/addresses");
      if (res.error) {
        setError(res.error.message || "Failed to load");
        setAddresses([]);
      } else {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setAddresses(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddAddressSelect = (selection: AddressPickerSelection) => {
    setPendingAddress(selection);
    setPickerVisible(false);
  };

  const handleSaveNewAddress = async () => {
    if (!user || !pendingAddress?.structured) return;
    const label = (addLabel || "Address").trim();
    if (!label) {
      Alert.alert("Required", "Please enter a label (e.g. Home, Work)");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<SavedAddress>("/api/me/addresses", {
        label,
        address_line1: pendingAddress.structured.address_line1,
        address_line2: pendingAddress.structured.address_line2 ?? null,
        city: pendingAddress.structured.city,
        state: pendingAddress.structured.state ?? null,
        postal_code: pendingAddress.structured.postal_code ?? null,
        country: pendingAddress.structured.country,
        latitude: pendingAddress.latitude,
        longitude: pendingAddress.longitude,
        is_default: addresses.length === 0,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message ?? "Failed to save address");
      } else {
        setAddModalVisible(false);
        setPendingAddress(null);
        setAddLabel("Home");
        await load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save address");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setSettingDefaultId(id);
    try {
      const res = await api.put<SavedAddress>(`/api/me/addresses/${id}`, {
        is_default: true,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message ?? "Failed to set default");
      } else {
        await load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to set default");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDelete = (addr: SavedAddress) => {
    Alert.alert(
      "Delete address",
      `Remove "${addr.label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(addr.id);
            try {
              const res = await api.delete(`/api/me/addresses/${addr.id}`);
              if (res.error) {
                Alert.alert("Error", res.error.message ?? "Failed to delete");
              } else {
                await load();
              }
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenFrame
      loading={loading}
      error={error}
      onRetry={load}
    >
      {addresses.length === 0 && (
        <View className="mb-6 items-center py-8">
          <Text className="text-center text-gray-500">No saved addresses</Text>
          <TouchableOpacity
            onPress={() => setAddModalVisible(true)}
            className="mt-4 flex-row items-center gap-2 rounded-xl bg-primary px-5 py-3"
            accessibilityLabel="Add address"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text className="font-medium text-white">Add address</Text>
          </TouchableOpacity>
        </View>
      )}
      {addresses.length > 0 && (
        <View className="gap-3 pb-6">
          {addresses.map((a) => (
            <View
              key={a.id}
              className="rounded-xl border border-gray-100 bg-white p-4"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">
                    {a.label || "Address"}
                  </Text>
                  <Text className="mt-1 text-gray-600">{a.address_line1}</Text>
                  {a.address_line2 && (
                    <Text className="text-gray-600">{a.address_line2}</Text>
                  )}
                  <Text className="text-gray-600">
                    {a.city}, {a.country}
                  </Text>
                  {a.is_default && (
                    <View className="mt-2 self-start rounded bg-primary/20 px-2 py-0.5">
                      <Text className="text-xs font-medium text-primary">
                        Default
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center gap-2">
                  {!a.is_default && (
                    <TouchableOpacity
                      onPress={() => handleSetDefault(a.id)}
                      disabled={!!settingDefaultId}
                      className="rounded-lg bg-gray-100 px-3 py-2"
                      accessibilityLabel="Set as default"
                      accessibilityRole="button"
                    >
                      {settingDefaultId === a.id ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Ionicons name="star-outline" size={18} color="#6b7280" />
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(a)}
                    disabled={!!deletingId}
                    className="rounded-lg bg-red-50 px-3 py-2"
                    accessibilityLabel="Delete address"
                    accessibilityRole="button"
                  >
                    {deletingId === a.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => setAddModalVisible(true)}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 py-4"
            accessibilityLabel="Add new address"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            <Text className="font-medium text-primary">Add address</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add address modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
            <TouchableOpacity
              onPress={() => {
                setAddModalVisible(false);
                setPendingAddress(null);
              }}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text className="text-primary font-medium">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold text-gray-900">Add address</Text>
            <TouchableOpacity
              onPress={handleSaveNewAddress}
              disabled={!pendingAddress?.structured || saving}
              accessibilityLabel="Save address"
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text
                  className={`font-medium ${pendingAddress?.structured && !saving ? "text-primary" : "text-gray-400"}`}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
            <Text className="mb-2 text-sm font-medium text-gray-700">
              Label (e.g. Home, Work)
            </Text>
            <TextInput
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900"
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="Home"
              placeholderTextColor="#9ca3af"
            />
            <Text className="mb-2 text-sm font-medium text-gray-700">
              Address
            </Text>
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              className="flex-row items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
              accessibilityLabel="Search address"
              accessibilityRole="button"
            >
              <Ionicons name="search-outline" size={20} color="#9ca3af" />
              <Text className={pendingAddress ? "text-gray-900" : "text-gray-500"}>
                {pendingAddress?.structured
                  ? `${pendingAddress.structured.address_line1}, ${pendingAddress.structured.city}`
                  : "Search for an address"}
              </Text>
            </TouchableOpacity>
            <AddressPicker
              visible={pickerVisible}
              onClose={() => setPickerVisible(false)}
              onSelect={handleAddAddressSelect}
              onUseCurrentLocation={() => setPickerVisible(false)}
            />
            {pendingAddress?.structured && (
              <View className="mt-4 rounded-xl bg-green-50 p-3">
                <Text className="text-sm font-medium text-green-800">Selected</Text>
                <Text className="mt-1 text-sm text-green-700">
                  {pendingAddress.structured.address_line1}, {pendingAddress.structured.city},{" "}
                  {pendingAddress.structured.country}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScreenFrame>
  );
}
