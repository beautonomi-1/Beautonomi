/**
 * Subscription screen – view plan, upgrade, cancel, renew.
 * Uses GET /api/provider/subscription, /subscription/plans, POST cancel, renew, initialize-payment, upgrade
 * (paid: upgrade first when Paystack auth exists, else initialize-payment — same as provider web).
 * Plan feature bullets match public /pricing (pricing_plan_features), not raw subscription_plans.features JSON.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, AppState, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { extractPaystackReferenceFromUrl } from "@/lib/payments/paystackRefFromUrl";
import {
  getSubscriptionPaystackReturnUrl,
  matchesSubscriptionPaystackReturnUrl,
  pollSubscriptionProvisioned,
  subscriptionSuccessCopy,
  subscriptionPendingCopy,
  subscriptionFailedCopy,
} from "@/lib/payments/providerPaystackReturn";
import {
  SubscriptionCheckoutReviewSheet,
  type SubscriptionCheckoutReview,
} from "@/components/subscription/SubscriptionCheckoutReviewSheet";
import { AdsCheckoutProcessingOverlay } from "@/components/ads/AdsCheckoutProcessingOverlay";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { stripHtmlToPlainText } from "@/lib/htmlPlainText";
import { startPaidSubscriptionCheckout } from "@/lib/subscription/start-paid-checkout";
import { startAppleSubscriptionCheckout } from "@/lib/subscription/start-apple-subscription-checkout";
import { shouldUseAppleIap, isAppleBillingActive } from "@/lib/iap/platform";
import {
  openAppleSubscriptionManagement,
  presentAppleOfferCodeSheet,
  restoreApplePurchases,
  syncUnfinishedApplePurchases,
} from "@/lib/iap/apple-iap";
import { useAppleIapProducts } from "@/lib/iap/useAppleIapProducts";
import { useProvider } from "@/providers/ProviderContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { pushWebPrivacyPolicy, pushWebPartnerEula } from "@/lib/legal-web";
import { useTranslation } from "@beautonomi/i18n";

const ACCENT = "#FF0077";

interface Plan {
  id: string;
  plan_id: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  interval: string;
  billing_period: string;
  features: string[];
  is_popular?: boolean;
  is_free?: boolean;
  apple_product_id?: string | null;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  cancelled_at: string | null;
  auto_renew: boolean;
  plan_id: string;
  billing_period?: "monthly" | "yearly" | null;
  billing_provider?: "paystack" | "apple" | "manual" | null;
  apple_price_increase_status?: "pending" | "consented" | "none" | null;
  ios_purchase_eligible?: boolean;
  ios_purchase_eligible_reason?: string | null;
  /** Set when an admin changed the plan and Paystack needs alignment */
  paystack_sync_pending?: boolean | null;
  paystack_sync_note?: string | null;
  latest_order?: {
    id: string;
    plan_id?: string | null;
    billing_period?: string | null;
    status?: string | null;
    failure_reason?: string | null;
  } | null;
  billing_issue?: {
    type: string;
    message: string;
    action: string;
  } | null;
  plan?: {
    id: string;
    name: string;
    description?: string | null;
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency: string;
    features?: unknown;
    feature_bullets?: string[];
    is_free?: boolean;
  };
}

function featureLines(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function currentPlanBullets(sub: Subscription | null): string[] {
  if (!sub?.plan) return [];
  const b = sub.plan.feature_bullets;
  const raw =
    Array.isArray(b) && b.length > 0
      ? b.filter((x) => typeof x === "string" && x.trim())
      : featureLines(sub.plan.features);
  return raw.map((s) => stripHtmlToPlainText(s).trim()).filter(Boolean);
}

function isFreeTierSubscription(sub: Subscription | null): boolean {
  if (!sub?.plan) return true;
  return sub.plan.is_free === true;
}

function isSamePlanOption(sub: Subscription | null, plan: Plan): boolean {
  if (!sub) return false;
  if (sub.plan_id !== plan.plan_id) return false;
  const bp = sub.billing_period ?? "monthly";
  return bp === plan.billing_period;
}

function subscriptionNeedsReactivation(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.cancelled_at) return true;
  return sub.status === "cancelled" || sub.status === "expired" || sub.status === "inactive";
}

function isActiveCurrentPlan(sub: Subscription | null, plan: Plan): boolean {
  return isSamePlanOption(sub, plan) && !subscriptionNeedsReactivation(sub);
}

function formatOptionPrice(plan: Plan, sub: (key: string, opts?: Record<string, unknown>) => string): string {
  if (plan.is_free || plan.amount === 0) return sub("free");
  const period = plan.billing_period === "yearly" ? sub("periodYear") : sub("periodMonth");
  return `${formatCurrency(plan.amount, plan.currency)}/${period}`;
}

/** StoreKit displayPrice is a bare localized amount; Guideline 3.1.2 needs the period. */
function formatAppleOptionPrice(displayPrice: string, billingPeriod: string, sub: (key: string, opts?: Record<string, unknown>) => string): string {
  const period = billingPeriod === "yearly" ? sub("periodYear") : sub("periodMonth");
  return `${displayPrice}/${period}`;
}

/** Price line for the member’s current subscription (respects billing_period). */
function currentSubscriptionPriceLine(sub: Subscription | null, subFn: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!sub?.plan) return null;
  const p = sub.plan;
  const cur = sub.billing_period ?? "monthly";
  if (p.is_free) return subFn("free");
  if (cur === "yearly" && p.price_yearly != null) {
    return `${formatCurrency(Number(p.price_yearly), p.currency ?? "ZAR")}${subFn("perYear")}`;
  }
  if (p.price_monthly != null) {
    return `${formatCurrency(Number(p.price_monthly), p.currency ?? "ZAR")}${subFn("perMonth")}`;
  }
  return null;
}

function getPlanCtaLabel(plan: Plan, sub: Subscription | null, subFn: (key: string, opts?: Record<string, unknown>) => string): string {
  if (isSamePlanOption(sub, plan)) {
    if (subscriptionNeedsReactivation(sub) && (plan.is_free || plan.amount === 0)) {
      return subFn("ctaReactivateFree");
    }
    return "";
  }
  if (plan.is_free || plan.amount === 0) {
    if (sub && isAppleBillingActive(sub.billing_provider, sub.status)) return "";
    return subFn("ctaActivateFree");
  }
  if (isFreeTierSubscription(sub)) return subFn("ctaUpgrade");
  if (sub && sub.plan_id === plan.plan_id && sub.billing_period !== plan.billing_period) {
    return plan.billing_period === "yearly" ? subFn("ctaSwitchToYearly") : subFn("ctaSwitchToMonthly");
  }
  return subFn("ctaSwitchPlan");
}

function statusLabel(sub: Subscription, subFn: (key: string, opts?: Record<string, unknown>) => string): string {
  if (sub.cancelled_at) return subFn("statusCancelling");
  const s = sub.status;
  if (s === "active") return subFn("statusActive");
  if (s === "expired") return subFn("statusExpired");
  if (s === "past_due") return subFn("statusPastDue");
  if (s === "trial" || s === "trialing") return subFn("statusTrial");
  if (s === "inactive") return subFn("statusInactive");
  if (s === "cancelled") return subFn("statusCancelled");
  return s;
}

function billingActionLabel(sub: Subscription | null, subFn: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!sub) return null;
  if (isAppleBillingActive(sub.billing_provider, sub.status)) {
    if (sub.billing_issue?.action === "manage_apple") return subFn("billingActionOpenAppStoreSubs");
    if (sub.cancelled_at) return subFn("billingActionManageInAppStore");
    if (sub.status === "past_due") return subFn("billingActionUpdateInAppStore");
    return null;
  }
  if (sub.billing_issue?.action === "retry_payment") return subFn("billingActionRetryPayment");
  if (sub.billing_issue?.action === "complete_payment") return subFn("billingActionCompletePayment");
  if (isFreeTierSubscription(sub) && subscriptionNeedsReactivation(sub)) {
    if (isAppleBillingActive(sub.billing_provider, sub.status)) return null;
    return subFn("ctaReactivateFree");
  }
  if (isFreeTierSubscription(sub)) return null;
  if (sub.status === "past_due") return subFn("billingActionPayNowUpdateCard");
  if (sub.paystack_sync_pending) return subFn("billingActionCompleteBilling");
  if (sub.cancelled_at) return subFn("billingActionResumeBilling");
  if (sub.status === "expired" || sub.status === "cancelled" || sub.status === "inactive") return subFn("billingActionReactivatePlan");
  if (sub.status === "active" && sub.auto_renew === false) return subFn("billingActionExtendPlan");
  return null;
}

function statusPillClasses(sub: Subscription): { bg: string; text: string } {
  if (sub.cancelled_at) return { bg: "bg-amber-100", text: "text-amber-900" };
  if (sub.status === "past_due") return { bg: "bg-red-100", text: "text-red-800" };
  if (sub.status === "expired" || sub.status === "cancelled" || sub.status === "inactive") {
    return { bg: "bg-gray-100", text: "text-gray-700" };
  }
  if (sub.status === "trial" || sub.status === "trialing") return { bg: "bg-blue-100", text: "text-blue-800" };
  return { bg: "bg-green-100", text: "text-green-800" };
}

/**
 * §Provider-paystack-audit 2026-05: post-payment status card mirroring the
 * Ads variant, with phases tied directly to `SubscriptionPaymentOutcome`.
 */
function SubscriptionPaymentOutcomeCard({
  outcome,
  onDismiss,
}: {
  outcome: SubscriptionPaymentOutcome;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const sub = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.subscriptionSettings.${key}`, opts) as string,
    [t],
  );
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
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityLabel={sub("dismissOutcomeA11y")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color={tone.iconColor} />
      </TouchableOpacity>
    </View>
  );
}

type SubscriptionPaymentOutcome =
  | { phase: "idle" }
  | { phase: "provisioned"; title: string; body: string }
  | { phase: "pending"; title: string; body: string }
  | { phase: "failed"; title: string; body: string };

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const sub = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.subscriptionSettings.${key}`, opts) as string,
    [t],
  );

  const router = useRouter();
  const { provider } = useProvider();
  const localParams = useLocalSearchParams<{
    payment_success?: string;
    payment_failed?: string;
    payment_pending?: string;
    order_id?: string;
  }>();
  const [refreshing, setRefreshing] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [managingCard, setManagingCard] = useState(false);
  const appState = useRef(AppState.currentState);
  const {
    data: subscription,
    loading,
    error,
    refresh,
  } = useApi<Subscription | null>("/api/provider/subscription");
  const { data: plans, error: plansError } = useApi<Plan[]>("/api/provider/subscription/plans", {
    staleTimeMs: 0,
  });
  const appleProductIds = useMemo(
    () =>
      (plans ?? [])
        .map((p) => p.apple_product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [plans],
  );
  const { byId: appleStoreProducts } = useAppleIapProducts(appleProductIds);
  const [restoringPurchases, setRestoringPurchases] = useState(false);
  const [redeemingOfferCode, setRedeemingOfferCode] = useState(false);
  const { execute: postAction } = useApiMutation("post");
  /**
   * §Provider-paystack-audit 2026-05: Paystack only honors HTTPS callback URLs,
   * and `WebBrowser.openAuthSessionAsync` only resolves with `success` when the
   * `returnUrl` matches the actual redirect prefix. Use the shared HTTPS bridge
   * for both. The server-side `initialize-payment` / `renew` routes ignore
   * non-HTTPS `callback_url` overrides, so we no longer pass the deep-link.
   */
  const subscriptionReturnUrl = getSubscriptionPaystackReturnUrl();
  const [paymentOutcome, setPaymentOutcome] = useState<SubscriptionPaymentOutcome>({ phase: "idle" });
  // Blocking overlay shown while we verify with Paystack and poll for the plan
  // to provision — mirrors the ads / customer product-order checkout so the
  // screen never appears frozen after the Paystack sheet closes.
  const [verifying, setVerifying] = useState(false);

  const paystackCheckout = useInAppPaystackCheckout();

  const openSubscriptionPaystack = useCallback(
    async (
      url: string,
      title: string,
      opts?: { orderId?: string; reference?: string },
    ) => {
      const result = await paystackCheckout.waitForCheckout(url, {
        title,
        returnUrl: subscriptionReturnUrl,
        matchSuccess: (rawUrl) => matchesSubscriptionPaystackReturnUrl(rawUrl, { success: true }),
        matchCancel: (rawUrl) => matchesSubscriptionPaystackReturnUrl(rawUrl, { cancelled: true }),
      });

      if (result?.outcome === "cancel") {
        const failed = subscriptionFailedCopy(sub("paymentNotCompleted"));
        setPaymentOutcome({ phase: "failed", ...failed });
        refresh();
        return;
      }

      const isClosed = result?.outcome === "closed";
      if (result.outcome !== "success" && !isClosed) {
        refresh();
        return;
      }

      setVerifying(true);
      try {
        let reference = opts?.reference?.trim() || null;
        if (result.outcome === "success" && result.url) {
          if (matchesSubscriptionPaystackReturnUrl(result.url, { cancelled: true })) {
            const failed = subscriptionFailedCopy(sub("paymentNotCompleted"));
            setPaymentOutcome({ phase: "failed", ...failed });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            refresh();
            return;
          }
          const extracted = extractPaystackReferenceFromUrl(result.url);
          if (extracted) reference = extracted;
        }

        const verifyResult = reference ? await verifyPaystackWithRetry(reference) : null;

        if (verifyResult?.status === "failed") {
          const failed = subscriptionFailedCopy(verifyResult.errorMessage ?? null);
          setPaymentOutcome({ phase: "failed", ...failed });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          refresh();
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const provisioned = await pollSubscriptionProvisioned({
          orderId: opts?.orderId ?? null,
        });
        if (provisioned.state === "provisioned") {
          setPaymentOutcome({
            phase: "provisioned",
            ...subscriptionSuccessCopy(provisioned.subscription),
          });
        } else {
          setPaymentOutcome({ phase: "pending", ...subscriptionPendingCopy() });
        }
        refresh();
      } finally {
        setVerifying(false);
      }
    },
    [paystackCheckout, refresh, subscriptionReturnUrl],
  );

  const [billingSegment, setBillingSegment] = useState<"monthly" | "yearly">("monthly");
  const visiblePlansList = useMemo(() => {
    const plist = plans ?? [];
    const free = plist.filter((p) => p.is_free);
    const paid = plist.filter((p) => !p.is_free && p.billing_period === billingSegment);
    return [...free, ...paid];
  }, [plans, billingSegment]);

  // Review sheet state. `requestReviewConfirm` opens a polished BottomSheet
  // (plan, price breakdown, what-you-get, charged-only-after-confirm) and
  // resolves true when the provider confirms, false when they dismiss —
  // replacing the old Alert.alert confirm so checkout matches the gold standard.
  const [reviewData, setReviewData] = useState<SubscriptionCheckoutReview | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const reviewResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestReviewConfirm = useCallback(
    (review: SubscriptionCheckoutReview) =>
      new Promise<boolean>((resolve) => {
        reviewResolverRef.current = resolve;
        setReviewSubmitting(false);
        setReviewData(review);
      }),
    [],
  );

  const handleReviewConfirm = useCallback(() => {
    setReviewSubmitting(true);
    reviewResolverRef.current?.(true);
    reviewResolverRef.current = null;
  }, []);

  const handleReviewClose = useCallback(() => {
    if (reviewResolverRef.current) {
      reviewResolverRef.current(false);
      reviewResolverRef.current = null;
    }
    setReviewData(null);
    setReviewSubmitting(false);
  }, []);

  const closeReviewSheet = useCallback(() => {
    setReviewData(null);
    setReviewSubmitting(false);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refresh]);

  // §Provider-audit 2026-04 (round 9): refresh whenever the screen regains
  // focus. In-app Paystack WebView checkout also keeps the app foregrounded,
  // so `AppState` inactive→active may not fire; we refresh on focus and after
  // checkout completes.
  useFocusEffect(
    useCallback(() => {
      refresh();
      if (shouldUseAppleIap() && provider?.id) {
        void syncUnfinishedApplePurchases(provider.id);
      }
    }, [refresh, provider?.id]),
  );

  /**
   * §Provider-paystack-audit 2026-05: surface the same outcome card when the
   * cold-start payment-return screen forwards the user here with payment_*
   * params (e.g. after a 3DS challenge that suspended the auth session).
   */
  const subColdStartHandledRef = useRef(false);
  useEffect(() => {
    const successFlag = localParams.payment_success === "1" || localParams.payment_success === "true";
    const failedFlag = localParams.payment_failed === "1" || localParams.payment_failed === "true";
    const pendingFlag = localParams.payment_pending === "1" || localParams.payment_pending === "true";
    const orderId = typeof localParams.order_id === "string" ? localParams.order_id : undefined;
    if (!successFlag && !failedFlag && !pendingFlag) return;
    if (subColdStartHandledRef.current) return;
    subColdStartHandledRef.current = true;

    const handle = async () => {
      if (failedFlag) {
        setPaymentOutcome({ phase: "failed", ...subscriptionFailedCopy() });
        refresh();
        return;
      }
      if (pendingFlag && !successFlag) {
        setPaymentOutcome({ phase: "pending", ...subscriptionPendingCopy() });
        refresh();
        return;
      }
      const result = await pollSubscriptionProvisioned({
        orderId: orderId ?? null,
        maxAttempts: 6,
        delayMs: 1500,
      });
      if (result.state === "provisioned") {
        setPaymentOutcome({ phase: "provisioned", ...subscriptionSuccessCopy(result.subscription) });
      } else {
        setPaymentOutcome({ phase: "pending", ...subscriptionPendingCopy() });
      }
      refresh();
    };
    void handle();
  }, [localParams.payment_success, localParams.payment_failed, localParams.payment_pending, localParams.order_id, refresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  async function handleCancel() {
    if (isAppleBillingActive(subscription?.billing_provider, subscription?.status)) {
      Alert.alert(
        sub("cancelInAppStoreTitle"),
        sub("cancelInAppStoreBody"),
        [
          { text: sub("notNow"), style: "cancel" },
          { text: sub("openAppStore"), onPress: () => openAppleSubscriptionManagement() },
        ],
      );
      return;
    }
    Alert.alert(
      sub("cancelAtPeriodEndTitle"),
      sub("cancelAtPeriodEndBody"),
      [
        { text: sub("keepSubscription"), style: "cancel" },
        {
          text: sub("cancelSubscription"),
          style: "destructive",
          onPress: async () => {
            const { error: err } = await postAction("/api/provider/subscription/cancel", {});
            if (err) Alert.alert(sub("errorTitle"), err);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
              Alert.alert(sub("doneTitle"), sub("cancelSuccess"));
            }
          },
        },
      ]
    );
  }

  async function handleRenew() {
    if (isAppleBillingActive(subscription?.billing_provider, subscription?.status)) {
      openAppleSubscriptionManagement();
      return;
    }
    const priceLine = currentSubscriptionPriceLine(subscription, sub);
    const confirmed = await requestReviewConfirm({
      heading: sub("renewalHeading"),
      title: subscription?.plan?.name ?? sub("renewalTitleFallback"),
      subtitle: sub("renewalSubtitle"),
      lineItems: [
        { label: sub("renewalLineItemPlan"), value: subscription?.plan?.name ?? sub("renewalCurrentPlanFallback") },
        { label: sub("renewalLineItemAmountDue"), value: priceLine ?? sub("renewalSeeCheckoutFallback") },
      ],
      benefits: currentPlanBullets(subscription).slice(0, 5),
      total: priceLine ?? sub("renewalTotalFallback"),
      confirmLabel: sub("renewalConfirmLabel"),
      recurring: true,
    });
    if (!confirmed) return;

    try {
      const { error: err, data } = await postAction("/api/provider/subscription/renew", {
        in_app: true,
        callback_url: subscriptionReturnUrl,
      });
      if (err) {
        closeReviewSheet();
        Alert.alert(sub("errorTitle"), err);
        return;
      }
      const d = data as { payment_url?: string; is_free?: boolean; message?: string };
      if (d?.is_free) {
        closeReviewSheet();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(sub("doneTitle"), d.message ?? sub("renewSuccess"));
        refresh();
        return;
      }
      const url = d?.payment_url;
      const renewOrderId =
        typeof (d as { order_id?: string })?.order_id === "string"
          ? (d as { order_id?: string }).order_id
          : undefined;
      const renewReference =
        typeof (d as { reference?: string })?.reference === "string"
          ? (d as { reference?: string }).reference
          : undefined;
      if (url) {
        closeReviewSheet();
        await openSubscriptionPaystack(url, sub("renewSubscriptionCheckoutTitle"), {
          orderId: renewOrderId,
          reference: renewReference,
        });
      } else {
        closeReviewSheet();
        Alert.alert(sub("noPaymentLink"), sub("noPaymentLinkBody"));
      }
      refresh();
    } finally {
      closeReviewSheet();
    }
  }

  async function handleBillingAction() {
    if (
      subscription &&
      isFreeTierSubscription(subscription) &&
      subscriptionNeedsReactivation(subscription)
    ) {
      const freePlan = plans?.find((p) => p.is_free || p.amount === 0);
      if (freePlan) {
        await handleUpgrade(freePlan.id);
        return;
      }
    }

    if (subscription?.billing_issue?.action === "update_payment" || subscription?.status === "past_due") {
      if (isAppleBillingActive(subscription.billing_provider, subscription.status)) {
        openAppleSubscriptionManagement();
        return;
      }
      try {
        const { error: linkErr, data } = await api.get<{ link?: string }>("/api/provider/subscription/manage-link");
        if (linkErr) {
          Alert.alert(sub("errorTitle"), sub("cardUpdateFailed"));
        } else if (data?.link) {
          await openSubscriptionPaystack(data.link, sub("updateCardCheckoutTitle"));
          return;
        }
      } catch {
        Alert.alert(sub("errorTitle"), sub("manageLinkFailed"));
      }
    }

    const latest = subscription?.latest_order;
    const retryPlan = latest?.plan_id
      ? plans?.find(
          (p) =>
            p.plan_id === latest.plan_id &&
            (!latest.billing_period || p.billing_period === latest.billing_period),
        )
      : null;

    if (
      retryPlan &&
      (subscription?.billing_issue?.action === "retry_payment" ||
        subscription?.billing_issue?.action === "complete_payment")
    ) {
      await handleUpgrade(retryPlan.id);
      return;
    }

    if (isAppleBillingActive(subscription?.billing_provider, subscription?.status)) {
      openAppleSubscriptionManagement();
      return;
    }

    await handleRenew();
  }

  /**
   * Persistent "Manage billing / update card" action for healthy paid
   * subscribers — reuses the same Paystack-hosted manage link as the
   * reactive past_due/billing_issue flow above, but is always available so a
   * provider can proactively swap cards without first hitting a payment
   * failure.
   */
  async function handleManageCard() {
    if (isAppleBillingActive(subscription?.billing_provider, subscription?.status)) {
      openAppleSubscriptionManagement();
      return;
    }
    setManagingCard(true);
    try {
      const { error: linkErr, data } = await api.get<{ link?: string }>("/api/provider/subscription/manage-link");
      if (linkErr) {
        Alert.alert(sub("errorAlertTitle"), getApiErrorMessage(linkErr, sub("cardUpdateFailed")));
        return;
      }
      if (data?.link) {
        await openSubscriptionPaystack(data.link, sub("manageBillingCheckoutTitle"));
      } else {
        Alert.alert(sub("errorAlertTitle"), sub("cardUpdateFailed"));
      }
    } catch {
      Alert.alert(sub("errorTitle"), sub("manageLinkFailed"));
    } finally {
      setManagingCard(false);
    }
  }

  async function handleUpgrade(planId: string) {
    const selectedPlan = plans?.find((p) => p.id === planId);
    if (!selectedPlan) return;
    const billingPeriod = selectedPlan.billing_period || "monthly";
    const barePlanId = selectedPlan.plan_id || planId;
    const isPaidSelection = !(selectedPlan.is_free || selectedPlan.amount === 0);

    if (
      isAppleBillingActive(subscription?.billing_provider, subscription?.status) &&
      !shouldUseAppleIap()
    ) {
      Alert.alert(
        sub("appStoreBillingTitle"),
        sub("appStoreBillingBody"),
      );
      return;
    }

    if (isPaidSelection) {
      const appleDisplayPrice =
        shouldUseAppleIap() && selectedPlan.apple_product_id
          ? appleStoreProducts.get(selectedPlan.apple_product_id)?.displayPrice
          : null;
      const priceLabel = appleDisplayPrice
        ? formatAppleOptionPrice(appleDisplayPrice, billingPeriod, sub)
        : formatOptionPrice(selectedPlan, sub);
      const planFeatures = Array.isArray(selectedPlan.features)
        ? selectedPlan.features.map((f) => stripHtmlToPlainText(f)).filter(Boolean).slice(0, 5)
        : [];
      const confirmed = await requestReviewConfirm({
        heading: isFreeTierSubscription(subscription) ? sub("ctaUpgrade") : sub("ctaSwitchPlan"),
        title: selectedPlan.name,
        subtitle: selectedPlan.description ? stripHtmlToPlainText(selectedPlan.description) : undefined,
        lineItems: [
          {
            label: `${selectedPlan.name} (${billingPeriod === "yearly" ? sub("lineItemPeriodYearly") : sub("lineItemPeriodMonthly")})`,
            value: priceLabel,
          },
          { label: sub("totalDueNow"), value: priceLabel },
        ],
        benefits: planFeatures,
        total: priceLabel,
        confirmLabel: shouldUseAppleIap() ? sub("subscribeLabel", { price: priceLabel }) : sub("payLabel", { price: priceLabel }),
        recurring: true,
      });
      if (!confirmed) return;
    }

    setUpgradingId(planId);
    try {
      if (selectedPlan.is_free || selectedPlan.amount === 0) {
        if (isAppleBillingActive(subscription?.billing_provider, subscription?.status)) {
          openAppleSubscriptionManagement();
          return;
        }
        const { error: err, data } = await postAction("/api/provider/subscription/upgrade", {
          plan_id: barePlanId,
          billing_period: billingPeriod,
        });
        if (err) {
          Alert.alert(sub("errorTitle"), err);
          return;
        }
        if ((data as { is_free?: boolean; subscription_id?: string })?.is_free || (data as { subscription_id?: string })?.subscription_id) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(sub("successTitle"), sub("freePlanActivated"));
          refresh();
          return;
        }
        Alert.alert(sub("activatePlanFailed"), sub("activatePlanFailedBody"));
        return;
      }

      // iOS: StoreKit is the only permitted path for digital subscriptions.
      // Never fall through to Paystack if a product ID or session is missing.
      if (shouldUseAppleIap()) {
        if (subscription?.ios_purchase_eligible === false) {
          Alert.alert(
            sub("notAvailableTitle"),
            subscription.ios_purchase_eligible_reason ?? sub("iapNotAvailableBody"),
          );
          return;
        }
        if (!provider?.id) {
          Alert.alert(sub("errorTitle"), sub("accountLoading"));
          return;
        }
        if (!selectedPlan.apple_product_id) {
          Alert.alert(
            sub("notAvailableTitle"),
            sub("appleProductNotMappedBody"),
          );
          return;
        }
        const checkoutStart = await startAppleSubscriptionCheckout({
          subscriptionPlanId: barePlanId,
          billingPeriod: billingPeriod as "monthly" | "yearly",
          appleProductId: selectedPlan.apple_product_id,
          providerId: provider.id,
        });
        if (!checkoutStart.ok) {
          if (!checkoutStart.cancelled) {
            const msg =
              checkoutStart.errorCode === "IAP_DISABLED"
                ? sub("iapDisabledBody")
                : checkoutStart.error;
            Alert.alert(sub("errorAlertTitle"), msg);
          }
          return;
        }
        if (checkoutStart.alreadyActive) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(sub("successTitle"), sub("subscriptionUpdated"));
          refresh();
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(sub("successTitle"), sub("subscriptionActivatedAppStore"));
        refresh();
        return;
      }

      // Paid plans: Paystack on Android/web — try subscription upgrade when authorization exists,
      // otherwise initialize a checkout (first payment or new card).
      const checkoutStart = await startPaidSubscriptionCheckout({
        subscriptionPlanId: barePlanId,
        billingPeriod: billingPeriod as "monthly" | "yearly",
        inApp: true,
      });
      if (!checkoutStart.ok) {
        Alert.alert(sub("errorAlertTitle"), checkoutStart.error);
        return;
      }
      if (checkoutStart.alreadyActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(sub("successTitle"), sub("subscriptionUpdated"));
        refresh();
        return;
      }
      await openSubscriptionPaystack(checkoutStart.authorizationUrl, sub("subscriptionCheckoutTitle"), {
        orderId: checkoutStart.orderId,
        reference: checkoutStart.reference,
      });
      refresh();
    } finally {
      setUpgradingId(null);
      closeReviewSheet();
    }
  }

  if (loading && subscription === undefined && !error) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={sub("loading")} />
      </ScreenContainer>
    );
  }

  if (error && !subscription) {
    return (
      <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
        <ScreenHeader title={sub("title")} showBack subtitle={sub("subtitle")} />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const paidSubscriber = subscription && !isFreeTierSubscription(subscription);
  const billingCta = billingActionLabel(subscription, sub);
  const showCancel =
    subscription &&
    subscription.status === "active" &&
    !subscription.cancelled_at &&
    paidSubscriber &&
    !isAppleBillingActive(subscription.billing_provider, subscription.status);
  const statusPill = subscription ? statusPillClasses(subscription) : null;

  return (
    <>
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title={sub("title")} showBack subtitle={sub("subtitle")} />

      {/* Hero intro */}
      <View style={{ marginBottom: 8, marginTop: 4 }}>
        <Text style={twStyle("text-base leading-6 text-gray-600")}>
          {sub("introPlansMatchRegion")}
        </Text>
        {shouldUseAppleIap() ? (
          <Text style={twStyle("mt-2 text-xs leading-5 text-gray-500")}>
            {sub("introIosAutoRenewable")}
          </Text>
        ) : null}
        <View style={twStyle("mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-2")}>
          <TouchableOpacity
            onPress={() => pushWebPartnerEula(router)}
            accessibilityRole="link"
            accessibilityLabel={sub("termsOfUseA11y")}
          >
            <Text style={twStyle("text-sm font-semibold text-gray-900 underline")}>{sub("termsOfUse")}</Text>
          </TouchableOpacity>
          <Text style={twStyle("text-sm text-gray-400")}>·</Text>
          <TouchableOpacity
            onPress={() => pushWebPrivacyPolicy(router)}
            accessibilityRole="link"
            accessibilityLabel={sub("privacyPolicyA11y")}
          >
            <Text style={twStyle("text-sm font-semibold text-gray-900 underline")}>{sub("privacyPolicy")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* §Provider-paystack-audit 2026-05: post-payment outcome card. Reads
        from `paymentOutcome` so the same component handles both in-app and
        cold-start returns and shows model-specific copy from the shared helper. */}
      <SubscriptionPaymentOutcomeCard
        outcome={paymentOutcome}
        onDismiss={() => setPaymentOutcome({ phase: "idle" })}
      />

      {paidSubscriber && isAppleBillingActive(subscription.billing_provider, subscription.status) ? (
        <View style={twStyle("mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-blue-900")}>{sub("billedThroughAppleTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-blue-900")}>
            {sub("billedThroughAppleBody")}
          </Text>
        </View>
      ) : null}

      {paidSubscriber && subscription.apple_price_increase_status === "pending" ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>{sub("priceIncreaseConsentTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-amber-900")}>
            {sub("priceIncreaseConsentBody")}
          </Text>
          <TouchableOpacity
            style={twStyle("mt-3 self-start rounded-xl bg-amber-900 px-4 py-2")}
            onPress={() => openAppleSubscriptionManagement()}
          >
            <Text style={twStyle("text-sm font-semibold text-white")}>{sub("openAppStoreSubscriptions")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {shouldUseAppleIap() ? (
        <View style={twStyle("mb-4 gap-2")}>
          <TouchableOpacity
            style={twStyle("flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
            onPress={async () => {
              if (!provider?.id) return;
              setRestoringPurchases(true);
              try {
                const result = await restoreApplePurchases(provider.id);
                if (result.ok) {
                  Alert.alert(sub("restoreComplete"), sub("restoreCompleteBody"));
                  refresh();
                } else {
                  Alert.alert(sub("restoreFailed"), result.error ?? sub("restoreFailedBody"));
                }
              } finally {
                setRestoringPurchases(false);
              }
            }}
            disabled={restoringPurchases || redeemingOfferCode}
          >
            {restoringPurchases ? (
              <ActivityIndicator size="small" color={Colors.gray[700]} style={{ marginEnd: 8 }} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={Colors.gray[700]} style={{ marginEnd: 8 }} />
            )}
            <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
              {restoringPurchases ? sub("restoringLabel") : sub("restorePurchases")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={twStyle("flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
            onPress={async () => {
              if (!provider?.id) return;
              setRedeemingOfferCode(true);
              try {
                const result = await presentAppleOfferCodeSheet(provider.id);
                if (result.ok) {
                  Alert.alert(
                    sub("offerCodeSuccessTitle"),
                    sub("offerCodeSuccessBody"),
                  );
                  refresh();
                } else {
                  Alert.alert(sub("offerCodeTitle"), result.error ?? sub("offerCodeFailed"));
                }
              } finally {
                setRedeemingOfferCode(false);
              }
            }}
            disabled={restoringPurchases || redeemingOfferCode}
          >
            {redeemingOfferCode ? (
              <ActivityIndicator size="small" color={Colors.gray[700]} style={{ marginEnd: 8 }} />
            ) : (
              <Ionicons name="gift-outline" size={18} color={Colors.gray[700]} style={{ marginEnd: 8 }} />
            )}
            <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
              {redeemingOfferCode ? sub("openingLabel") : sub("redeemOfferCode")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {paidSubscriber && subscription?.paystack_sync_pending ? (
        <View
          style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}
        >
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>{sub("billingSyncNeededTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-amber-900")}>
            {subscription.paystack_sync_note?.trim() || sub("billingSyncNeededBody")}
          </Text>
        </View>
      ) : null}

      {/* Current plan */}
      <SectionHeader title={sub("yourPlan")} />
      {!subscription ? (
        <View
          style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-5")}
        >
          <Text style={twStyle("text-base font-medium text-gray-800")}>{sub("noSubscriptionTitle")}</Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
            {sub("noSubscriptionBody")}
          </Text>
        </View>
      ) : (
        <View
          style={[
            twStyle("mb-6 overflow-hidden rounded-2xl border-2 p-5"),
            { borderColor: "#fce7f3", backgroundColor: "#fffafb" },
          ]}
        >
          <View style={twStyle("flex-row items-start justify-between")}>
            <View style={{ flex: 1, paddingEnd: 12 }}>
              <Text style={twStyle("text-xl font-bold text-gray-900")}>
                {subscription.plan?.name ?? sub("planNameFallback")}
              </Text>
              {subscription.plan?.description ? (
                <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
                  {stripHtmlToPlainText(subscription.plan.description)}
                </Text>
              ) : null}
              {currentSubscriptionPriceLine(subscription, sub) ? (
                <Text style={twStyle("mt-3 text-2xl font-bold text-gray-900")}>
                  {currentSubscriptionPriceLine(subscription, sub)}
                </Text>
              ) : null}
              {subscription.cancelled_at ? (
                <Text style={twStyle("mt-2 text-sm text-amber-800")}>
                  {sub("cancellingAccessUntil", { date: subscription.expires_at ? formatDate(subscription.expires_at) : sub("periodEndFallback") })}
                </Text>
              ) : (
                <>
                  <Text style={twStyle("mt-2 text-sm text-gray-600")}>
                    {subscription.expires_at
                      ? subscription.auto_renew
                        ? sub("autoRenewsOn", { date: formatDate(subscription.expires_at) })
                        : sub("paidUntil", { date: formatDate(subscription.expires_at) })
                      : null}
                  </Text>
                </>
              )}
            </View>
            <View
              style={twStyle(
                `rounded-full px-3 py-1.5 ${statusPill?.bg ?? "bg-gray-100"}`
              )}
            >
              <Text
                style={twStyle(
                  `text-xs font-semibold ${statusPill?.text ?? "text-gray-700"}`
                )}
              >
                {statusLabel(subscription, sub)}
              </Text>
            </View>
          </View>

          {currentPlanBullets(subscription).length > 0 ? (
            <View style={twStyle("mt-5 border-t border-pink-100 pt-4")}>
              <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}>
                {sub("whatsIncluded")}
              </Text>
              {currentPlanBullets(subscription).map((line, i) => (
                <View key={`${i}-${line.slice(0, 12)}`} style={twStyle("mb-3 flex-row items-start")}>
                  <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginTop: 0, marginEnd: 10 }} />
                  <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {subscription.billing_issue ? (
            <View style={twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
              <Text style={twStyle("text-sm font-semibold text-amber-900")}>
                {subscription.billing_issue.type === "payment_failed"
                  ? sub("billingIssuePaymentNotCompleted")
                  : subscription.billing_issue.type === "past_due"
                    ? sub("billingIssuePaymentActionNeeded")
                    : sub("billingIssueActionNeeded")}
              </Text>
              <Text style={twStyle("mt-1 text-sm leading-5 text-amber-900")}>
                {subscription.billing_issue.message}
              </Text>
            </View>
          ) : null}

          {paidSubscriber && subscription.billing_provider !== "apple" ? (
            <TouchableOpacity
              style={twStyle("mt-4 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/billing" as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={18} color={Colors.gray[700]} style={{ marginEnd: 8 }} />
              <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
                {sub("viewInvoicesAndPaymentMethods")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Persistent card-update action for healthy paid subscribers — the
              reactive "Pay now / update card" CTA below only appears once
              something has already gone wrong, so this is the only way to
              proactively swap cards. */}
          {paidSubscriber && !billingCta && isAppleBillingActive(subscription.billing_provider, subscription.status) ? (
            <TouchableOpacity
              style={twStyle("mt-3 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
              onPress={handleManageCard}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-apple" size={18} color={Colors.gray[700]} style={{ marginEnd: 8 }} />
              <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
                {sub("billingActionManageInAppStore")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {paidSubscriber && !billingCta && subscription.billing_provider !== "apple" ? (
            <TouchableOpacity
              style={twStyle("mt-3 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
              onPress={handleManageCard}
              activeOpacity={0.85}
              disabled={managingCard}
            >
              {managingCard ? (
                <ActivityIndicator size="small" color={Colors.gray[700]} style={{ marginEnd: 8 }} />
              ) : (
                <Ionicons name="card-outline" size={18} color={Colors.gray[700]} style={{ marginEnd: 8 }} />
              )}
              <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
                {managingCard ? sub("openingLabel") : sub("manageBillingUpdateCard")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showCancel ? (
            <TouchableOpacity
              style={twStyle("mt-4 rounded-2xl border border-red-200 bg-white py-3")}
              onPress={handleCancel}
              activeOpacity={0.85}
            >
              <Text style={twStyle("text-center text-sm font-semibold text-red-600")}>
                {isAppleBillingActive(subscription.billing_provider, subscription.status)
                  ? sub("cancelInAppStore")
                  : sub("cancelSubscriptionCta")}
              </Text>
            </TouchableOpacity>
          ) : null}
          {subscription.cancelled_at ? (
            <View style={twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
              <Text style={twStyle("text-center text-sm leading-5 text-amber-900")}>
                {sub("cancelledKeepAccessNote")}
              </Text>
            </View>
          ) : null}
          {billingCta ? (
            <TouchableOpacity
              style={[twStyle("mt-3 rounded-2xl py-3.5"), { backgroundColor: ACCENT }]}
              onPress={handleBillingAction}
              activeOpacity={0.9}
            >
              <Text style={twStyle("text-center text-sm font-semibold text-white")}>
                {billingCta}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Available plans */}
      <SectionHeader title={sub("allPlans")} />
      {plans && plans.length > 0 ? (
        <View style={twStyle("pb-4")}>
          {(plans ?? []).some((p) => !p.is_free) ? (
            <View style={twStyle("mb-4 flex-row rounded-full bg-gray-100 p-1")}>
              {(["monthly", "yearly"] as const).map((seg) => {
                const active = billingSegment === seg;
                return (
                  <TouchableOpacity
                    key={seg}
                    style={[
                      twStyle("flex-1 rounded-full py-2.5"),
                      active ? { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4 } : {},
                    ]}
                    onPress={() => setBillingSegment(seg)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={twStyle(
                        `text-center text-sm font-semibold ${active ? "text-gray-900" : "text-gray-500"}`
                      )}
                    >
                      {seg === "monthly" ? sub("monthlySegment") : sub("yearlySegment")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {visiblePlansList.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              subscription={subscription}
              upgradingId={upgradingId}
              onUpgrade={handleUpgrade}
              appleDisplayPrice={
                plan.apple_product_id
                  ? appleStoreProducts.get(plan.apple_product_id)?.displayPrice
                  : undefined
              }
            />
          ))}
        </View>
      ) : plansError ? (
        <ErrorState message={sub("couldNotLoadPlans")} onRetry={refresh} />
      ) : (
        <EmptyState icon="pricetag-outline" title={sub("noPlansTitle")} description={sub("noPlansDesc")} />
      )}

      {shouldUseAppleIap() ? (
        <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wider text-gray-500")}>
            {sub("autoRenewableSubscriptionTitle")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
            {sub("autoRenewableSubscriptionBody")}
          </Text>
        </View>
      ) : null}

      <View style={twStyle("h-10")} />
    </ScreenContainer>
    {paystackCheckout.modal}
    <SubscriptionCheckoutReviewSheet
      visible={reviewData != null}
      review={reviewData}
      submitting={reviewSubmitting}
      onConfirm={handleReviewConfirm}
      onClose={handleReviewClose}
    />
    <AdsCheckoutProcessingOverlay
      visible={verifying}
      message={sub("verifyingOverlayMessage")}
    />
    </>
  );
}

function PlanCard({
  plan,
  subscription,
  upgradingId,
  onUpgrade,
  appleDisplayPrice,
}: {
  plan: Plan;
  subscription: Subscription | null;
  upgradingId: string | null;
  onUpgrade: (id: string) => void;
  appleDisplayPrice?: string;
}) {
  const { t } = useTranslation();
  const sub = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.subscriptionSettings.${key}`, opts) as string,
    [t],
  );
  const isCurrent = isActiveCurrentPlan(subscription, plan);
  const needsReactivate =
    isSamePlanOption(subscription, plan) && subscriptionNeedsReactivation(subscription);
  const cta = getPlanCtaLabel(plan, subscription, sub);
  const loading = upgradingId === plan.id;

  return (
    <View
      style={[
        twStyle("mb-4 overflow-hidden rounded-2xl border-2 bg-white p-5"),
        plan.is_popular
          ? { borderColor: ACCENT, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
          : { borderColor: "#f3f4f6" },
      ]}
    >
      <View style={twStyle("flex-row flex-wrap items-start justify-between gap-2")}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={twStyle("flex-row flex-wrap items-center gap-2")}>
            <Text style={twStyle("text-lg font-bold text-gray-900")}>{plan.name}</Text>
            {plan.is_popular ? (
              <View style={{ borderRadius: 9999, backgroundColor: "#fce7f3", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: ACCENT }}>{sub("mostPopularBadge")}</Text>
              </View>
            ) : null}
            {isCurrent ? (
              <View style={{ borderRadius: 9999, backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#4b5563" }}>{sub("currentBadge")}</Text>
              </View>
            ) : null}
          </View>
          <Text style={twStyle("mt-2 text-3xl font-bold text-gray-900")}>
            {plan.is_free || plan.amount === 0
              ? sub("free")
              : appleDisplayPrice
                ? formatAppleOptionPrice(appleDisplayPrice, plan.billing_period, sub)
                : formatOptionPrice(plan, sub)}
          </Text>
          {plan.description ? (
            <Text style={twStyle("mt-3 text-sm leading-5 text-gray-600")}>
              {stripHtmlToPlainText(plan.description)}
            </Text>
          ) : null}
        </View>
      </View>

      {Array.isArray(plan.features) && plan.features.length > 0 ? (
        <View style={twStyle("mt-5 border-t border-gray-100 pt-4")}>
          {plan.features.map((f, i) => (
            <View key={`${plan.id}-f-${i}`} style={twStyle("mb-3 flex-row items-start")}>
              <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginEnd: 10 }} />
              <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>
                {stripHtmlToPlainText(f)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {(!isCurrent || needsReactivate) && cta ? (
        <TouchableOpacity
          style={[
            twStyle("mt-5 flex-row items-center justify-center rounded-full py-4"),
            {
              backgroundColor: plan.is_popular ? ACCENT : "#111827",
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={() => onUpgrade(plan.id)}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginEnd: 8 }} />
          ) : null}
          <Text style={twStyle("text-base font-bold text-white")}>{loading ? sub("pleaseWait") : cta}</Text>
        </TouchableOpacity>
      ) : isCurrent ? (
        <View style={twStyle("mt-5 rounded-full bg-gray-100 py-3")}>
          <Text style={twStyle("text-center text-sm font-semibold text-gray-600")}>{sub("thisIsYourCurrentPlan")}</Text>
        </View>
      ) : needsReactivate ? (
        <Text style={twStyle("mt-3 text-center text-xs text-amber-800")}>
          {sub("cancelledReactivateNote")}
        </Text>
      ) : null}
    </View>
  );
}
