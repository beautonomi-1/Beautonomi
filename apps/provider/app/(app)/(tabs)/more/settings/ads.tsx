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
import { getDefaultMoneyLocale } from "@beautonomi/utils";
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
import { useTranslation } from "@beautonomi/i18n";
import {
  type CampaignFilterChip,
  countCampaignsByChip,
  filterCampaignsByChip,
  isPastCampaign,
  listClearableDraftCampaigns,
} from "@/lib/ads/campaign-filters";
import { trackAdsCampaignFilter } from "@/lib/analytics";

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
  new Intl.NumberFormat(getDefaultMoneyLocale(), { maximumFractionDigits: 0 }).format(Number(value ?? 0));

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
const AD_RANGES: { value: AdsDateRange; key: string }[] = [
  { value: "today", key: "rangeToday" },
  { value: "7d", key: "range7d" },
  { value: "30d", key: "range30d" },
  { value: "all", key: "rangeAll" },
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
  { labelKey: string; color: string }
> = {
  awaiting_payment: { labelKey: "lifecycleAwaitingPayment", color: "#b45309" },
  confirming: { labelKey: "lifecycleConfirming", color: "#1d4ed8" },
  payment_failed: { labelKey: "lifecyclePaymentFailed", color: "#dc2626" },
  active: { labelKey: "lifecycleActive", color: "#16a34a" },
  paused: { labelKey: "lifecyclePaused", color: "#d97706" },
  budget_exhausted: { labelKey: "lifecycleBudgetExhausted", color: "#64748b" },
  expired: { labelKey: "lifecycleExpired", color: "#64748b" },
  delivered: { labelKey: "lifecycleDelivered", color: "#64748b" },
  cancelled: { labelKey: "lifecycleCancelled", color: "#64748b" },
};

function isFreshPendingOrder(order: LatestBudgetOrder | null | undefined): boolean {
  if (!order || order.status !== "pending") return false;
  if (!order.created_at) return true;
  return Date.now() - new Date(order.created_at).getTime() < PENDING_ORDER_FRESH_MS;
}

const CAMPAIGN_FILTER_CHIPS: CampaignFilterChip[] = [
  "all",
  "needs_payment",
  "payment_failed",
  "active",
  "past",
];

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

function campaignModelLabel(campaign: Campaign, tr: (key: string) => string): string {
  if (isTimeBasedCampaign(campaign)) return tr("modelTimeBoost");
  if (isImpressionPackCampaign(campaign)) return tr("modelImpressionPack");
  return tr("modelCpcBudget");
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(getDefaultMoneyLocale(), { style: "currency", currency }).format(Number(amount ?? 0));
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
}

function campaignSummaryLine(
  c: Campaign,
  currency: string,
  tr: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (c.billing_model === "time_based") {
    const d = c.duration_days;
    const daysLabel = d == null ? "?" : tr("day", { count: d });
    const paid = formatMoney(Number(c.budget), currency);
    const end = c.end_at ? tr("summaryEnds", { date: new Date(c.end_at).toLocaleDateString() }) : "";
    return tr("summaryTimeBoost", { days: daysLabel, paid, end });
  }
  if (c.pack_impressions != null) {
    return tr("summaryPack", {
      count: c.pack_impressions,
      paid: formatMoney(Number(c.budget), currency),
      spent: formatMoney(Number(c.spent), currency),
    });
  }
  const daily =
    c.daily_budget != null ? tr("summaryDailyCap", { amount: formatMoney(Number(c.daily_budget), currency) }) : "";
  const bid =
    c.bid_cpc != null && Number(c.bid_cpc) > 0
      ? tr("summaryBid", { amount: formatMoney(Number(c.bid_cpc), currency) })
      : "";
  return tr("summaryCpc", {
    budget: formatMoney(Number(c.budget), currency),
    spent: formatMoney(Number(c.spent), currency),
    daily,
    bid,
  });
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
  onManageBilling,
  billingLabel,
}: {
  outcome: AdsPaymentOutcome;
  onDismiss: () => void;
  onManageBilling?: () => void;
  billingLabel?: string;
}) {
  const { t } = useTranslation();
  const managePaymentFallback = t("provider.mobile.screens.adsCampaignFilters.managePaymentMethods") as string;
  const dismissA11y = t("provider.mobile.screens.ads.dismissPaymentA11y") as string;
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
      <View style={twStyle(`me-3 rounded-full p-2 ${tone.iconWrap}`)}>
        <Ionicons name={tone.icon} size={18} color={tone.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={twStyle(`text-sm font-semibold ${tone.title}`)}>{outcome.title}</Text>
        <Text style={twStyle(`text-xs ${tone.body}`)}>{outcome.body}</Text>
        {outcome.phase === "failed" && onManageBilling ? (
          <TouchableOpacity
            onPress={onManageBilling}
            style={twStyle("mt-2 self-start rounded-lg bg-white/80 px-3 py-2 border border-amber-200")}
            accessibilityRole="button"
          >
            <Text style={twStyle("text-xs font-semibold text-amber-900")}>{billingLabel ?? managePaymentFallback}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityLabel={dismissA11y}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color={tone.iconColor} />
      </TouchableOpacity>
    </View>
  );
}

function remainingLine(
  c: Campaign,
  metrics: CampaignPerformance,
  currency: string,
  nowMs: number,
  tr: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (c.billing_model === "time_based") {
    if (!c.end_at) return tr("startsAfterPayment");
    if (new Date(c.end_at).getTime() <= nowMs) return tr("boostPeriodEnded");
    const days = Math.max(0, Math.ceil((new Date(c.end_at).getTime() - nowMs) / 86400000));
    return tr("daysRemaining", { count: days });
  }
  if (isImpressionPackCampaign(c) && c.pack_impressions != null) {
    if (Number(metrics.impressions ?? 0) >= Number(c.pack_impressions)) {
      return tr("allImpressionsDelivered");
    }
    const remaining = Math.max(0, Number(c.pack_impressions) - Number(metrics.impressions || 0));
    return tr("impressionsRemaining", { count: formatCompactNumber(remaining) });
  }
  const budget = Number(c.budget || 0);
  if (budget > 0 && Number(c.spent ?? 0) >= budget) {
    return tr("budgetFullyUsed");
  }
  return tr("budgetRemaining", { amount: formatMoney(Math.max(0, budget - Number(c.spent || 0)), currency) });
}

export default function AdsSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const ads = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.ads.${key}`, opts) as string,
    [t],
  );
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
  const [campaignFilterChip, setCampaignFilterChip] = useState<CampaignFilterChip>("all");
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
  const [processingMessage, setProcessingMessage] = useState(() => t("provider.mobile.screens.ads.confirmingPayment") as string);
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
        Alert.alert(ads("errorTitle"), ads("loadPartialError"));
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
      Alert.alert(ads("errorTitle"), ads("loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setNowMs(Date.now());
    }
  }, [enabled, perfRange, ads]);

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
        title: ads("adPaymentTitle"),
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
        const failed = adsFailedCopy(ads("paymentNotCompleted"));
        setPaymentOutcome({ phase: "failed", campaignId, ...failed });
        await loadAll();
        return;
      }

      if (result?.outcome !== "success") {
        await loadAll();
        return;
      }

      setProcessing(true);
      setProcessingMessage(ads("confirmingPayment"));
      setProcessingHint(ads("verifyingPaystackHint"));
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

        setProcessingMessage(ads("activatingCampaign"));
        setProcessingHint(ads("fundingHint"));

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
        setProcessingMessage(ads("confirmingPayment"));
        setProcessingHint(null);
      }
    },
    [adsPaystackCheckout, loadAll, router, tenantCurrency, ads],
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
      Alert.alert(ads("invalidTitle"), ads("invalidBudget", { currency: tenantCurrency }));
      return;
    }
    if (budgetNum > 0) {
      const dailyCap = createForm.daily_budget ? parseFloat(createForm.daily_budget.replace(/,/g, ".")) : null;
      const bidCpc = createForm.bid_cpc ? parseFloat(createForm.bid_cpc.replace(/,/g, ".")) : 0;
      const lineItems = [{ label: ads("campaignBudget"), value: formatMoney(budgetNum, tenantCurrency) }];
      if (dailyCap && Number.isFinite(dailyCap) && dailyCap > 0) {
        lineItems.push({ label: ads("dailyCap"), value: formatMoney(dailyCap, tenantCurrency) });
      }
      if (bidCpc && Number.isFinite(bidCpc) && bidCpc > 0) {
        lineItems.push({ label: ads("bidPerClick"), value: ads("bidPerClickValue", { amount: formatMoney(bidCpc, tenantCurrency) }) });
      }
      lineItems.push({ label: ads("totalDue"), value: formatMoney(budgetNum, tenantCurrency) });
      const confirmed = await requestAdsCheckout({
        heading: ads("cpcBudget"),
        title: ads("cpcCampaignTitle", { amount: formatMoney(budgetNum, tenantCurrency) }),
        subtitle: ads("cpcSubtitle"),
        benefits: [
          ads("cpcBenefit1"),
          ads("cpcBenefit2"),
          ads("cpcBenefit3"),
        ],
        lineItems,
        total: formatMoney(budgetNum, tenantCurrency),
        confirmLabel: ads("payAmount", { amount: formatMoney(budgetNum, tenantCurrency) }),
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
        Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("createFailed")));
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
          productLabel: ads("cpcBudget"),
        });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAll();
      Alert.alert(t("common.done"), ads("createdDraft"));
    } catch (e: unknown) {
      Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("createFailed")));
    } finally {
      setCreating(false);
    }
  }, [createForm, loadAll, tenantCurrency, requestAdsCheckout, openAdsPaystack, ads, t]);

  const handleBuyPack = useCallback(
    async (pack: ImpressionPack) => {
      const confirmed = await requestAdsCheckout({
        heading: ads("impressionPack"),
        title: ads("impressionPackTitle", { count: formatCompactNumber(pack.impressions) }),
        subtitle: ads("impressionPackSubtitle"),
        benefits: [
          ads("impressionPackBenefit1", { count: formatCompactNumber(pack.impressions) }),
          ads("impressionPackBenefit2"),
          ads("impressionPackBenefit3"),
        ],
        lineItems: [
          { label: ads("impressionPack"), value: formatCompactNumber(pack.impressions) },
          { label: ads("totalDue"), value: packDisplayPrice(pack) },
        ],
        total: packDisplayPrice(pack),
        confirmLabel: shouldUseAppleIap() ? ads("purchaseAmount", { amount: packDisplayPrice(pack) }) : ads("payAmount", { amount: packDisplayPrice(pack) }),
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
          setProcessingMessage(ads("processingApple"));
          const appleResult = await createAdsCampaignWithApplePayment({
            impression_pack_id: pack.id,
            targeting,
          });
          setProcessing(false);
          if (!appleResult.ok) {
            if (!appleResult.cancelled) {
              Alert.alert(ads("errorTitle"), appleResult.error);
            }
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          loadAll();
          Alert.alert(t("common.done"), ads("packPurchased"));
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
          Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("createFailed")));
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
            productLabel: ads("impressionPack"),
          });
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
        Alert.alert(t("common.done"), ads("created"));
      } catch (e: unknown) {
        Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("createFailed")));
      } finally {
        setCreatingPackId(null);
      }
    },
    [loadAll, createForm.global_category_ids, requestAdsCheckout, tenantCurrency, openAdsPaystack, ads, t]
  );

  const handleUpdateCampaign = useCallback(async () => {
    if (!editCampaign) return;
    const canEditBudget = canEditBudgetFields(editCampaign);
    if (canEditBudget && editForm.budget) {
      const nextBudget = parseFloat(editForm.budget.replace(/,/g, "."));
      if (Number.isFinite(nextBudget) && nextBudget > Number(editCampaign.budget ?? 0)) {
        Alert.alert(
          ads("budgetTopUpTitle"),
          ads("budgetTopUpBody")
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
        Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("updateFailed")));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditCampaign(null);
      loadAll();
      Alert.alert(t("common.done"), ads("updated"));
    } catch (e: unknown) {
      Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("updateFailed")));
    } finally {
      setUpdating(null);
    }
  }, [editCampaign, editForm, loadAll, ads, t]);

  const handleSetStatus = useCallback(
    (campaignId: string, status: "active" | "paused" | "ended") => {
      const run = async () => {
        setUpdating(campaignId);
        try {
          const res = await api.patch(`/api/provider/ads/campaigns/${campaignId}`, { status });
          if (res.error) {
            Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("statusUpdateFailed")));
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          loadAll();
        } catch (e: unknown) {
          Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("statusUpdateFailed")));
        } finally {
          setUpdating(null);
        }
      };
      if (status === "ended") {
        Alert.alert(ads("endCampaignTitle"), ads("endCampaignBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: ads("endAction"), style: "destructive", onPress: () => void run() },
        ]);
        return;
      }
      void run();
    },
    [loadAll, ads, t]
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
          setProcessingMessage(ads("processingApple"));
          const appleResult = await retryAdsCampaignWithApplePayment(campaign.id);
          setProcessing(false);
          if (!appleResult.ok) {
            if (!appleResult.cancelled) {
              Alert.alert(ads("errorTitle"), appleResult.error);
            }
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(ads("successTitle"), ads("applePurchaseSuccess"));
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
          Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("reopenPaystackFailed")));
          return;
        }
        const payUrl = (res.data?.payment_url ?? "").trim();
        if (!payUrl) {
          Alert.alert(ads("errorTitle"), ads("noPaymentUrl"));
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
          productLabel: campaignModelLabel(campaign, ads),
        });
      } catch (e: unknown) {
        Alert.alert(
          "Error",
          getApiErrorMessage(
            e,
            shouldUseAppleIap() ? ads("restartAppleFailed") : ads("reopenPaystackFailed"),
          ),
        );
      } finally {
        setProcessing(false);
        setUpdating(null);
      }
    },
    [loadAll, openAdsPaystack, requestAdsCheckout, tenantCurrency, ads, t],
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
        ads("removeCampaignTitle"),
        ads("removeCampaignBody"),
        [
          { text: ads("keep"), style: "cancel" },
          {
            text: ads("cancelCampaign"),
            style: "destructive",
            onPress: () => handleSetStatus(campaign.id, "ended"),
          },
        ],
      );
    },
    [handleSetStatus, ads],
  );

  const af = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`provider.mobile.screens.adsCampaignFilters.${key}`, opts ?? {}) as string,
    [t],
  );

  const campaignChipCounts = useMemo(() => countCampaignsByChip(campaigns), [campaigns]);

  const filteredCampaigns = useMemo(
    () =>
      filterCampaignsByChip(campaigns, campaignFilterChip, {
        showPast: showEndedCampaigns || campaignFilterChip === "past",
      }),
    [campaigns, campaignFilterChip, showEndedCampaigns],
  );

  const clearableDrafts = useMemo(() => listClearableDraftCampaigns(campaigns), [campaigns]);

  const openBilling = useCallback(() => {
    router.push("/(app)/(tabs)/more/settings/billing" as never);
  }, [router]);

  const handleClearDrafts = useCallback(() => {
    const drafts = clearableDrafts;
    if (drafts.length < 2) return;
    Alert.alert(
      af("clearDraftsConfirmTitle"),
      af("clearDraftsConfirmBody", { count: drafts.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: af("clearDrafts"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              for (const c of drafts) {
                await api.patch(`/api/provider/ads/campaigns/${c.id}`, { status: "ended" });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadAll();
            })();
          },
        },
      ],
    );
  }, [af, clearableDrafts, loadAll, t]);

  const handleAbandonPendingOrder = useCallback(
    async (campaign: Campaign) => {
      const orderId = campaign.latest_budget_order?.id;
      if (!orderId) return;
      setUpdating(campaign.id);
      try {
        const res = await api.post(`/api/provider/ads/budget-orders/${orderId}/abandon`, {});
        if (res.error) {
          Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("cancelPaymentFailed")));
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadAll();
      } catch (e: unknown) {
        Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("cancelPaymentFailed")));
      } finally {
        setUpdating(null);
      }
    },
    [loadAll, ads],
  );

  const handleViewReceipt = useCallback(
    async (campaign: Campaign) => {
      const orderId = campaign.latest_budget_order?.id;
      if (!orderId) {
        Alert.alert(ads("receiptUnavailable"), ads("noPaidOrder"));
        return;
      }
      setUpdating(campaign.id);
      try {
        const res = await api.post<{ url?: string }>(
          `/api/provider/ads/orders/${orderId}/receipt/signed-url`,
          {},
        );
        if (res.error) {
          Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("openReceiptFailed")));
          return;
        }
        const signed = res.data?.url?.trim();
        if (!signed) {
          Alert.alert(ads("errorTitle"), ads("openReceiptFailedPeriod"));
          return;
        }
        pushInAppBrowser(router, signed, ads("receipt"));
      } catch (e: unknown) {
        Alert.alert(ads("errorTitle"), getApiErrorMessage(e, ads("openReceiptFailed")));
      } finally {
        setUpdating(null);
      }
    },
    [router, ads],
  );

  const handleBuyAgain = useCallback((campaign: Campaign) => {
    setCreateForm({
      budget: String(campaign.budget ?? ""),
      daily_budget: campaign.daily_budget != null ? String(campaign.daily_budget) : "",
      bid_cpc: campaign.bid_cpc != null ? String(campaign.bid_cpc) : "",
      global_category_ids: campaign.targeting?.global_category_ids ?? [],
    });
    if (isTimeBasedCampaign(campaign) || isImpressionPackCampaign(campaign)) {
      Alert.alert(ads("buyAgainTitle"), ads("buyAgainBody"));
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
        <ScreenHeader title={ads("title")} subtitle={ads("subtitleDisabled")} onBack={() => router.back()} />
        <View style={[twStyle("flex-1 px-4 pt-8"), { paddingHorizontal: screenPadding }]}>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-amber-50 p-6")}>
            <Ionicons name="megaphone-outline" size={40} color="#b45309" />
            <Text style={twStyle("mt-3 text-base font-semibold text-gray-900")}>{ads("notEnabledTitle")}</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>
              {ads("notEnabledBody")}
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (loading && campaigns.length === 0 && !performance) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ads("title")} subtitle={ads("subtitleLoading")} onBack={() => router.back()} />
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
        title={ads("title")}
        subtitle={ads("subtitle")}
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
            onManageBilling={openBilling}
            billingLabel={af("managePaymentMethods")}
          />

          {/* Performance */}
          {performance && (
            <View style={twStyle("mb-6")}>
              <View style={twStyle("mb-2 flex-row items-end justify-between")}>
                <View style={{ flex: 1, paddingEnd: 8 }}>
                  <Text style={twStyle("text-sm font-semibold text-gray-700")}>{ads("adPerformance")}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {ads("adPerformanceHint")}
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
                        {ads(r.key)}
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
                    label: ads("metricImpressions"),
                    value: formatCompactNumber(performance.impressions),
                    accent: "#6b7280",
                  },
                  {
                    icon: "people-outline" as const,
                    label: ads("metricReach"),
                    value: formatCompactNumber(performance.reach),
                    accent: "#6b7280",
                  },
                  {
                    icon: "hand-left-outline" as const,
                    label: ads("metricClicks"),
                    value: formatCompactNumber(performance.clicks),
                    accent: "#6b7280",
                  },
                  {
                    icon: "trending-up-outline" as const,
                    label: ads("metricCtr"),
                    value: aggregateCtr,
                    accent: "#4f46e5",
                  },
                  {
                    icon: "calendar-outline" as const,
                    label: ads("metricBookings"),
                    value: formatCompactNumber(totalBooks),
                    accent: "#059669",
                  },
                  {
                    icon: "wallet-outline" as const,
                    label: ads("metricSpend"),
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
                        marginEnd: idx % 2 === 0 ? "4%" : 0,
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
                <Text style={twStyle("text-base font-semibold text-gray-950")}>{ads("chooseHowToGrow")}</Text>
                <Text style={twStyle("mt-1 text-sm leading-5 text-gray-600")}>
                  {defaultModel === "time_based"
                    ? ads("recommendTime")
                    : defaultModel === "impression_pack"
                      ? ads("recommendPack")
                      : ads("recommendCpc")}
                </Text>
              </View>
            </View>
          </View>

          {globalCategories.length > 0 && (timePacks.length > 0 || packs.length > 0) && (
            <View style={twStyle("mb-5")}>
              <View style={twStyle("flex-row items-center justify-between mb-1")}>
                <Text style={twStyle("text-sm font-semibold text-gray-700")}>{ads("targetCategoriesOptional")}</Text>
                {createForm.global_category_ids.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setCreateForm((p) => ({ ...p, global_category_ids: [] }))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={twStyle("text-xs font-semibold text-indigo-600")}>{ads("clearCount", { count: createForm.global_category_ids.length })}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>
                {ads("targetCategoriesHint")}
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
                <Text style={twStyle("text-base font-semibold text-gray-900")}>{ads("boostDaysTitle")}</Text>
                {defaultModel === "time_based" ? (
                  <Text style={twStyle("rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800")}>
                    {ads("recommended")}
                  </Text>
                ) : null}
              </View>
              <Text style={twStyle("text-sm text-gray-500 mb-4 leading-5")}>
                {ads("boostDaysHint")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={packCardWidth + packSnapGap}
                snapToAlignment="start"
                contentContainerStyle={{
                  paddingEnd: screenPadding + 8,
                  gap: packSnapGap,
                  paddingVertical: 4,
                }}
              >
                {timePacks.map((tp) => (
                  <TouchableOpacity
                    key={tp.id}
                    onPress={async () => {
                      const daysLabel = ads("day", { count: tp.duration_days });
                      const confirmed = await requestAdsCheckout({
                        heading: ads("timeBoost"),
                        title: tp.label?.trim() ? tp.label : ads("boostTitle", { days: daysLabel }),
                        subtitle: ads("timeBoostSubtitle", { days: daysLabel }),
                        benefits: [
                          ads("timeBoostBenefit1", { days: daysLabel }),
                          ads("timeBoostBenefit2"),
                          ads("timeBoostBenefit3"),
                        ],
                        lineItems: [
                          { label: ads("boostDuration"), value: daysLabel },
                          { label: ads("totalDue"), value: packDisplayPrice(tp) },
                        ],
                        total: packDisplayPrice(tp),
                        confirmLabel: shouldUseAppleIap() ? ads("purchaseAmount", { amount: packDisplayPrice(tp) }) : ads("payAmount", { amount: packDisplayPrice(tp) }),
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
                          setProcessingMessage(ads("processingApple"));
                          const appleResult = await createAdsCampaignWithApplePayment({
                            time_pack_id: tp.id,
                            targeting,
                          });
                          setProcessing(false);
                          if (!appleResult.ok) {
                            if (!appleResult.cancelled) {
                              Alert.alert(ads("errorTitle"), appleResult.error);
                            }
                            return;
                          }
                          Alert.alert(ads("successTitle"), ads("timeBoostPurchased"));
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
                          Alert.alert(ads("errorTitle"), getApiErrorMessage(res.error, ads("createFailedPeriod")));
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
                            productLabel: ads("timeBoost"),
                          });
                          return;
                        }
                        Alert.alert(ads("successTitle"), ads("created"));
                        loadAll();
                      } catch {
                        Alert.alert(ads("errorTitle"), ads("createFailedPeriod"));
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
                            {ads("timeBoost")}
                          </Text>
                          <Text style={[twStyle("text-3xl font-bold text-gray-900 mt-1"), { fontVariant: ["tabular-nums"] }]}>
                            {tp.duration_days}
                          </Text>
                          <Text style={twStyle("text-sm text-gray-600 mt-0.5")} numberOfLines={2}>
                            {tp.label?.trim() ? tp.label : tp.duration_days === 1 ? ads("dayInSlots") : ads("daysInSlots")}
                          </Text>
                        </View>
                        <View style={twStyle("mt-3 pt-3 border-t border-gray-100")}>
                          <Text style={twStyle("text-lg font-bold text-gray-900")}>
                            {packDisplayPrice(tp)}
                          </Text>
                          {creatingPackId === tp.id ? (
                            <ActivityIndicator size="small" color="#047857" style={{ marginTop: 10 }} />
                          ) : (
                            <Text style={twStyle("text-xs font-semibold text-emerald-600 mt-2")}>{ads("tapToPurchase")}</Text>
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
                <Text style={twStyle("text-base font-semibold text-gray-900")}>{ads("buyImpressions")}</Text>
                {defaultModel === "impression_pack" ? (
                  <Text style={twStyle("rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800")}>
                    {ads("recommended")}
                  </Text>
                ) : null}
              </View>
              <Text style={twStyle("text-sm text-gray-500 mb-4 leading-5")}>
                {ads("buyImpressionsHint")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={packCardWidth + packSnapGap}
                snapToAlignment="start"
                contentContainerStyle={{
                  paddingEnd: screenPadding + 8,
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
                            {ads("impressionPack")}
                          </Text>
                          <Text style={[twStyle("text-3xl font-bold text-gray-900 mt-1"), { fontVariant: ["tabular-nums"] }]}>
                            {formatCompactNumber(pack.impressions)}
                          </Text>
                          <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>{ads("sponsoredImpressions")}</Text>
                        </View>
                        <View style={twStyle("mt-3 pt-3 border-t border-gray-100")}>
                          <Text style={twStyle("text-lg font-bold text-gray-900")}>
                            {packDisplayPrice(pack)}
                          </Text>
                          {creatingPackId === pack.id ? (
                            <ActivityIndicator size="small" color="#5b21b6" style={{ marginTop: 10 }} />
                          ) : (
                            <Text style={twStyle("text-xs font-semibold text-violet-600 mt-2")}>{ads("tapToPurchase")}</Text>
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
                <Text style={twStyle("text-sm font-semibold text-gray-700")}>{ads("campaigns")}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>{ads("campaignsHint")}</Text>
              </View>
              {cpcBudgetAvailable && (
                <ActionButton
                  label={ads("newCampaign")}
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
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>{ads("cpcRecommendedTitle")}</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-gray-500")}>
                  {ads("cpcRecommendedBody")}
                </Text>
              </View>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              style={twStyle("mb-3")}
            >
              {CAMPAIGN_FILTER_CHIPS.map((chip) => {
                const active = campaignFilterChip === chip;
                const chipKey =
                  chip === "needs_payment"
                    ? "needsPayment"
                    : chip === "payment_failed"
                      ? "paymentFailed"
                      : chip;
                const count = campaignChipCounts[chip];
                return (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => {
                      if (campaignFilterChip === chip) return;
                      Haptics.selectionAsync();
                      setCampaignFilterChip(chip);
                      trackAdsCampaignFilter(chip);
                      if (chip === "past") setShowEndedCampaigns(true);
                    }}
                    style={twStyle(
                      `rounded-full border px-3 py-2 flex-row items-center ${active ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"}`,
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${af(chipKey)} (${count})`}
                  >
                    <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-gray-700"}`)}>
                      {af(chipKey)}
                    </Text>
                    <View
                      style={twStyle(
                        `ms-1.5 min-w-[20px] rounded-full px-1.5 py-0.5 ${active ? "bg-white/20" : "bg-gray-100"}`,
                      )}
                    >
                      <Text style={twStyle(`text-[10px] font-bold text-center ${active ? "text-white" : "text-gray-600"}`)}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {(campaignFilterChip === "payment_failed" ||
              filteredCampaigns.some(
                (c) => c.payment_state === "failed" || c.lifecycle === "payment_failed",
              )) ? (
              <View style={twStyle("mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
                <Text style={twStyle("text-sm font-semibold text-amber-900")}>{af("paymentEducationTitle")}</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-amber-800")}>{af("paymentEducationBody")}</Text>
                <TouchableOpacity
                  onPress={openBilling}
                  style={twStyle("mt-3 self-start rounded-lg bg-white px-3 py-2 border border-amber-200")}
                  accessibilityRole="button"
                >
                  <Text style={twStyle("text-xs font-semibold text-amber-900")}>{af("managePaymentMethods")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {clearableDrafts.length >= 2 ? (
              <TouchableOpacity
                onPress={handleClearDrafts}
                style={twStyle("mb-3 self-start rounded-lg border border-gray-300 bg-white px-3 py-2")}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>{af("clearDrafts")}</Text>
              </TouchableOpacity>
            ) : null}
            {campaigns.some((c) => isPastCampaign(c.lifecycle)) ? (
              <TouchableOpacity
                onPress={() => setShowEndedCampaigns((v) => !v)}
                style={twStyle("mb-3 self-start rounded-lg border border-gray-300 bg-white px-3 py-2")}
              >
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>
                  {showEndedCampaigns ? ads("hidePast") : ads("showPast")}
                </Text>
              </TouchableOpacity>
            ) : null}
            {filteredCampaigns.length === 0 ? (
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
                  {ads("emptyTitle")}
                </Text>
                <Text style={twStyle("mt-2 text-sm text-gray-600 text-center leading-5 px-2")}>
                  {(() => {
                    const hasPacks = timePacks.length > 0 || packs.length > 0;
                    if (cpcBudgetAvailable && hasPacks) {
                      return ads("emptyBoth");
                    }
                    if (cpcBudgetAvailable) {
                      return ads("emptyCpc");
                    }
                    if (hasPacks) {
                      return ads("emptyPacks");
                    }
                    return ads("emptyMarket");
                  })()}
                </Text>
                {cpcBudgetAvailable ? (
                  <ActionButton
                    label={ads("newCpcCampaign")}
                    onPress={() => setCreateOpen(true)}
                    variant="primary"
                    icon="add"
                    style={twStyle("mt-4")}
                  />
                ) : null}
              </View>
              ) : (
              <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-5")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>{af("emptyFiltered")}</Text>
                <Text style={twStyle("mt-1 text-xs text-gray-600")}>{af("emptyFilteredHint")}</Text>
                <View style={twStyle("mt-4 flex-row flex-wrap gap-2")}>
                  {campaignFilterChip !== "all" ? (
                    <ActionButton
                      label={af("showAllCampaigns")}
                      onPress={() => {
                        setCampaignFilterChip("all");
                        trackAdsCampaignFilter("all");
                      }}
                      variant="secondary"
                      size="sm"
                    />
                  ) : null}
                  {cpcBudgetAvailable ? (
                    <ActionButton
                      label={af("createCampaign")}
                      onPress={() => setCreateOpen(true)}
                      variant="primary"
                      size="sm"
                      icon="add"
                    />
                  ) : null}
                </View>
              </View>
              )
            ) : (
              <View style={twStyle("gap-3")}>
                {filteredCampaigns.map((c) => {
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
                              {campaignModelLabel(c, ads)}
                            </Text>
                            {lifecycleBadge ? (
                              <Text style={[twStyle("text-xs font-semibold"), { color: lifecycleBadge.color }]}>
                                {ads(lifecycleBadge.labelKey)}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={twStyle("text-sm text-gray-600 leading-5")}>{campaignSummaryLine(c, tenantCurrency, ads)}</Text>
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
                              {remainingLine(c, metrics, tenantCurrency, nowMs, ads)}
                            </Text>
                          </View>
                          <View style={twStyle("mt-3 flex-row flex-wrap gap-2")}>
                            {[
                              ["metricImprShort", formatCompactNumber(metrics.impressions)],
                              ["metricReach", formatCompactNumber(metrics.reach)],
                              ["metricClicks", formatCompactNumber(metrics.clicks)],
                              // §Ads-mobile-audit 2026-05: CTR and Bookings
                              // chips bring the per-campaign card to parity
                              // with the aggregate dashboard.
                              ["metricCtr", formatCtr(metrics.impressions, metrics.clicks)],
                              ["metricBookings", formatCompactNumber(metrics.books)],
                              ["metricSpend", formatMoney(Number(metrics.spent ?? 0), tenantCurrency)],
                            ].map(([labelKey, value]) => (
                              <View key={labelKey} style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
                                <Text style={twStyle("text-[10px] uppercase tracking-wide text-gray-400")}>{ads(labelKey)}</Text>
                                <Text style={twStyle("text-xs font-semibold text-gray-900")}>{value}</Text>
                              </View>
                            ))}
                          </View>
                          {(c.targeting?.global_category_ids?.length ?? 0) > 0 ? (
                            <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                              {ads("targetingCount", { count: c.targeting!.global_category_ids!.length })}
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
                            {canEditBudgetFields(c) ? t("common.edit") : ads("editTargeting")}
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
                                {paymentState === "failed" ? ads("tryPaymentAgain") : ads("completePayment")}
                              </Text>
                            </TouchableOpacity>
                            {paymentState === "failed" ? (
                              <TouchableOpacity
                                onPress={openBilling}
                                disabled={updating === c.id}
                                style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                              >
                                <Text style={twStyle("text-gray-800 text-xs font-medium")}>
                                  {af("managePaymentMethods")}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              onPress={() => handleCancelDraft(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-gray-700 text-xs font-medium")}>{ads("cancelCampaign")}</Text>
                            </TouchableOpacity>
                          </>
                        ) : paymentState === "pending" ? (
                          <>
                            <TouchableOpacity
                              onPress={() => void handleRetryAdsPayment(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg bg-indigo-600 px-3 py-2")}
                            >
                              <Text style={twStyle("text-white text-xs font-semibold")}>{ads("resumePayment")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void handleAbandonPendingOrder(c)}
                              disabled={updating === c.id}
                              style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-gray-700 text-xs font-medium")}>{ads("cancelPayment")}</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                        {canActivate ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "active")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg bg-green-600 px-3 py-2")}
                          >
                            <Text style={twStyle("text-white text-xs font-semibold")}>{ads("activate")}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {lifecycle === "active" ? (
                          <TouchableOpacity
                            onPress={() => handleSetStatus(c.id, "paused")}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-amber-300 bg-amber-50 px-3 py-2")}
                          >
                            <Text style={twStyle("text-amber-900 text-xs font-semibold")}>{ads("pause")}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {(paymentState === "paid" || c.latest_budget_order?.status === "paid") &&
                        c.latest_budget_order?.id ? (
                          <TouchableOpacity
                            onPress={() => void handleViewReceipt(c)}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                          >
                            <Text style={twStyle("text-gray-800 text-xs font-medium")}>{ads("viewReceipt")}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {isPastCampaign(lifecycle) ? (
                          <TouchableOpacity
                            onPress={() => handleBuyAgain(c)}
                            disabled={updating === c.id}
                            style={twStyle("rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2")}
                          >
                            <Text style={twStyle("text-indigo-900 text-xs font-semibold")}>{ads("buyAgain")}</Text>
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
                            <Text style={twStyle("text-gray-500 text-xs font-medium")}>{ads("endAction")}</Text>
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
      <BottomSheet visible={createOpen} onClose={() => !creating && setCreateOpen(false)} title={ads("createSheetTitle")} subtitle={ads("createSheetSubtitle", { currency: tenantCurrency })} snapHeight="full">
        <View style={[twStyle("gap-4"), { paddingBottom: 28 + insets.bottom }]}>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("totalBudget", { currency: tenantCurrency })}</Text>
            <TextInput
              value={createForm.budget}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, budget: t }))}
              placeholder={ads("placeholder500")}
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("dailyBudgetOptional", { currency: tenantCurrency })}</Text>
            <TextInput
              value={createForm.daily_budget}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, daily_budget: t }))}
              placeholder={ads("placeholder50")}
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("bidOptional", { currency: tenantCurrency })}</Text>
            <TextInput
              value={createForm.bid_cpc}
              onChangeText={(t) => setCreateForm((p) => ({ ...p, bid_cpc: t }))}
              placeholder={ads("placeholder2")}
              keyboardType="decimal-pad"
              style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
            />
          </View>
          {globalCategories.length > 0 && (
            <View>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>
                {ads("targetCategories")}{" "}
                <Text style={twStyle("text-xs text-gray-400 font-normal")}>{ads("optionalParen")}</Text>
              </Text>
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>
                {ads("createTargetHint")}
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
          <ActionButton label={creating ? ads("creating") : ads("createSheetTitle")} onPress={handleCreateCampaign} loading={creating} disabled={creating} fullWidth />
        </View>
      </BottomSheet>

      {/* Edit campaign sheet */}
      <BottomSheet
        visible={!!editCampaign}
        onClose={() => !updating && setEditCampaign(null)}
        title={ads("editSheetTitle")}
        subtitle={canEditBudgetFields(editCampaign) ? ads("editSheetSubtitleBudget") : ads("editSheetSubtitleLocked")}
        snapHeight="full"
      >
        {editCampaign && (
          <View style={[twStyle("gap-4"), { paddingBottom: 28 + insets.bottom }]}>
            {canEditBudgetFields(editCampaign) ? (
              <>
                <View>
                  <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("totalBudget", { currency: tenantCurrency })}</Text>
                  <TextInput
                    value={editForm.budget}
                    onChangeText={(t) => setEditForm((p) => ({ ...p, budget: t }))}
                    placeholder={ads("placeholder500")}
                    keyboardType="decimal-pad"
                    style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
                  />
                  <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                    {ads("budgetLowerHint")}
                  </Text>
                </View>
                <View>
                  <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("dailyBudget", { currency: tenantCurrency })}</Text>
                  <TextInput
                    value={editForm.daily_budget}
                    onChangeText={(t) => setEditForm((p) => ({ ...p, daily_budget: t }))}
                    placeholder={ads("placeholder50")}
                    keyboardType="decimal-pad"
                    style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
                  />
                </View>
                <View>
                  <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>{ads("bidPerClickCurrency", { currency: tenantCurrency })}</Text>
                  <TextInput
                    value={editForm.bid_cpc}
                    onChangeText={(t) => setEditForm((p) => ({ ...p, bid_cpc: t }))}
                    placeholder={ads("placeholder2")}
                    keyboardType="decimal-pad"
                    style={twStyle("border border-gray-200 rounded-xl px-4 py-3 text-base")}
                  />
                </View>
              </>
            ) : (
              <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
                <Text style={twStyle("text-sm font-semibold text-amber-950")}>{ads("pricingLockedTitle")}</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-amber-800")}>
                  {isTimeBasedCampaign(editCampaign)
                    ? ads("pricingLockedTime")
                    : ads("pricingLockedPack")}
                </Text>
              </View>
            )}
            {globalCategories.length > 0 && (
              <View>
                <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>{ads("targetCategories")}</Text>
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
            <ActionButton label={updating === editCampaign.id ? ads("saving") : t("common.save")} onPress={handleUpdateCampaign} loading={updating === editCampaign.id} disabled={!!updating} fullWidth />
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
      title={processingMessage === ads("activatingCampaign") ? ads("overlayAlmostThere") : ads("overlayConfirming")}
      message={processingMessage}
      hint={processingHint}
    />
    </>
  );
}
