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
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  currency: string;
  discount_percent: number;
  is_active: boolean;
  subscriber_count?: number;
  monthly_revenue?: number;
  benefits?: string[];
  created_at: string;
}

interface PlansResponse {
  plans: MembershipPlan[];
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const INITIAL_FORM = {
  name: "",
  description: "",
  priceMonthly: "",
  discountPercent: "",
  isActive: true,
  benefits: "",
};

export default function MembershipPlansScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showDetail, setShowDetail] = useState<MembershipPlan | null>(null);

  const { data: rawData, loading, refresh } = useApi<PlansResponse>(
    "/api/provider/membership-plans"
  );
  const plans = useMemo(
    () => rawData?.plans ?? (Array.isArray(rawData) ? (rawData as MembershipPlan[]) : []),
    [rawData]
  );
  const { execute: createPlan, loading: creating } = useApiPost<any, any>(
    "/api/provider/membership-plans"
  );
  const { execute: updatePlan, loading: updating } = useApiMutation("patch");
  const { execute: deletePlan } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    let result = plans;

    if (filter === "active") result = result.filter((p) => p.is_active);
    else if (filter === "inactive") result = result.filter((p) => !p.is_active);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [plans, filter, search]);

  const stats = useMemo(() => {
    return {
      total: plans.length,
      active: plans.filter((p) => p.is_active).length,
      subscribers: plans.reduce((s, p) => s + (p.subscriber_count ?? 0), 0),
      revenue: plans
        .filter((p) => p.is_active)
        .reduce((s, p) => s + (p.monthly_revenue ?? p.price_monthly * (p.subscriber_count ?? 0)), 0),
    };
  }, [plans]);

  function openCreate() {
    setEditing(null);
    setForm(INITIAL_FORM);
    setShowForm(true);
  }

  function openEdit(plan: MembershipPlan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      priceMonthly: String(plan.price_monthly),
      discountPercent: plan.discount_percent ? String(plan.discount_percent) : "",
      isActive: plan.is_active,
      benefits: plan.benefits?.join(", ") ?? "",
    });
    setShowDetail(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.priceMonthly) {
      Alert.alert("Required", "Name and price are required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_monthly: Number(form.priceMonthly),
      discount_percent: form.discountPercent ? Number(form.discountPercent) : 0,
      is_active: form.isActive,
      benefits: form.benefits
        ? form.benefits.split(",").map((b) => b.trim()).filter(Boolean)
        : undefined,
    };

    if (editing) {
      const { error } = await updatePlan(
        `/api/provider/membership-plans/${editing.id}`,
        payload
      );
      if (error) { Alert.alert("Error", error); return; }
    } else {
      const { error } = await createPlan(payload);
      if (error) { Alert.alert("Error", error); return; }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    setForm(INITIAL_FORM);
    setEditing(null);
    refresh();
  }

  async function handleToggleActive(plan: MembershipPlan) {
    const { error } = await updatePlan(`/api/provider/membership-plans/${plan.id}`, {
      is_active: !plan.is_active,
    });
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(plan: MembershipPlan) {
    Alert.alert("Delete", `Remove "${plan.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deletePlan(`/api/provider/membership-plans/${plan.id}`);
          if (error) Alert.alert("Error", error);
          else {
            setShowDetail(null);
            refresh();
          }
        },
      },
    ]);
  }

  async function handleDuplicate(plan: MembershipPlan) {
    const { error } = await createPlan({
      name: `${plan.name} (Copy)`,
      description: plan.description,
      price_monthly: plan.price_monthly,
      discount_percent: plan.discount_percent,
      is_active: false,
      benefits: plan.benefits,
    });
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDetail(null);
      refresh();
    }
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Membership Plans"
        showBack
        subtitle={`${stats.active} active · ${stats.subscribers} subscribers`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <StatCard title="Plans" value={String(stats.total)} icon="card-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Members" value={String(stats.subscribers)} icon="people-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="MRR" value={formatCurrency(stats.revenue)} icon="trending-up-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search plans..." />

      <View className="my-3">
        <FilterChipGroup options={STATUS_FILTERS} selected={filter} onSelect={setFilter} />
      </View>

      {loading && !rawData ? (
        <SkeletonList rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title="No membership plans"
          description={search || filter !== "all" ? "No results" : "Create plans to offer recurring client memberships"}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p: MembershipPlan) => p.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: plan }: { item: MembershipPlan }) => (
            <TouchableOpacity
              className={`rounded-xl border bg-white p-4 ${plan.is_active ? "border-gray-100" : "border-gray-100 opacity-60"}`}
              onPress={() => setShowDetail(plan)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <View className="h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                      <Ionicons name="card" size={16} color="#6366f1" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900">{plan.name}</Text>
                      {plan.description && (
                        <Text className="text-xs text-gray-500" numberOfLines={1}>{plan.description}</Text>
                      )}
                    </View>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-base font-bold text-indigo-600">
                    {formatCurrency(plan.price_monthly)}<Text className="text-xs font-normal text-gray-400">/mo</Text>
                  </Text>
                  <View className={`mt-1 rounded-full px-2 py-0.5 ${plan.is_active ? "bg-green-50" : "bg-gray-100"}`}>
                    <Text className={`text-[10px] font-medium ${plan.is_active ? "text-green-700" : "text-gray-500"}`}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-2 flex-row items-center gap-3">
                {plan.discount_percent > 0 && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="pricetag-outline" size={12} color="#22c55e" />
                    <Text className="text-xs text-green-600">{plan.discount_percent}% off</Text>
                  </View>
                )}
                {plan.subscriber_count != null && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="people-outline" size={12} color="#6b7280" />
                    <Text className="text-xs text-gray-500">{plan.subscriber_count} subscribers</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Detail sheet */}
      <BottomSheet
        visible={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail?.name ?? "Plan Details"}
      >
        {showDetail && (
          <View>
            <View className="mb-3 items-center rounded-xl bg-indigo-50 p-5">
              <Text className="text-3xl font-bold text-indigo-700">
                {formatCurrency(showDetail.price_monthly)}
              </Text>
              <Text className="text-sm text-indigo-500">per month</Text>
            </View>

            {showDetail.description && (
              <Text className="mb-3 text-sm text-gray-600">{showDetail.description}</Text>
            )}

            <View className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
              {showDetail.discount_percent > 0 && (
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-sm text-gray-500">Discount</Text>
                  <Text className="text-sm font-medium text-green-600">{showDetail.discount_percent}%</Text>
                </View>
              )}
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-sm text-gray-500">Status</Text>
                <Text className={`text-sm font-medium ${showDetail.is_active ? "text-green-600" : "text-gray-500"}`}>
                  {showDetail.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
              {showDetail.subscriber_count != null && (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-gray-500">Subscribers</Text>
                  <Text className="text-sm text-gray-700">{showDetail.subscriber_count}</Text>
                </View>
              )}
            </View>

            {showDetail.benefits && showDetail.benefits.length > 0 && (
              <View className="mb-3">
                <Text className="mb-1.5 text-xs font-semibold uppercase text-gray-400">Benefits</Text>
                {showDetail.benefits.map((b, i) => (
                  <View key={i} className="flex-row items-center gap-2 mb-1">
                    <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                    <Text className="text-sm text-gray-700">{b}</Text>
                  </View>
                ))}
              </View>
            )}

            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 items-center rounded-lg bg-indigo-50 py-2.5"
                onPress={() => openEdit(showDetail)}
              >
                <Text className="text-sm font-medium text-indigo-700">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 items-center rounded-lg bg-gray-100 py-2.5"
                onPress={() => handleDuplicate(showDetail)}
              >
                <Text className="text-sm font-medium text-gray-700">Duplicate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 items-center rounded-lg bg-gray-100 py-2.5"
                onPress={() => handleToggleActive(showDetail)}
              >
                <Text className="text-sm font-medium text-gray-700">
                  {showDetail.is_active ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="mt-2 items-center rounded-lg bg-red-50 py-2.5"
              onPress={() => handleDelete(showDetail)}
            >
              <Text className="text-sm font-medium text-red-700">Delete Plan</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>

      {/* Create / Edit form */}
      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Plan" : "New Membership Plan"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Plan Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Gold Membership"
            placeholderTextColor="#9ca3af"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Description</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Plan benefits overview..."
            placeholderTextColor="#9ca3af"
            multiline
          />

          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Monthly Price (R) *</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.priceMonthly}
                onChangeText={(t) => setForm((p) => ({ ...p, priceMonthly: t }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Discount %</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.discountPercent}
                onChangeText={(t) => setForm((p) => ({ ...p, discountPercent: t }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">Benefits (comma separated)</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.benefits}
            onChangeText={(t) => setForm((p) => ({ ...p, benefits: t }))}
            placeholder="e.g. Priority booking, Free products, 10% off"
            placeholderTextColor="#9ca3af"
          />

          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Active</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.isActive ? "#6366f1" : "#f4f4f5"}
            />
          </View>

          <ActionButton
            label={editing ? "Update Plan" : "Create Plan"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
