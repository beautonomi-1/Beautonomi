import { useState, useCallback, useMemo } from "react";
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
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatCard } from "@/components/ui/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface ReferralSource {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  client_count?: number;
  created_at?: string;
}

const SOURCE_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  instagram: { icon: "logo-instagram", color: "#e1306c" },
  facebook: { icon: "logo-facebook", color: "#1877f2" },
  google: { icon: "logo-google", color: "#4285f4" },
  tiktok: { icon: "logo-tiktok", color: "#000000" },
  twitter: { icon: "logo-twitter", color: "#1da1f2" },
  website: { icon: "globe-outline", color: "#6366f1" },
  friend: { icon: "people-outline", color: "#22c55e" },
  walk_in: { icon: "walk-outline", color: "#f59e0b" },
};

function getSourceIcon(name: string): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const key = name.toLowerCase().replace(/\s+/g, "_");
  return SOURCE_ICONS[key] ?? { icon: "git-network-outline", color: "#6b7280" };
}

export default function ReferralSourcesScreen() {
  const { t } = useTranslation();
  const rs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.referralSources.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReferralSource | null>(null);
  const [form, setForm] = useState({ name: "", description: "", isActive: true });

  const { data: sources, loading, error: loadError, refresh } = useApi<ReferralSource[]>(
    "/api/provider/referral-sources"
  );
  const { execute: createSource, loading: creating } = useApiPost<any, any>(
    "/api/provider/referral-sources"
  );
  const { execute: updateSource, loading: updating } = useApiMutation("patch");
  const { execute: deleteSource } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!sources) return [];
    if (!search.trim()) return sources;
    const q = search.toLowerCase();
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
    );
  }, [sources, search]);

  const stats = useMemo(() => {
    if (!sources) return { total: 0, active: 0, totalClients: 0 };
    return {
      total: sources.length,
      active: sources.filter((s) => s.is_active).length,
      totalClients: sources.reduce((sum, s) => sum + (s.client_count ?? 0), 0),
    };
  }, [sources]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", isActive: true });
    setShowForm(true);
  }

  function openEdit(source: ReferralSource) {
    setEditing(source);
    setForm({
      name: source.name,
      description: source.description ?? "",
      isActive: source.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert(rs("requiredTitle"), rs("nameRequired"));
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      is_active: form.isActive,
    };

    if (editing) {
      const { error } = await updateSource(
        `/api/provider/referral-sources/${editing.id}`,
        payload
      );
      if (error) { Alert.alert(rs("errorTitle"), error); return; }
    } else {
      const { error } = await createSource(payload);
      if (error) { Alert.alert(rs("errorTitle"), error); return; }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(source: ReferralSource) {
    const { error } = await updateSource(
      `/api/provider/referral-sources/${source.id}`,
      { is_active: !source.is_active }
    );
    if (error) Alert.alert(rs("errorTitle"), error);
    else refresh();
  }

  function handleDelete(source: ReferralSource) {
    Alert.alert(rs("deleteTitle"), rs("deleteBody", { name: source.name }), [
      { text: rs("cancel"), style: "cancel" },
      {
        text: rs("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteSource(
            `/api/provider/referral-sources/${source.id}`
          );
          if (error) Alert.alert(rs("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={rs("title")}
        showBack
        subtitle={rs("subtitle")}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3")}>
        <Text style={twStyle("text-xs text-blue-800")}>
          <Text style={twStyle("font-semibold")}>{rs("attributionLead")}</Text>
          {rs("attributionBody")}
        </Text>
      </View>

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
          <StatCard title={rs("statTotal")} value={String(stats.total)} icon="git-network-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
          <StatCard title={rs("statActive")} value={String(stats.active)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title={rs("statClients")} value={String(stats.totalClients)} icon="people-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={rs("searchPlaceholder")} />

      <View style={twStyle("mt-3")} />

      {loading && !sources && !loadError ? (
        <SkeletonList rows={5} />
      ) : loadError && !sources ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="git-network-outline"
          title={rs("emptyTitle")}
          description={search ? rs("emptySearch") : rs("emptyHint")}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(s: ReferralSource) => s.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: source }: { item: ReferralSource }) => {
            const si = getSourceIcon(source.name);
            return (
              <TouchableOpacity
                style={twStyle(`rounded-xl border bg-white p-4 ${
                  source.is_active ? "border-gray-100" : "border-gray-100 opacity-60"
                }`)}
                onPress={() => openEdit(source)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={[twStyle("h-10 w-10 items-center justify-center rounded-xl"), { backgroundColor: si.color + "15" }]}
                  >
                    <Ionicons name={si.icon} size={18} color={si.color} />
                  </View>
                  <View style={twStyle("ms-3 flex-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Text style={[twStyle("text-sm font-semibold text-gray-900"), { marginEnd: 8 }]}>{source.name}</Text>
                      {!source.is_active && (
                        <View style={twStyle("rounded-full bg-gray-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] text-gray-500")}>{rs("inactive")}</Text>
                        </View>
                      )}
                    </View>
                    {source.description && (
                      <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={1}>
                        {source.description}
                      </Text>
                    )}
                    {source.client_count != null && source.client_count > 0 && (
                      <Text style={twStyle("mt-0.5 text-xs text-indigo-600")}>
                        {rs("clientsCount", { count: source.client_count })}
                      </Text>
                    )}
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    <Switch
                      value={source.is_active}
                      onValueChange={() => handleToggleActive(source)}
                      trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                      thumbColor={source.is_active ? "#6366f1" : "#f4f4f5"}
                      style={{ marginEnd: 8, transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                    <TouchableOpacity onPress={() => handleDelete(source)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? rs("editTitle") : rs("newTitle")}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rs("nameLabel")}</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
            placeholder={rs("namePlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{rs("description")}</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(text) => setForm((p) => ({ ...p, description: text }))}
            placeholder={rs("descriptionPlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{rs("active")}</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.isActive ? "#6366f1" : "#f4f4f5"}
            />
          </View>

          <ActionButton
            label={editing ? rs("updateSource") : rs("addSource")}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
