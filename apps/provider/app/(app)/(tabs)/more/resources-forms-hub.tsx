import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Resources & forms" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {forms.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No forms yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              Add intake and consent forms in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/forms" as never)}
              style={{ borderRadius: 12, backgroundColor: "#0d9488", paddingHorizontal: 24, paddingVertical: 12 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>Manage forms</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {forms.map((f) => (
              <View
                key={f.id}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{f.title}</Text>
                {f.form_type && (
                  <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500], textTransform: "capitalize" }}>{f.form_type.replace(/_/g, " ")}</Text>
                )}
                {f.fields?.length != null && (
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>{f.fields.length} field(s)</Text>
                )}
                {f.is_required && (
                  <View style={{ marginTop: 4, alignSelf: "flex-start", borderRadius: 4, backgroundColor: "#fef3c2", paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 12, color: "#92400e" }}>Required</Text>
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
