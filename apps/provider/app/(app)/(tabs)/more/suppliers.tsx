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
import { useTranslation } from "@beautonomi/i18n";
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
import { useRouter } from "expo-router";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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

const CATEGORY_VALUES = [
  { value: "all", labelKey: "categoryAll" },
  { value: "hair", labelKey: "categoryHair" },
  { value: "skincare", labelKey: "categorySkincare" },
  { value: "nails", labelKey: "categoryNails" },
  { value: "equipment", labelKey: "categoryEquipment" },
  { value: "general", labelKey: "categoryGeneral" },
] as const;

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

function categoryLabel(
  cat: string,
  s: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const match = CATEGORY_VALUES.find((c) => c.value === cat);
  return match ? s(match.labelKey) : cat;
}

function statusLabel(
  status: string,
  s: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (status === "active") return s("statusActive");
  if (status === "inactive") return s("statusInactive");
  return status;
}

export default function SuppliersScreen() {
  const { t } = useTranslation();
  const s = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.suppliers.${key}`, opts) as string,
    [t],
  );
  const categoryOptions = useMemo(
    () => CATEGORY_VALUES.map((c) => ({ label: s(c.labelKey), value: c.value })),
    [s],
  );
  const router = useRouter();
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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
      Alert.alert(s("requiredTitle"), s("nameRequired"));
      return;
    }
    if (form.phone.trim()) {
      const pe = validateE164Phone(form.phone);
      if (pe) {
        Alert.alert(s("invalidPhoneTitle"), pe);
        return;
      }
    }

    if (editMode && selectedSupplier) {
      const { error } = await updateSupplier(
        `/api/provider/suppliers/${selectedSupplier.id}`,
        form
      );
      if (error) {
        Alert.alert(s("errorTitle"), error);
        return;
      }
    } else {
      const { error } = await createSupplier(form);
      if (error) {
        Alert.alert(s("errorTitle"), error);
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
      s("deleteTitle"),
      s("deleteBody", { name: supplier.name }),
      [
        { text: s("cancel"), style: "cancel" },
        {
          text: s("delete"),
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteSupplier(
              `/api/provider/suppliers/${supplier.id}`
            );
            if (error) {
              Alert.alert(s("errorTitle"), error);
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
      Alert.alert(s("errorTitle"), s("dialerError"))
    );
  }

  function handleEmail(email: string) {
    Linking.openURL(`mailto:${email}`).catch(() =>
      Alert.alert(s("errorTitle"), s("emailClientError"))
    );
  }

  function handleWebsite(website: string) {
    const url = website.startsWith("http") ? website : `https://${website}`;
    pushInAppBrowser(router, url, s("website"));
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
          <View style={{ marginStart: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                {item.name}
              </Text>
              <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBg }}>
                <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: statusText }}>
                  {statusLabel(item.status, s)}
                </Text>
              </View>
            </View>
            {item.email && (
              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{item.email}</Text>
            )}
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
              <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: cat.bg, marginEnd: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: cat.text }}>
                  {categoryLabel(item.category, s)}
                </Text>
              </View>
              {item.product_count > 0 && (
                <Text style={{ fontSize: 11, color: Colors.gray[400] }}>
                  {s("productCount", { count: item.product_count })}
                </Text>
              )}
            </View>
          </View>
          <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" style={{ marginStart: 4, alignSelf: "center" }} />
        </View>

        {(item.phone || item.email || item.website) && (
          <View style={{ marginTop: 12, flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.gray[50], paddingTop: 12 }}>
            {item.phone && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#dcfce7", paddingHorizontal: 12, paddingVertical: 6, marginEnd: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleCall(item.phone!);
                }}
              >
                <Ionicons name="call-outline" size={13} color="#22c55e" />
                <Text style={{ marginStart: 4, fontSize: 12, fontWeight: "500", color: "#15803d" }}>{s("call")}</Text>
              </TouchableOpacity>
            )}
            {item.email && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#dbeafe", paddingHorizontal: 12, paddingVertical: 6, marginEnd: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleEmail(item.email!);
                }}
              >
                <Ionicons name="mail-outline" size={13} color="#3b82f6" />
                <Text style={{ marginStart: 4, fontSize: 12, fontWeight: "500", color: "#1d4ed8" }}>{s("email")}</Text>
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
                <Text style={{ marginStart: 4, fontSize: 12, fontWeight: "500", color: "#6d28d9" }}>{s("web")}</Text>
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
        title={s("title")}
        showBack
        subtitle={s("subtitle", { count: suppliers?.length ?? 0 })}
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
        <View style={{ flex: 1, marginEnd: 12 }}>
          <StatCard
            title={s("statTotal")}
            value={String(suppliers?.length ?? 0)}
            icon="business-outline"
            iconColor="#6366f1"
            iconBg="#eef2ff"
            compact
          />
        </View>
        <View style={{ flex: 1 }}>
          <StatCard
            title={s("statActive")}
            value={String(activeCount)}
            icon="checkmark-circle-outline"
            iconColor="#22c55e"
            iconBg="#dcfce7"
            compact
          />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={s("searchPlaceholder")} />
      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <FilterChipGroup
          options={categoryOptions}
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
          title={s("emptyTitle")}
          description={search || categoryFilter !== "all" ? s("emptyFiltered") : s("emptyDescription")}
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
        title={s("detailTitle")}
      >
        {selectedSupplier && (
          <View>
            <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}>
              <View style={{ height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#eef2ff" }}>
                <Ionicons name="business" size={26} color="#6366f1" />
              </View>
              <View style={{ marginStart: 12, flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                  {selectedSupplier.name}
                </Text>
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      borderRadius: 9999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginEnd: 8,
                      backgroundColor: selectedSupplier.status === "active" ? "#dcfce7" : Colors.gray[100],
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: selectedSupplier.status === "active" ? "#166534" : Colors.gray[500] }}>
                      {statusLabel(selectedSupplier.status, s)}
                    </Text>
                  </View>
                  {(() => {
                    const c = categoryColor(selectedSupplier.category);
                    return (
                      <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: "500", textTransform: "capitalize", color: c.text }}>
                          {categoryLabel(selectedSupplier.category, s)}
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
                  <Text style={{ marginStart: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.email}</Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.phone && (
                <TouchableOpacity style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }} onPress={() => handleCall(selectedSupplier.phone!)}>
                  <Ionicons name="call-outline" size={16} color="#6b7280" />
                  <Text style={{ marginStart: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.phone}</Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.address && (
                <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "flex-start" }}>
                  <Ionicons name="location-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                  <Text style={{ marginStart: 8, flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedSupplier.address}</Text>
                </View>
              )}
              {selectedSupplier.website && (
                <TouchableOpacity style={{ flexDirection: "row", alignItems: "center" }} onPress={() => handleWebsite(selectedSupplier.website!)}>
                  <Ionicons name="globe-outline" size={16} color="#6b7280" />
                  <Text style={{ marginStart: 8, flex: 1, fontSize: 14, color: "#4f46e5" }}>{selectedSupplier.website}</Text>
                </TouchableOpacity>
              )}
              {!selectedSupplier.email && !selectedSupplier.phone && !selectedSupplier.address && !selectedSupplier.website && (
                <Text style={{ fontSize: 14, color: Colors.gray[400] }}>{s("noContact")}</Text>
              )}
            </View>

            <View style={{ marginBottom: 16, flexDirection: "row" }}>
              <View style={{ flex: 1, marginEnd: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], padding: 12 }}>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{s("products")}</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{selectedSupplier.product_count}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], padding: 12 }}>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{s("totalOrders")}</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{selectedSupplier.total_orders}</Text>
              </View>
            </View>

            {selectedSupplier.notes && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{s("notes")}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.gray[700] }}>{selectedSupplier.notes}</Text>
              </View>
            )}

            {isLegacySupplier(selectedSupplier) && (
              <View style={{ marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
                <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
                  {s("legacyHint")}
                </Text>
              </View>
            )}

            {!isLegacySupplier(selectedSupplier) && (
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  style={{ flex: 1, marginEnd: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eef2ff", paddingVertical: 12 }}
                  onPress={() => openEditForm(selectedSupplier)}
                >
                  <Ionicons name="create-outline" size={16} color="#6366f1" />
                  <Text style={{ marginStart: 6, fontSize: 14, fontWeight: "500", color: "#4338ca" }}>{s("edit")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fee2e2", paddingVertical: 12 }}
                  onPress={() => handleDelete(selectedSupplier)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={{ marginStart: 6, fontSize: 14, fontWeight: "500", color: "#b91c1c" }}>{s("delete")}</Text>
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
        title={editMode ? s("editTitle") : s("newTitle")}
      >
        <View>
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("nameLabel")}</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.name}
            onChangeText={(text) => updateForm("name", text)}
            placeholder={s("namePlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("categoryLabel")}</Text>
          <View style={{ marginBottom: 12 }}>
            <FilterChipGroup
              options={categoryOptions.filter((c) => c.value !== "all")}
              selected={form.category}
              onSelect={(v) => updateForm("category", v)}
            />
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("emailLabel")}</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.email}
            onChangeText={(text) => updateForm("email", text)}
            placeholder={s("emailPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={{ marginBottom: 12 }}>
            <E164PhoneField
              label={s("phoneLabel")}
              valueE164={form.phone}
              onChangeE164={(e164) => updateForm("phone", e164)}
              compact
              muted
              accessibilityLabel={s("phoneA11y")}
            />
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("addressLabel")}</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.address}
            onChangeText={(text) => updateForm("address", text)}
            placeholder={s("addressPlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("websiteLabel")}</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.website}
            onChangeText={(text) => updateForm("website", text)}
            placeholder={s("websitePlaceholder")}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{s("notesLabel")}</Text>
          <TextInput
            style={{ marginBottom: 16, minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.notes}
            onChangeText={(text) => updateForm("notes", text)}
            placeholder={s("notesPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          <ActionButton
            label={editMode ? s("saveChanges") : s("addSupplier")}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
