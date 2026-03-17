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
import { RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { Ionicons } from "@expo/vector-icons";

/** Parse "Gate: 1234, Buzzer: Apt 5" into { gate: "1234", buzzer: "Apt 5" } */
function parseAccessCodesText(text: string): Record<string, string> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const out: Record<string, string> = {};
  const pairs = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.search(/[:=]/);
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim().toLowerCase().replace(/\s+/g, "_") || "code";
    const value = pair.slice(idx + 1).trim();
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Format access_codes object for display in text input */
function formatAccessCodesForDisplay(access_codes: Record<string, string> | null | undefined): string {
  if (!access_codes || typeof access_codes !== "object") return "";
  return Object.entries(access_codes)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
}

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
  apartment_unit?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  access_codes?: Record<string, string> | null;
  parking_instructions?: string | null;
  location_landmarks?: string | null;
}

export default function AddressesScreen() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [addLabel, setAddLabel] = useState("Home");
  const [addApartmentUnit, setAddApartmentUnit] = useState("");
  const [addBuildingName, setAddBuildingName] = useState("");
  const [addFloorNumber, setAddFloorNumber] = useState("");
  const [addAccessCodesText, setAddAccessCodesText] = useState("");
  const [addParkingInstructions, setAddParkingInstructions] = useState("");
  const [addLocationLandmarks, setAddLocationLandmarks] = useState("");
  const [pendingAddress, setPendingAddress] = useState<AddressPickerSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editApartmentUnit, setEditApartmentUnit] = useState("");
  const [editBuildingName, setEditBuildingName] = useState("");
  const [editFloorNumber, setEditFloorNumber] = useState("");
  const [editAccessCodesText, setEditAccessCodesText] = useState("");
  const [editParkingInstructions, setEditParkingInstructions] = useState("");
  const [editLocationLandmarks, setEditLocationLandmarks] = useState("");
  const [editPendingAddress, setEditPendingAddress] = useState<AddressPickerSelection | null>(null);
  const [editPickerVisible, setEditPickerVisible] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
      const payload: Record<string, unknown> = {
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
      };
      if (addApartmentUnit.trim()) payload.apartment_unit = addApartmentUnit.trim();
      if (addBuildingName.trim()) payload.building_name = addBuildingName.trim();
      if (addFloorNumber.trim()) payload.floor_number = addFloorNumber.trim();
      const parsedAccess = parseAccessCodesText(addAccessCodesText);
      if (parsedAccess) payload.access_codes = parsedAccess;
      if (addParkingInstructions.trim()) payload.parking_instructions = addParkingInstructions.trim();
      if (addLocationLandmarks.trim()) payload.location_landmarks = addLocationLandmarks.trim();
      const res = await api.post<SavedAddress>("/api/me/addresses", payload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to save address"));
      } else {
        setAddModalVisible(false);
        setPendingAddress(null);
        setAddLabel("Home");
        setAddApartmentUnit("");
        setAddBuildingName("");
        setAddFloorNumber("");
        setAddAccessCodesText("");
        setAddParkingInstructions("");
        setAddLocationLandmarks("");
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

  const openEditModal = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setEditLabel(addr.label || "");
    setEditApartmentUnit(addr.apartment_unit ?? "");
    setEditBuildingName(addr.building_name ?? "");
    setEditFloorNumber(addr.floor_number ?? "");
    setEditAccessCodesText(formatAccessCodesForDisplay(addr.access_codes));
    setEditParkingInstructions(addr.parking_instructions ?? "");
    setEditLocationLandmarks(addr.location_landmarks ?? "");
    setEditPendingAddress(null);
    setEditModalVisible(true);
  };

  const handleEditAddressSelect = (selection: AddressPickerSelection) => {
    setEditPendingAddress(selection);
    setEditPickerVisible(false);
  };

  const handleUpdateAddress = async () => {
    if (!user || !editingAddress) return;
    const label = (editLabel || "Address").trim();
    if (!label) {
      Alert.alert("Required", "Please enter a label (e.g. Home, Work)");
      return;
    }
    setUpdatingId(editingAddress.id);
    try {
      const payload: Record<string, unknown> = {
        label,
        is_default: editingAddress.is_default,
      };
      if (editPendingAddress?.structured) {
        payload.address_line1 = editPendingAddress.structured.address_line1;
        payload.address_line2 = editPendingAddress.structured.address_line2 ?? null;
        payload.city = editPendingAddress.structured.city;
        payload.state = editPendingAddress.structured.state ?? null;
        payload.postal_code = editPendingAddress.structured.postal_code ?? null;
        payload.country = editPendingAddress.structured.country;
        payload.latitude = editPendingAddress.latitude;
        payload.longitude = editPendingAddress.longitude;
      } else {
        payload.address_line1 = editingAddress.address_line1;
        payload.address_line2 = editingAddress.address_line2 ?? null;
        payload.city = editingAddress.city;
        payload.state = editingAddress.state ?? null;
        payload.postal_code = editingAddress.postal_code ?? null;
        payload.country = editingAddress.country;
        if (editingAddress.latitude != null) payload.latitude = editingAddress.latitude;
        if (editingAddress.longitude != null) payload.longitude = editingAddress.longitude;
      }
      if (editApartmentUnit.trim()) payload.apartment_unit = editApartmentUnit.trim(); else payload.apartment_unit = null;
      if (editBuildingName.trim()) payload.building_name = editBuildingName.trim(); else payload.building_name = null;
      if (editFloorNumber.trim()) payload.floor_number = editFloorNumber.trim(); else payload.floor_number = null;
      const parsedAccess = parseAccessCodesText(editAccessCodesText);
      payload.access_codes = parsedAccess ?? null;
      if (editParkingInstructions.trim()) payload.parking_instructions = editParkingInstructions.trim(); else payload.parking_instructions = null;
      if (editLocationLandmarks.trim()) payload.location_landmarks = editLocationLandmarks.trim(); else payload.location_landmarks = null;
      const res = await api.put<SavedAddress>(`/api/me/addresses/${editingAddress.id}`, payload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to update address"));
      } else {
        setEditModalVisible(false);
        setEditingAddress(null);
        setEditLabel("");
        setEditPendingAddress(null);
        await load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to update address"));
    } finally {
      setUpdatingId(null);
    }
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
            style={{ marginTop: 16, flexDirection: "row", alignItems: "center", borderRadius: RADIUS_BUTTON, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 }}
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
            <View key={a.id} style={{ borderRadius: RADIUS_CARD, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 20, marginTop: index === 0 ? 0 : 16 }}>
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
                  <TouchableOpacity
                    onPress={() => openEditModal(a)}
                    style={{ marginRight: 8, borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                    accessibilityLabel="Edit address"
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil-outline" size={18} color={Colors.gray[600]} />
                  </TouchableOpacity>
                  {!a.is_default && (
                    <View style={{ marginRight: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleSetDefault(a.id)}
                      disabled={!!settingDefaultId}
                      style={{ borderRadius: RADIUS_INPUT, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
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
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: RADIUS_CARD, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingVertical: 18 }}
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
              style={{ marginBottom: 16, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14, color: Colors.gray[900] }}
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="Home"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address</Text>
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14 }}
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
              <View style={{ marginTop: 16, borderRadius: RADIUS_INPUT, backgroundColor: "#F0FDF4", padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#166534" }}>Selected</Text>
                <Text style={{ marginTop: 4, fontSize: 14, color: "#15803d" }}>
                  {pendingAddress.structured.address_line1}, {pendingAddress.structured.city},{" "}
                  {pendingAddress.structured.country}
                </Text>
              </View>
            )}
            <Text style={{ marginTop: 24, marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>House call details (optional)</Text>
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Apartment / Unit</Text>
            <TextInput
              style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addApartmentUnit}
              onChangeText={setAddApartmentUnit}
              placeholder="e.g. 5B"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Building name</Text>
            <TextInput
              style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addBuildingName}
              onChangeText={setAddBuildingName}
              placeholder="e.g. Sunset Towers"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Floor</Text>
            <TextInput
              style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addFloorNumber}
              onChangeText={setAddFloorNumber}
              placeholder="e.g. 3"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Access codes</Text>
            <TextInput
              style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addAccessCodesText}
              onChangeText={setAddAccessCodesText}
              placeholder="Gate: 1234, Buzzer: Apt 5"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Parking instructions</Text>
            <TextInput
              style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addParkingInstructions}
              onChangeText={setAddParkingInstructions}
              placeholder="e.g. Visitor bay 12"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Landmarks</Text>
            <TextInput
              style={{ marginBottom: 16, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
              value={addLocationLandmarks}
              onChangeText={setAddLocationLandmarks}
              placeholder="e.g. Next to blue pharmacy"
              placeholderTextColor={Colors.gray[400]}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit address modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: Colors.white }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 16, paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={() => {
                setEditModalVisible(false);
                setEditingAddress(null);
                setEditPendingAddress(null);
              }}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.primary, fontWeight: "500" }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Edit address</Text>
            <TouchableOpacity
              onPress={handleUpdateAddress}
              disabled={!!updatingId}
              accessibilityLabel="Save changes"
              accessibilityRole="button"
            >
              {updatingId ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={{ fontWeight: "500", color: Colors.primary }}>Save</Text>
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
            {editingAddress && (
              <>
                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Label (e.g. Home, Work)</Text>
                <TextInput
                  style={{ marginBottom: 16, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editLabel}
                  onChangeText={setEditLabel}
                  placeholder="Home"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address</Text>
                <TouchableOpacity
                  onPress={() => setEditPickerVisible(true)}
                  style={{ flexDirection: "row", alignItems: "center", borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}
                  accessibilityLabel="Change address"
                  accessibilityRole="button"
                >
                  <Ionicons name="search-outline" size={20} color={Colors.gray[400]} />
                  <Text style={{ color: editPendingAddress ? Colors.gray[900] : Colors.gray[500], marginLeft: 10 }}>
                    {editPendingAddress?.structured
                      ? `${editPendingAddress.structured.address_line1}, ${editPendingAddress.structured.city}`
                      : `${editingAddress.address_line1}, ${editingAddress.city}`}
                  </Text>
                </TouchableOpacity>
                <AddressPicker
                  visible={editPickerVisible}
                  onClose={() => setEditPickerVisible(false)}
                  onSelect={handleEditAddressSelect}
                  onUseCurrentLocation={() => setEditPickerVisible(false)}
                  initialQuery={editingAddress ? `${editingAddress.address_line1}, ${editingAddress.city}` : undefined}
                />
                {editPendingAddress?.structured && (
                  <View style={{ marginTop: 16, borderRadius: RADIUS_INPUT, backgroundColor: "#F0FDF4", padding: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#166534" }}>Selected</Text>
                    <Text style={{ marginTop: 4, fontSize: 14, color: "#15803d" }}>
                      {editPendingAddress.structured.address_line1}, {editPendingAddress.structured.city},{" "}
                      {editPendingAddress.structured.country}
                    </Text>
                  </View>
                )}
                <Text style={{ marginTop: 24, marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>House call details (optional)</Text>
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Apartment / Unit</Text>
                <TextInput
                  style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editApartmentUnit}
                  onChangeText={setEditApartmentUnit}
                  placeholder="e.g. 5B"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Building name</Text>
                <TextInput
                  style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editBuildingName}
                  onChangeText={setEditBuildingName}
                  placeholder="e.g. Sunset Towers"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Floor</Text>
                <TextInput
                  style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editFloorNumber}
                  onChangeText={setEditFloorNumber}
                  placeholder="e.g. 3"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Access codes</Text>
                <TextInput
                  style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editAccessCodesText}
                  onChangeText={setEditAccessCodesText}
                  placeholder="Gate: 1234, Buzzer: Apt 5"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Parking instructions</Text>
                <TextInput
                  style={{ marginBottom: 12, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editParkingInstructions}
                  onChangeText={setEditParkingInstructions}
                  placeholder="e.g. Visitor bay 12"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={{ marginBottom: 6, fontSize: 13, color: Colors.gray[500] }}>Landmarks</Text>
                <TextInput
                  style={{ marginBottom: 16, borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900] }}
                  value={editLocationLandmarks}
                  onChangeText={setEditLocationLandmarks}
                  placeholder="e.g. Next to blue pharmacy"
                  placeholderTextColor={Colors.gray[400]}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenFrame>
  );
}
