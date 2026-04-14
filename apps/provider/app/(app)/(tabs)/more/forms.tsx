import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Colors } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormType = "intake" | "consent" | "waiver";
type FieldType = "text" | "checkbox" | "signature" | "date";

interface FormField {
  id: string;
  name: string;
  field_type: FieldType;
  is_required: boolean;
  sort_order: number;
}

/** Matches API response from GET /api/provider/forms */
interface FormTemplate {
  id: string;
  title: string;
  description: string | null;
  form_type: FormType;
  is_required: boolean;
  is_active: boolean;
  fields: FormField[];
  created_at: string;
  updated_at?: string;
}

interface FormData {
  title: string;
  description: string;
  form_type: FormType;
  is_required: boolean;
}

interface FieldFormData {
  name: string;
  field_type: FieldType;
  is_required: boolean;
}

const EMPTY_FORM: FormData = {
  title: "",
  description: "",
  form_type: "intake",
  is_required: false,
};

const EMPTY_FIELD: FieldFormData = {
  name: "",
  field_type: "text",
  is_required: false,
};

const FORM_TYPES: { label: string; value: FormType }[] = [
  { label: "Intake", value: "intake" },
  { label: "Consent", value: "consent" },
  { label: "Waiver", value: "waiver" },
];

const FIELD_TYPES: { label: string; value: FieldType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Text", value: "text", icon: "text-outline" },
  { label: "Checkbox", value: "checkbox", icon: "checkbox-outline" },
  { label: "Signature", value: "signature", icon: "pencil-outline" },
  { label: "Date", value: "date", icon: "calendar-outline" },
];

const SUGGESTED_FORMS = [
  { title: "Client Intake", type: "intake" as FormType, description: "Basic client information and health history" },
  { title: "COVID Waiver", type: "waiver" as FormType, description: "COVID-19 safety acknowledgment" },
  { title: "Consent Form", type: "consent" as FormType, description: "Service consent and liability waiver" },
];

function getTypeColor(type: FormType): { color: string; bg: string } {
  switch (type) {
    case "intake": return { color: "#3b82f6", bg: "#eff6ff" };
    case "consent": return { color: "#22c55e", bg: "#f0fdf4" };
    case "waiver": return { color: "#f59e0b", bg: "#fffbeb" };
  }
}

function getTypeIcon(type: FormType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "intake": return "clipboard-outline";
    case "consent": return "checkmark-circle-outline";
    case "waiver": return "shield-checkmark-outline";
  }
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function FormsScreen({ embedded }: { embedded?: boolean } = {}) {
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingForm, setEditingForm] = useState<FormTemplate | null>(null);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [fieldForm, setFieldForm] = useState<FieldFormData>(EMPTY_FIELD);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const { data: forms, loading, refresh } = useApi<FormTemplate[]>("/api/provider/forms");
  const { execute: createForm, loading: creating } = useApiPost<any, any>("/api/provider/forms");
  const { execute: mutateForm } = useApiMutation("put");
  const { execute: deleteForm } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  function openAddForm() {
    setEditingForm(null);
    setForm(EMPTY_FORM);
    setShowFormModal(true);
  }

  function openEditForm(template: FormTemplate) {
    setEditingForm(template);
    setForm({
      title: template.title,
      description: template.description ?? "",
      form_type: template.form_type,
      is_required: template.is_required,
    });
    setShowFormModal(true);
  }

  function openAddField(formId: string) {
    setActiveFormId(formId);
    setFieldForm(EMPTY_FIELD);
    setShowFieldModal(true);
  }

  async function handleSaveForm() {
    if (!form.title.trim()) {
      Alert.alert("Error", "Form title is required");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      form_type: form.form_type,
      is_required: form.is_required,
    };

    if (editingForm) {
      const { error } = await mutateForm(
        `/api/provider/forms/${editingForm.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createForm(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }

    setShowFormModal(false);
    refresh();
  }

  async function handleSaveField() {
    if (!fieldForm.name.trim() || !activeFormId) {
      Alert.alert("Error", "Field name is required");
      return;
    }

    const payload = {
      name: fieldForm.name.trim(),
      field_type: fieldForm.field_type,
      is_required: fieldForm.is_required,
    };

    const { error } = await mutateForm(
      `/api/provider/forms/${activeFormId}/fields`,
      payload
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }

    setShowFieldModal(false);
    refresh();
  }

  async function handleDeleteForm(template: FormTemplate) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete Form", `Delete "${template.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteForm(
            `/api/provider/forms/${template.id}`,
            {}
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  async function handleDeleteField(formId: string, fieldId: string) {
    Alert.alert("Remove Field", "Remove this field from the form?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteForm(
            `/api/provider/forms/${formId}/fields/${fieldId}`,
            {}
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  async function handleToggleActive(template: FormTemplate) {
    const { error } = await mutateForm(
      `/api/provider/forms/${template.id}`,
      { is_active: !template.is_active }
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleSuggestion(suggestion: typeof SUGGESTED_FORMS[0]) {
    setEditingForm(null);
    setForm({
      title: suggestion.title,
      description: suggestion.description,
      form_type: suggestion.type,
      is_required: false,
    });
    setShowFormModal(true);
  }

  function updateForm(key: keyof FormData, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateFieldForm(key: keyof FieldFormData, value: any) {
    setFieldForm((prev) => ({ ...prev, [key]: value }));
  }

  const inner = (
    <>
      {/* Add button */}
      <TouchableOpacity
        style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.gray[900], paddingVertical: 12 }}
        onPress={openAddForm}
        accessibilityLabel="Add new form"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.white }}>Add Form</Text>
      </TouchableOpacity>

      {/* Form list */}
      {loading && !forms ? (
        <LoadingState />
      ) : !forms || forms.length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="document-text-outline"
            title="No forms yet"
            description="Create intake forms, consent forms, or waivers for your clients"
          />

          {/* Suggestions */}
          <View style={{ marginTop: 16 }}>
            <SectionHeader title="Quick Start" />
            <View>
              {SUGGESTED_FORMS.map((s, i) => {
                const typeStyle = getTypeColor(s.type);
                return (
                  <TouchableOpacity
                    key={s.title}
                    style={{ flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16, marginTop: i === 0 ? 0 : 8 }}
                    onPress={() => handleSuggestion(s)}
                    accessibilityLabel={`Create ${s.title}`}
                    accessibilityRole="button"
                  >
                    <View style={{ backgroundColor: typeStyle.bg, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                      <Ionicons name={getTypeIcon(s.type)} size={20} color={typeStyle.color} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{s.title}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{s.description}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : (
        <FlatList
          data={forms}
          keyExtractor={(f: FormTemplate) => f.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: template }: { item: FormTemplate }) => {
            const typeStyle = getTypeColor(template.form_type);
            const isExpanded = expandedForm === template.id;

            return (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                  backgroundColor: Colors.white,
                  opacity: template.is_active ? 1 : 0.6,
                }}
              >
                {/* Header */}
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", padding: 16 }}
                  onPress={() =>
                    setExpandedForm(isExpanded ? null : template.id)
                  }
                  onLongPress={() => handleDeleteForm(template)}
                  accessibilityLabel={`${isExpanded ? "Collapse" : "Expand"} ${template.title}`}
                  accessibilityRole="button"
                >
                  <View
                    style={{ backgroundColor: typeStyle.bg, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}
                  >
                    <Ionicons
                      name={getTypeIcon(template.form_type)}
                      size={20}
                      color={typeStyle.color}
                    />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                      {template.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                      <Text
                        style={{ fontSize: 12, textTransform: "capitalize", color: typeStyle.color, marginRight: 8 }}
                      >
                        {template.form_type}
                      </Text>
                      {template.is_required && (
                        <Text style={{ fontSize: 12, color: "#ef4444", marginRight: 8 }}>Required</Text>
                      )}
                      <Text style={{ fontSize: 12, color: Colors.gray[400] }}>
                        {template.fields?.length ?? 0} fields
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleToggleActive(template)}
                      accessibilityLabel={`Toggle ${template.title} active status`}
                      accessibilityRole="switch"
                      style={{ marginRight: 8 }}
                    >
                      <View
                        style={{
                          height: 24,
                          width: 40,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 9999,
                          backgroundColor: template.is_active ? "#22c55e" : Colors.gray[300],
                        }}
                      >
                        <View
                          style={{
                            height: 16,
                            width: 16,
                            borderRadius: 8,
                            backgroundColor: Colors.white,
                            marginLeft: template.is_active ? 16 : 0,
                            marginRight: template.is_active ? 0 : 16,
                          }}
                        />
                      </View>
                    </TouchableOpacity>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#9ca3af"
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded: fields */}
                {isExpanded && (
                  <View style={{ borderTopWidth: 1, borderTopColor: Colors.gray[50], paddingHorizontal: 16, paddingBottom: 16 }}>
                    {template.description && (
                      <Text style={{ marginTop: 12, fontSize: 14, color: Colors.gray[500] }}>
                        {template.description}
                      </Text>
                    )}

                    {/* Fields list */}
                    {template.fields && template.fields.length > 0 ? (
                      <View style={{ marginTop: 12 }}>
                        {template.fields.map((field: FormField, fi: number) => {
                          const fieldMeta = FIELD_TYPES.find(
                            (ft) => ft.value === field.field_type
                          );
                          return (
                            <View
                              key={field.id}
                              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, backgroundColor: Colors.gray[50], paddingHorizontal: 12, paddingVertical: 10, marginTop: fi === 0 ? 0 : 8 }}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                <Ionicons
                                  name={fieldMeta?.icon ?? "text-outline"}
                                  size={16}
                                  color="#6b7280"
                                />
                                <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[700] }}>
                                  {field.name}
                                </Text>
                                {field.is_required && (
                                  <Text style={{ marginLeft: 4, fontSize: 12, color: "#ef4444" }}>*</Text>
                                )}
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={{ fontSize: 12, color: Colors.gray[400], textTransform: "capitalize", marginRight: 8 }}>
                                  {field.field_type}
                                </Text>
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() =>
                                    handleDeleteField(template.id, field.id)
                                  }
                                  accessibilityLabel={`Remove ${field.name} field`}
                                  accessibilityRole="button"
                                >
                                  <Ionicons
                                    name="close-circle"
                                    size={18}
                                    color="#d1d5db"
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={{ marginTop: 12, fontSize: 14, color: Colors.gray[400], fontStyle: "italic" }}>
                        No fields added yet
                      </Text>
                    )}

                    {/* Actions */}
                    <View style={{ marginTop: 12, flexDirection: "row" }}>
                      <TouchableOpacity
                        style={{ flex: 1, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#eef2ff", paddingVertical: 10 }}
                        onPress={() => openAddField(template.id)}
                        accessibilityLabel="Add field"
                        accessibilityRole="button"
                      >
                        <Ionicons name="add" size={16} color="#6366f1" />
                        <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "500", color: "#4f46e5" }}>
                          Add Field
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[100], paddingVertical: 10 }}
                        onPress={() => openEditForm(template)}
                        accessibilityLabel="Edit form"
                        accessibilityRole="button"
                      >
                        <Ionicons name="pencil" size={14} color="#6b7280" />
                        <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                          Edit
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Form template modal */}
      <BottomSheet
        visible={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingForm ? "Edit Form" : "New Form"}
      >
        <View>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Title *</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder="Form title"
              placeholderTextColor="#9ca3af"
              value={form.title}
              onChangeText={(v) => updateForm("title", v)}
              accessibilityLabel="Form title"
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Description</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder="Describe this form"
              placeholderTextColor="#9ca3af"
              value={form.description}
              onChangeText={(v) => updateForm("description", v)}
              multiline
              accessibilityLabel="Form description"
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Form Type</Text>
            <View style={{ flexDirection: "row" }}>
              {FORM_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    borderRadius: 12,
                    paddingVertical: 12,
                    marginRight: 8,
                    backgroundColor: form.form_type === t.value ? Colors.gray[900] : Colors.white,
                    borderWidth: form.form_type === t.value ? 0 : 1,
                    borderColor: Colors.gray[200],
                  }}
                  onPress={() => updateForm("form_type", t.value)}
                  accessibilityLabel={`Set form type to ${t.label}`}
                  accessibilityRole="button"
                >
                  <Text
                    style={{ fontSize: 14, fontWeight: "500", color: form.form_type === t.value ? Colors.white : Colors.gray[600] }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 16, color: Colors.gray[700] }}>Required for all clients</Text>
            <Switch
              value={form.is_required}
              onValueChange={(v) => updateForm("is_required", v)}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              accessibilityLabel="Required toggle"
            />
          </View>

          <ActionButton
            label={editingForm ? "Save Changes" : "Create Form"}
            onPress={handleSaveForm}
            loading={creating}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Add field modal */}
      <BottomSheet
        visible={showFieldModal}
        onClose={() => setShowFieldModal(false)}
        title="Add Field"
      >
        <View>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Field Name *</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder="e.g. Full Name, Date of Birth"
              placeholderTextColor="#9ca3af"
              value={fieldForm.name}
              onChangeText={(v) => updateFieldForm("name", v)}
              accessibilityLabel="Field name"
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Field Type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {FIELD_TYPES.map((ft) => (
                <TouchableOpacity
                  key={ft.value}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    marginRight: 8,
                    marginBottom: 8,
                    backgroundColor: fieldForm.field_type === ft.value ? Colors.gray[900] : Colors.white,
                    borderWidth: fieldForm.field_type === ft.value ? 0 : 1,
                    borderColor: Colors.gray[200],
                  }}
                  onPress={() => updateFieldForm("field_type", ft.value)}
                  accessibilityLabel={`Set field type to ${ft.label}`}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={ft.icon}
                    size={16}
                    color={fieldForm.field_type === ft.value ? "#fff" : "#6b7280"}
                  />
                  <Text
                    style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: fieldForm.field_type === ft.value ? Colors.white : Colors.gray[600] }}
                  >
                    {ft.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 16, color: Colors.gray[700] }}>Required</Text>
            <Switch
              value={fieldForm.is_required}
              onValueChange={(v) => updateFieldForm("is_required", v)}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              accessibilityLabel="Field required toggle"
            />
          </View>

          <ActionButton label="Add Field" onPress={handleSaveField} fullWidth />
        </View>
      </BottomSheet>
    </>
  );
  if (embedded) return <View style={{ flex: 1, minHeight: 0 }}>{inner}</View>;
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Forms"
        showBack
        subtitle={`${forms?.length ?? 0} form templates`}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFormModal(true);
            }}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#e0f2fe", paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={16} color="#0c4a6e" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0c4a6e" }}>Create</Text>
          </TouchableOpacity>
        }
      />
      {inner}
    </ScreenContainer>
  );
}
