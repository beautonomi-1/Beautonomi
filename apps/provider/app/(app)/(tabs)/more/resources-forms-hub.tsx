import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Form = {
  id: string;
  title: string;
  description?: string | null;
  form_type?: string | null;
  is_required?: boolean;
  is_active?: boolean;
  fields?: { name?: string; field_type?: string }[];
};

export default function ResourcesFormsHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Form[] | { data?: Form[] }>(
    "/api/provider/forms"
  );

  const forms: Form[] = Array.isArray(data) ? data : (data as { data?: Form[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Resources & forms" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Resources & forms" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Resources & forms"
        subtitle="Resources, intake & consent forms"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {forms.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No forms yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500 mb-4">
              Add intake and consent forms in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/forms" as never)}
              className="rounded-xl bg-teal-600 px-6 py-3"
              activeOpacity={0.8}
            >
              <Text className="font-semibold text-white">Manage forms</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="pb-4">
            {forms.map((f) => (
              <View
                key={f.id}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <Text className="font-semibold text-gray-900">{f.title}</Text>
                {f.form_type && (
                  <Text className="mt-0.5 text-xs text-gray-500 capitalize">{f.form_type.replace(/_/g, " ")}</Text>
                )}
                {f.fields?.length != null && (
                  <Text className="mt-2 text-sm text-gray-600">{f.fields.length} field(s)</Text>
                )}
                {f.is_required && (
                  <View className="mt-1 self-start rounded bg-amber-100 px-2 py-0.5">
                    <Text className="text-xs text-amber-800">Required</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
