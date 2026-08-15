/**
 * Ads – native ad campaigns and performance. Paystack checkout uses an in-app WebView modal.
 * Create and manage campaigns; view impressions, clicks, and spend.
 */
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
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
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { extractPaystackReferenceFromUrl } from "@/lib/payments/paystackRefFromUrl";
import {
  getAdsPaystackReturnUrl,
  matchesAdsPaystackReturnUrl,
  pollCampaignProvisioned,
  adsSuccessCopy,
  adsPendingCopy,
  adsFailedCopy,
  buildAdsRetryCheckoutReview,
} from "@/lib/payments/providerPaystackReturn";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { AdsCheckoutProcessingOverlay } from "@/components/ads/AdsCheckoutProcessingOverlay";
import { AdsCheckoutReviewSheet, type AdsCheckoutReview } from "@/components/ads/AdsCheckoutReviewSheet";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getApiErrorMessage } from "@/lib/api-error";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { shouldUseAppleIap } from "@/lib/iap/platform";
import {
  createAdsCampaignWithApplePayment,
  retryAdsCampaignWithApplePayment,
} from "@/lib/iap/ads-apple-payment";
import { useAppleIapProducts } from "@/lib/iap/useAppleIapProducts";

type CampaignPaymentState = "none" | "unpaid" | "pending" | "failed" | "paid";

type CampaignLifecycle =
  | "awaiting_payment"
  | "confirming"
  | "payment_failed"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "expired"
  | "delivered"
  | "cancelled";

type LatestBudgetOrder = {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded" | string;
  amount: number;
  currency: string | null;
  created_at?: string;
};

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
  /** §Provider-paystack-audit 2026-05: server-derived state for the action row. */
  payment_state?: CampaignPaymentState;
  lifecycle?: CampaignLifecycle;
  latest_budget_order?: LatestBudgetOrder | null;
};

type AdsPaymentOutcome =
  | { phase: "idle" }
  | { phase: "provisioned"; campaignId: string; title: string; body: string }
  | { phase: "pending"; campaignId?: string; title: string; body: string }
  | { phase: "failed"; campaignId?: string; title: string; body: string };

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

function adsCreateOrderId(data: AdsCampaignCreateData | undefined): string | undefined {
  if (!data || typeof data !== "object" || !("order_id" in data)) return undefined;
  const id = data.order_id;
  return typeof id === "string" && id.trim() ? id : undefined;
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

function normalizeCategories(raw: unknown): GlobalCategory[] {
  if (Array.isArray(raw)) return raw as GlobalCategory[];
  if (!raw || typeof raw !== "object") return [];
  const root = raw as { data?: unknown; categories?: unknown; global_categories?: unknown };
  if (Array.isArray(root.data)) return root.data as GlobalCategory[];
  if (Array.isArray(root.categories)) return root.categories as GlobalCategory[];
  if (Array.isArray(root.global_categories)) return root.global_categories as GlobalCategory[];
  if (root.data && typeof root.data === "object" && Array.isArray((root.data as { categories?: unknown }).categories)) {
    return (root.data as { categories: GlobalCategory[] }).categories;
  }
  return [];
}

type PerformanceSummary = {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
};

type CampaignPerformance = {
  impressions: number;
  reach: number;
  clicks: number;
  books: number;
  spent: number;
};

const formatCompactNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value ?? 0));

// §Ads-mobile-audit 2026-05: surface CTR (clicks ÷ impressions) and a
// bookings total alongside the existing reach + spend numbers. These metrics
// come straight from the existing performance + by_campaign payload.
const formatCtr = (impressions: number, clicks: number): string => {
  const denom = Number(impressions || 0);
  if (denom <= 0) return "—";
  const ctr = (Number(clicks || 0) / denom) * 100;
  if (!Number.isFinite(ctr)) return "—";
  return `${ctr >= 10 ? ctr.toFixed(0) : ctr.toFixed(1)}%`;
};

type AdsDateRange = "today" | "7d" | "30d" | "all";
const AD_RANGES: { value: AdsDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

function rangeToParams(range: AdsDateRange): string {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (range === "all") return "";
  if (range === "today") return `?start_date=${end}&end_date=${end}`;
  const offsetDays = range === "7d" ? 6 : 29;
  const start = new Date(today.getTime() - offsetDays * 86400000).toISOString().slice(0, 10);
  return `?start_date=${start}&end_date=${end}`;
}

type ImpressionPack = {
  id: string;
  impressions: number;
  price_zar: number;
  display_order?: number;
  apple_product_id?: string | null;
};

type TimePack = {
  id: string;
  duration_days: number;
  label: string;
  price_zar: number;
  display_order?: number;
  apple_product_id?: string | null;
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

const PENDING_ORDER_FRESH_MS = 30 * 60 * 1000;

const LIFECYCLE_BADGE: Record<
  CampaignLifecycle,
  { label: string; color: string }
> = {
  awaiting_payment: { label: "Awaiting payment", color: "#b45309" },
  confirming: { label: "Confirming payment", color: "#1d4ed8" },
  payment_failed: { label: "Payment failed", color: "#dc2626" },
  active: { label: "Active", color: "#16a34a" },
  paused: { label: "Paused", color: "#d97706" },
  budget_exhausted: { label: "Budget exhausted", color: "#64748b" },
  expired: { label: "Expired", color: "#64748b" },
  delivered: { label: "Delivered", color: "#64748b" },
  cancelled: { label: "Cancelled", color: "#64748b" },
};

function isFreshPendingOrder(order: LatestBudgetOrder | null | undefined): boolean {
  if (!order || order.status !== "pending") return false;
  if (!order.created_at) return true;
  return Date.now() - new Date(order.created_at).getTime() < PENDING_ORDER_FRESH_MS;
}

function isPastCampaign(lifecycle: CampaignLifecycle | undefined): boolean {
  return (
    lifecycle === "budget_exhausted" ||
    lifecycle === "expired" ||
    lifecycle === "delivered" ||
    lifecycle === "cancelled"
  );
}

const packCardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  default: {},
});

const packCardElevation = Platform.OS === "android" ? { elevation: 5 } : {};

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

function effectiveCampaignStatus(campaign: Campaign, nowMs: number, metrics?: CampaignPerformance): string {
  const base = campaign.status;
  if (base !== "active") return base;

  if (campaign.billing_model === "time_based" && campaign.end_at && new Date(campaign.end_at).getTime() <= nowMs) {
    return "ended";
  }

  if (
    isImpressionPackCampaign(campaign) &&
    campaign.pack_impressions != null &&
    metrics &&
    Number(metrics.impressions ?? 0) >= Number(campaign.pack_impressions)
  ) {
    return "ended";
  }

  const budget = Number(campaign.budget || 0);
  if (campaign.billing_model === "cpc_budget" && budget > 0 && Number(campaign.spent ?? 0) >= budget) {
    return "ended";
  }

  return base;
}

function campaignProgress(c: Campaign, nowMs: number, metrics?: CampaignPerformance): number {
  if (isImpressionPackCampaign(c) && c.pack_impressions != null && metrics) {
    const cap = Number(c.pack_impressions);
    if (cap <= 0) return 0;
    return Math.max(0, Math.min(1, Number(metrics.impressions ?? 0) / cap));
  }
  if (c.billing_model === "time_based" && c.start_at && c.end_at) {
    const start = new Date(c.start_at).getTime();
    const end = new Date(c.end_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
    }
  }
  const budget = Number(c.budget || 0);
  if (budget <= 0) return 0;
  return Math.max(0, Math.min(1, Number(c.spent || 0) / budget));
}

/**
 * §Provider-paystack-audit 2026-05: shared post-payment status card. Phases
 * map directly to `AdsPaymentOutcome.phase` so future provisioning states can
 * extend it without touching the screen layout.
 */
function AdsPaymentOutcomeCard({
  outcome,
  onDismiss,
}: {
  outcome: AdsPaymentOutcome;
  onDismiss: () => void;
}) {
  if (outcome.phase === "idle") return null;

  const tone = (() => {
    if (outcome.phase === "provisioned") {
      return {
        wrap: "border-emerald-200 bg-emerald-50",
        iconWrap: "bg-emerald-100",
        iconColor: "#047857",
        icon: "checkmark-circle" as const,
        title: "text-emerald-900",
        body: "text-emerald-800",
      };
    }
    if (outcome.phase === "pending") {
      return {
        wrap: "border-blue-200 bg-blue-50",
        iconWrap: "bg-blue-100",
        iconColor: "#1d4ed8",
        icon: "time" as const,
        title: "text-blue-900",
        body: "text-blue-800",
      };
    }
    return {
      wrap: "border-amber-200 bg-amber-50",
      iconWrap: "bg-amber-100",
      iconColor: "#b45309",
      icon: "alert-circle" as const,
      title: "text-amber-900",
      body: "text-amber-800",
    };
  })();

  return (
    <View style={twStyle(`mb-4 flex-row items-start rounded-2xl border p-3 ${tone.wrap}`)}>
      <View style={twStyle(`mr-3 rounded-full p-2 ${tone.iconWrap}`)}>
        <Ionicons name={tone.icon} size={18} color={tone.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={twStyle(`text-sm font-semibold ${tone.title}`)}>{outcome.title}</Text>
        <Text style={twStyle(`text-xs ${tone.body}`)}>{outcome.body}</Text>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityLabel="Dismiss payment notification"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color={tone.iconColor} />
      </TouchableOpacity>
    </View>
  );
}

function remainingLine(c: Campaign, metrics: CampaignPerformance, currency: string, nowMs: number): string {
  if (c.billing_model === "time_based") {
    if (!c.end_at) return "Starts after payment";
    if (new Date(c.end_at).getTime() <= nowMs) return "Boost period ended";
    const days = Math.max(0, Math.ceil((new Date(c.end_at).getTime() - nowMs) / 86400000));
    return days === 1 ? "1 day remaining" : `${days} days remaining`;
  }
  if (isImpressionPackCampaign(c) && c.pack_impressions != null) {
    if (Number(metrics.impressions ?? 0) >= Number(c.pack_impressions)) {
      return "All impressions delivered";
    }
    const remaining = Math.max(0, Number(c.pack_impressions) - Number(metrics.impressions || 0));
    return `${formatCompactNumber(remaining)} impressions remaining`;
  }
  const budget = Number(c.budget || 0);
  if (budget > 0 && Number(c.spent ?? 0) >= budget) {
    return "Budget fully used";
  }
  return `${formatMoney(Math.max(0, budget - Number(c.spent || 0)), currency)} budget remaining`;
}

export default function AdsSettingsScreen() {
  const router = useRouter();
  const localParams = useLocalSearchParams<{
    payment_success?: string;
    payment_failed?: string;
    payment_pending?: string;
    campaign_id?: string;
  }>();
  const insets = useSafeAreaInsets();
  const tenantCurrency = getTenantDefaultCurrency();
  const { screenPadding, width, contentMaxWidth } = useResponsive();
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const enabled = Boolean(adsConfig?.enabled) || adsEnabled;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [campaignPerformance, setCampaignPerformance] = useState<Record<string, CampaignPerformance>>({});
  // §Ads-mobile-audit 2026-05: scope performance metrics with a date range
  // chip row (Today / 7d / 30d / All) — backend already accepts start_date +
  // end_date on /api/provider/ads/performance; we just expose it to the UI.
  const [perfRange, setPerfRange] = useState<AdsDateRange>("30d");
  // §Provider-paystack-audit 2026-05: drive a richer post-payment state machine.
  // `paymentOutcome` powers the success/pending/failed card surfaced at the top
  // of the screen after Paystack closes — we replaced the old boolean banner so
  // we can show model-specific copy and never falsely claim a campaign is live
  // before the webhook has provisioned the budget on the server.
  const [paymentOutcome, setPaymentOutcome] = useState<AdsPaymentOutcome>({ phase: "idle" });
  const [showEndedCampaigns, setShowEndedCampaigns] = useState(false);
  const [packs, setPacks] = useState<ImpressionPack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("time_based");
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [creatingPackId, setCreatingPackId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const appStateRef = useRef(AppState.currentState);
  // §Ads-enterprise-hardening 2026-06: world-class checkout UX. A polished
  // review/summary sheet replaces the native Alert confirm, and a full-screen
  // processing overlay covers the verify + provisioning poll so the flow never
  // looks frozen — matching the customer product-order checkout.
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Confirming your payment…");
  const [processingHint, setProcessingHint] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<AdsCheckoutReview | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const reviewResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const packCardWidth = Math.round(Math.min(182, Math.max(154, (Math.min(width, contentMaxWidth) - screenPadding * 2 - 40) / 2)));
  const packSnapGap = 12;

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
  const cpcBudgetAvailable =
    (availableModels.length === 0 || availableModels.includes("cpc_budget")) && !shouldUseAppleIap();
  const applePackProductIds = useMemo(
    () =>
      [...packs, ...timePacks]
        .map((p) => p.apple_product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [packs, timePacks],
  );
  const { byId: applePackPrices } = useAppleIapProducts(applePackProductIds);

  const packDisplayPrice = useCallback(
    (pack: { price_zar: number; apple_product_id?: string | null }) => {
      if (shouldUseAppleIap() && pack.apple_product_id) {
        const applePrice = applePackPrices.get(pack.apple_product_id)?.displayPrice;
        if (applePrice) return applePrice;
      }
      return formatMoney(Number(pack.price_zar), tenantCurrency);
    },
    [applePackPrices, tenantCurrency],
  );

  const loadAll = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const [campRes, perfRes, packsRes, catRes] = await Promise.all([
        api.get<Campaign[]>("/api/provider/ads/campaigns"),
        api.get<{ summary: PerformanceSummary; by_campaign?: Record<string, CampaignPerformance> }>(
          `/api/provider/ads/performance${rangeToParams(perfRange)}`,
        ),
        api.get<{ impression_packs: ImpressionPack[]; time_packs: TimePack[]; available_models: string[]; default_model?: string }>("/api/provider/ads/packs"),
        api.get<GlobalCategory[]>("/api/public/categories/global?all=true"),
      ]);
      const anyError = campRes.error || perfRes.error || packsRes.error;
      if (anyError) {
        Alert.alert("Error", "Some ads data could not be loaded. Pull to refresh.");
      }
      setCampaigns(Array.isArray(campRes.data) ? campRes.data : []);
      setPerformance(perfRes.data?.summary ?? null);
      setCampaignPerformance(perfRes.data?.by_campaign ?? {});
      const pd = packsRes.data;
      if (pd && typeof pd === "object" && !Array.isArray(pd)) {
        setPacks(Array.isArray(pd.impression_packs) ? pd.impression_packs : []);
        setTimePacks(Array.isArray(pd.time_packs) ? pd.time_packs : []);
        setAvailableModels(Array.isArray(pd.available_models) ? pd.available_models : []);
        setDefaultModel(typeof pd.default_model === "string" ? pd.default_model : "time_based");
      } else {
        setPacks(Array.isArray(pd) ? (pd as ImpressionPack[]) : []);
      }
      setGlobalCategories(normalizeCategories(catRes.data));
    } catch {
      setCampaigns([]);
      setPerformance(null);
      setCampaignPerformance({});
      setPacks([]);
      setGlobalCategories([]);
      Alert.alert("Error", "Failed to load ads data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setNowMs(Date.now());
    }
  }, [enabled, perfRange]);

  // §Ads-mobile-audit 2026-05: total bookings + CTR aren't in the API summary
  // — derive them from `by_campaign` so the dashboard can show the metric
  // that actually proves ads are working (booking-driven revenue).
  const totalBooks = useMemo(
    () => Object.values(campaignPerformance).reduce((sum, m) => sum + Number(m.books || 0), 0),
    [campaignPerformance],
  );
  const aggregateCtr = useMemo(
    () => formatCtr(Number(performance?.impressions || 0), Number(performance?.clicks || 0)),
    [performance],
  );

  const adsPaystackCheckout = useInAppPaystackCheckout();

  /**
   * §Provider-paystack-audit 2026-05: Open Paystack inside the in-app browser,
   * wait for the HTTPS bridge return URL, then verify + poll until the campaign
   * is provisioned on the server. The shared matchers / pollers keep this in
   * lock-step with the subscription flow so the UX doesn't drift over time.
   */
  const openAdsPaystack = useCallback(
    async (
      payUrl: string,
      opts?: {
        campaignId?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        productLabel?: string;
      },
    ) => {
      const returnUrl = getAdsPaystackReturnUrl();
      const result = await adsPaystackCheckout.waitForCheckout(payUrl, {
        title: "Ad payment",
        returnUrl,
        matchSuccess: (rawUrl) => matchesAdsPaystackReturnUrl(rawUrl, { success: true }),
        matchCancel: (rawUrl) => matchesAdsPaystackReturnUrl(rawUrl, { cancelled: true }),
      });

      const campaignId = opts?.campaignId;
      let orderId = opts?.orderId;
      let amount = opts?.amount;
      const payCurrency = opts?.currency ?? tenantCurrency;
      const productLabel = opts?.productLabel;

      if (result?.outcome === "cancel" || result?.outcome === "closed") {
        const failed = adsFailedCopy("Payment wasn't completed.");
        setPaymentOutcome({ phase: "failed", campaignId, ...failed });
        await loadAll();
        return;
      }

      if (result?.outcome !== "success") {
        await loadAll();
        return;
      }

      setProcessing(true);
      setProcessingMessage("Confirming your payment…");
      setProcessingHint("We're verifying with Paystack — this usually takes a few seconds.");
      try {
        const reference = extractPaystackReferenceFromUrl(result.url);
        const verifyResult = reference ? await verifyPaystackWithRetry<{
          adsBudgetOrderId?: string;
          campaignId?: string;
          type?: string;
        }>(reference) : null;

        if (verifyResult?.status === "failed") {
          const failed = adsFailedCopy(verifyResult.errorMessage ?? null);
          setPaymentOutcome({ phase: "failed", campaignId, ...failed });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          await loadAll();
          return;
        }

        if (verifyResult?.data?.adsBudgetOrderId) {
          orderId = orderId ?? verifyResult.data.adsBudgetOrderId;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setProcessingMessage("Activating your campaign…");
        setProcessingHint("Funding your ad budget — almost there.");

        const resolvedCampaignId = campaignId ?? verifyResult?.data?.campaignId ?? undefined;

        if (resolvedCampaignId) {
          const provisioned = await pollCampaignProvisioned(resolvedCampaignId, {
            maxAttempts: 6,
            delayMs: 1500,
          });
          if (provisioned.state === "provisioned") {
            const copy = adsSuccessCopy(provisioned.campaign, tenantCurrency);
            setPaymentOutcome({ phase: "provisioned", campaignId: resolvedCampaignId, ...copy });
            if (amount == null && provisioned.campaign.budget) {
              amount = Number(provisioned.campaign.budget);
            }
            const successParams: Record<string, string> = {
              campaign_id: resolvedCampaignId,
              title: copy.title,
              body: copy.body,
            };
            if (orderId) successParams.order_id = orderId;
            if (reference) successParams.reference = reference;
            if (amount != null && Number.isFinite(amount)) {
              successParams.amount = String(amount);
            }
            if (payCurrency) successParams.currency = payCurrency;
            if (productLabel) successParams.product_label = productLabel;
            router.replace({
              pathname: "/(app)/(tabs)/more/settings/ads-payment-success",
              params: successParams,
            });
          } else {
            const copy = adsPendingCopy();
            setPaymentOutcome({ phase: "pending", campaignId: resolvedCampaignId, ...copy });
          }
        } else {
          const copy = adsPendingCopy();
          setPaymentOutcome({ phase: "pending", ...copy });
        }

        await loadAll();
        setTimeout(() => {
          void loadAll();
        }, 1500);
      } finally {
        setProcessing(false);
        setProcessingMessage("Confirming your payment…");
        setProcessingHint(null);
      }
    },
    [adsPaystackCheckout, loadAll, router, tenantCurrency],
  );

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  /**
   * §Provider-paystack-audit 2026-05: when the cold-start payment-return screen
   * navigates here with `payment_success=1`, surface the same outcome card as
   * the in-app flow. Polls a few times in case the campaign GET hasn't caught
   * the webhook update yet.
   */
  const coldStartHandledRef = useRef(false);
  useEffect(() => {
    const successFlag = localParams.payment_success === "1" || localParams.payment_success === "true";
    const failedFlag = localParams.payment_failed === "1" || localParams.payment_failed === "true";
    const pendingFlag = localParams.payment_pending === "1" || localParams.payment_pending === "true";
    const campaignId = typeof localParams.campaign_id === "string" ? localParams.campaign_id : undefined;
    if (!successFlag && !failedFlag && !pendingFlag) return;
    if (coldStartHandledRef.current) return;
    coldStartHandledRef.current = true;

    const handle = async () => {
      if (failedFlag) {
        const failed = adsFailedCopy();
        setPaymentOutcome({ phase: "failed", campaignId, ...failed });
        await loadAll();
        return;
      }
      if (pendingFlag && !successFlag) {
        const pending = adsPendingCopy();
        setPaymentOutcome({ phase: "pending", campaignId, ...pending });
        await loadAll();
        return;
      }
      if (campaignId) {
        const result = await pollCampaignProvisioned(campaignId, { maxAttempts: 6, delayMs: 1500 });
        if (result.state === "provisioned") {
          const copy = adsSuccessCopy(result.campaign, tenantCurrency);
          setPaymentOutcome({ phase: "provisioned", campaignId, ...copy });
        } else {
          const copy = adsPendingCopy();
          setPaymentOutcome({ phase: "pending", campaignId, ...copy });
        }
      } else {
        const copy = adsPendingCopy();
        setPaymentOutcome({ phase: "pending", ...copy });
      }
      await loadAll();
    };
    void handle();
  }, [localParams.payment_success, localParams.payment_failed, localParams.payment_pending, localParams.campaign_id, loadAll, tenantCurrency]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        setNowMs(Date.now());
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

  /**
   * §Ads-enterprise-hardening 2026-06: present the polished review sheet and
   * resolve true/false when the provider confirms or dismisses. Mirrors the
   * previous promise-based confirm contract so call sites stay simple.
   */
  const requestAdsCheckout = useCallback(
    (review: AdsCheckoutReview) =>
      new Promise<boolean>((resolve) => {
        reviewResolverRef.current = resolve;
        setReviewSubmitting(false);
        setReviewState(review);
      }),
    [],
  );

  const handleReviewConfirm = useCallback(() => {
    Haptics.selectionAsync();
    setReviewSubmitting(true);
    const resolver = reviewResolverRef.current;
    reviewResolverRef.current = null;
    setReviewState(null);
    setReviewSubmitting(false);
    resolver?.(true);
  }, []);

  const handleReviewClose = useCallback(() => {
    const resolver = reviewResolverRef.current;
    reviewResolverRef.current = null;
    setReviewState(null);
    setReviewSubmitting(false);
    resolver?.(false);
  }, []);

  const handleCreateCampaign = useCallback(async () => {
    const budgetNum = parseFloat(createForm.budget.replace(/,/g, "."));
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      Alert.alert("Invalid", `Enter a valid total budget (${tenantCurrency}).`);
      return;
    }
    if (budgetNum > 0) {
      const dailyCap = createForm.daily_budget ? parseFloat(createForm.daily_budget.replace(/,/g, ".")) : null;
      const bidCpc = createForm.bid_cpc ? parseFloat(createForm.bid_cpc.replace(/,/g, ".")) : 0;
      const lineItems = [{ label: "Campaign budget", value: formatMoney(budgetNum, tenantCurrency) }];
      if (dailyCap && Number.isFinite(dailyCap) && dailyCap > 0) {
        lineItems.push({ label: "Daily cap", value: formatMoney(dailyCap, tenantCurrency) });
      }
      if (bidCpc && Number.isFinite(bidCpc) && bidCpc > 0) {
        lineItems.push({ label: "Bid per click", value: `${formatMoney(bidCpc, tenantCurrency)}/click` });
      }
      lineItems.push({ label: "Total due", value: formatMoney(budgetNum, tenantCurrency) });
      const confirmed = await requestAdsCheckout({
        heading: "CPC budget",
        title: `${formatMoney(budgetNum, tenantCurrency)} campaign budget`,
        subtitle: "Pay-per-click campaign with full control over spend and bids.",
        benefits: [
          "Sponsored placement in eligible category searches",
          "You only pay as your ad earns clicks",
          "Pause or end anytime — unspent budget stops serving",
        ],
        lineItems,
        total: formatMoney(budgetNum, tenantCurrency),
        confirmLabel: `Pay ${formatMoney(budgetNum, tenantCurrency)}`,
      });
      if (!confirmed) return;
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
        await openAdsPaystack(payUrl, {
          campaignId: campaign?.id,
          orderId: adsCreateOrderId(data),
          amount: budgetNum,
          currency: tenantCurrency,
          productLabel: "CPC budget",
        });
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
  }, [createForm, loadAll, tenantCurrency, requestAdsCheckout, openAdsPaystack]);

  const handleBuyPack = useCallback(
    async (pack: ImpressionPack) => {
      const confirmed = await requestAdsCheckout({
        heading: "Impression pack",
        title: `${formatCompactNumber(pack.impressions)} sponsored impressions`,
        subtitle: "Prepaid reach — placements deliver until the pack is fully shown.",
        benefits: [
          `${formatCompactNumber(pack.impressions)} guaranteed sponsored impressions`,
          "Delivery starts only after payment is verified",
          "No bidding or daily caps to manage",
        ],
        lineItems: [
          { label: "Impression pack", value: formatCompactNumber(pack.impressions) },
          { label: "Total due", value: packDisplayPrice(pack) },
        ],
        total: packDisplayPrice(pack),
        confirmLabel: shouldUseAppleIap() ? `Purchase ${packDisplayPrice(pack)}` : `Pay ${packDisplayPrice(pack)}`,
      });
      if (!confirmed) return;

      setCreatingPackId(pack.id);
      try {
        const targeting =
          createForm.global_category_ids.length > 0
            ? { global_category_ids: createForm.global_category_ids }
            : undefined;

        if (shouldUseAppleIap()) {
          setProcessing(true);
          setProcessingMessage("Processing App Store purchase…");
          const appleResult = await createAdsCampaignWithApplePayment({
            impression_pack_id: pack.id,
            targeting,
          });
          setProcessing(false);
          if (!appleResult.ok) {
            if (!appleResult.cancelled) {
              Alert.alert("Error", appleResult.error);
            }
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          loadAll();
          Alert.alert("Done", "Impression pack purchased and campaign created.");
          return;
        }

        const res = await api.post<
          Campaign | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null }
        >(
          "/api/provider/ads/campaigns",
          {
            ...ADS_NATIVE_PAYMENT,
            impression_pack_id: pack.id,
            targeting,
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
          await openAdsPaystack(payUrl, {
            campaignId: campaign?.id,
            orderId: adsCreateOrderId(data),
            amount: pack.price_zar,
            currency: tenantCurrency,
            productLabel: "Impression pack",
          });
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
    [loadAll, createForm.global_category_ids, requestAdsCheckout, tenantCurrency, openAdsPaystack]
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

  /**
   * §Provider-paystack-audit 2026-05: re-open Paystack for a draft campaign
   * whose first payment didn't land (closed, declined, or otherwise stuck on
   * "awaiting payment"). Posts to a dedicated retry-checkout endpoint that
   * recomputes the amount, marks any stale `pending` order as `failed`, and
   * issues a fresh HTTPS Paystack init so the same draft can be funded.
   */
  const handleRetryAdsPayment = useCallback(
    async (campaign: Campaign) => {
      const review = buildAdsRetryCheckoutReview(campaign, tenantCurrency);
      const confirmed = await requestAdsCheckout(review);
      if (!confirmed) return;

      setUpdating(campaign.id);
      try {
        if (shouldUseAppleIap()) {
          setProcessing(true);
          setProcessingMessage("Processing App Store purchase…");
          const appleResult = await retryAdsCampaignWithApplePayment(campaign.id);
          setProcessing(false);
          if (!appleResult.ok) {
            if (!appleResult.cancelled) {
              Alert.alert("Error", appleResult.error);
            }
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Success", "Purchase completed. Your campaign will start shortly.");
          await loadAll();
          return;
        }

        const res = await api.post<{
          payment_url?: string | null;
          order_id?: string;
          campaign_id?: string;
        }>(
          `/api/provider/ads/campaigns/${campaign.id}/checkout`,
          ADS_NATIVE_PAYMENT,
        );
        if (res.error) {
          Alert.alert("Error", getApiErrorMessage(res.error, "Couldn't reopen Paystack"));
          return;
        }
        const payUrl = (res.data?.payment_url ?? "").trim();
        if (!payUrl) {
          Alert.alert("Error", "Paystack didn't return a payment URL. Please try again.");
          return;
        }
        const orderId = res.data?.order_id ?? campaign.latest_budget_order?.id;
        const amount =
          Number(campaign.latest_budget_order?.amount ?? campaign.budget ?? 0) || undefined;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await openAdsPaystack(payUrl, {
          campaignId: campaign.id,
          orderId,
          amount,
          currency: campaign.latest_budget_order?.currency ?? tenantCurrency,
          productLabel: campaignModelLabel(campaign),
        });
      } catch (e: unknown) {
        Alert.alert(
          "Error",
          getApiErrorMessage(
            e,
            shouldUseAppleIap() ? "Couldn't restart App Store payment" : "Couldn't reopen Paystack",
          ),
        );
      } finally {
        setProcessing(false);
        setUpdating(null);
      }
    },
    [loadAll, openAdsPaystack, requestAdsCheckout, tenantCurrency],
  );

  /**
   * §Provider-paystack-audit 2026-05: explicit "Cancel campaign" affordance
   * for unpaid drafts. Maps to the existing `status: ended` PATCH but with
   * cancel-style copy so providers don't have to interpret the generic "End"
   * action when they simply want to drop a draft they never paid for.
   */
  const handleCancelDraft = useCallback(
    (campaign: Campaign) => {
      Alert.alert(
        "Remove this campaign?",
        "No charge was made. The draft will be cancelled and removed from your active list.",
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Cancel campaign",
            style: "destructive",
            onPress: () => handleSetStatus(campaign.id, "ended"),
          },
        ],
      );
    },
    [handleSetStatus],
  );

  const handleAbandonPendingOrder = useCallback(
    async (campaign: Campaign) => {
      const orderId = campaign.latest_budget_order?.id;
      if (!orderId) return;
      setUpdating(campaign.id);
      try {
        const res = await api.post(`/api/provider/ads/budget-orders/${orderId}/abandon`, {});
        if (res.error) {
          Alert.alert("Error", getApiErrorMessage(res.error, "Couldn't cancel the payment"));
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
      } catch (e: unknown) {
        Alert.alert("Error", getApiErrorMessage(e, "Couldn't cancel the payment"));
      } finally {
        setUpdating(null);
      }
    },
    [loadAll],
  );

  const handleViewReceipt = useCallback(
    async (campaign: Campaign) => {
      const orderId = campaign.latest_budget_order?.id;
      if (!orderId) {
        Alert.alert("Receipt unavailable", "No paid order found for this campaign.");
        return;
      }
      setUpdating(campaign.id);
      try {
        const res = await api.post<{ url?: string }>(
          `/api/provider/ads/orders/${orderId}/receipt/signed-url`,
          {},
        );
        if (res.error) {
          Alert.alert("Error", getApiErrorMessage(res.error, "Couldn't open the receipt"));
          return;
        }
        const signed = res.data?.url?.trim();
        if (!signed) {
          Alert.alert("Error", "Couldn't open the receipt.");
          return;
        }
        pushInAppBrowser(router, signed, "Receipt");
      } catch (e: unknown) {
        Alert.alert("Error", getApiErrorMessage(e, "Couldn't open the receipt"));
      } finally {
        setUpdating(null);
      }
    },
    [router],
  );

  const handleBuyAgain = useCallback((campaign: Campaign) => {
    setCreateForm({
      budget: String(campaign.budget ?? ""),
      daily_budget: campaign.daily_budget != null ? String(campaign.daily_budget) : "",
      bid_cpc: campaign.bid_cpc != null ? String(campaign.bid_cpc) : "",
      global_category_ids: campaign.targeting?.global_category_ids ?? [],
    });
    if (isTimeBasedCampaign(campaign) || isImpressionPackCampaign(campaign)) {
      Alert.alert("Buy again", "Pick a boost or pack above to run another campaign with the same targeting.");
      return;
    }
    setCreateOpen(true);
  }, []);

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
    <>
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Paid ads"
        subtitle="Boost discovery, target categories, and track reach"
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[twStyle("px-4 pt-4"), { paddingHorizontal: screenPadding }]}>
          {/* §Provider-paystack-audit 2026-05 (payment outcome card): replaces
            the old transient "Payment confirmed" banner with a richer state
            machine. We surface model-specific success copy when the server
            confirms provisioning, a softer "received — confirming" message
            when we time out polling, and a clear failure state with retry /
            cancel guidance so providers never see an ambiguous result. */}
          <AdsPaymentOutcomeCard
            outcome={paymentOutcome}
            onDismiss={() => setPaymentOutcome({ phase: "idle" })}
          />

          {/* Performance */}
          {performance && (
            <View style={twStyle("mb-6")}>
              <View style={twStyle("mb-2 flex-row items-end justify-between")}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={twStyle("text-sm font-semibold text-gray-700")}>Ad performance</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    Reach, clicks, bookings, and spend for the selected window.
                  </Text>
                </View>
              </View>

              {/* §Ads-mobile-audit 2026-05 (date range filter): the perf API
                already accepts start_date / end_date — expose it as a chip
                row so providers can pivot between Today / 7d / 30d / All. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
                style={twStyle("mb-3")}
              >
                {AD_RANGES.map((r) => {
                  const active = perfRange === r.value;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => {
                        if (perfRange === r.value) return;
                        Haptics.selectionAsync();
                        setPerfRange(r.value);
                      }}
                      style={twStyle(
                        `rounded-full border px-3 py-2 ${active ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"}`,
                      )}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-gray-700"}`)}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Six-tile grid: Impressions / Reach / Clicks / CTR / Bookings / Spend. */}
              <View style={twStyle("flex-row flex-wrap")}>
                {[
                  {
                    icon: "eye-outline" as const,
                    label: "Impressions",
                    value: formatCompactNumber(performance.impressions),
                    accent: "#6b7280",
                  },
                  {
                    icon: "people-outline" as const,
                    label: "Reach",
                    value: formatCompactNumber(performance.reach),
                    accent: "#6b7280",
                  },
                  {
                    icon: "hand-left-outline" as const,
                    label: "Clicks",
                    value: formatCompactNumber(performance.clicks),
                    accent: "#6b7280",
                  },
                  {
                    icon: "trending-up-outline" as const,
                    label: "CTR",
                    value: aggregateCtr,
                    accent: "#4f46e5",
                  },
                  {
                    icon: "calendar-outline" as const,
                    label: "Bookings",
                    value: formatCompactNumber(totalBooks),
                    accent: "#059669",
                  },
                  {
                    icon: "wallet-outline" as const,
                    label: "Spend",
                    value: formatMoney(Number(performance.spend), tenantCurrency),
                    accent: "#6b7280",
                  },
                ].map((tile, idx) => (
                  <View
                    key={tile.label}
                    style={[
                      twStyle("rounded-2xl border border-gray-200 bg-white p-4 mb-2"),
                      {
                        flexBasis: "48%",
                        marginRight: idx % 2 === 0 ? "4%" : 0,
                      },
                    ]}
                  >
                    <Ionicons name={tile.icon} size={20} color={tile.accent} />
                    <Text style={twStyle("text-2xl font-bold text-gray-900 mt-1")}>{tile.value}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{tile.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={twStyle("mb-5 rounded-3xl border border-indigo-100 bg-indigo-50 p-4")}>
            <View style={twStyle("flex-row items-start gap-3")}>
              <View style={twStyle("rounded-2xl bg-white p-2")}>
                <Ionicons name="sparkles-outline" size={22} color="#4f46e5" />
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-base font-semibold text-gray-950")}>Choose how you want to grow</Text>
                <Text style={twStyle("mt-1 text-sm leading-5 text-gray-600")}>
                  {defaultModel === "time_based"
                    ? "Recommended: buy a time boost for predictable visibility over a fixed number of days."
                    : defaultModel === "impression_pack"
                      ? "Recommended: buy a fixed impression pack and track delivery until it is used."
                      : "Recommended: set a custom CPC budget if you want manual control over spend and bids."}
                </Text>
              </View>
            </View>
          </View>

          {globalCategories.length > 0 && (timePacks.length > 0 || packs.length > 0) && (
            <View style={twStyle("mb-5")}>
              <View style={twStyle("flex-row items-center justify-between mb-1")}>
                <Text style={twStyle("text-sm font-semibold text-gray-700")}>Target categories (optional)</Text>
                {createForm.global_category_ids.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setCreateForm((p) => ({ ...p, global_category_ids: [] }))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={twStyle("text-xs font-semibold text-indigo-600")}>Clear ({createForm.global_category_ids.length})</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
                        `rounded-full px-3.5 py-2.5 border ${
                          selected ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"
                        }`
                      )}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text style={twStyle(`text-sm ${selected ? "text-white font-medium" : "text-gray-700"}`)}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Time-based boost packs */}
          {timePacks.length > 0 && availableModels.includes("time_based") && (
            <View style={twStyle("mb-7")}>
              <View style={twStyle("flex-row items-center gap-2 mb-1")}>
                <Text style={twStyle("text-base font-semibold text-gray-900")}>Boost for a set number of days</Text>
                {defaultModel === "time_based" ? (
                  <Text style={twStyle("rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800")}>
                    Recommended
                  </Text>
                ) : null}
              </View>
              <Text style={twStyle("text-sm text-gray-500 mb-4 leading-5")}>
                Flat fee — your profile stays in sponsored placement for the whole window.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={packCardWidth + packSnapGap}
                snapToAlignment="start"
                contentContainerStyle={{
                  paddingRight: screenPadding + 8,
                  gap: packSnapGap,
                  paddingVertical: 4,
                }}
              >
                {timePacks.map((tp) => (
                  <TouchableOpacity
                    key={tp.id}
                    onPress={async () => {
                      const daysLabel =
                        tp.duration_days === 1 ? "1 day" : `${tp.duration_days} days`;
                      const confirmed = await requestAdsCheckout({
                        heading: "Time boost",
                        title: tp.label?.trim() ? tp.label : `${daysLabel} boost`,
                        subtitle: `Flat fee — sponsored placement for ${daysLabel}.`,
                        benefits: [
                          `Sponsored placement for the full ${daysLabel}`,
                          "Predictable flat price — no per-click charges",
                          "Goes live only after payment is verified",
                        ],
                        lineItems: [
                          { label: "Boost duration", value: daysLabel },
                          { label: "Total due", value: packDisplayPrice(tp) },
                        ],
                        total: packDisplayPrice(tp),
                        confirmLabel: shouldUseAppleIap() ? `Purchase ${packDisplayPrice(tp)}` : `Pay ${packDisplayPrice(tp)}`,
                      });
                      if (!confirmed) return;

                      setCreatingPackId(tp.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      try {
                        const targeting = createForm.global_category_ids.length > 0
                          ? { global_category_ids: createForm.global_category_ids }
                          : {};

                        if (shouldUseAppleIap()) {
                          setProcessing(true);
                          setProcessingMessage("Processing App Store purchase…");
                          const appleResult = await createAdsCampaignWithApplePayment({
                            time_pack_id: tp.id,
                            targeting,
                          });
                          setProcessing(false);
                          if (!appleResult.ok) {
                            if (!appleResult.cancelled) {
                              Alert.alert("Error", appleResult.error);
                            }
                            return;
                          }
                          Alert.alert("Success", "Time boost purchased and campaign created.");
                          loadAll();
                          return;
                        }

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
                          await openAdsPaystack(payUrl, {
                            campaignId: campaign?.id,
                            orderId: adsCreateOrderId(data),
                            amount: tp.price_zar,
                            currency: tenantCurrency,
                            productLabel: "Time boost",
                          });
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
                    activeOpacity={0.85}
                    style={{ width: packCardWidth }}
                  >
                    <LinearGradient
                      colors={["#10b981", "#059669", "#047857"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        borderRadius: 20,
                        padding: 1.5,
                        ...packCardShadow,
                        ...packCardElevation,
                      }}
                    >
                      <View
                        style={{
                          borderRadius: 18,
                          backgroundColor: "#ffffff",
                          paddingHorizontal: 16,
                          paddingVertical: 16,
                          minHeight: 148,
                          justifyContent: "space-between",
                        }}
                      >
                        <View>
                          <Text style={twStyle("text-[11px] font-semibold uppercase tracking-wider text-emerald-600")}>
                            Time boost
                          </Text>
                          <Text style={[twStyle("text-3xl font-bold text-gray-900 mt-1"), { fontVariant: ["tabular-nums"] }]}>
                            {tp.duration_days}
                          </Text>
                          <Text style={twStyle("text-sm text-gray-600 mt-0.5")} numberOfLines={2}>
                            {tp.label?.trim() ? tp.label : tp.duration_days === 1 ? "day in sponsored slots" : "days in sponsored slots"}
                          </Text>
                        </View>
                        <View style={twStyle("mt-3 pt-3 border-t border-gray-100")}>
                          <Text style={twStyle("text-lg font-bold text-gray-900")}>
                            {packDisplayPrice(tp)}
                          </Text>
                          {creatingPackId === tp.id ? (
                            <ActivityIndicator size="small" color="#047857" style={{ marginTop: 10 }} />
                          ) : (
                            <Text style={twStyle("text-xs font-semibold text-emerald-600 mt-2")}>Tap to purchase →</Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Impression packs */}
          {packs.length > 0 && availableModels.includes("impression_pack") && (
            <View style={twStyle("mb-7")}>
              <View style={twStyle("flex-row items-center gap-2 mb-1")}>
                <Text style={twStyle("text-base font-semibold text-gray-900")}>Buy impressions</Text>
                {defaultModel === "impression_pack" ? (
                  <Text style={twStyle("rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800")}>
                    Recommended
                  </Text>
                ) : null}
              </View>
              <Text style={twStyle("text-sm text-gray-500 mb-4 leading-5")}>
                Prepaid reach — your sponsored placements deliver until the pack is fully shown.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={packCardWidth + packSnapGap}
                snapToAlignment="start"
                contentContainerStyle={{
                  paddingRight: screenPadding + 8,
                  gap: packSnapGap,
                  paddingVertical: 4,
                }}
              >
                {packs.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    onPress={() => handleBuyPack(pack)}
                    disabled={!!creatingPackId}
                    activeOpacity={0.85}
                    style={{ width: packCardWidth }}
                  >
                    <LinearGradient
                      colors={["#7c3aed", "#6366f1", "#4f46e5"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        borderRadius: 20,
                        padding: 1.5,
                        ...packCardShadow,
                        ...packCardElevation,
                      }}
                    >
                      <View
                        style={{
                          borderRadius: 18,
                          backgroundColor: "#ffffff",
                          paddingHorizontal: 16,
                          paddingVertical: 16,
                          minHeight: 148,
                          justifyContent: "space-between",
                        }}
                      >
                        <View>
                          <Text style={twStyle("text-[11px] font-semibold uppercase tracking-wider text-violet-700")}>
                            Impression pack
                          </Text>
                          <Text style={[twStyle("text-3xl font-bold text-gray-900 mt-1"), { fontVariant: ["tabular-nums"] }]}>
                            {formatCompactNumber(pack.impressions)}
                          </Text>
                          <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>sponsored impressions</Text>
                        </View>
                        <View style={twStyle("mt-3 pt-3 border-t border-gray-100")}>
                          <Text style={twStyle("text-lg font-bold text-gray-900")}>
                            {packDisplayPrice(pack)}
                          </Text>
                          {creatingPackId === pack.id ? (
                            <ActivityIndicator size="small" color="#5b21b6" style={{ marginTop: 10 }} />
                          ) : (
                            <Text style={twStyle("text-xs font-semibold text-violet-600 mt-2")}>Tap to purchase →</Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Campaigns */}
          <View style={twStyle("mb-4")}>
            <View style={twStyle("mb-3 flex-row flex-wrap items-start justify-between gap-2")}>
              <View style={twStyle("flex-1 min-w-[65%]")}>
                <Text style={twStyle("text-sm font-semibold text-gray-700")}>Campaigns</Text>
                <Text style={twStyle("text-xs text-gray-500")}>Edit targeting, pause/activate, and track delivery per campaign.</Text>
              </View>
              {cpcBudgetAvailable && (
                <ActionButton
                  label="New campaign"
                  onPress={() => setCreateOpen(true)}
                  variant="primary"
                  size="sm"
                  icon="add"
                  style={twStyle("self-start")}
                />
              )}
            </View>
            {cpcBudgetAvailable && defaultModel === "cpc_budget" ? (
              <View style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>Custom CPC budget is recommended by the marketplace</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-gray-500")}>
                  Use this when you want to control total spend, daily cap, and bid. Fixed boosts and packs stay locked to admin pricing.
                </Text>
              </View>
            ) : null}
            {campaigns.some((c) => isPastCampaign(c.lifecycle)) ? (
              <TouchableOpacity
                onPress={() => setShowEndedCampaigns((v) => !v)}
                style={twStyle("mb-3 self-start rounded-lg border border-gray-300 bg-white px-3 py-2")}
              >
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>
                  {showEndedCampaigns ? "Hide past campaigns" : "Show past campaigns"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {campaigns.filter((c) => showEndedCampaigns || !isPastCampaign(c.lifecycle)).length === 0 ? (
              campaigns.length === 0 ? (
              // §Ads-mobile-audit 2026-05: empty state previously referenced
              // "packs above" even when no packs were configured. Now the
              // copy + CTA adapts to what's actually available so the
              // provider always has a clear next action.
              <View style={twStyle("rounded-3xl border border-gray-200 bg-gray-50 p-6 items-center")}>
                <View style={twStyle("rounded-full bg-white p-3 mb-3")}>
                  <Ionicons name="megaphone-outline" size={28} color="#4f46e5" />
                </View>
                <Text style={twStyle("text-base font-semibold text-gray-900 text-center")}>
                  Get found by more clients
                </Text>
                <Text style={twStyle("mt-2 text-sm text-gray-600 text-center leading-5 px-2")}>
                  {(() => {
                    const hasPacks = timePacks.length > 0 || packs.length > 0;
                    if (cpcBudgetAvailable && hasPacks) {
                      return "Pick a time boost or impression pack above, or run a custom CPC campaign with full control over bids and spend.";
                    }
                    if (cpcBudgetAvailable) {
                      return "Run a custom CPC campaign with full control over your total budget, daily cap, and bid per click.";
                    }
                    if (hasPacks) {
                      return "Pick a time boost or impression pack above to start running sponsored placements.";
                    }
                    return "Sponsored placements are not yet open in your market. Check back soon.";
                  })()}
                </Text>
                {cpcBudgetAvailable ? (
                  <ActionButton
                    label="New CPC campaign"
                    onPress={() => setCreateOpen(true)}
                    variant="primary"
                    icon="add"
                    style={twStyle("mt-4")}
                  />
                ) : null}
              </View>
              ) : (
              <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-5")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>No active campaigns</Text>
                <Text style={twStyle("mt-1 text-xs text-gray-600")}>
                  Past campaigns are hidden. Tap show past campaigns to review ended boosts.
                </Text>
              </View>
              )
            ) : (
              <View style={twStyle("gap-3")}>
                {campaigns
                  .filter((c) => showEndedCampaigns || !isPastCampaign(c.lifecycle))
                  .map((c) => {
                  const metrics = campaignPerformance[c.id] ?? {
                    impressions: 0,
                    reach: 0,
                    clicks: 0,
                    books: 0,
                    spent: Number(c.spent ?? 0),
                  };
                  const lifecycle = c.lifecycle;
                  const lifecycleBadge =
                    lifecycle && LIFECYCLE_BADGE[lifecycle] ? LIFECYCLE_BADGE[lifecycle] : null;
                  const hasBudgetLeft = Number(c.budget) > Number(c.spent ?? 0);
                  const isUnfundedDraft =
                    (c.status === "draft" || c.status === "paused") && !hasBudgetLeft;
                  const paymentState: CampaignPaymentState =
                    c.payment_state ?? (isUnfundedDraft ? "unpaid" : "none");
                  const freshPending =
                    paymentState === "pending" && isFreshPendingOrder(c.latest_budget_order);
                  const canActivate =
                    (c.status === "draft" || c.status === "paused") &&
                    hasBudgetLeft &&
                    paymentState === "paid";
                  const progress = campaignProgress(c, nowMs, metrics);
                  return (
                    <View key={c.id} style={twStyle("rounded-2xl border border-gray-200 bg-white p-4")}>
                      <View style={twStyle("flex-row items-start justify-between gap-2 flex-wrap")}>
                        <View style={twStyle("flex-1 min-w-[60%]")}>
                          <View style={twStyle("flex-row items-center gap-2 flex-wrap mb-1")}>
                            <Text style={twStyle("text-sm font-semibold text-gray-900 capitalize")}>
                              {campaignModelLabel(c)}
                            </Text>
                            {lifecycleBadge ? (
                              <Text style={[twStyle("text-xs font-semibold"), { color: lifecycleBadge.color }]}>
                                {lifecycleBadge.label}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={twStyle("text-sm text-gray-600 leading-5")}>{campaignSummaryLine(c, tenantCurrency)}</Text>
                          <View style={twStyle("mt-3")}>
                            <View style={twStyle("h-2 overflow-hidden rounded-full bg-gray-100")}>
                              <View
                                style={[
                                  twStyle("h-2 rounded-full bg-indigo-500"),
                                  { width: `${Math.round(progress * 100)}%` },
                                ]}
                              />
                            </View>
                            <Text style={twStyle("mt-1 text-xs font-medium text-gray-500")}>
                              {remainingLine(c, metrics, tenantCurrency, nowMs)}
                            </Text>
                          </View>
                          <View style={twStyle("mt-3 flex-row flex-wrap gap-2")}>
                            {[
                              ["Impr.", formatCompactNumber(metrics.impressions)],
                              ["Reach", formatCompactNumber(metrics.reach)],
                              ["Clicks", formatCompactNumber(metrics.clicks)],
                              // §Ads-mobile-audit 2026-05: CTR and Bookings
                              // chips bring the per-campaign card to parity
                              // with the aggregate dashboard.
                              ["CTR", formatCtr(metrics.impressions, metrics.clicks)],
                              ["Bookings", formatCompactNumber(metrics.books)],
                              ["Spend", formatMoney(Number(metrics.spent ?? 0), tenantCurrency)],
                            ].map(([label, value]) => (
                              <View key={label} style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
                                <Text style={twStyle("text-[10px] uppercase tracking-wide text-gray-400")}>{label}</Text>
                                <Text style={twStyle("text-xs font-semibold text-gray-900")}>{value}</Text>
                              </View>
                            ))}
                          </View>
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
                        {/* §Provider-paystack-audit 2026-05: explicit recovery
                          actions for drafts that never funded — Complete payment
                          (unpaid) or Try payment again (failed) reopen the same
                          draft via /campaigns/[id]/checkout, and Cancel campaign
                          ends the draft cleanly so providers aren't stuck. */}
                        {paymentState === "unpaid" || paymentState === "failed" ? (
                          <>
                            <TouchableOpacity
                              onPress={() => void handleRetryAdsPayment(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg bg-indigo-600 px-3 py-2")}
                            >
                              <Text style={twStyle("text-white text-xs font-semibold")}>
                                {paymentState === "failed" ? "Try payment again" : "Complete payment"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleCancelDraft(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-gray-700 text-xs font-medium")}>Cancel campaign</Text>
                            </TouchableOpacity>
                          </>
                        ) : paymentState === "pending" ? (
                          <>
                            <TouchableOpacity
                              onPress={() => void handleRetryAdsPayment(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg bg-indigo-600 px-3 py-2")}
                            >
                              <Text style={twStyle("text-white text-xs font-semibold")}>Resume payment</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void handleAbandonPendingOrder(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-gray-700 text-xs font-medium")}>Cancel payment</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                        {canActivate ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "active")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg bg-green-600 px-3 py-2")}
                          >
                            <Text style={twStyle("text-white text-xs font-semibold")}>Activate</Text>
                          </TouchableOpacity>
                        ) : null}
                        {lifecycle === "active" ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "paused")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-amber-300 bg-amber-50 px-3 py-2")}
                          >
                            <Text style={twStyle("text-amber-900 text-xs font-semibold")}>Pause</Text>
                          </TouchableOpacity>
                        ) : null}
                        {(paymentState === "paid" || c.latest_budget_order?.status === "paid") &&
                        c.latest_budget_order?.id ? (
                          <TouchableOpacity
                            onPress={() => void handleViewReceipt(c)}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                          >
                            <Text style={twStyle("text-gray-800 text-xs font-medium")}>View receipt</Text>
                          </TouchableOpacity>
                        ) : null}
                        {isPastCampaign(lifecycle) ? (
                          <TouchableOpacity
                            onPress={() => handleBuyAgain(c)}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2")}
                          >
                            <Text style={twStyle("text-indigo-900 text-xs font-semibold")}>Buy again</Text>
                          </TouchableOpacity>
                        ) : null}
                        {!isPastCampaign(lifecycle) &&
                        paymentState !== "unpaid" &&
                        paymentState !== "failed" &&
                        !(paymentState === "pending" && freshPending) ? (
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
        <View style={[twStyle("gap-4"), { paddingBottom: 28 + insets.bottom }]}>
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
                      style={twStyle(
                        `rounded-full px-3.5 py-2.5 border ${
                          selected
                            ? "bg-gray-900 border-gray-900"
                            : "bg-white border-gray-200"
                        }`,
                      )}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text
                        style={twStyle(
                          `text-sm ${selected ? "text-white font-medium" : "text-gray-700"}`,
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
          <View style={[twStyle("gap-4"), { paddingBottom: 28 + insets.bottom }]}>
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
                          `rounded-full px-3.5 py-2.5 border ${
                            selected ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"
                          }`,
                        )}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                      >
                        <Text
                          style={twStyle(
                            `text-sm ${selected ? "text-white font-medium" : "text-gray-700"}`,
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
    <AdsCheckoutReviewSheet
      visible={!!reviewState}
      review={reviewState}
      submitting={reviewSubmitting}
      onConfirm={handleReviewConfirm}
      onClose={handleReviewClose}
    />
    {adsPaystackCheckout.modal}
    <AdsCheckoutProcessingOverlay
      visible={processing}
      title={processingMessage.includes("Activating") ? "Almost there" : "Confirming payment"}
      message={processingMessage}
      hint={processingHint}
    />
    </>
  );
}
