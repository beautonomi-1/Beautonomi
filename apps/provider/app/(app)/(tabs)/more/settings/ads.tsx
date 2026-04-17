/**
 * Ads – native ad campaigns and performance (no WebView).
 * Create and manage campaigns, view impressions, clicks, spend, and sales.
 */
import { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  AppState,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type Campaign = {
  id: string;
  status: string;
  budget: number;
  spent: number;
  daily_budget?: number | null;
  bid_cpc?: number;
  pack_impressions?: number | null;
  billing_model?: string;
  duration_days?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  targeting?: { global_category_ids?: string[] };
  created_at: string;
};

type PerformanceSummary = {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
};

type ImpressionPack = {
  id: string;
  impressions: number;
  price_zar: number;
  display_order?: number;
};

type TimePack = {
  id: string;
  duration_days: number;
  label: string;
  price_zar: number;
  display_order?: number;
};

type GlobalCategory = { id: string; name: string; slug: string };

const STATUS_COLOR: Record<string, string> = {
  draft: "#6b7280",
  active: "#22c55e",
  paused: "#f59e0b",
  ended: "#94a3b8",
};

export default function AdsSettingsScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const { screenPadding } = useResponsive();
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const enabled = Boolean(adsConfig?.enabled) || adsEnabled;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [packs, setPacks] = useState<ImpressionPack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [creatingPackId, setCreatingPackId] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const [createForm, setCreateForm] = useState({
    budget: "",
    daily_budget: "",
    bid_cpc: "",
    global_category_ids: [] as string[],
  });
  const [editForm, setEditForm] = useState({
    budget: "",
    daily_budget: "",
    bid_cpc: "",
    global_category_ids: [] as string[],
  });

  const loadAll = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const [campRes, perfRes, packsRes, catRes] = await Promise.all([
        api.get<Campaign[]>("/api/provider/ads/campaigns"),
        api.get<{ summary: PerformanceSummary }>("/api/provider/ads/performance"),
        api.get<{ impression_packs: ImpressionPack[]; time_packs: TimePack[]; available_models: string[] }>("/api/provider/ads/packs"),
        api.get<GlobalCategory[]>("/api/public/categories/global?all=true"),
      ]);
      const anyError = campRes.error || perfRes.error || packsRes.error;
      if (anyError) {
        Alert.alert("Error", "Some ads data could not be loaded. Pull to refresh.");
      }
      setCampaigns(Array.isArray(campRes.data) ? campRes.data : []);
      setPerformance(perfRes.data?.summary ?? null);
      const pd = packsRes.data;
      if (pd && typeof pd === "object" && !Array.isArray(pd)) {
        setPacks(Array.isArray(pd.impression_packs) ? pd.impression_packs : []);
        setTimePacks(Array.isArray(pd.time_packs) ? pd.time_packs : []);
        setAvailableModels(Array.isArray(pd.available_models) ? pd.available_models : []);
      } else {
        setPacks(Array.isArray(pd) ? (pd as any) : []);
      }
      setGlobalCategories(Array.isArray(catRes.data) ? catRes.data : []);
    } catch {
      setCampaigns([]);
      setPerformance(null);
      setPacks([]);
      setGlobalCategories([]);
      Alert.alert("Error", "Failed to load ads data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        loadAll();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const handleCreateCampaign = useCallback(async () => {
    const budgetNum = parseFloat(createForm.budget.replace(/,/g, "."));
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      Alert.alert("Invalid", `Enter a valid total budget (${tenantCurrency}).`);
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<Campaign | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null; order_id?: string }>(
        "/api/provider/ads/campaigns",
        {
          budget: budgetNum,
          daily_budget: createForm.daily_budget ? parseFloat(createForm.daily_budget.replace(/,/g, ".")) : null,
          bid_cpc: createForm.bid_cpc ? parseFloat(createForm.bid_cpc.replace(/,/g, ".")) : 0,
          targeting: createForm.global_category_ids.length > 0
            ? { global_category_ids: createForm.global_category_ids }
            : undefined,
        }
      );
      if (res.error) {
        Alert.alert("Error", (res.error as any)?.message ?? "Failed to create campaign");
        return;
      }
      const data = res.data as any;
      const campaign = data?.campaign ?? data;
      if (campaign?.id) setCampaigns((prev) => [campaign, ...prev]);
      setCreateOpen(false);
      setCreateForm({ budget: "", daily_budget: "", bid_cpc: "", global_category_ids: [] });
      if (data?.requires_payment && data?.payment_url) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await Linking.openURL(data.payment_url);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAll();
      Alert.alert("Done", "Campaign created (draft). Activate it when ready.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  }, [createForm, loadAll, tenantCurrency]);

  const handleBuyPack = useCallback(
    async (pack: ImpressionPack) => {
      setCreatingPackId(pack.id);
      try {
        const res = await api.post<
          Campaign | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null }
        >(
          "/api/provider/ads/campaigns",
          { impression_pack_id: pack.id }
        );
        if (res.error) {
          Alert.alert("Error", (res.error as any)?.message ?? "Failed to create campaign");
          return;
        }
        const data = res.data as any;
        const campaign = data?.campaign ?? data;
        if (campaign?.id) setCampaigns((prev) => [campaign, ...prev]);
        if (data?.requires_payment && data?.payment_url) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await Linking.openURL(data.payment_url);
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
        Alert.alert("Done", "Campaign created.");
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to create campaign");
      } finally {
        setCreatingPackId(null);
      }
    },
    [loadAll]
  );

  const handleUpdateCampaign = useCallback(async () => {
    if (!editCampaign) return;
    setUpdating(editCampaign.id);
    try {
      const res = await api.patch(`/api/provider/ads/campaigns/${editCampaign.id}`, {
        budget: editForm.budget ? parseFloat(editForm.budget.replace(/,/g, ".")) : undefined,
        daily_budget: editForm.daily_budget === "" ? null : editForm.daily_budget ? parseFloat(editForm.daily_budget.replace(/,/g, ".")) : undefined,
        bid_cpc: editForm.bid_cpc ? parseFloat(editForm.bid_cpc.replace(/,/g, ".")) : undefined,
        targeting: { global_category_ids: editForm.global_category_ids },
      });
      if (res.error) {
        Alert.alert("Error", (res.error as any)?.message ?? "Failed to update campaign");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditCampaign(null);
      loadAll();
      Alert.alert("Done", "Campaign updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to update campaign");
    } finally {
      setUpdating(null);
    }
  }, [editCampaign, editForm, loadAll]);

  const handleSetStatus = useCallback(
    async (campaignId: string, status: "active" | "paused" | "ended") => {
      setUpdating(campaignId);
      try {
        const res = await api.patch(`/api/provider/ads/campaigns/${campaignId}`, { status });
        if (res.error) {
          Alert.alert("Error", (res.error as any)?.message ?? "Failed to update status");
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to update status");
      } finally {
        setUpdating(null);
      }
    },
    [loadAll]
  );

  const openEdit = (c: Campaign) => {
    setEditCampaign(c);
    setEditForm({
      budget: String(c.budget ?? ""),
      daily_budget: c.daily_budget != null ? String(c.daily_budget) : "",
      bid_cpc: c.bid_cpc != null ? String(c.bid_cpc) : "",
      global_category_ids: c.targeting?.global_category_ids ?? [],
    });
  };

  if (!enabled) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Ads" subtitle="Ad campaigns & spend" onBack={() => router.back()} />
        <View style={[twStyle("flex-1 px-4 pt-8"), { paddingHorizontal: screenPadding }]}>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-amber-50 p-6")}>
            <Ionicons name="megaphone-outline" size={40} color="#b45309" />
            <Text style={twStyle("mt-3 text-base font-semibold text-gray-900")}>Ads not enabled</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>Paid ads are not enabled for your account. Contact support to get access.</Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (loading && campaigns.length === 0 && !performance) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Ads" subtitle="Campaigns & performance" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Ads" subtitle="Campaigns & performance" onBack={() => router.back()} />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[twStyle("px-4 pt-4"), { paddingHorizontal: screenPadding }]}>
          {/* Performance */}
          {performance && (
            <View style={twStyle("mb-6")}>
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-3")}>Performance</Text>
              <View style={twStyle("flex-row flex-wrap")}>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mr-2 mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="eye-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{performance.impressions}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Impressions</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="hand-left-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{performance.clicks}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Clicks</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mr-2 mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="wallet-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{tenantCurrency} {Number(performance.spend).toFixed(2)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Spend</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="cart-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{performance.sales}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Sales (bookings)</Text>
                </View>
              </View>
            </View>
          )}

          {/* Time-based boost packs */}
          {timePacks.length > 0 && availableModels.includes("time_based") && (
            <View style={twStyle("mb-6")}>
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-1")}>Boost for a set number of days</Text>
              <Text style={twStyle("text-xs text-gray-500 mb-3")}>Flat rate, guaranteed sponsored placement for the full duration.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("-mx-4")} contentContainerStyle={twStyle("px-4 gap-3 flex-row")}>
                {timePacks.map((tp) => (
                  <TouchableOpacity
                    key={tp.id}
                    onPress={async () => {
                      setCreatingPackId(tp.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try {
                        const targeting = createForm.global_category_ids.length > 0
                          ? { global_category_ids: createForm.global_category_ids }
                          : {};
                        const res = await api.post<{ payment_url?: string }>("/api/provider/ads/campaigns", {
                          time_pack_id: tp.id,
                          targeting,
                        });
                        if (res.data?.payment_url) {
                          await Linking.openURL(res.data.payment_url);
                          return;
                        }
                        Alert.alert("Success", "Campaign created.");
                        loadAll();
                      } catch {
                        Alert.alert("Error", "Failed to create campaign.");
                      } finally {
                        setCreatingPackId(null);
                      }
                    }}
                    disabled={!!creatingPackId}
                    style={twStyle("rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 w-36")}
                    activeOpacity={0.7}
                  >
                    <Text style={twStyle("text-lg font-bold text-gray-900")}>{tp.duration_days}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{tp.duration_days === 1 ? "day" : "days"}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>{tenantCurrency} {Number(tp.price_zar).toFixed(2)}</Text>
                    {creatingPackId === tp.id ? (
                      <ActivityIndicator size="small" color="#111" style={{ marginTop: 8 }} />
                    ) : (
                      <Text style={twStyle("text-xs text-emerald-600 mt-2")}>Boost →</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Impression packs */}
          {packs.length > 0 && availableModels.includes("impression_pack") && (
            <View style={twStyle("mb-6")}>
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-3")}>Buy impressions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("-mx-4")} contentContainerStyle={twStyle("px-4 gap-3 flex-row")}>
                {packs.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    onPress={() => handleBuyPack(pack)}
                    disabled={!!creatingPackId}
                    style={twStyle("rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 w-36")}
                    activeOpacity={0.7}
                  >
                    <Text style={twStyle("text-lg font-bold text-gray-900")}>{pack.impressions}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>impressions</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>{tenantCurrency} {Number(pack.price_zar).toFixed(2)}</Text>
                    {creatingPackId === pack.id ? (
                      <ActivityIndicator size="small" color="#111" style={{ marginTop: 8 }} />
                    ) : (
                      <Text style={twStyle("text-xs text-indigo-600 mt-2")}>Buy →</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Campaigns */}
          <View style={twStyle("mb-4")}>
            <View style={twStyle("flex-row items-center justify-between mb-3")}>
              <Text style={twStyle("text-sm font-semibold text-gray-700")}>Campaigns</Text>
              <ActionButton label="Create campaign" onPress={() => setCreateOpen(true)} variant="primary" size="sm" icon="add" />
            </View>
            {campaigns.length === 0 ? (
              <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-8 items-center")}>
                <Ionicons name="megaphone-outline" size={32} color="#9ca3af" />
                <Text style={twStyle("mt-2 text-sm text-gray-600 text-center")}>No campaigns yet. Create one or buy an impression pack above.</Text>
              </View>
            ) : (
              <View style={twStyle("gap-3")}>
                {campaigns.map((c) => (
                  <View key={c.id} style={twStyle("rounded-2xl border border-gray-200 bg-white p-4")}>
                    <View style={twStyle("flex-row items-center justify-between flex-wrap")}>
                      <View style={twStyle("flex-row items-center gap-2 flex-wrap")}>
                        <View style={[twStyle("rounded-lg px-2 py-1"), { backgroundColor: `${STATUS_COLOR[c.status] ?? "#6b7280"}20` }]}>
                          <Text style={[twStyle("text-xs font-semibold"), { color: STATUS_COLOR[c.status] ?? "#6b7280" }]}>{c.status}</Text>
                        </View>
                        {c.billing_model === "time_based" && c.duration_days && (
                          <Text style={twStyle("text-xs text-emerald-600")}>{c.duration_days} day boost</Text>
                        )}
                        {c.billing_model !== "time_based" && c.pack_impressions != null && (
                          <Text style={twStyle("text-xs text-gray-500")}>{c.pack_impressions} impressions</Text>
                        )}
                      </View>
                      {updating === c.id ? (
                        <ActivityIndicator size="small" color="#111" />
                      ) : (
                        <View style={twStyle("flex-row gap-2")}>
                          {c.status === "draft" && (
                            <TouchableOpacity onPress={() => handleSetStatus(c.id, "active")} style={twStyle("bg-green-600 px-3 py-1.5 rounded-lg")}>
                              <Text style={twStyle("text-white text-xs font-medium")}>Activate</Text>
                            </TouchableOpacity>
                          )}
                          {c.status === "active" && (
                            <TouchableOpacity onPress={() => handleSetStatus(c.id, "paused")} style={twStyle("bg-amber-500 px-3 py-1.5 rounded-lg")}>
                              <Text style={twStyle("text-white text-xs font-medium")}>Pause</Text>
                            </TouchableOpacity>
                          )}
                          {c.status === "paused" && (
                            <TouchableOpacity onPress={() => handleSetStatus(c.id, "active")} style={twStyle("bg-green-600 px-3 py-1.5 rounded-lg")}>
                              <Text style={twStyle("text-white text-xs font-medium")}>Resume</Text>
                            </TouchableOpacity>
                          )}
                          {(c.status === "draft" || c.status === "paused") && c.pack_impressions == null && c.billing_model !== "time_based" && (
                            <TouchableOpacity onPress={() => openEdit(c)} style={twStyle("border border-gray-300 px-3 py-1.5 rounded-lg")}>
                              <Text style={twStyle("text-gray-700 text-xs font-medium")}>Edit</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={twStyle("flex-row mt-3 gap-4 flex-wrap")}>
                      <Text style={twStyle("text-sm text-gray-600")}>Paid: {tenantCurrency} {Number(c.budget).toFixed(2)}</Text>
                      {c.billing_model === "time_based" ? (
                        <>
                          {c.end_at && (
                            <Text style={twStyle("text-sm text-gray-600")}>
                              Ends: {new Date(c.end_at).toLocaleDateString()}
                            </Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Text style={twStyle("text-sm text-gray-600")}>Spent: {tenantCurrency} {Number(c.spent).toFixed(2)}</Text>
                          {c.daily_budget != null && <Text style={twStyle("text-sm text-gray-600")}>Daily: {tenantCurrency} {Number(c.daily_budget).toFixed(2)}</Text>}
                        </>
                      )}
                    </View>
                    {(c.targeting?.global_category_ids?.length ?? 0) > 0 && (
                      <Text style={twStyle("text-xs text-gray-400 mt-1")}>
                        Targeting: {c.targeting!.global_category_ids!.length} categor{c.targeting!.global_category_ids!.length === 1 ? "y" : "ies"}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Create campaign sheet */}
      <BottomSheet visible={createOpen} onClose={() => !creating && setCreateOpen(false)} title="Create campaign" subtitle={`Set a total budget (${tenantCurrency}). You can pay now or add budget later.`} snapHeight="full">
        <View style={twStyle("gap-4 pb-6")}>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Total budget ({tenantCurrency})</Text>
            <TextInput
              value={createForm.budget}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, budget: t }))}
              placeholder="e.g. 500"
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Daily budget ({tenantCurrency}, optional)</Text>
            <TextInput
              value={createForm.daily_budget}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, daily_budget: t }))}
              placeholder="e.g. 50"
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Bid per click ({tenantCurrency}, optional)</Text>
            <TextInput
              value={createForm.bid_cpc}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, bid_cpc: t }))}
              placeholder="e.g. 2"
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          {globalCategories.length > 0 && (
            <View>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>
                Target categories{" "}
                <Text style={twStyle("text-xs text-gray-400 font-normal")}>(optional)</Text>
              </Text>
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>
                Leave blank to reach all searches. Select to target specific categories.
              </Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {globalCategories.map((cat) => {
                  const selected = createForm.global_category_ids.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() =>
                        setCreateForm((p) => ({
                          ...p,
                          global_category_ids: selected
                            ? p.global_category_ids.filter((x) => x !== cat.id)
                            : [...p.global_category_ids, cat.id],
                        }))
                      }
                      style={[
                        twStyle(
                          `rounded-full px-3 py-1.5 border ${
                            selected
                              ? "bg-gray-900 border-gray-900"
                              : "bg-white border-gray-200"
                          }`
                        ),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          `text-sm ${selected ? "text-white font-medium" : "text-gray-600"}`
                        )}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <ActionButton label={creating ? "Creating…" : "Create campaign"} onPress={handleCreateCampaign} loading={creating} disabled={creating} fullWidth />
        </View>
      </BottomSheet>

      {/* Edit campaign sheet */}
      <BottomSheet visible={!!editCampaign} onClose={() => !updating && setEditCampaign(null)} title="Edit campaign" subtitle="Update budget and bid." snapHeight="full">
        {editCampaign && (
          <View style={twStyle("gap-4 pb-6")}>
            <View>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Total budget ({tenantCurrency})</Text>
              <TextInput
                value={editForm.budget}
                onChangeText={(t) => setEditForm((p) => ({ ...p, budget: t }))}
                placeholder="e.g. 500"
                keyboardType="decimal-pad"
                style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
              />
            </View>
            <View>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Daily budget ({tenantCurrency})</Text>
              <TextInput
                value={editForm.daily_budget}
                onChangeText={(t) => setEditForm((p) => ({ ...p, daily_budget: t }))}
                placeholder="e.g. 50"
                keyboardType="decimal-pad"
                style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
              />
            </View>
            <View>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Bid per click ({tenantCurrency})</Text>
              <TextInput
                value={editForm.bid_cpc}
                onChangeText={(t) => setEditForm((p) => ({ ...p, bid_cpc: t }))}
                placeholder="e.g. 2"
                keyboardType="decimal-pad"
                style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
              />
            </View>
            {globalCategories.length > 0 && (
              <View>
                <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Target categories</Text>
                <View style={twStyle("flex-row flex-wrap gap-2")}>
                  {globalCategories.map((cat) => {
                    const selected = editForm.global_category_ids.includes(cat.id);
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() =>
                          setEditForm((p) => ({
                            ...p,
                            global_category_ids: selected
                              ? p.global_category_ids.filter((x) => x !== cat.id)
                              : [...p.global_category_ids, cat.id],
                          }))
                        }
                        style={twStyle(
                          `rounded-full px-3 py-1.5 border ${
                            selected ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"
                          }`
                        )}
                      >
                        <Text
                          style={twStyle(
                            `text-sm ${selected ? "text-white font-medium" : "text-gray-600"}`
                          )}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            <ActionButton label={updating === editCampaign.id ? "Saving…" : "Save"} onPress={handleUpdateCampaign} loading={updating === editCampaign.id} disabled={!!updating} fullWidth />
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
