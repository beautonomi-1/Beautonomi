import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { twStyle } from "@/lib/twStyle";

interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  type: "internal" | "client_visible" | "system";
  category: string | null;
  is_active: boolean;
}

const TYPE_OPTIONS = [
  { label: "Internal", value: "internal" },
  { label: "Client Visible", value: "client_visible" },
];

type FilterType = "all" | "internal" | "client_visible";

export default function NoteTemplatesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [previewing, setPreviewing] = useState<NoteTemplate | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [form, setForm] = useState({
    name: "",
    content: "",
    type: "internal",
    category: "",
  });

  const { data: templates, loading, refresh } = useApi<NoteTemplate[]>(
    "/api/provider/note-templates"
  );
  const { execute: createTemplate, loading: creating } = useApiPost<any, any>(
    "/api/provider/note-templates"
  );
  const { execute: updateTemplate, loading: updating } =
    useApiMutation("patch");
  const { execute: deleteTemplate } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const categories = useMemo(() => {
    if (!templates) return [];
    const cats = new Set<string>();
    templates.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    let result = [...templates];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.content.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") {
      result = result.filter((t) => t.type === filterType);
    }
    return result;
  }, [templates, search, filterType]);

  const internalCount = useMemo(
    () => templates?.filter((t) => t.type === "internal").length ?? 0,
    [templates]
  );
  const clientVisibleCount = useMemo(
    () => templates?.filter((t) => t.type === "client_visible").length ?? 0,
    [templates]
  );

  function openCreate() {
    setEditing(null);
    setForm({ name: "", content: "", type: "internal", category: "" });
    setShowForm(true);
  }

  function openEdit(tmpl: NoteTemplate) {
    setEditing(tmpl);
    setForm({
      name: tmpl.name,
      content: tmpl.content,
      type: tmpl.type,
      category: tmpl.category ?? "",
    });
    setShowForm(true);
  }

  function openPreview(tmpl: NoteTemplate) {
    setPreviewing(tmpl);
    setShowPreview(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) {
      Alert.alert("Required", "Name and content are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      content: form.content.trim(),
      type: form.type,
      category: form.category.trim() || null,
    };
    if (editing) {
      const { error } = await updateTemplate(
        `/api/provider/note-templates/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createTemplate(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleDuplicate(tmpl: NoteTemplate) {
    const { error } = await createTemplate({
      name: `${tmpl.name} (Copy)`,
      content: tmpl.content,
      type: tmpl.type,
      category: tmpl.category,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function handleCopyContent(tmpl: NoteTemplate) {
    await Clipboard.setStringAsync(tmpl.content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Template content copied to clipboard");
  }

  function handleDelete(tmpl: NoteTemplate) {
    Alert.alert("Delete Template", `Delete "${tmpl.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteTemplate(
            `/api/provider/note-templates/${tmpl.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Note Templates"
        showBack
        subtitle={`${templates?.length ?? 0} templates`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {templates && templates.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard
              title="Internal"
              value={String(internalCount)}
              icon="lock-closed-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Client Visible"
              value={String(clientVisibleCount)}
              icon="eye-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
        </View>
      )}

      {templates && templates.length > 2 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search templates..."
          />
          <View style={twStyle("mt-2")}>
            <FilterChipGroup
              options={[
                { label: "All", value: "all" },
                { label: "Internal", value: "internal" },
                { label: "Client Visible", value: "client_visible" },
              ]}
              selected={filterType}
              onSelect={(v) => setFilterType(v as FilterType)}
            />
          </View>
        </View>
      )}

      {/* Category chips */}
      {categories.length > 0 && !search && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={twStyle("mb-3")}
        >
          <View style={twStyle("flex-row")}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[twStyle("rounded-full bg-indigo-50 px-3 py-1.5"), { marginRight: 8 }]}
                onPress={() => setSearch(cat)}
              >
                <Text style={twStyle("text-xs font-medium text-indigo-600")}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {loading && !templates ? (
        <SkeletonList rows={4} />
      ) : !filtered.length ? (
        <EmptyState
          icon="document-text-outline"
          title={search || filterType !== "all" ? "No matches" : "No templates"}
          description={
            search || filterType !== "all"
              ? "Try different filters"
              : "Create reusable note templates for bookings"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t: NoteTemplate) => t.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: tmpl }: { item: NoteTemplate }) => (
            <TouchableOpacity
              style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() => openEdit(tmpl)}
              onLongPress={() => openPreview(tmpl)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {tmpl.name}
                  </Text>
                  <Text
                    style={twStyle("mt-1 text-xs text-gray-500")}
                    numberOfLines={2}
                  >
                    {tmpl.content}
                  </Text>
                </View>
                <View style={twStyle("ml-2 flex-row items-center")}>
                  <TouchableOpacity
                    style={[twStyle("p-1"), { marginRight: 4 }]}
                    onPress={() => handleCopyContent(tmpl)}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color="#6366f1"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[twStyle("p-1"), { marginRight: 4 }]}
                    onPress={() => handleDuplicate(tmpl)}
                  >
                    <Ionicons
                      name="duplicate-outline"
                      size={16}
                      color="#3b82f6"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twStyle("p-1")}
                    onPress={() => handleDelete(tmpl)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color="#ef4444"
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={twStyle("mt-2 flex-row items-center")}>
                <View
                  style={[twStyle(`rounded-full px-2 py-0.5 ${
                    tmpl.type === "internal" ? "bg-indigo-50" : "bg-green-50"
                  }`), { marginRight: 8 }]}
                >
                  <Text
                    style={twStyle(`text-[10px] font-medium ${
                      tmpl.type === "internal"
                        ? "text-indigo-600"
                        : "text-green-600"
                    }`)}
                  >
                    {tmpl.type === "internal" ? "Internal" : "Client Visible"}
                  </Text>
                </View>
                {tmpl.category && (
                  <View style={twStyle("rounded-full bg-gray-100 px-2 py-0.5")}>
                    <Text style={twStyle("text-[10px] text-gray-600")}>
                      {tmpl.category}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create / Edit form */}
      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Template" : "New Template"}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Name *
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Post-Treatment Care"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Content *
          </Text>
          <TextInput
            style={twStyle("mb-3 min-h-[100px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.content}
            onChangeText={(t) => setForm((p) => ({ ...p, content: t }))}
            placeholder="Template content..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Type</Text>
          <View style={twStyle("mb-3 flex-row")}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[twStyle(`rounded-full px-4 py-2 ${
                  form.type === opt.value ? "bg-indigo-600" : "bg-gray-100"
                }`), { marginRight: 8 }]}
                onPress={() => setForm((p) => ({ ...p, type: opt.value }))}
              >
                <Text
                  style={twStyle(`text-sm ${
                    form.type === opt.value
                      ? "font-medium text-white"
                      : "text-gray-700"
                  }`)}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Category
          </Text>
          <ChipCombobox
            singleSelect
            value={form.category || null}
            onChange={(v) => setForm((p) => ({ ...p, category: v ?? "" }))}
            staticSuggestions={categories.map((c) => ({ value: c, label: c }))}
            placeholder="e.g. Aftercare, Booking notes"
            accessibilityLabel="Category"
          />
          <View style={twStyle("mt-2")}>
            <ActionButton
              label={editing ? "Update" : "Create"}
              onPress={handleSave}
              loading={creating || updating}
              fullWidth
            />
          </View>
        </View>
      </BottomSheet>

      {/* Preview sheet */}
      <BottomSheet
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        title="Template Preview"
      >
        {previewing && (
          <View>
            <Text style={twStyle("mb-2 text-base font-semibold text-gray-900")}>
              {previewing.name}
            </Text>
            <View style={twStyle("rounded-xl bg-gray-50 p-4")}>
              <Text style={twStyle("text-sm leading-5 text-gray-700")}>
                {previewing.content}
              </Text>
            </View>
            <View style={twStyle("mt-3 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
                <ActionButton
                  label="Copy Content"
                  onPress={() => handleCopyContent(previewing)}
                  variant="outline"
                  fullWidth
                />
              </View>
              <View style={twStyle("flex-1")}>
                <ActionButton
                  label="Edit"
                  onPress={() => {
                    setShowPreview(false);
                    openEdit(previewing);
                  }}
                  fullWidth
                />
              </View>
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
