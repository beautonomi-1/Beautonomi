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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { stripHtmlToPlainText } from "@/lib/htmlPlainText";
import { Colors } from "@/constants/colors";

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
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  cancelled_at: string | null;
  auto_renew: boolean;
  plan_id: string;
  billing_period?: "monthly" | "yearly" | null;
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

function formatOptionPrice(plan: Plan): string {
  if (plan.is_free || plan.amount === 0) return "Free";
  const period = plan.billing_period === "yearly" ? "year" : "month";
  return `${formatCurrency(plan.amount, plan.currency)}/${period}`;
}

/** Price line for the member’s current subscription (respects billing_period). */
function currentSubscriptionPriceLine(sub: Subscription | null): string | null {
  if (!sub?.plan) return null;
  const p = sub.plan;
  const cur = sub.billing_period ?? "monthly";
  if (p.is_free) return "Free";
  if (cur === "yearly" && p.price_yearly != null) {
    return `${formatCurrency(Number(p.price_yearly), p.currency ?? "ZAR")}/year`;
  }
  if (p.price_monthly != null) {
    return `${formatCurrency(Number(p.price_monthly), p.currency ?? "ZAR")}/month`;
  }
  return null;
}

function getPlanCtaLabel(plan: Plan, sub: Subscription | null): string {
  if (isSamePlanOption(sub, plan)) {
    if (subscriptionNeedsReactivation(sub) && (plan.is_free || plan.amount === 0)) {
      return "Reactivate free plan";
    }
    return "";
  }
  if (plan.is_free || plan.amount === 0) return "Activate free";
  if (isFreeTierSubscription(sub)) return "Upgrade";
  if (sub && sub.plan_id === plan.plan_id && sub.billing_period !== plan.billing_period) {
    return plan.billing_period === "yearly" ? "Switch to yearly billing" : "Switch to monthly billing";
  }
  return "Switch plan";
}

function statusLabel(sub: Subscription): string {
  if (sub.cancelled_at) return "Cancelling";
  const s = sub.status;
  if (s === "active") return "Active";
  if (s === "expired") return "Expired";
  if (s === "past_due") return "Past due";
  if (s === "trial" || s === "trialing") return "Trial";
  if (s === "inactive") return "Inactive";
  if (s === "cancelled") return "Cancelled";
  return s;
}

function billingActionLabel(sub: Subscription | null): string | null {
  if (!sub) return null;
  if (isFreeTierSubscription(sub) && subscriptionNeedsReactivation(sub)) {
    return "Reactivate free plan";
  }
  if (isFreeTierSubscription(sub)) return null;
  if (sub.status === "past_due") return "Pay now / update card";
  if (sub.paystack_sync_pending) return "Complete billing";
  if (sub.billing_issue?.action === "retry_payment") return "Retry payment";
  if (sub.billing_issue?.action === "complete_payment") return "Complete payment";
  if (sub.cancelled_at) return "Resume billing";
  if (sub.status === "expired" || sub.status === "cancelled" || sub.status === "inactive") return "Reactivate plan";
  if (sub.status === "active" && sub.auto_renew === false) return "Extend plan";
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
        accessibilityLabel="Dismiss subscription payment notification"
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
  const router = useRouter();
  const localParams = useLocalSearchParams<{
    payment_success?: string;
    payment_failed?: string;
    payment_pending?: string;
    order_id?: string;
  }>();
  const [refreshing, setRefreshing] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
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

  const paystackCheckout = useInAppPaystackCheckout();

  const openSubscriptionPaystack = useCallback(
    async (url: string, title: string, opts?: { orderId?: string }) => {
      const result = await paystackCheckout.waitForCheckout(url, {
        title,
        returnUrl: subscriptionReturnUrl,
        matchSuccess: (rawUrl) => matchesSubscriptionPaystackReturnUrl(rawUrl, { success: true }),
        matchCancel: (rawUrl) => matchesSubscriptionPaystackReturnUrl(rawUrl, { cancelled: true }),
      });

      if (result?.outcome === "cancel" || result?.outcome === "closed") {
        const failed = subscriptionFailedCopy("Payment wasn't completed.");
        setPaymentOutcome({ phase: "failed", ...failed });
        refresh();
        return;
      }

      if (result.outcome !== "success") {
        refresh();
        return;
      }

      // Cross-confirm against Paystack so the screen never claims a plan is
      // active before the webhook (and the bank) signs off.
      const reference = extractPaystackReferenceFromUrl(result.url);
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
        maxAttempts: 6,
        delayMs: 1500,
      });
      if (provisioned.state === "provisioned") {
        setPaymentOutcome({ phase: "provisioned", ...subscriptionSuccessCopy(provisioned.subscription) });
      } else {
        setPaymentOutcome({ phase: "pending", ...subscriptionPendingCopy() });
      }
      refresh();
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

  const confirmSecureCheckout = useCallback(
    (params: { title: string; message: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(params.title, params.message, [
          { text: "Not now", style: "cancel", onPress: () => resolve(false) },
          {
            text: params.confirmLabel ?? "Continue to Paystack",
            style: "default",
            onPress: () => resolve(true),
          },
        ]);
      }),
    [],
  );

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
    }, [refresh]),
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
    Alert.alert(
      "Cancel subscription",
      "Your plan will remain active until the end of the current period. After that you will be moved to the free plan.",
      [
        { text: "Keep subscription", style: "cancel" },
        {
          text: "Cancel subscription",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await postAction("/api/provider/subscription/cancel", {});
            if (err) Alert.alert("Error", err);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
              Alert.alert("Done", "Subscription will be cancelled at the end of the period.");
            }
          },
        },
      ]
    );
  }

  async function handleRenew() {
    const confirmed = await confirmSecureCheckout({
      title: "Review renewal",
      message:
        "We'll open secure Paystack checkout. Your plan renews only after Paystack confirms the payment.",
      confirmLabel: "Renew securely",
    });
    if (!confirmed) return;

    const { error: err, data } = await postAction("/api/provider/subscription/renew", {
      in_app: true,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    const d = data as { payment_url?: string; is_free?: boolean; message?: string };
    if (d?.is_free) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Done", d.message ?? "Plan renewed.");
      refresh();
      return;
    }
    const url = d?.payment_url;
    const renewOrderId =
      typeof (d as { order_id?: string })?.order_id === "string"
        ? (d as { order_id?: string }).order_id
        : undefined;
    if (url) {
      await openSubscriptionPaystack(url, "Renew subscription", { orderId: renewOrderId });
    } else {
      Alert.alert("No payment link", "Unable to start renewal. Please try again or contact support.");
    }
    refresh();
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
      try {
        const { error: linkErr, data } = await api.get<{ link?: string }>("/api/provider/subscription/manage-link");
        if (linkErr) {
          Alert.alert("Error", "Could not generate card update link. You can also try completing payment below.");
        } else if (data?.link) {
          await openSubscriptionPaystack(data.link, "Update Card");
          return;
        }
      } catch {
        Alert.alert("Error", "Failed to get manage link.");
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

    await handleRenew();
  }

  async function handleUpgrade(planId: string) {
    const selectedPlan = plans?.find((p) => p.id === planId);
    if (!selectedPlan) return;
    const billingPeriod = selectedPlan.billing_period || "monthly";
    const barePlanId = selectedPlan.plan_id || planId;
    const isPaidSelection = !(selectedPlan.is_free || selectedPlan.amount === 0);

    if (isPaidSelection) {
      const confirmed = await confirmSecureCheckout({
        title: "Review plan payment",
        message: `${selectedPlan.name} is ${formatOptionPrice(selectedPlan)}. We'll open Paystack to complete the payment, then return here with a confirmation screen.`,
        confirmLabel: "Pay securely",
      });
      if (!confirmed) return;
    }

    setUpgradingId(planId);
    try {
      if (selectedPlan.is_free || selectedPlan.amount === 0) {
        const { error: err, data } = await postAction("/api/provider/subscription/upgrade", {
          plan_id: barePlanId,
          billing_period: billingPeriod,
        });
        if (err) {
          Alert.alert("Error", err);
          return;
        }
        if ((data as { is_free?: boolean; subscription_id?: string })?.is_free || (data as { subscription_id?: string })?.subscription_id) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Success", "Free plan activated!");
          refresh();
          return;
        }
        Alert.alert("Could not activate plan", "Please try again or contact support.");
        return;
      }

      // Paid plans: match provider web — try Paystack subscription upgrade when authorization exists,
      // otherwise initialize a checkout (first payment or new card).
      const { error: upErr, data: upData } = await postAction("/api/provider/subscription/upgrade", {
        plan_id: barePlanId,
        billing_period: billingPeriod,
      });
      if (upErr) {
        Alert.alert("Error", upErr);
        return;
      }
      const upgraded = upData as {
        is_free?: boolean;
        subscription_id?: string;
        requires_payment?: boolean;
        payment_url?: string;
        authorization_url?: string;
      };
      if (upgraded?.is_free) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Plan updated!");
        refresh();
        return;
      }
      if (upgraded?.subscription_id && !upgraded?.requires_payment) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Subscription updated!");
        refresh();
        return;
      }
      const upUrl = upgraded?.authorization_url ?? upgraded?.payment_url;
      if (upUrl) {
        await openSubscriptionPaystack(upUrl, "Subscription checkout");
        refresh();
        return;
      }

      const { error: err, data } = await postAction("/api/provider/subscription/initialize-payment", {
        plan_id: barePlanId,
        billing_period: billingPeriod,
        in_app: true,
      });
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      const d = data as { authorization_url?: string; payment_url?: string; requires_payment?: boolean; order_id?: string };
      const url = d?.authorization_url ?? d?.payment_url;
      const initOrderId = typeof d?.order_id === "string" ? d.order_id : undefined;
      if (d?.requires_payment && url) {
        await openSubscriptionPaystack(url, "Subscription checkout", { orderId: initOrderId });
        refresh();
        return;
      }
      if (url) {
        await openSubscriptionPaystack(url, "Subscription checkout", { orderId: initOrderId });
      } else {
        Alert.alert("No payment link", "Unable to start checkout. Please try again or contact support.");
      }
      refresh();
    } finally {
      setUpgradingId(null);
    }
  }

  if (loading && subscription === undefined && !error) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading subscription..." />
      </ScreenContainer>
    );
  }

  if (error && !subscription) {
    return (
      <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
        <ScreenHeader title="Subscription" showBack subtitle="Plan & billing" />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const paidSubscriber = subscription && !isFreeTierSubscription(subscription);
  const billingCta = billingActionLabel(subscription);
  const showCancel =
    subscription && subscription.status === "active" && !subscription.cancelled_at && paidSubscriber;
  const statusPill = subscription ? statusPillClasses(subscription) : null;

  return (
    <>
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Subscription" showBack subtitle="Plan & billing" />

      {/* Hero intro */}
      <View style={{ marginBottom: 8, marginTop: 4 }}>
        <Text style={twStyle("text-base leading-6 text-gray-600")}>
          Plans match your region&apos;s public pricing catalog. Use Monthly / Yearly to compare paid tiers without duplicate cards.
        </Text>
        <Text style={twStyle("mt-2 text-xs leading-5 text-gray-500")}>
          Marketing lines on the website (e.g. hero text on /pricing) are edited in Admin → Content, not here.
        </Text>
      </View>

      {/* §Provider-paystack-audit 2026-05: post-payment outcome card. Reads
        from `paymentOutcome` so the same component handles both in-app and
        cold-start returns and shows model-specific copy from the shared helper. */}
      <SubscriptionPaymentOutcomeCard
        outcome={paymentOutcome}
        onDismiss={() => setPaymentOutcome({ phase: "idle" })}
      />

      {paidSubscriber && subscription?.paystack_sync_pending ? (
        <View
          style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}
        >
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>Billing sync needed</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-amber-900")}>
            {subscription.paystack_sync_note?.trim() ||
              "Your subscription was updated outside Paystack or Paystack could not be updated automatically. Complete payment or confirm billing in Paystack if you use card billing."}
          </Text>
        </View>
      ) : null}

      {/* Current plan */}
      <SectionHeader title="Your plan" />
      {!subscription ? (
        <View
          style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-5")}
        >
          <Text style={twStyle("text-base font-medium text-gray-800")}>No subscription on file</Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
            Choose a plan below to unlock paid features. You can start with the free tier anytime.
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
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={twStyle("text-xl font-bold text-gray-900")}>
                {subscription.plan?.name ?? "Plan"}
              </Text>
              {subscription.plan?.description ? (
                <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
                  {stripHtmlToPlainText(subscription.plan.description)}
                </Text>
              ) : null}
              {currentSubscriptionPriceLine(subscription) ? (
                <Text style={twStyle("mt-3 text-2xl font-bold text-gray-900")}>
                  {currentSubscriptionPriceLine(subscription)}
                </Text>
              ) : null}
              {subscription.cancelled_at ? (
                <Text style={twStyle("mt-2 text-sm text-amber-800")}>
                  Cancelling — access until{" "}
                  {subscription.expires_at ? formatDate(subscription.expires_at) : "period end"}
                </Text>
              ) : (
                <>
                  <Text style={twStyle("mt-2 text-sm text-gray-600")}>
                    {subscription.expires_at
                      ? subscription.auto_renew
                        ? `Auto-renews ${formatDate(subscription.expires_at)}`
                        : `Paid until ${formatDate(subscription.expires_at)}`
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
                {statusLabel(subscription)}
              </Text>
            </View>
          </View>

          {currentPlanBullets(subscription).length > 0 ? (
            <View style={twStyle("mt-5 border-t border-pink-100 pt-4")}>
              <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}>
                What&apos;s included
              </Text>
              {currentPlanBullets(subscription).map((line, i) => (
                <View key={`${i}-${line.slice(0, 12)}`} style={twStyle("mb-3 flex-row items-start")}>
                  <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginTop: 0, marginRight: 10 }} />
                  <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {paidSubscriber && subscription.billing_issue ? (
            <View style={twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
              <Text style={twStyle("text-sm font-semibold text-amber-900")}>
                {subscription.billing_issue.type === "payment_failed"
                  ? "Payment was not completed"
                  : subscription.billing_issue.type === "past_due"
                    ? "Payment action needed"
                    : "Billing action needed"}
              </Text>
              <Text style={twStyle("mt-1 text-sm leading-5 text-amber-900")}>
                {subscription.billing_issue.message}
              </Text>
            </View>
          ) : null}

          {paidSubscriber ? (
            <TouchableOpacity
              style={twStyle("mt-4 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/billing" as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={18} color={Colors.gray[700]} style={{ marginRight: 8 }} />
              <Text style={twStyle("text-center text-sm font-semibold text-gray-800")}>
                View invoices & payment methods
              </Text>
            </TouchableOpacity>
          ) : null}

          {showCancel ? (
            <TouchableOpacity
              style={twStyle("mt-4 rounded-2xl border border-red-200 bg-white py-3")}
              onPress={handleCancel}
              activeOpacity={0.85}
            >
              <Text style={twStyle("text-center text-sm font-semibold text-red-600")}>Cancel subscription</Text>
            </TouchableOpacity>
          ) : null}
          {subscription.cancelled_at ? (
            <View style={twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
              <Text style={twStyle("text-center text-sm leading-5 text-amber-900")}>
                You keep access until the date above. No further charges after that.
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
      <SectionHeader title="All plans" />
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
                      {seg === "monthly" ? "Monthly" : "Yearly"}
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
            />
          ))}
        </View>
      ) : plansError ? (
        <ErrorState message="Could not load plans. Pull down to retry." onRetry={refresh} />
      ) : (
        <EmptyState icon="pricetag-outline" title="No plans" description="Subscription plans will appear here." />
      )}

      <View style={twStyle("h-10")} />
    </ScreenContainer>
    {paystackCheckout.modal}
    </>
  );
}

function PlanCard({
  plan,
  subscription,
  upgradingId,
  onUpgrade,
}: {
  plan: Plan;
  subscription: Subscription | null;
  upgradingId: string | null;
  onUpgrade: (id: string) => void;
}) {
  const isCurrent = isActiveCurrentPlan(subscription, plan);
  const needsReactivate =
    isSamePlanOption(subscription, plan) && subscriptionNeedsReactivation(subscription);
  const cta = getPlanCtaLabel(plan, subscription);
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
                <Text style={{ fontSize: 11, fontWeight: "700", color: ACCENT }}>Most popular</Text>
              </View>
            ) : null}
            {isCurrent ? (
              <View style={{ borderRadius: 9999, backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#4b5563" }}>Current</Text>
              </View>
            ) : null}
          </View>
          <Text style={twStyle("mt-2 text-3xl font-bold text-gray-900")}>
            {plan.is_free || plan.amount === 0 ? "Free" : formatOptionPrice(plan)}
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
              <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginRight: 10 }} />
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
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={twStyle("text-base font-bold text-white")}>{loading ? "Please wait…" : cta}</Text>
        </TouchableOpacity>
      ) : isCurrent ? (
        <View style={twStyle("mt-5 rounded-full bg-gray-100 py-3")}>
          <Text style={twStyle("text-center text-sm font-semibold text-gray-600")}>This is your current plan</Text>
        </View>
      ) : needsReactivate ? (
        <Text style={twStyle("mt-3 text-center text-xs text-amber-800")}>
          Subscription is cancelled — tap Reactivate free plan above.
        </Text>
      ) : null}
    </View>
  );
}
