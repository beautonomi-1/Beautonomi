/**
 * Forms – intake/consent/waiver forms.
 * GET /api/provider/forms, GET/PATCH/DELETE /api/provider/forms/[id]
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface FormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

interface Form {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  fields: FormField[];
}

export default function FormsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<"intake" | "consent" | "waiver">("intake");
  const { data: forms, loading, error: loadError, refresh } = useApi<Form[]>(
    `/api/provider/forms${filter ? `?form_type=${filter}` : ""}`
  );
  const { execute: createForm } = useApiMutation("post");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleCreateForm = useCallback(async () => {
    if (!newTitle.trim()) {
      Alert.alert("Missing title", "Enter a form title.");
      return;
    }
    setCreating(true);
    const { error } = await createForm("/api/provider/forms", {
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      form_type: newType,
      is_required: false,
    });
    setCreating(false);
    if (error) {
      Alert.alert("Could not create form", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    setNewTitle("");
    setNewDescription("");
    setNewType("intake");
    refresh();
  }, [createForm, newDescription, newTitle, newType, refresh]);

  const list = forms ?? [];

  if (loading && !forms && !loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading forms..." />
      </ScreenContainer>
    );
  }

  if (loadError && !forms) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Forms" showBack />
        <ErrorState message={loadError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Forms"
        showBack
        subtitle="Intake, consent & waivers"
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCreateOpen(true);
            }}
            style={twStyle("flex-row items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2")}
          >
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginRight: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>Create</Text>
          </TouchableOpacity>
        }
      />
      <View style={twStyle("mb-3 flex-row")}>
        <TouchableOpacity
          style={[twStyle(`rounded-full px-4 py-2 ${!filter ? "bg-gray-900" : "bg-gray-100"}`), { marginRight: 8 }]}
          onPress={() => setFilter(null)}
        >
          <Text style={twStyle(`text-sm font-medium ${!filter ? "text-white" : "text-gray-600"}`)}>
            All
          </Text>
        </TouchableOpacity>
        {["intake", "consent", "waiver"].map((t) => (
          <TouchableOpacity
            key={t}
            style={[twStyle(`rounded-full px-4 py-2 ${filter === t ? "bg-gray-900" : "bg-gray-100"}`), { marginRight: 8 }]}
            onPress={() => setFilter(t)}
          >
            <Text style={twStyle(`text-sm font-medium capitalize ${filter === t ? "text-white" : "text-gray-600"}`)}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <SectionHeader title="Forms" />
      {list.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No forms"
          description="No forms yet. Create forms in your operations workflow and they will appear here."
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={list}
          keyExtractor={(f: Form) => f.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: Form }) => (
            <View style={twStyle("mb-2 rounded-xl border border-gray-100 bg-white p-4")}>
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.title}</Text>
                <View style={twStyle("rounded-full bg-gray-100 px-2 py-0.5")}>
                  <Text style={twStyle("text-xs font-medium text-gray-600 capitalize")}>
                    {item.form_type}
                  </Text>
                </View>
              </View>
              {item.description ? (
                <Text style={twStyle("mt-1 text-sm text-gray-500")} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={twStyle("mt-2 flex-row items-center")}>
                <Ionicons name="list-outline" size={14} color="#9ca3af" style={{ marginRight: 8 }} />
                <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 8 }]}>
                  {item.fields?.length ?? 0} field{(item.fields?.length ?? 0) !== 1 ? "s" : ""}
                </Text>
                {item.is_required && (
                  <View style={twStyle("rounded bg-amber-100 px-1.5 py-0.5")}>
                    <Text style={twStyle("text-[10px] font-medium text-amber-700")}>Required</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
      <BottomSheet
        visible={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Create form"
        subtitle="Build intake, consent, or waiver forms"
      >
        <View style={twStyle("gap-3 pb-6")}>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Title</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. New client intake"
              placeholderTextColor="#9ca3af"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Type</Text>
            <View style={twStyle("flex-row gap-2")}>
              {(["intake", "consent", "waiver"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setNewType(type)}
                  style={twStyle(`rounded-xl px-3 py-2 ${newType === type ? "bg-indigo-600" : "border border-gray-200 bg-white"}`)}
                >
                  <Text style={twStyle(`text-sm font-medium capitalize ${newType === type ? "text-white" : "text-gray-700"}`)}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Description (optional)</Text>
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Short description"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              style={twStyle("min-h-[88px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>
          <ActionButton
            label={creating ? "Creating..." : "Create form"}
            onPress={handleCreateForm}
            loading={creating}
            disabled={creating}
            fullWidth
          />
        </View>
      </BottomSheet>
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
