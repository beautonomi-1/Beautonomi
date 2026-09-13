import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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
  const { t } = useTranslation();
  const rf = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.resourcesFormsHub.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Form[]>("/api/provider/forms");

  const forms: Form[] = Array.isArray(data) ? data : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openFormsEditor = useCallback(
    (expandId?: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (expandId) {
        router.push({
          pathname: "/(app)/(tabs)/more/forms",
          params: { expandId },
        } as never);
      } else {
        router.push("/(app)/(tabs)/more/forms" as never);
      }
    },
    [router],
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rf("title")} showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rf("title")} showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={rf("title")}
        subtitle={rf("subtitle")}
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => openFormsEditor()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 10,
              backgroundColor: "#ccfbf1",
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
            accessibilityLabel={rf("openEditorA11y")}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={16} color="#0f766e" style={{ marginEnd: 6 }} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#115e59" }}>{rf("forms")}</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/resources" as never);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 16,
            marginHorizontal: 8,
            marginBottom: 16,
          }}
          activeOpacity={0.8}
          accessibilityLabel={rf("roomsA11y")}
          accessibilityRole="button"
        >
          <View
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              backgroundColor: "#ccfbf1",
            }}
          >
            <Ionicons name="construct-outline" size={22} color="#0d9488" />
          </View>
          <View style={{ marginStart: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{rf("roomsTitle")}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
              {rf("roomsHint")}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginHorizontal: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>
            {rf("intakeTitle")}
          </Text>
          <TouchableOpacity
            onPress={() => openFormsEditor()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={rf("editAllA11y")}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0d9488" }}>{rf("manage")}</Text>
          </TouchableOpacity>
        </View>

        {forms.length === 0 ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>
              {rf("emptyTitle")}
            </Text>
            <Text
              style={{
                marginTop: 8,
                textAlign: "center",
                fontSize: 14,
                color: Colors.gray[500],
                marginBottom: 16,
              }}
            >
              {rf("emptyDescription")}
            </Text>
            <TouchableOpacity
              onPress={() => openFormsEditor()}
              style={{
                borderRadius: 12,
                backgroundColor: "#0d9488",
                paddingHorizontal: 24,
                paddingVertical: 12,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>{rf("createForms")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 8, paddingBottom: 16 }}>
            {forms.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => openFormsEditor(f.id)}
                activeOpacity={0.75}
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  padding: 16,
                }}
                accessibilityRole="button"
                accessibilityLabel={rf("editFormA11y", { title: f.title })}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingEnd: 8 }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{f.title}</Text>
                    {f.form_type ? (
                      <Text
                        style={{
                          marginTop: 2,
                          fontSize: 12,
                          color: Colors.gray[500],
                          textTransform: "capitalize",
                        }}
                      >
                        {String(f.form_type).replace(/_/g, " ")}
                      </Text>
                    ) : null}
                  </View>
                  <DirectionalIcon name="chevron-forward" size={18} color="#9ca3af" />
                </View>
                {f.fields?.length != null ? (
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>
                    {rf("fieldsCount", { count: f.fields.length })}
                  </Text>
                ) : null}
                {f.is_required ? (
                  <View
                    style={{
                      marginTop: 8,
                      alignSelf: "flex-start",
                      borderRadius: 4,
                      backgroundColor: "#fef3c2",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#92400e" }}>{rf("attachedToBookings")}</Text>
                  </View>
                ) : null}
                {!f.is_active ? (
                  <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[400] }}>{rf("inactive")}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
