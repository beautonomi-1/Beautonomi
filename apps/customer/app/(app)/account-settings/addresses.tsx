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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
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
        setError(getApiErrorMessage(res.error, "Failed to load"));
        setAddresses([]);
      } else {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setAddresses(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
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
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to save address"));
      } else {
        setAddModalVisible(false);
        setPendingAddress(null);
        setAddLabel("Home");
        await load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to save address"));
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
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to set default"));
      } else {
        await load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to set default"));
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
              Alert.alert("Error", getApiErrorMessage(e, "Failed to delete"));
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
        <View style={{ marginBottom: 24, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ textAlign: "center", color: Colors.gray[500] }}>No saved addresses</Text>
          <TouchableOpacity
            onPress={() => setAddModalVisible(true)}
            style={{ marginTop: 16, flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12 }}
            accessibilityLabel="Add address"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.white }}>Add address</Text>
          </TouchableOpacity>
        </View>
      )}
      {addresses.length > 0 && (
        <View style={{ paddingBottom: 24 }}>
          {addresses.map((a, index) => (
            <View key={a.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16, marginTop: index === 0 ? 0 : 12 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{a.label || "Address"}</Text>
                  <Text style={{ marginTop: 4, color: Colors.gray[600] }}>{a.address_line1}</Text>
                  {a.address_line2 && (
                    <Text style={{ color: Colors.gray[600] }}>{a.address_line2}</Text>
                  )}
                  <Text style={{ color: Colors.gray[600] }}>{a.city}, {a.country}</Text>
                  {a.is_default && (
                    <View style={{ marginTop: 8, alignSelf: "flex-start", borderRadius: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.primary }}>Default</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {!a.is_default && (
                    <View style={{ marginRight: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleSetDefault(a.id)}
                      disabled={!!settingDefaultId}
                      style={{ borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                      accessibilityLabel="Set as default"
                      accessibilityRole="button"
                    >
                      {settingDefaultId === a.id ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Ionicons name="star-outline" size={18} color={Colors.gray[600]} />
                      )}
                    </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(a)}
                    disabled={!!deletingId}
                    style={{ borderRadius: 8, backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 8 }}
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
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingVertical: 16 }}
            accessibilityLabel="Add new address"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.primary }}>Add address</Text>
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
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: Colors.white }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 16, paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={() => {
                setAddModalVisible(false);
                setPendingAddress(null);
              }}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.primary, fontWeight: "500" }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Add address</Text>
            <TouchableOpacity
              onPress={handleSaveNewAddress}
              disabled={!pendingAddress?.structured || saving}
              accessibilityLabel="Save address"
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={{ fontWeight: "500", color: pendingAddress?.structured && !saving ? Colors.primary : Colors.gray[400] }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 220 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Label (e.g. Home, Work)</Text>
            <TextInput
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="Home"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address</Text>
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}
              accessibilityLabel="Search address"
              accessibilityRole="button"
            >
              <Ionicons name="search-outline" size={20} color={Colors.gray[400]} />
              <Text style={{ color: pendingAddress ? Colors.gray[900] : Colors.gray[500] }}>
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
              <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: "#F0FDF4", padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#166534" }}>Selected</Text>
                <Text style={{ marginTop: 4, fontSize: 14, color: "#15803d" }}>
                  {pendingAddress.structured.address_line1}, {pendingAddress.structured.city},{" "}
                  {pendingAddress.structured.country}
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenFrame>
  );
}
