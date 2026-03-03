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
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

interface BlockedTimeType {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_COLORS = ["#FF0077", "#6366f1", "#0d9488", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function BlockedTimeScreen() {
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
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(DEFAULT_COLORS[0]);
    setSheetOpen(true);
  };

  const openEdit = (t: BlockedTimeType) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setColor(t.color || DEFAULT_COLORS[0]);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter a name for this type (e.g. Lunch, Meeting).");
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
        Alert.alert("Error", err);
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
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSheetOpen(false);
    refresh();
  };

  const handleDelete = (t: BlockedTimeType) => {
    Alert.alert(
      "Delete type",
      `Remove "${t.name}"? Time blocks using this type will keep the name but no longer link to a type.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteType(`/api/provider/blocked-time-types/${t.id}`);
            if (err) Alert.alert("Error", err);
            else refresh();
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Blocked time types" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Blocked time types" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Blocked time types"
        subtitle="Types used when blocking calendar time"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {types.length === 0 ? (
          <View className="px-4 py-12 items-center">
            <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4">
              <Ionicons name="time-outline" size={32} color="#475569" />
            </View>
            <Text className="text-lg font-semibold text-gray-900 text-center">No types yet</Text>
            <Text className="mt-2 text-center text-gray-600">
              Add types like Lunch, Meeting or Personal so you can block time on your calendar.
            </Text>
            <View className="mt-6">
              <ActionButton
                label="Add type"
                variant="secondary"
                onPress={openAdd}
                icon="add"
              />
            </View>
          </View>
        ) : (
          <View className="px-4 pb-4">
            <TouchableOpacity
              className="mb-4 flex-row items-center justify-center rounded-xl border border-dashed border-gray-300 py-3"
              onPress={openAdd}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
              <Text className="ml-2 font-medium text-indigo-600">Add type</Text>
            </TouchableOpacity>
            {types.map((t) => (
              <View
                key={t.id}
                className="mb-3 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
              >
                <View
                  className="h-10 w-10 rounded-full"
                  style={{ backgroundColor: t.color || "#e2e8f0" }}
                />
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-gray-900">{t.name}</Text>
                  {t.description ? (
                    <Text className="text-sm text-gray-500" numberOfLines={1}>
                      {t.description}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  className="mr-2 min-h-[44px] min-w-[44px] items-center justify-center"
                  onPress={() => openEdit(t)}
                  accessibilityLabel={`Edit ${t.name}`}
                >
                  <Ionicons name="pencil-outline" size={20} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="min-h-[44px] min-w-[44px] items-center justify-center"
                  onPress={() => handleDelete(t)}
                  accessibilityLabel={`Delete ${t.name}`}
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
        title={editing ? "Edit type" : "Add blocked time type"}
        snapHeight="half"
      >
        <View className="gap-4">
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Name</Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lunch, Meeting"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </View>
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Description (optional)</Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={description}
              onChangeText={setDescription}
              placeholder="Short description"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View>
            <Text className="mb-2 text-sm font-medium text-gray-700">Color</Text>
            <View className="flex-row flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  className="h-9 w-9 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "#111" : "transparent",
                    borderWidth: color === c ? 2 : 0,
                  }}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </View>
          <ActionButton
            label={editing ? "Save changes" : "Add type"}
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
