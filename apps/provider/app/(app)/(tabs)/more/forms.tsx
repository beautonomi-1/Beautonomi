import { useState, useCallback, useEffect } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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

const FORM_TYPES: { labelKey: string; value: FormType }[] = [
  { labelKey: "typeIntake", value: "intake" },
  { labelKey: "typeConsent", value: "consent" },
  { labelKey: "typeWaiver", value: "waiver" },
];

const FIELD_TYPES: { labelKey: string; value: FieldType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { labelKey: "fieldText", value: "text", icon: "text-outline" },
  { labelKey: "fieldCheckbox", value: "checkbox", icon: "checkbox-outline" },
  { labelKey: "fieldSignature", value: "signature", icon: "pencil-outline" },
  { labelKey: "fieldDate", value: "date", icon: "calendar-outline" },
];

const SUGGESTED_FORMS = [
  { titleKey: "suggestIntakeTitle", descKey: "suggestIntakeDesc", type: "intake" as FormType },
  { titleKey: "suggestCovidTitle", descKey: "suggestCovidDesc", type: "waiver" as FormType },
  { titleKey: "suggestConsentTitle", descKey: "suggestConsentDesc", type: "consent" as FormType },
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
  const { t } = useTranslation();
  const f = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.forms.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const expandParams = useLocalSearchParams<{ expandId?: string | string[] }>();
  const expandIdRaw = Array.isArray(expandParams.expandId)
    ? expandParams.expandId[0]
    : expandParams.expandId;
  const [refreshing, setRefreshing] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingForm, setEditingForm] = useState<FormTemplate | null>(null);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [fieldForm, setFieldForm] = useState<FieldFormData>(EMPTY_FIELD);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const { data: forms, loading, refresh } = useApi<FormTemplate[]>("/api/provider/forms");

  useEffect(() => {
    if (!expandIdRaw || !forms?.length) return;
    const exists = forms.some((f) => f.id === expandIdRaw);
    if (exists) setExpandedForm(expandIdRaw);
  }, [expandIdRaw, forms]);
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
      Alert.alert(f("errorTitle"), f("titleRequired"));
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
        Alert.alert(f("errorTitle"), error);
        return;
      }
    } else {
      const { error } = await createForm(payload);
      if (error) {
        Alert.alert(f("errorTitle"), error);
        return;
      }
    }

    setShowFormModal(false);
    refresh();
  }

  async function handleSaveField() {
    if (!fieldForm.name.trim() || !activeFormId) {
      Alert.alert(f("errorTitle"), f("fieldNameRequired"));
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
      Alert.alert(f("errorTitle"), error);
      return;
    }

    setShowFieldModal(false);
    refresh();
  }

  async function handleDeleteForm(template: FormTemplate) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(f("deleteFormTitle"), f("deleteFormBody", { title: template.title }), [
      { text: f("cancel"), style: "cancel" },
      {
        text: f("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteForm(
            `/api/provider/forms/${template.id}`,
            {}
          );
          if (error) Alert.alert(f("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  async function handleDeleteField(formId: string, fieldId: string) {
    Alert.alert(f("removeFieldTitle"), f("removeFieldBody"), [
      { text: f("cancel"), style: "cancel" },
      {
        text: f("remove"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteForm(
            `/api/provider/forms/${formId}/fields/${fieldId}`,
            {}
          );
          if (error) Alert.alert(f("errorTitle"), error);
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
    if (error) Alert.alert(f("errorTitle"), error);
    else refresh();
  }

  function handleSuggestion(suggestion: typeof SUGGESTED_FORMS[0]) {
    setEditingForm(null);
    setForm({
      title: f(suggestion.titleKey),
      description: f(suggestion.descKey),
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
        accessibilityLabel={f("addFormA11y")}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={{ marginStart: 8, fontWeight: "600", color: Colors.white }}>{f("addForm")}</Text>
      </TouchableOpacity>

      {/* Form list */}
      {loading && !forms ? (
        <LoadingState />
      ) : !forms || forms.length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="document-text-outline"
            title={f("emptyTitle")}
            description={f("emptyDescription")}
          />

          {/* Suggestions */}
          <View style={{ marginTop: 16 }}>
            <SectionHeader title={f("quickStart")} />
            <View>
              {SUGGESTED_FORMS.map((s, i) => {
                const typeStyle = getTypeColor(s.type);
                const suggestionTitle = f(s.titleKey);
                return (
                  <TouchableOpacity
                    key={s.titleKey}
                    style={{ flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16, marginTop: i === 0 ? 0 : 8 }}
                    onPress={() => handleSuggestion(s)}
                    accessibilityLabel={f("createSuggestionA11y", { title: suggestionTitle })}
                    accessibilityRole="button"
                  >
                    <View style={{ backgroundColor: typeStyle.bg, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                      <Ionicons name={getTypeIcon(s.type)} size={20} color={typeStyle.color} />
                    </View>
                    <View style={{ marginStart: 12, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{suggestionTitle}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{f(s.descKey)}</Text>
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
          {...verticalFlatListPerf}
          data={forms}
          keyExtractor={(item: FormTemplate) => item.id}
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
                  accessibilityLabel={isExpanded ? f("collapseA11y", { title: template.title }) : f("expandA11y", { title: template.title })}
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
                  <View style={{ marginStart: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                      {template.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                      <Text
                        style={{ fontSize: 12, textTransform: "capitalize", color: typeStyle.color, marginEnd: 8 }}
                      >
                        {FORM_TYPES.find((ft) => ft.value === template.form_type)
                          ? f(FORM_TYPES.find((ft) => ft.value === template.form_type)!.labelKey)
                          : template.form_type}
                      </Text>
                      {template.is_required && (
                        <Text style={{ fontSize: 12, color: "#ef4444", marginEnd: 8 }}>{f("required")}</Text>
                      )}
                      <Text style={{ fontSize: 12, color: Colors.gray[400] }}>
                        {f("fieldsCount", { count: template.fields?.length ?? 0 })}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleToggleActive(template)}
                      accessibilityLabel={f("toggleActiveA11y", { title: template.title })}
                      accessibilityRole="switch"
                      style={{ marginEnd: 8 }}
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
                            marginStart: template.is_active ? 16 : 0,
                            marginEnd: template.is_active ? 0 : 16,
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
                                <Text style={{ marginStart: 8, fontSize: 14, color: Colors.gray[700] }}>
                                  {field.name}
                                </Text>
                                {field.is_required && (
                                  <Text style={{ marginStart: 4, fontSize: 12, color: "#ef4444" }}>*</Text>
                                )}
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={{ fontSize: 12, color: Colors.gray[400], textTransform: "capitalize", marginEnd: 8 }}>
                                  {fieldMeta ? f(fieldMeta.labelKey) : field.field_type}
                                </Text>
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() =>
                                    handleDeleteField(template.id, field.id)
                                  }
                                  accessibilityLabel={f("removeFieldA11y", { name: field.name })}
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
                        {f("noFieldsYet")}
                      </Text>
                    )}

                    {/* Actions */}
                    <View style={{ marginTop: 12, flexDirection: "row" }}>
                      <TouchableOpacity
                        style={{ flex: 1, marginEnd: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#eef2ff", paddingVertical: 10 }}
                        onPress={() => openAddField(template.id)}
                        accessibilityLabel={f("addFieldA11y")}
                        accessibilityRole="button"
                      >
                        <Ionicons name="add" size={16} color="#6366f1" />
                        <Text style={{ marginStart: 4, fontSize: 14, fontWeight: "500", color: "#4f46e5" }}>
                          {f("addField")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[100], paddingVertical: 10 }}
                        onPress={() => openEditForm(template)}
                        accessibilityLabel={f("editFormA11y")}
                        accessibilityRole="button"
                      >
                        <Ionicons name="pencil" size={14} color="#6b7280" />
                        <Text style={{ marginStart: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                          {f("edit")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {/*
                      §Provider-launch (audit 2026-04): there is no
                      aggregate form_responses endpoint today — submitted
                      values are stored on each booking as
                      provider_form_responses and surface in the booking
                      detail screen. This CTA gives providers a direct
                      path to find them without promising UI that doesn't
                      exist yet.
                    */}
                    <TouchableOpacity
                      style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[50], paddingVertical: 10 }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push("/(app)/(tabs)/more/bookings" as never);
                      }}
                      accessibilityLabel={f("viewResponsesA11y")}
                      accessibilityRole="button"
                    >
                      <Ionicons name="reader-outline" size={14} color="#6b7280" />
                      <Text style={{ marginStart: 4, fontSize: 13, color: Colors.gray[600] }}>
                        {f("responsesOnBookings")}
                      </Text>
                    </TouchableOpacity>
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
        title={editingForm ? f("editFormTitle") : f("newFormTitle")}
      >
        <View>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{f("titleLabel")}</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder={f("titlePlaceholder")}
              placeholderTextColor="#9ca3af"
              value={form.title}
              onChangeText={(v) => updateForm("title", v)}
              accessibilityLabel={f("titleA11y")}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{f("descriptionLabel")}</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder={f("descriptionPlaceholder")}
              placeholderTextColor="#9ca3af"
              value={form.description}
              onChangeText={(v) => updateForm("description", v)}
              multiline
              accessibilityLabel={f("descriptionA11y")}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{f("formTypeLabel")}</Text>
            <View style={{ flexDirection: "row" }}>
              {FORM_TYPES.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    borderRadius: 12,
                    paddingVertical: 12,
                    marginEnd: 8,
                    backgroundColor: form.form_type === opt.value ? Colors.gray[900] : Colors.white,
                    borderWidth: form.form_type === opt.value ? 0 : 1,
                    borderColor: Colors.gray[200],
                  }}
                  onPress={() => updateForm("form_type", opt.value)}
                  accessibilityLabel={f("setFormTypeA11y", { label: f(opt.labelKey) })}
                  accessibilityRole="button"
                >
                  <Text
                    style={{ fontSize: 14, fontWeight: "500", color: form.form_type === opt.value ? Colors.white : Colors.gray[600] }}
                  >
                    {f(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/*
            §Provider-launch (audit 2026-04): the is_required flag is how
            a form template is "assigned" to every new booking — web uses
            the same field.  Rename the label so providers understand
            this is the assignment control rather than a per-field thing.
          */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flex: 1, paddingEnd: 12 }}>
              <Text style={{ fontSize: 16, color: Colors.gray[700] }}>{f("attachEveryBooking")}</Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                {f("attachEveryBookingDesc")}
              </Text>
            </View>
            <Switch
              value={form.is_required}
              onValueChange={(v) => updateForm("is_required", v)}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              accessibilityLabel={f("requiredToggleA11y")}
            />
          </View>

          <ActionButton
            label={editingForm ? f("saveChanges") : f("createForm")}
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
        title={f("addFieldTitle")}
      >
        <View>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{f("fieldNameLabel")}</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder={f("fieldNamePlaceholder")}
              placeholderTextColor="#9ca3af"
              value={fieldForm.name}
              onChangeText={(v) => updateFieldForm("name", v)}
              accessibilityLabel={f("fieldNameA11y")}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{f("fieldTypeLabel")}</Text>
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
                    marginEnd: 8,
                    marginBottom: 8,
                    backgroundColor: fieldForm.field_type === ft.value ? Colors.gray[900] : Colors.white,
                    borderWidth: fieldForm.field_type === ft.value ? 0 : 1,
                    borderColor: Colors.gray[200],
                  }}
                  onPress={() => updateFieldForm("field_type", ft.value)}
                  accessibilityLabel={f("setFieldTypeA11y", { label: f(ft.labelKey) })}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={ft.icon}
                    size={16}
                    color={fieldForm.field_type === ft.value ? "#fff" : "#6b7280"}
                  />
                  <Text
                    style={{ marginStart: 8, fontSize: 14, fontWeight: "500", color: fieldForm.field_type === ft.value ? Colors.white : Colors.gray[600] }}
                  >
                    {f(ft.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 16, color: Colors.gray[700] }}>{f("fieldRequired")}</Text>
            <Switch
              value={fieldForm.is_required}
              onValueChange={(v) => updateFieldForm("is_required", v)}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              accessibilityLabel={f("fieldRequiredA11y")}
            />
          </View>

          <ActionButton label={f("addField")} onPress={handleSaveField} fullWidth />
        </View>
      </BottomSheet>
    </>
  );
  if (embedded) return <View style={{ flex: 1, minHeight: 0 }}>{inner}</View>;
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={f("title")}
        showBack
        subtitle={f("subtitle", { count: forms?.length ?? 0 })}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openAddForm();
            }}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#e0f2fe", paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={16} color="#0c4a6e" style={{ marginEnd: 6 }} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0c4a6e" }}>{f("create")}</Text>
          </TouchableOpacity>
        }
      />
      {inner}
    </ScreenContainer>
  );
}
