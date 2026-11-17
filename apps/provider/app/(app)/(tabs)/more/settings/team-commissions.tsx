import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { StaffPayPlanForm } from "@/components/payroll/StaffPayPlanForm";
import {
  defaultPayPlanFormState,
  payModelUsesCommission,
  payPlanDateError,
  payPlanFromApiRow,
  payPlanToPostBody,
  staffMoneyFromPayPlan,
  type PayPlanFormState,
} from "@/lib/pay-plan-form-state";

interface CommissionTier {
  id?: string;
  minRevenue: number;
  commissionRate: number;
  tierOrder: number;
}

function memberRates(member: StaffCommission) {
  const service = member.serviceCommissionRate ?? member.commissionPercentage;
  const product = member.productCommissionRate ?? member.commissionPercentage;
  return { service, product, split: service !== product };
}

interface StaffCommission {
  staffId: string;
  name: string;
  email: string;
  role: string;
  commissionPercentage: number;
  serviceCommissionRate?: number;
  productCommissionRate?: number;
  tiers: CommissionTier[];
  totalEarnings?: number;
  totalCommissionPaid?: number;
}

export default function TeamCommissionsScreen() {
  const { staffId: staffIdParam } = useLocalSearchParams<{ staffId?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.teamCommissions.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<StaffCommission | null>(null);
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [search, setSearch] = useState("");
  const [payPlan, setPayPlan] = useState<PayPlanFormState>(defaultPayPlanFormState);

  const { data: staff, loading, refresh } = useApi<StaffCommission[]>(
    "/api/provider/settings/team/commissions"
  );
  const { data: teamAccess } = useApi<{ can_manage_payroll?: boolean; is_business_owner?: boolean }>(
    "/api/provider/team-access",
    { staleTimeMs: 60_000 },
  );
  const canManagePayroll =
    teamAccess?.is_business_owner === true || teamAccess?.can_manage_payroll === true;
  const { execute: saveCommission, loading: saving } = useApiMutation("patch");
  const { execute: savePayPlan, loading: savingPlan } = useApiMutation("post");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!staff) return [];
    if (!search) return staff;
    const q = search.toLowerCase();
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [staff, search]);

  const avgCommission = useMemo(() => {
    if (!staff?.length) return 0;
    const sum = staff.reduce((acc, member) => {
      const rates = memberRates(member);
      const rate = rates.split ? (rates.service + rates.product) / 2 : rates.service;
      return acc + rate;
    }, 0);
    return (sum / staff.length).toFixed(1);
  }, [staff]);

  const maxCommission = useMemo(() => {
    if (!staff?.length) return 0;
    return Math.max(
      ...staff.flatMap((member) => {
        const rates = memberRates(member);
        return [rates.service, rates.product];
      }),
    );
  }, [staff]);

  const tieredCount = useMemo(
    () => staff?.filter((s) => s.tiers.length > 0).length ?? 0,
    [staff]
  );

  async function openEdit(member: StaffCommission) {
    setSelected(member);
    const svc = member.serviceCommissionRate ?? member.commissionPercentage;
    const prod = member.productCommissionRate ?? member.commissionPercentage;
    setTiers(member.tiers.length > 0 ? [...member.tiers] : []);
    try {
      const { api } = await import("@/lib/api-client");
      const plansRes = await api.get<Record<string, unknown>[]>(
        `/api/provider/staff/${member.staffId}/pay-plans`,
      );
      const latest = plansRes.data?.[0];
      setPayPlan(
        payPlanFromApiRow(latest, {
          service_rate: svc,
          product_rate: prod,
        }),
      );
    } catch {
      setPayPlan(
        payPlanFromApiRow(undefined, {
          service_rate: svc,
          product_rate: prod,
        }),
      );
    }
  }

  useEffect(() => {
    if (!staffIdParam || !staff?.length) return;
    const match = staff.find((s) => s.staffId === staffIdParam);
    if (match) void openEdit(match);
  }, [staffIdParam, staff]);

  function addTier() {
    setTiers((prev) => [
      ...prev,
      { minRevenue: 0, commissionRate: 0, tierOrder: prev.length },
    ]);
  }

  function updateTier(
    index: number,
    field: "minRevenue" | "commissionRate",
    value: string
  ) {
    setTiers((prev) =>
      prev.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier
      )
    );
  }

  function removeTier(index: number) {
    setTiers((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((tier, i) => ({ ...tier, tierOrder: i }))
    );
  }

  async function handleSave() {
    if (!selected) return;
    if (!canManagePayroll) {
      Alert.alert(tc("errorTitle"), tc("payPlanReadOnly"));
      return;
    }
    const dateError = payPlanDateError(payPlan);
    if (dateError) {
      Alert.alert(tc("invalidTitle"), dateError);
      return;
    }
    const planMoney = staffMoneyFromPayPlan(payPlan);
    if (
      planMoney.service_commission_rate < 0 ||
      planMoney.service_commission_rate > 100 ||
      planMoney.product_commission_rate < 0 ||
      planMoney.product_commission_rate > 100
    ) {
      Alert.alert(tc("invalidTitle"), tc("invalidRates"));
      return;
    }
    const tierPayload = payModelUsesCommission(payPlan.pay_model)
      ? tiers.map((tier, i) => ({
          min_revenue: tier.minRevenue,
          commission_rate: tier.commissionRate,
          tier_order: i,
        }))
      : [];
    const { error: planErr } = await savePayPlan(
      `/api/provider/staff/${selected.staffId}/pay-plans`,
      payPlanToPostBody(payPlan, tierPayload),
    );
    if (planErr) {
      Alert.alert(tc("errorTitle"), planErr);
      return;
    }
    const { error } = await saveCommission(
      `/api/provider/staff/${selected.staffId}/commission`,
      {
        commission_enabled: planMoney.commission_enabled,
        service_commission_rate: planMoney.service_commission_rate,
        product_commission_rate: planMoney.product_commission_rate,
        hourly_rate: planMoney.hourly_rate,
        salary: planMoney.salary,
        tiers: tierPayload,
      },
    );
    if (error) {
      Alert.alert(tc("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelected(null);
    refresh();
  }

  function getCommissionColor(pct: number): string {
    if (pct >= 40) return "#22c55e";
    if (pct >= 20) return "#f59e0b";
    return "#6366f1";
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={tc("title")}
        showBack
        subtitle={
          canManagePayroll
            ? tc("payPlanSubtitle", {
                defaultValue:
                  "Salary, hourly pay, commission, and tax. Payroll uses this. Commission and tips count on the day the client pays, not the appointment day.",
              })
            : tc("payPlanSubtitleReadOnly", {
                defaultValue:
                  "How you are paid. Only the owner, or someone granted payroll access, can change it. Commission and tips count on the day the client pays.",
              })
        }
      />
      <TouchableOpacity
        onPress={() =>
          router.push(
            (canManagePayroll
              ? "/(app)/(tabs)/more/team-pay?tab=payroll"
              : "/(app)/(tabs)/more/team-pay?tab=my-earnings") as never,
          )
        }
        style={twStyle("mb-3 px-1")}
      >
        <Text style={twStyle("text-sm font-semibold text-[#FF0077]")}>
          {canManagePayroll ? "Open payroll" : "My payslips"}
        </Text>
      </TouchableOpacity>

      {staff && staff.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={tc("statAverage")}
              value={tc("percentValue", { value: avgCommission })}
              icon="trending-up-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={tc("statHighest")}
              value={tc("percentValue", { value: maxCommission })}
              icon="arrow-up-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title={tc("statTiered")}
              value={String(tieredCount)}
              icon="layers-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      {staff && staff.length > 2 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={tc("searchPlaceholder")}
          />
        </View>
      )}

      {loading && !staff ? (
        <SkeletonList rows={5} />
      ) : !filtered.length ? (
        <EmptyState
          icon="trending-up-outline"
          title={search ? tc("emptyMatches") : tc("emptyTitle")}
          description={
            search
              ? tc("emptyMatchesHint")
              : tc("emptyHint")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(s: StaffCommission) => s.staffId}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: member }: { item: StaffCommission }) => {
            const rates = memberRates(member);
            const shown = rates.split ? Math.max(rates.service, rates.product) : rates.service;
            const commColor = getCommissionColor(shown);
            return (
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
                onPress={() => openEdit(member)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-center")}>
                  <Avatar name={member.name} size="sm" />
                  <View style={twStyle("ms-3 flex-1")}>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {member.name}
                    </Text>
                    <Text style={twStyle("text-xs capitalize text-gray-500")}>
                      {member.role}
                    </Text>
                  </View>
                  <View style={twStyle("items-end")}>
                    <Text
                      style={[
                        twStyle(rates.split ? "text-xs font-semibold text-end" : "text-lg font-bold"),
                        { color: commColor, maxWidth: rates.split ? 160 : undefined },
                      ]}
                    >
                      {rates.split
                        ? tc("splitPercent", {
                            service: rates.service,
                            product: rates.product,
                            defaultValue: "{{service}}% services · {{product}}% products",
                          })
                        : tc("percentValue", { value: rates.service })}
                    </Text>
                    {member.tiers.length > 0 && (
                      <Text style={twStyle("text-[10px] text-gray-400")}>
                        {tc("tierCount", { count: member.tiers.length })}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Commission bar */}
                <View style={twStyle("mt-3 h-2 overflow-hidden rounded-full bg-gray-100")}>
                  <View
                    style={[twStyle("h-2 rounded-full"), {
                      width: `${Math.min(shown, 100)}%`,
                      backgroundColor: commColor,
                    }]}
                  />
                </View>

                {member.tiers.length > 0 && (
                  <View style={twStyle("mt-2 flex-row flex-wrap")}>
                    {member.tiers
                      .sort((a: CommissionTier, b: CommissionTier) => a.tierOrder - b.tierOrder)
                      .map((tier: CommissionTier, idx: number) => (
                        <View
                          key={idx}
                          style={[twStyle("rounded-full bg-gray-100 px-2 py-0.5"), { marginEnd: 4, marginBottom: 4 }]}
                        >
                          <Text style={twStyle("text-[10px] text-gray-600")}>
                            {tc("tierChip", {
                              currency: getTenantDefaultCurrency(),
                              min: tier.minRevenue,
                              rate: tier.commissionRate,
                            })}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={tc("sheetTitle", { name: selected?.name ?? "" })}
      >
        {selected && (
          <View>
            <View style={twStyle("mb-4 flex-row items-center rounded-xl bg-gray-50 p-3")}>
              <Avatar name={selected.name} size="sm" />
              <View style={twStyle("ms-3")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {selected.name}
                </Text>
                <Text style={twStyle("text-xs capitalize text-gray-500")}>
                  {selected.role} · {selected.email}
                </Text>
              </View>
            </View>

            <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>
              {tc("payPlanSection")}
            </Text>
            {!canManagePayroll ? (
              <Text style={twStyle("mb-3 text-xs text-gray-500")}>{tc("payPlanReadOnly")}</Text>
            ) : null}
            <StaffPayPlanForm
              value={payPlan}
              onChange={setPayPlan}
              disabled={!canManagePayroll}
              label={(key) => tc(key)}
            />

            <Text style={twStyle("mb-3 mt-4 text-xs text-gray-500")}>
              {payModelUsesCommission(payPlan.pay_model)
                ? "Salary, hourly pay, and commission rates are set on the pay plan above. A pay run and a payslip use that plan. Tiers below are saved with it."
                : "Salary, hourly pay, and commission rates are set on the pay plan above. A pay run and a payslip use that plan. This pay model does not use a commission ladder."}
            </Text>

            {payModelUsesCommission(payPlan.pay_model) ? (
            <>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
                {tc("tieredCommissions")}
              </Text>
              <TouchableOpacity onPress={addTier} disabled={!canManagePayroll}>
                <Text style={twStyle("text-xs font-medium text-indigo-600")}>
                  {tc("addTier")}
                </Text>
              </TouchableOpacity>
            </View>

            {tiers.length === 0 && (
              <View style={twStyle("mb-3 rounded-lg bg-gray-50 p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {tc("noTiersHint")}
                </Text>
              </View>
            )}

            {tiers.map((tier, idx) => (
              <View
                key={idx}
                style={twStyle("mb-2 flex-row items-center rounded-lg border border-gray-100 bg-gray-50 p-3")}
              >
                <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
                  <Text style={twStyle("text-[10px] text-gray-500")}>
                    {tc("minRevenueLabel", { currency: getTenantDefaultCurrency() })}
                  </Text>
                  <TextInput
                    style={twStyle("rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900")}
                    value={String(tier.minRevenue)}
                    onChangeText={(v) => updateTier(idx, "minRevenue", v)}
                    keyboardType="decimal-pad"
                    editable={canManagePayroll}
                  />
                </View>
                <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
                  <Text style={twStyle("text-[10px] text-gray-500")}>{tc("ratePercent")}</Text>
                  <TextInput
                    style={twStyle("rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900")}
                    value={String(tier.commissionRate)}
                    onChangeText={(v) =>
                      updateTier(idx, "commissionRate", v)
                    }
                    keyboardType="decimal-pad"
                    editable={canManagePayroll}
                  />
                </View>
                <TouchableOpacity
                  style={twStyle("mt-3")}
                  onPress={() => removeTier(idx)}
                  disabled={!canManagePayroll}
                >
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
            </>
            ) : null}

            <View style={twStyle("mt-4")}>
              <ActionButton
                label={canManagePayroll ? tc("savePaySettings") : tc("payPlanReadOnly")}
                onPress={handleSave}
                loading={saving || savingPlan}
                fullWidth
                disabled={!canManagePayroll}
              />
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
