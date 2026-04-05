import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/colors";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  category: string;
  status: "active" | "inactive";
  product_count: number;
  total_orders: number;
  created_at: string | null;
}

/** Legacy entries (from product.supplier text) are read-only; no edit/delete. */
const LEGACY_SUPPLIER_ID_PREFIX = "legacy:";
function isLegacySupplier(s: Supplier): boolean {
  return s.id.startsWith(LEGACY_SUPPLIER_ID_PREFIX);
}

interface SupplierForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  category: string;
}

const EMPTY_FORM: SupplierForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  notes: "",
  category: "general",
};

const CATEGORY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Hair", value: "hair" },
  { label: "Skincare", value: "skincare" },
  { label: "Nails", value: "nails" },
  { label: "Equipment", value: "equipment" },
  { label: "General", value: "general" },
];

function categoryColor(cat: string): { bg: string; text: string } {
  switch (cat) {
    case "hair":
      return { bg: "#faf5ff", text: "#7e22ce" };
    case "skincare":
      return { bg: "#fdf2f8", text: "#be185d" };
    case "nails":
      return { bg: "#fff1f2", text: "#be123c" };
    case "equipment":
      return { bg: "#eff6ff", text: "#1d4ed8" };
    default:
      return { bg: Colors.gray[100], text: Colors.gray[600] };
  }
}

export default function SuppliersScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);

  const { data: suppliers, loading, error: suppliersError, refresh } = useApi<Supplier[]>("/api/provider/suppliers");
  const { execute: createSupplier, loading: creating } = useApiPost<SupplierForm, Supplier>("/api/provider/suppliers");
  const { execute: updateSupplier, loading: updating } = useApiMutation<Supplier>("patch");
  const { execute: deleteSupplier } = useApiMutation<void>("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = suppliers ?? [];
    if (categoryFilter !== "all") {
      list = list.filter((s) => s.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.phone?.includes(q)
      );
    }
    return list;
  }, [suppliers, search, categoryFilter]);

  const activeCount = useMemo(
    () => (suppliers ?? []).filter((s) => s.status === "active").length,
    [suppliers]
  );

  function updateForm(key: keyof SupplierForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNewForm() {
    setForm(EMPTY_FORM);
    setEditMode(false);
    setShowForm(true);
  }

  function openEditForm(supplier: Supplier) {
    setForm({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      website: supplier.website ?? "",
      notes: supplier.notes ?? "",
      category: supplier.category,
    });
    setSelectedSupplier(supplier);
    setEditMode(true);
    setShowDetail(false);
    setShowForm(true);
  }

  function openDetail(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setShowDetail(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Supplier name is required");
      return;
    }
    if (form.phone.trim()) {
      const pe = validateE164Phone(form.phone);
      if (pe) {
        Alert.alert("Invalid phone", pe);
        return;
      }
    }

    if (editMode && selectedSupplier) {
      const { error } = await updateSupplier(
        `/api/provider/suppliers/${selectedSupplier.id}`,
        form
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createSupplier(form);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    setForm(EMPTY_FORM);
    refresh();
  }

  function handleDelete(supplier: Supplier) {
    Alert.alert(
      "Delete Supplier",
      `Are you sure you want to delete "${supplier.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteSupplier(
              `/api/provider/suppliers/${supplier.id}`
            );
            if (error) {
              Alert.alert("Error", error);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowDetail(false);
            setSelectedSupplier(null);
            refresh();
          },
        },
      ]
    );
  }

  function handleCall(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert("Error", "Could not open phone dialer")
    );
  }

  function handleEmail(email: string) {
    Linking.openURL(`mailto:${email}`).catch(() =>
      Alert.alert("Error", "Could not open email client")
    );
  }

  function handleWebsite(website: string) {
    const url = website.startsWith("http") ? website : `https://${website}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Could not open website")
    );
  }

  const renderSupplierItem = (item: Supplier) => {
    const cat = categoryColor(item.category);
    const statusBg = item.status === "active" ? "#dcfce7" : Colors.gray[100];
    const statusText = item.status === "active" ? "#166534" : Colors.gray[500];
    return (
      <TouchableOpacity
        key={item.id}
        style={{ marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eef2ff" }}>
            <Ionicons name="business-outline" size={20} color="#6366f1" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                {item.name}
              </Text>
              <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBg }}>
                <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: statusText }}>
                  {item.status}
                </Text>
              </View>
            </View>
            {item.email && (
              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{item.email}</Text>
            )}
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
              <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: cat.bg, marginRight: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: cat.text }}>
                  {item.category}
                </Text>
              </View>
              {item.product_count > 0 && (
                <Text style={{ fontSize: 11, color: Colors.gray[400] }}>
                  {item.product_count} product{item.product_count !== 1 ? "s" : ""}
                </Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 4, alignSelf: "center" }} />
        </View>

        {(item.phone || item.email || item.website) && (
          <View style={{ marginTop: 12, flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.gray[50], paddingTop: 12 }}>
            {item.phone && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#dcfce7", paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleCall(item.phone!);
                }}
              >
                <Ionicons name="call-outline" size={13} color="#22c55e" />
                <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: "#15803d" }}>Call</Text>
              </TouchableOpacity>
            )}
            {item.email && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#dbeafe", paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleEmail(item.email!);
                }}
              >
                <Ionicons name="mail-outline" size={13} color="#3b82f6" />
                <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: "#1d4ed8" }}>Email</Text>
              </TouchableOpacity>
            )}
            {item.website && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#f5f3ff", paddingHorizontal: 12, paddingVertical: 6 }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleWebsite(item.website!);
                }}
              >
                <Ionicons name="globe-outline" size={13} color="#8b5cf6" />
                <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: "#6d28d9" }}>Web</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer
      scrollable={true}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <ScreenHeader
        title="Suppliers"
        showBack
        subtitle={`${suppliers?.length ?? 0} suppliers`}
        rightAction={
          <TouchableOpacity
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: Colors.gray[900] }}
            onPress={openNewForm}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={{ marginBottom: 12, flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <StatCard
            title="Total Suppliers"
            value={String(suppliers?.length ?? 0)}
            icon="business-outline"
            iconColor="#6366f1"
            iconBg="#eef2ff"
            compact
          />
        </View>
        <View style={{ flex: 1 }}>
          <StatCard
            title="Active"
            value={String(activeCount)}
            icon="checkmark-circle-outline"
            iconColor="#22c55e"
            iconBg="#dcfce7"
            compact
          />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, email, or phone..." />
      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <FilterChipGroup
          options={CATEGORY_OPTIONS}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
        />
      </View>

      {loading && !suppliers ? (
        <SkeletonList rows={5} />
      ) : suppliersError && !suppliers ? (
        <ErrorState message={suppliersError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No suppliers found"
          description={search || categoryFilter !== "all" ? "Try adjusting your filters" : "Add suppliers to manage your product vendors"}
        />
      ) : (
        <View>
          {filtered.map((item) => renderSupplierItem(item))}
        </View>
      )}

      {/* Supplier Detail */}
      <BottomSheet
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        title="Supplier Details"
      >
        {selectedSupplier && (
          <View>
            <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}>
              <View style={{ height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#eef2ff" }}>
                <Ionicons name="business" size={26} color="#6366f1" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                  {selectedSupplier.name}
                </Text>
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      borderRadius: 9999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginRight: 8,
                      backgroundColor: selectedSupplier.status === "active" ? "#dcfce7" : Colors.gray[100],
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: selectedSupplier.status === "active" ? "#166534" : Colors.gray[500] }}>
                      {selectedSupplier.status}
                    </Text>
                  </View>
                  {(() => {
                    const c = categoryColor(selectedSupplier.category);
                    return (
                      <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: c.text }}>
                          {selectedSupplier.category}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            </View>

            <View style={{ marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
              {selectedSupplier.email && (
                <TouchableOpacity style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }} onPress={() => handleEmail(selectedSupplier.email!)}>
                  <Ionicons name="mail-outline" size={16} color="#6b7280" />
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.email}</Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.phone && (
                <TouchableOpacity style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }} onPress={() => handleCall(selectedSupplier.phone!)}>
                  <Ionicons name="call-outline" size={16} color="#6b7280" />
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.phone}</Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.address && (
                <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "flex-start" }}>
                  <Ionicons name="location-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.address}</Text>
                </View>
              )}
              {selectedSupplier.website && (
                <TouchableOpacity style={{ flexDirection: "row", alignItems: "center" }} onPress={() => handleWebsite(selectedSupplier.website!)}>
                  <Ionicons name="globe-outline" size={16} color="#6b7280" />
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, color: "#4f46e5" }}>{selectedSupplier.website}</Text>
                </TouchableOpacity>
              )}
              {!selectedSupplier.email && !selectedSupplier.phone && !selectedSupplier.address && !selectedSupplier.website && (
                <Text style={{ fontSize: 14, color: Colors.gray[400] }}>No contact information added</Text>
              )}
            </View>

            <View style={{ marginBottom: 16, flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], padding: 12 }}>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Products</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{selectedSupplier.product_count}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], padding: 12 }}>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Total Orders</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{selectedSupplier.total_orders}</Text>
              </View>
            </View>

            {selectedSupplier.notes && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Notes</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.gray[700] }}>{selectedSupplier.notes}</Text>
              </View>
            )}

            {isLegacySupplier(selectedSupplier) && (
              <View style={{ marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
                <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
                  This supplier is from your product list. Add them as a managed supplier to store contact details and edit.
                </Text>
              </View>
            )}

            {!isLegacySupplier(selectedSupplier) && (
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  style={{ flex: 1, marginRight: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eef2ff", paddingVertical: 12 }}
                  onPress={() => openEditForm(selectedSupplier)}
                >
                  <Ionicons name="create-outline" size={16} color="#6366f1" />
                  <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "500", color: "#4338ca" }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fee2e2", paddingVertical: 12 }}
                  onPress={() => handleDelete(selectedSupplier)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "500", color: "#b91c1c" }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </BottomSheet>

      {/* Add/Edit Form */}
      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editMode ? "Edit Supplier" : "New Supplier"}
      >
        <View>
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Supplier Name *</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.name}
            onChangeText={(t) => updateForm("name", t)}
            placeholder="e.g. Beauty Wholesale Co."
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Category</Text>
          <View style={{ marginBottom: 12 }}>
            <FilterChipGroup
              options={CATEGORY_OPTIONS.filter((c) => c.value !== "all")}
              selected={form.category}
              onSelect={(v) => updateForm("category", v)}
            />
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Email</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.email}
            onChangeText={(t) => updateForm("email", t)}
            placeholder="supplier@example.com"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={{ marginBottom: 12 }}>
            <E164PhoneField
              label="Phone"
              valueE164={form.phone}
              onChangeE164={(e164) => updateForm("phone", e164)}
              compact
              muted
              accessibilityLabel="Supplier phone"
            />
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.address}
            onChangeText={(t) => updateForm("address", t)}
            placeholder="Street address, city"
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Website</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.website}
            onChangeText={(t) => updateForm("website", t)}
            placeholder="www.example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Notes</Text>
          <TextInput
            style={{ marginBottom: 16, minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.notes}
            onChangeText={(t) => updateForm("notes", t)}
            placeholder="Additional notes about this supplier..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          <ActionButton
            label={editMode ? "Save Changes" : "Add Supplier"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
