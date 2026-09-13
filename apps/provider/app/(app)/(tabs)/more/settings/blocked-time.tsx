/**
 * Blocked time types – manage types (e.g. Lunch, Meeting) used when blocking calendar time.
 * Full native CRUD using /api/provider/blocked-time-types.
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

interface BlockedTimeType {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_COLORS = [Colors.primary, "#6366f1", "#0d9488", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function BlockedTimeScreen() {
  const { t } = useTranslation();
  const bt = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.blockedTimeTypes." + key, opts) as string,
    [t],
  );
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BlockedTimeType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  const { data, loading, error, refresh } = useApi<BlockedTimeType[] | { data?: BlockedTimeType[] }>(
    "/api/provider/blocked-time-types"
  );
  const { execute: postType, loading: creating } = useApiMutation<BlockedTimeType>("post");
  const { execute: patchType, loading: updating } = useApiMutation<BlockedTimeType>("patch");
  const { execute: deleteType } = useApiMutation("delete");

  const types: BlockedTimeType[] = Array.isArray(data)
    ? data
    : (data as { data?: BlockedTimeType[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(DEFAULT_COLORS[0]);
    setSheetOpen(true);
  };

  const openEdit = (row: BlockedTimeType) => {
    setEditing(row);
    setName(row.name);
    setDescription(row.description ?? "");
    setColor(row.color || DEFAULT_COLORS[0]);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(bt("requiredTitle"), bt("requiredBody"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (editing) {
      const { error: err } = await patchType(`/api/provider/blocked-time-types/${editing.id}`, {
        name: trimmed,
        description: description.trim() || null,
        color: color || undefined,
      });
      if (err) {
        Alert.alert(bt("errorTitle"), err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSheetOpen(false);
      refresh();
      return;
    }
    const { error: err } = await postType("/api/provider/blocked-time-types", {
      name: trimmed,
      description: description.trim() || undefined,
      color: color || undefined,
    });
    if (err) {
      Alert.alert(bt("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSheetOpen(false);
    refresh();
  };

  const handleDelete = (row: BlockedTimeType) => {
    Alert.alert(
      bt("deleteTitle"),
      bt("deleteBody", { name: row.name }),
      [
        { text: t("common.cancel") as string, style: "cancel" },
        {
          text: t("common.delete") as string,
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteType(`/api/provider/blocked-time-types/${row.id}`);
            if (err) Alert.alert(bt("errorTitle"), err);
            else refresh();
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={bt("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={bt("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={bt("title")}
        subtitle={bt("subtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {types.length === 0 ? (
          <View style={twStyle("px-4 py-12 items-center")}>
            <View style={twStyle("w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4")}>
              <Ionicons name="time-outline" size={32} color="#475569" />
            </View>
            <Text style={twStyle("text-lg font-semibold text-gray-900 text-center")}>{bt("emptyTitle")}</Text>
            <Text style={twStyle("mt-2 text-center text-gray-600")}>
              {bt("emptyBody")}
            </Text>
            <View style={twStyle("mt-6")}>
              <ActionButton
                label={bt("addType")}
                variant="secondary"
                onPress={openAdd}
                icon="add"
              />
            </View>
          </View>
        ) : (
          <View style={twStyle("px-4 pb-4")}>
            <TouchableOpacity
              style={twStyle("mb-4 flex-row items-center justify-center rounded-xl border border-dashed border-gray-300 py-3")}
              onPress={openAdd}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
              <Text style={twStyle("ms-2 font-medium text-indigo-600")}>{bt("addType")}</Text>
            </TouchableOpacity>
            {types.map((row) => (
              <View
                key={row.id}
                style={twStyle("mb-3 flex-row items-center rounded-xl border border-gray-200 bg-white p-4")}
              >
                <View
                  style={[twStyle("h-10 w-10 rounded-full"), { backgroundColor: row.color || "#e2e8f0" }]}
                />
                <View style={twStyle("ms-3 flex-1")}>
                  <Text style={twStyle("font-semibold text-gray-900")}>{row.name}</Text>
                  {row.description ? (
                    <Text style={twStyle("text-sm text-gray-500")} numberOfLines={1}>
                      {row.description}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={twStyle("me-2 min-h-[44px] min-w-[44px] items-center justify-center")}
                  onPress={() => openEdit(row)}
                  accessibilityLabel={bt("editA11y", { name: row.name })}
                >
                  <Ionicons name="pencil-outline" size={20} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
                  onPress={() => handleDelete(row)}
                  accessibilityLabel={bt("deleteA11y", { name: row.name })}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? bt("editTitle") : bt("addTitle")}
        snapHeight="half"
      >
        <View>
          <View style={{ marginBottom: 16 }}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{bt("name")}</Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={name}
              onChangeText={setName}
              placeholder={bt("namePlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{bt("description")}</Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={description}
              onChangeText={setDescription}
              placeholder={bt("descriptionPlaceholder")}
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{bt("color")}</Text>
            <View style={twStyle("flex-row flex-wrap")}>
              {DEFAULT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[twStyle("h-9 w-9 rounded-full border-2"), {
                    backgroundColor: c,
                    borderColor: color === c ? "#111" : "transparent",
                    borderWidth: color === c ? 2 : 0,
                    marginEnd: 8,
                    marginBottom: 8,
                  }]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </View>
          <ActionButton
            label={editing ? bt("saveChanges") : bt("addType")}
            variant="primary"
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
