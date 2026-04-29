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
import { pushInAppBrowser } from "@/lib/in-app-web";
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
import { getApiErrorMessage } from "@/lib/api-error";

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

/** POST /api/provider/ads/campaigns success body (wrapped or bare campaign). */
type AdsCampaignCreateData = Campaign | {
  campaign?: Campaign;
  requires_payment?: boolean;
  payment_url?: string | null;
  order_id?: string;
};

function pickCampaignFromAdsCreate(data: AdsCampaignCreateData | undefined): Campaign | undefined {
  if (!data || typeof data !== "object") return undefined;
  if ("campaign" in data && data.campaign) return data.campaign;
  if ("id" in data && typeof (data as Campaign).id === "string") return data as Campaign;
  return undefined;
}

function adsCreatePaymentUrl(data: AdsCampaignCreateData | undefined): string | null {
  if (!data || typeof data !== "object" || !("requires_payment" in data) || !data.requires_payment) {
    return null;
  }
  const url = "payment_url" in data ? data.payment_url : null;
  return typeof url === "string" && url.trim() ? url : null;
}

function isTimeBasedCampaign(campaign: Campaign | null): boolean {
  return campaign?.billing_model === "time_based";
}

function isImpressionPackCampaign(campaign: Campaign | null): boolean {
  return Boolean(campaign && campaign.billing_model !== "time_based" && campaign.pack_impressions != null);
}

function canEditBudgetFields(campaign: Campaign | null): boolean {
  return Boolean(campaign && !isTimeBasedCampaign(campaign) && !isImpressionPackCampaign(campaign));
}

type PerformanceSummary = {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  sales: number;
};

const formatCompactNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value ?? 0));

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

/** Tells Paystack to return to a page that notifies the RN WebView (see web `/provider/settings/ads/payment-return`). */
const ADS_NATIVE_PAYMENT = { payment_redirect: "provider_inapp" as const };

const STATUS_COLOR: Record<string, string> = {
  draft: "#6b7280",
  active: "#22c55e",
  paused: "#f59e0b",
  ended: "#94a3b8",
};

function campaignModelLabel(campaign: Campaign): string {
  if (isTimeBasedCampaign(campaign)) return "time boost";
  if (isImpressionPackCampaign(campaign)) return "impression pack";
  return "CPC budget";
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount ?? 0));
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
}

function campaignSummaryLine(c: Campaign, currency: string): string {
  if (c.billing_model === "time_based") {
    const d = c.duration_days;
    const daysLabel = d == null ? "?" : d === 1 ? "1 day" : `${d} days`;
    const paid = formatMoney(Number(c.budget), currency);
    const end = c.end_at ? ` · Ends ${new Date(c.end_at).toLocaleDateString()}` : "";
    return `${daysLabel} boost · ${paid} paid${end}`;
  }
  if (c.pack_impressions != null) {
    return `${c.pack_impressions} impressions · ${formatMoney(Number(c.budget), currency)} paid · ${formatMoney(Number(c.spent), currency)} spent`;
  }
  const daily =
    c.daily_budget != null ? ` · Daily cap ${formatMoney(Number(c.daily_budget), currency)}` : "";
  const bid =
    c.bid_cpc != null && Number(c.bid_cpc) > 0 ? ` · Bid ${formatMoney(Number(c.bid_cpc), currency)}/click` : "";
  return `Total budget ${formatMoney(Number(c.budget), currency)} · Spent ${formatMoney(Number(c.spent), currency)}${daily}${bid}`;
}

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
  const cpcBudgetAvailable = availableModels.length === 0 || availableModels.includes("cpc_budget");

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
        setPacks(Array.isArray(pd) ? (pd as ImpressionPack[]) : []);
      }
      const rawCat = catRes.data as GlobalCategory[] | { data?: GlobalCategory[] } | null | undefined;
      const catList = Array.isArray(rawCat)
        ? rawCat
        : rawCat && typeof rawCat === "object" && Array.isArray((rawCat as { data?: GlobalCategory[] }).data)
          ? (rawCat as { data: GlobalCategory[] }).data
          : [];
      setGlobalCategories(catList);
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
          ...ADS_NATIVE_PAYMENT,
          budget: budgetNum,
          daily_budget: createForm.daily_budget ? parseFloat(createForm.daily_budget.replace(/,/g, ".")) : null,
          bid_cpc: createForm.bid_cpc ? parseFloat(createForm.bid_cpc.replace(/,/g, ".")) : 0,
          targeting: createForm.global_category_ids.length > 0
            ? { global_category_ids: createForm.global_category_ids }
            : undefined,
        }
      );
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to create campaign"));
        return;
      }
      const data = res.data as AdsCampaignCreateData | undefined;
      const campaign = pickCampaignFromAdsCreate(data);
      if (campaign?.id) setCampaigns((prev) => [campaign, ...prev]);
      setCreateOpen(false);
      setCreateForm({ budget: "", daily_budget: "", bid_cpc: "", global_category_ids: [] });
      const payUrl = adsCreatePaymentUrl(data);
      if (payUrl) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        pushInAppBrowser(router, payUrl, "Ad payment");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAll();
      Alert.alert("Done", "Campaign created (draft). Activate it when ready.");
    } catch (e: unknown) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to create campaign"));
    } finally {
      setCreating(false);
    }
  }, [createForm, loadAll, tenantCurrency, router]);

  const handleBuyPack = useCallback(
    async (pack: ImpressionPack) => {
      setCreatingPackId(pack.id);
      try {
        const res = await api.post<
          Campaign | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null }
        >(
          "/api/provider/ads/campaigns",
          {
            ...ADS_NATIVE_PAYMENT,
            impression_pack_id: pack.id,
            targeting:
              createForm.global_category_ids.length > 0
                ? { global_category_ids: createForm.global_category_ids }
                : undefined,
          }
        );
        if (res.error) {
          Alert.alert("Error", getApiErrorMessage(res.error, "Failed to create campaign"));
          return;
        }
        const data = res.data as AdsCampaignCreateData | undefined;
        const campaign = pickCampaignFromAdsCreate(data);
        if (campaign?.id) setCampaigns((prev) => [campaign, ...prev]);
        const payUrl = adsCreatePaymentUrl(data);
        if (payUrl) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          pushInAppBrowser(router, payUrl, "Ad payment");
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
        Alert.alert("Done", "Campaign created.");
      } catch (e: unknown) {
        Alert.alert("Error", getApiErrorMessage(e, "Failed to create campaign"));
      } finally {
        setCreatingPackId(null);
      }
    },
    [loadAll, router, createForm.global_category_ids]
  );

  const handleUpdateCampaign = useCallback(async () => {
    if (!editCampaign) return;
    const canEditBudget = canEditBudgetFields(editCampaign);
    if (canEditBudget && editForm.budget) {
      const nextBudget = parseFloat(editForm.budget.replace(/,/g, "."));
      if (Number.isFinite(nextBudget) && nextBudget > Number(editCampaign.budget ?? 0)) {
        Alert.alert(
          "Budget top-up needed",
          "Budget increases require a new paid campaign or pack. Lower the budget here, or buy another boost."
        );
        return;
      }
    }
    setUpdating(editCampaign.id);
    try {
      const payload: Record<string, unknown> = {
        targeting: { global_category_ids: editForm.global_category_ids },
      };
      if (canEditBudget) {
        payload.budget = editForm.budget ? parseFloat(editForm.budget.replace(/,/g, ".")) : undefined;
        payload.daily_budget =
          editForm.daily_budget === "" ? null : editForm.daily_budget ? parseFloat(editForm.daily_budget.replace(/,/g, ".")) : undefined;
        payload.bid_cpc = editForm.bid_cpc ? parseFloat(editForm.bid_cpc.replace(/,/g, ".")) : undefined;
      }
      const res = await api.patch(`/api/provider/ads/campaigns/${editCampaign.id}`, payload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to update campaign"));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditCampaign(null);
      loadAll();
      Alert.alert("Done", "Campaign updated.");
    } catch (e: unknown) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to update campaign"));
    } finally {
      setUpdating(null);
    }
  }, [editCampaign, editForm, loadAll]);

  const handleSetStatus = useCallback(
    (campaignId: string, status: "active" | "paused" | "ended") => {
      const run = async () => {
        setUpdating(campaignId);
        try {
          const res = await api.patch(`/api/provider/ads/campaigns/${campaignId}`, { status });
          if (res.error) {
            Alert.alert("Error", getApiErrorMessage(res.error, "Failed to update status"));
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          loadAll();
        } catch (e: unknown) {
          Alert.alert("Error", getApiErrorMessage(e, "Failed to update status"));
        } finally {
          setUpdating(null);
        }
      };
      if (status === "ended") {
        Alert.alert("End campaign", "This will stop the campaign. You can still view it in the list.", [
          { text: "Cancel", style: "cancel" },
          { text: "End", style: "destructive", onPress: () => void run() },
        ]);
        return;
      }
      void run();
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
        <ScreenHeader title="Paid ads" subtitle="Sponsored listings when available in your market" onBack={() => router.back()} />
        <View style={[twStyle("flex-1 px-4 pt-8"), { paddingHorizontal: screenPadding }]}>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-amber-50 p-6")}>
            <Ionicons name="megaphone-outline" size={40} color="#b45309" />
            <Text style={twStyle("mt-3 text-base font-semibold text-gray-900")}>Ads not enabled</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>
              Sponsored listings are not available in your market yet. When ads are available, you will be able to boost your
              profile and track visibility, reach, clicks, and bookings here.
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (loading && campaigns.length === 0 && !performance) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Paid ads" subtitle="Loading campaigns…" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Paid ads"
        subtitle="Boost discovery, target categories, track reach and bookings"
        onBack={() => router.back()}
      />
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
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-1")}>Ad performance</Text>
              <Text style={twStyle("text-xs text-gray-500 mb-3")}>
                Impressions, unique reach, clicks, spend, and bookings from your ads.
              </Text>
              <View style={twStyle("flex-row flex-wrap")}>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mr-2 mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="eye-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{formatCompactNumber(performance.impressions)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Impressions</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="people-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{formatCompactNumber(performance.reach)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Reach</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mr-2 mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="hand-left-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{formatCompactNumber(performance.clicks)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Clicks</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="wallet-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>
                    {formatMoney(Number(performance.spend), tenantCurrency)}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Spend</Text>
                </View>
                <View style={[twStyle("rounded-2xl border border-gray-200 bg-white p-4 flex-1 min-w-[45%] mr-2 mb-2"), { minWidth: "45%" }]}>
                  <Ionicons name="cart-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{formatCompactNumber(performance.sales)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>Sales (bookings)</Text>
                </View>
              </View>
            </View>
          )}

          {globalCategories.length > 0 && (timePacks.length > 0 || packs.length > 0) && (
            <View style={twStyle("mb-5")}>
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-1")}>Target categories (optional)</Text>
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>
                For packs and boosts below. None selected = all category searches.
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
                      style={twStyle(
                        `rounded-full px-3 py-1.5 border ${
                          selected ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"
                        }`
                      )}
                    >
                      <Text style={twStyle(`text-sm ${selected ? "text-white font-medium" : "text-gray-600"}`)}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
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
                        const res = await api.post<
                          Campaign | { campaign?: Campaign; requires_payment?: boolean; payment_url?: string | null }
                        >("/api/provider/ads/campaigns", {
                          ...ADS_NATIVE_PAYMENT,
                          time_pack_id: tp.id,
                          targeting,
                        });
                        if (res.error) {
                          Alert.alert("Error", getApiErrorMessage(res.error, "Failed to create campaign."));
                          return;
                        }
                        const data = res.data as AdsCampaignCreateData | undefined;
                        const campaign = pickCampaignFromAdsCreate(data);
                        if (campaign?.id) setCampaigns((prev) => [campaign, ...prev]);
                        const payUrl = adsCreatePaymentUrl(data);
                        if (payUrl) {
                          pushInAppBrowser(router, payUrl, "Ad payment");
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
                    <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>
                      {formatMoney(Number(tp.price_zar), tenantCurrency)}
                    </Text>
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
                    <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>
                      {formatMoney(Number(pack.price_zar), tenantCurrency)}
                    </Text>
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
              {cpcBudgetAvailable && (
                <ActionButton label="New campaign" onPress={() => setCreateOpen(true)} variant="primary" size="sm" icon="add" />
              )}
            </View>
            {campaigns.length === 0 ? (
              <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-8 items-center")}>
                <Ionicons name="megaphone-outline" size={32} color="#9ca3af" />
                <Text style={twStyle("mt-2 text-sm text-gray-600 text-center")}>
                  {cpcBudgetAvailable
                    ? "No campaigns yet. Create a CPC campaign or buy a pack above."
                    : "No campaigns yet. Buy a boost or impression pack above."}
                </Text>
              </View>
            ) : (
              <View style={twStyle("gap-3")}>
                {campaigns.map((c) => {
                  const hasBudgetLeft = Number(c.budget) > Number(c.spent ?? 0);
                  const canActivate = (c.status === "draft" || c.status === "paused") && hasBudgetLeft;
                  const showAwaitingPayment =
                    (c.status === "draft" || c.status === "paused") && !hasBudgetLeft;
                  return (
                    <View key={c.id} style={twStyle("rounded-2xl border border-gray-200 bg-white p-4")}>
                      <View style={twStyle("flex-row items-start justify-between gap-2 flex-wrap")}>
                        <View style={twStyle("flex-1 min-w-[60%]")}>
                          <View style={twStyle("flex-row items-center gap-2 flex-wrap mb-1")}>
                            <Text style={twStyle("text-sm font-semibold text-gray-900")}>Campaign</Text>
                            <View
                              style={[twStyle("rounded-md px-2 py-0.5"), { backgroundColor: `${STATUS_COLOR[c.status] ?? "#6b7280"}22` }]}
                            >
                              <Text style={[twStyle("text-xs font-semibold"), { color: STATUS_COLOR[c.status] ?? "#6b7280" }]}>
                                {c.status}
                              </Text>
                            </View>
                            <View style={twStyle("rounded-md border border-gray-200 px-2 py-0.5")}>
                              <Text style={twStyle("text-xs font-medium text-gray-600")}>{campaignModelLabel(c)}</Text>
                            </View>
                            {showAwaitingPayment ? (
                              <Text style={twStyle("text-xs font-medium text-amber-700")}>awaiting payment</Text>
                            ) : null}
                          </View>
                          <Text style={twStyle("text-sm text-gray-600 leading-5")}>{campaignSummaryLine(c, tenantCurrency)}</Text>
                          {(c.targeting?.global_category_ids?.length ?? 0) > 0 ? (
                            <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                              Targeting: {c.targeting!.global_category_ids!.length} categor
                              {c.targeting!.global_category_ids!.length === 1 ? "y" : "ies"}
                            </Text>
                          ) : null}
                        </View>
                        {updating === c.id ? <ActivityIndicator size="small" color="#111" /> : null}
                      </View>

                      <View style={twStyle("flex-row flex-wrap gap-2 mt-3")}>
                        <TouchableOpacity
                          onPress={() => openEdit(c)}
                          disabled={updating === c.id}
                          style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                        >
                          <Text style={twStyle("text-gray-800 text-xs font-medium")}>
                            {canEditBudgetFields(c) ? "Edit" : "Edit targeting"}
                          </Text>
                        </TouchableOpacity>
                        {canActivate ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "active")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg bg-green-600 px-3 py-2")}
                          >
                            <Text style={twStyle("text-white text-xs font-semibold")}>Activate</Text>
                          </TouchableOpacity>
                        ) : null}
                        {c.status === "active" ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "paused")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-amber-300 bg-amber-50 px-3 py-2")}
                          >
                            <Text style={twStyle("text-amber-900 text-xs font-semibold")}>Pause</Text>
                          </TouchableOpacity>
                        ) : null}
                        {c.status !== "ended" ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "ended")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg px-3 py-2")}
                          >
                            <Text style={twStyle("text-gray-500 text-xs font-medium")}>End</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
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
      <BottomSheet
        visible={!!editCampaign}
        onClose={() => !updating && setEditCampaign(null)}
        title="Edit campaign"
        subtitle={canEditBudgetFields(editCampaign) ? "Update budget, bid, and targeting." : "Pack pricing is locked. You can refine targeting."}
        snapHeight="full"
      >
        {editCampaign && (
          <View style={twStyle("gap-4 pb-6")}>
            {canEditBudgetFields(editCampaign) ? (
              <>
                <View>
                  <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Total budget ({tenantCurrency})</Text>
                  <TextInput
                    value={editForm.budget}
                    onChangeText={(t) => setEditForm((p) => ({ ...p, budget: t }))}
                    placeholder="e.g. 500"
                    keyboardType="decimal-pad"
                    style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
                  />
                  <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                    You can lower this budget. To add more money, buy another boost or pack.
                  </Text>
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
              </>
            ) : (
              <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
                <Text style={twStyle("text-sm font-semibold text-amber-950")}>Pricing is set by the marketplace</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-amber-800")}>
                  {isTimeBasedCampaign(editCampaign)
                    ? "Time boosts keep their purchased dates and price. Buy another boost to extend visibility."
                    : "Impression packs keep their purchased impression count and price."}
                </Text>
              </View>
            )}
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
