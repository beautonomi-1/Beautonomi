/**
 * Forms – intake/consent/waiver forms.
 * GET /api/provider/forms, GET/PATCH/DELETE /api/provider/forms/[id]
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
  const { data: forms, loading, refresh } = useApi<Form[]>(
    `/api/provider/forms${filter ? `?form_type=${filter}` : ""}`
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const list = forms ?? [];

  if (loading && !forms) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading forms..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Forms"
        showBack
        subtitle="Intake, consent & waivers"
      />
      <View className="mb-3 flex-row gap-2">
        <TouchableOpacity
          className={`rounded-full px-4 py-2 ${!filter ? "bg-gray-900" : "bg-gray-100"}`}
          onPress={() => setFilter(null)}
        >
          <Text className={`text-sm font-medium ${!filter ? "text-white" : "text-gray-600"}`}>
            All
          </Text>
        </TouchableOpacity>
        {["intake", "consent", "waiver"].map((t) => (
          <TouchableOpacity
            key={t}
            className={`rounded-full px-4 py-2 ${filter === t ? "bg-gray-900" : "bg-gray-100"}`}
            onPress={() => setFilter(t)}
          >
            <Text className={`text-sm font-medium capitalize ${filter === t ? "text-white" : "text-gray-600"}`}>
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
          description="Create intake or consent forms in the provider portal."
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(f: Form) => f.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: Form }) => (
            <View className="mb-2 rounded-xl border border-gray-100 bg-white p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-gray-900">{item.title}</Text>
                <View className="rounded-full bg-gray-100 px-2 py-0.5">
                  <Text className="text-xs font-medium text-gray-600 capitalize">
                    {item.form_type}
                  </Text>
                </View>
              </View>
              {item.description ? (
                <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View className="mt-2 flex-row items-center gap-2">
                <Ionicons name="list-outline" size={14} color="#9ca3af" />
                <Text className="text-xs text-gray-500">
                  {item.fields?.length ?? 0} field{(item.fields?.length ?? 0) !== 1 ? "s" : ""}
                </Text>
                {item.is_required && (
                  <View className="rounded bg-amber-100 px-1.5 py-0.5">
                    <Text className="text-[10px] font-medium text-amber-700">Required</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
      <View className="h-8" />
    </ScreenContainer>
  );
}
