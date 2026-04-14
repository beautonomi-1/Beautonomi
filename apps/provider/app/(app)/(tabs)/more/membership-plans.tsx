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
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";

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
  benefitsList: [] as string[],
};

export default function MembershipPlansScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showDetail, setShowDetail] = useState<MembershipPlan | null>(null);

  const { data: rawData, loading, error: loadError, refresh } = useApi<PlansResponse>(
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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
      benefitsList: plan.benefits ?? [],
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
      benefits: form.benefitsList.length > 0 ? form.benefitsList : undefined,
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
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Plans" value={String(stats.total)} icon="card-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Members" value={String(stats.subscribers)} icon="people-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title="MRR" value={formatCurrency(stats.revenue)} icon="trending-up-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search plans..." />

      <View style={twStyle("my-3")}>
        <FilterChipGroup options={STATUS_FILTERS} selected={filter} onSelect={setFilter} />
      </View>

      {loadError && !rawData ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : loading && !rawData && !loadError ? (
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
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: plan }: { item: MembershipPlan }) => (
            <TouchableOpacity
              style={twStyle(`rounded-xl border bg-white p-4 ${plan.is_active ? "border-gray-100" : "border-gray-100 opacity-60"}`)}
              onPress={() => setShowDetail(plan)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <View style={twStyle("flex-row items-center")}>
                    <View style={[twStyle("h-8 w-8 items-center justify-center rounded-lg bg-indigo-50"), { marginRight: 8 }]}>
                      <Ionicons name="card" size={16} color="#6366f1" />
                    </View>
                    <View style={twStyle("flex-1")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{plan.name}</Text>
                      {plan.description && (
                        <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>{plan.description}</Text>
                      )}
                    </View>
                  </View>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-indigo-600")}>
                    {formatCurrency(plan.price_monthly)}<Text style={twStyle("text-xs font-normal text-gray-400")}>/mo</Text>
                  </Text>
                  <View style={twStyle(`mt-1 rounded-full px-2 py-0.5 ${plan.is_active ? "bg-green-50" : "bg-gray-100"}`)}>
                    <Text style={twStyle(`text-[10px] font-medium ${plan.is_active ? "text-green-700" : "text-gray-500"}`)}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={twStyle("mt-2 flex-row items-center")}>
                {plan.discount_percent > 0 && (
                  <View style={[twStyle("flex-row items-center"), { marginRight: 12 }]}>
                    <Ionicons name="pricetag-outline" size={12} color="#22c55e" style={{ marginRight: 4 }} />
                    <Text style={twStyle("text-xs text-green-600")}>{plan.discount_percent}% off</Text>
                  </View>
                )}
                {plan.subscriber_count != null && (
                  <View style={twStyle("flex-row items-center")}>
                    <Ionicons name="people-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                    <Text style={twStyle("text-xs text-gray-500")}>{plan.subscriber_count} subscribers</Text>
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
            <View style={twStyle("mb-3 items-center rounded-xl bg-indigo-50 p-5")}>
              <Text style={twStyle("text-3xl font-bold text-indigo-700")}>
                {formatCurrency(showDetail.price_monthly)}
              </Text>
              <Text style={twStyle("text-sm text-indigo-500")}>per month</Text>
            </View>

            {showDetail.description && (
              <Text style={twStyle("mb-3 text-sm text-gray-600")}>{showDetail.description}</Text>
            )}

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-3")}>
              {showDetail.discount_percent > 0 && (
                <View style={twStyle("flex-row justify-between mb-1.5")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Discount</Text>
                  <Text style={twStyle("text-sm font-medium text-green-600")}>{showDetail.discount_percent}%</Text>
                </View>
              )}
              <View style={twStyle("flex-row justify-between mb-1.5")}>
                <Text style={twStyle("text-sm text-gray-500")}>Status</Text>
                <Text style={twStyle(`text-sm font-medium ${showDetail.is_active ? "text-green-600" : "text-gray-500"}`)}>
                  {showDetail.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
              {showDetail.subscriber_count != null && (
                <View style={twStyle("flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Subscribers</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{showDetail.subscriber_count}</Text>
                </View>
              )}
            </View>

            {showDetail.benefits && showDetail.benefits.length > 0 && (
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase text-gray-400")}>Benefits</Text>
                {showDetail.benefits.map((b, i) => (
                  <View key={i} style={[twStyle("flex-row items-center mb-1"), { marginRight: 8 }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#22c55e" style={{ marginRight: 8 }} />
                    <Text style={twStyle("text-sm text-gray-700")}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 items-center rounded-lg bg-indigo-50 py-2.5"), { marginRight: 8 }]}
                onPress={() => openEdit(showDetail)}
              >
                <Text style={twStyle("text-sm font-medium text-indigo-700")}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[twStyle("flex-1 items-center rounded-lg bg-gray-100 py-2.5"), { marginRight: 8 }]}
                onPress={() => handleDuplicate(showDetail)}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Duplicate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 items-center rounded-lg bg-gray-100 py-2.5")}
                onPress={() => handleToggleActive(showDetail)}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>
                  {showDetail.is_active ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={twStyle("mt-2 items-center rounded-lg bg-red-50 py-2.5")}
              onPress={() => handleDelete(showDetail)}
            >
              <Text style={twStyle("text-sm font-medium text-red-700")}>Delete Plan</Text>
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
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Plan Name *</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Gold Membership"
            placeholderTextColor="#9ca3af"
          />

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Description</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Plan benefits overview..."
            placeholderTextColor="#9ca3af"
            multiline
          />

          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{`Monthly Price (${getTenantDefaultCurrency()}) *`}</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.priceMonthly}
                onChangeText={(t) => setForm((p) => ({ ...p, priceMonthly: t }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Discount %</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.discountPercent}
                onChangeText={(t) => setForm((p) => ({ ...p, discountPercent: t }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Benefits</Text>
          <ChipCombobox
            value={form.benefitsList}
            onChange={(v) => setForm((p) => ({ ...p, benefitsList: v }))}
            staticSuggestions={[
              { value: "Priority booking", label: "Priority booking" },
              { value: "10% off", label: "10% off" },
              { value: "Free product", label: "Free product" },
              { value: "Exclusive events", label: "Exclusive events" },
            ]}
            placeholder="e.g. Priority booking, 10% off"
            accessibilityLabel="Benefits"
          />

          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
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
