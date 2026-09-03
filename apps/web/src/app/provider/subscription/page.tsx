"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Calendar, Sparkles } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ProviderAppDownloadNudge } from "@/components/provider/ProviderAppDownloadNudge";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const APPLE_BILLED_MESSAGE =
  "This plan is billed through the App Store. Manage, change, or cancel it in Apple ID → Subscriptions to avoid a second charge.";

interface SubscriptionPlan {
  id: string;
  plan_id: string;
  name: string;
  /** Short pitch — same source as public /pricing cards when linked in CMS */
  description?: string | null;
  price?: number;
  /** Present on `/api/provider/subscription/plans` (alias of price for paid options) */
  amount?: number;
  currency: string;
  billing_period: "monthly" | "yearly";
  /** Marketing bullets (from `pricing_plan_features`, same as /pricing) */
  features: string[];
  is_popular?: boolean;
  is_free?: boolean;
}

interface ProviderSubscription {
  id: string;
  plan_id: string;
  status: "active" | "expired" | "cancelled" | "past_due" | "inactive";
  started_at?: string;
  expires_at?: string;
  cancelled_at?: string | null;
  billing_period?: "monthly" | "yearly";
  auto_renew?: boolean;
  plan?: {
    id?: string;
    name?: string;
    description?: string | null;
    features?: unknown;
    feature_bullets?: string[];
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency?: string;
    is_free?: boolean;
  };
  paystack_sync_pending?: boolean | null;
  paystack_sync_note?: string | null;
  latest_order?: {
    id: string;
    plan_id?: string | null;
    billing_period?: "monthly" | "yearly" | string | null;
    status?: "pending" | "paid" | "failed" | string | null;
    failure_reason?: string | null;
  } | null;
  scheduled_plan_id?: string | null;
  scheduled_change_at?: string | null;
  scheduled_plan?: { id: string; name: string | null } | null;
  billing_issue?: {
    type: "past_due" | "sync_pending" | "payment_failed" | "payment_pending" | string;
    message: string;
    action: "pay_now" | "update_payment" | "retry_payment" | "complete_payment" | string;
  } | null;
  billing_provider?: "paystack" | "apple" | "manual" | null;
}

function isPaidSubscriptionState(sub: ProviderSubscription | null): boolean {
  if (!sub?.plan) return false;
  if (sub.plan.is_free === true) return false;
  const monthly = Number(sub.plan.price_monthly ?? 0);
  const yearly = Number(sub.plan.price_yearly ?? 0);
  return monthly > 0 || yearly > 0;
}

function planDisplayPrice(plan: SubscriptionPlan): number {
  const n = plan.price ?? plan.amount ?? 0;
  return Number(n);
}

function formatPlanPriceMain(plan: SubscriptionPlan): string {
  const p = planDisplayPrice(plan);
  if (plan.is_free || p === 0) return "Free";
  if (plan.currency === "ZAR") return `R${p}`;
  return `${plan.currency} ${p}`;
}

function formatPlanPricePeriod(plan: SubscriptionPlan): string {
  if (plan.is_free || planDisplayPrice(plan) === 0) return "";
  return plan.billing_period === "monthly" ? "/month" : "/year";
}

function isInProviderAppWebView(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
}

function isPaidCurrentPlan(plan: SubscriptionPlan | null): boolean {
  return Boolean(plan && !plan.is_free && planDisplayPrice(plan) > 0);
}

function isAppleBilled(sub: ProviderSubscription | null): boolean {
  return isAppleBillingActive(sub?.billing_provider, sub?.status);
}

function openAppleSubscriptions(): void {
  window.open(APPLE_SUBSCRIPTIONS_URL, "_blank", "noopener,noreferrer");
}

function subscriptionNeedsReactivation(sub: ProviderSubscription | null): boolean {
  if (!sub) return false;
  if (sub.cancelled_at) return true;
  return sub.status === "cancelled" || sub.status === "expired" || sub.status === "inactive";
}

function isActiveCurrentPlanSelection(
  sub: ProviderSubscription | null,
  plan: SubscriptionPlan
): boolean {
  const same =
    sub?.plan_id === plan.plan_id &&
    (sub?.billing_period ?? "monthly") === plan.billing_period;
  return Boolean(same && sub && !subscriptionNeedsReactivation(sub));
}

function planUpgradeButtonLabel(
  sub: ProviderSubscription | null,
  plan: SubscriptionPlan
): string {
  const same =
    sub?.plan_id === plan.plan_id &&
    (sub?.billing_period ?? "monthly") === plan.billing_period;
  if (same && subscriptionNeedsReactivation(sub) && (plan.is_free || planDisplayPrice(plan) === 0)) {
    return "Reactivate free plan";
  }
  if (plan.is_free || planDisplayPrice(plan) === 0) return "Activate free plan";
  return "Continue with this plan";
}

function billingActionLabel(
  subscription: ProviderSubscription,
  isPaidPlan: boolean
): string | null {
  if (!isPaidPlan) {
    if (subscriptionNeedsReactivation(subscription)) return "Reactivate free plan";
    return null;
  }
  if (isAppleBillingActive(subscription.billing_provider, subscription.status)) {
    if (subscription.status === "past_due") return "Update payment in App Store";
    if (subscription.cancelled_at || subscription.auto_renew === false) return "Resume in App Store";
    return null;
  }
  if (subscription.status === "past_due") return "Pay now / update card";
  if (subscription.paystack_sync_pending) return "Complete billing";
  if (subscription.billing_issue?.action === "retry_payment") return "Retry payment";
  if (subscription.billing_issue?.action === "complete_payment") return "Complete payment";
  if (subscription.cancelled_at) return "Resume billing";
  if (subscription.status === "expired" || subscription.status === "cancelled")
    return "Reactivate plan";
  if (subscription.status === "active" && subscription.auto_renew === false) return "Extend plan";
  return null;
}

export default function SubscriptionPage() {
  const { provider } = useProviderPortal();
  const router = useRouter();
  const [subscription, setSubscription] = useState<ProviderSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showInAppReturnBanner, setShowInAppReturnBanner] = useState(false);
  const [showCheckoutSuccessNudge, setShowCheckoutSuccessNudge] = useState(false);
  const [checkoutReturnToDashboard, setCheckoutReturnToDashboard] = useState(false);
  const [inAppReturnStatus, setInAppReturnStatus] = useState<
    "success" | "failed" | "pending" | null
  >(null);
  const [billingTab, setBillingTab] = useState<"monthly" | "yearly">("monthly");
  // Pre-payment review dialog (gold-standard checkout): show the plan, price,
  // what-you-get, and a charged-only-after-confirm note before redirecting to
  // Paystack — instead of an immediate, silent redirect.
  const [reviewPlan, setReviewPlan] = useState<SubscriptionPlan | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  // Blocking overlay while we verify with Paystack on return from checkout.
  const [verifying, setVerifying] = useState(false);
  // Loading state for the persistent "Manage billing / update card" action.
  const [managingCard, setManagingCard] = useState(false);

  const visiblePlans = useMemo(() => {
    if (!plans.length) return [];
    const free = plans.filter((p) => p.is_free);
    const paid = plans.filter((p) => !p.is_free && p.billing_period === billingTab);
    return [...free, ...paid];
  }, [plans, billingTab]);

  async function loadData(): Promise<ProviderSubscription | null> {
    try {
      setIsLoading(true);
      setError(null);

      const [subscriptionRes, plansRes] = await Promise.all([
        fetcher.get<{ data: ProviderSubscription | null }>("/api/provider/subscription"),
        /** Same source as the provider app: tenant-aware options + Paystack-backed plan rows */
        fetcher.get<{ data: SubscriptionPlan[] }>("/api/provider/subscription/plans"),
      ]);

      const sub = (subscriptionRes as any)?.data ?? null;
      setSubscription(sub);
      const rawPlans = (plansRes as { data?: SubscriptionPlan[] })?.data ?? [];
      setPlans(Array.isArray(rawPlans) ? rawPlans : []);
      return sub;
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load subscription data";
      setError(errorMessage);
      console.error("Error loading subscription:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isPaymentSuccess = urlParams.get("payment_success") === "true";
    const isPaymentCancelled = urlParams.get("payment_cancelled") === "1";
    const inApp = urlParams.get("in_app") === "1";
    const returnToDashboard = urlParams.get("return_to") === "dashboard";
    const reference = urlParams.get("reference") || urlParams.get("trxref");

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    async function init() {
      if (isPaymentCancelled) {
        // User cancelled on the Paystack hosted page — clean URL and show info toast.
        const cleanSearch = inApp ? "?in_app=1" : "";
        window.history.replaceState({}, "", window.location.pathname + cleanSearch);
        toast.info("Payment was cancelled. No charge was made.");
        await loadData();

        if (inApp && typeof window !== "undefined") {
          const win = window as Window & {
            ReactNativeWebView?: { postMessage: (data: string) => void };
          };
          win.ReactNativeWebView?.postMessage(JSON.stringify({ type: "subscription_cancelled" }));
        }
        return;
      }

      if (isPaymentSuccess && reference) {
        setVerifying(true);
        try {
          const verifyPayload = await verifyWithRetry<{ status?: string; message?: string }>(
            reference,
            { maxAttempts: 5, delayMs: 1500 }
          );
          if (verifyPayload.status === "failed") {
            console.warn(
              "Subscription Paystack verify did not return success:",
              verifyPayload.errorMessage
            );
          }
        } catch {
          // Webhooks still reconcile this path; the banner below reflects the latest order state.
        } finally {
          setVerifying(false);
        }
      }

      const loaded = await loadData();
      if (!isPaymentSuccess) return;

      const latestStatus = loaded?.latest_order?.status;
      const loadedIsPaid = isPaidSubscriptionState(loaded);
      const failed =
        loadedIsPaid &&
        (latestStatus === "failed" || loaded?.billing_issue?.type === "payment_failed");
      const pending =
        loadedIsPaid &&
        (latestStatus === "pending" || loaded?.billing_issue?.type === "payment_pending");
      const status = failed ? "failed" : pending ? "pending" : "success";

      setInAppReturnStatus(status);
      if (inApp) setShowInAppReturnBanner(true);

      if (status === "success") {
        toast.success("Payment successful! Your subscription is being activated...");
        timeouts.push(setTimeout(() => loadData(), 2000));
        if (!inApp) {
          setCheckoutReturnToDashboard(returnToDashboard);
          setShowCheckoutSuccessNudge(true);
        } else if (returnToDashboard) {
          timeouts.push(
            setTimeout(() => {
              router.replace("/provider/dashboard?subscription_success=1");
            }, 1800)
          );
        }
      } else if (status === "failed") {
        toast.error(
          loaded?.billing_issue?.message ??
            "Payment was not completed. Please try another card or add funds."
        );
      } else {
        toast.info(
          "Payment is still pending. We'll update your subscription once the bank confirms it."
        );
      }

      const cleanSearch = inApp ? "?in_app=1" : "";
      window.history.replaceState({}, "", window.location.pathname + cleanSearch);

      if (inApp && typeof window !== "undefined") {
        const win = window as Window & {
          ReactNativeWebView?: { postMessage: (data: string) => void };
        };
        if (win.ReactNativeWebView?.postMessage) {
          // Always relay an outcome to the native shell — including pending —
          // so the in-app WebView can swap to a clear result card instead of
          // stranding the provider on the web banner.
          timeouts.push(
            setTimeout(() => {
              const messageType =
                status === "success"
                  ? "subscription_success"
                  : status === "failed"
                    ? "subscription_failed"
                    : "subscription_pending";
              win.ReactNativeWebView?.postMessage(
                JSON.stringify({
                  type: messageType,
                  status,
                  return_to: status === "success" && returnToDashboard ? "dashboard" : undefined,
                })
              );
            }, 1500)
          );
        }
      }
    }

    init();
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [router]);

  useEffect(() => {
    if (!provider?.id) return;
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;
    const channel = supabaseClient
      .channel(`provider-subscription:${provider.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "provider_subscriptions",
          filter: `provider_id=eq.${provider.id}`,
        },
        () => {
          void loadData();
        },
      )
      .subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [provider?.id]);

  // Paid plans open the review dialog first; free plans activate immediately.
  const handleUpgrade = async (planId: string) => {
    if (isAppleBilled(subscription)) {
      toast.error(APPLE_BILLED_MESSAGE);
      return;
    }
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      toast.error("Plan not found");
      return;
    }
    if (plan.is_free || planDisplayPrice(plan) === 0) {
      await proceedUpgrade(planId);
      return;
    }
    setReviewSubmitting(false);
    setReviewPlan(plan);
  };

  const proceedUpgrade = async (planId: string) => {
    if (isAppleBilled(subscription)) {
      toast.error(APPLE_BILLED_MESSAGE);
      setReviewPlan(null);
      setReviewSubmitting(false);
      return;
    }
    try {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) throw new Error("Plan not found");

      // Try to upgrade directly (may work if authorization exists)
      const res = await fetcher.post<{
        data: {
          payment_url?: string | null;
          requires_payment?: boolean;
          is_free?: boolean;
          subscription_id?: string;
          scheduled?: boolean;
          changes_on?: string;
        };
      }>("/api/provider/subscription/upgrade", {
        plan_id: plan.plan_id,
        billing_period: plan.billing_period,
      });

      const data = (res as any).data;

      if (data.scheduled) {
        const when = data.changes_on ? new Date(data.changes_on).toLocaleDateString() : "period end";
        toast.success(`Plan change scheduled. Changes on ${when}.`);
        setShowUpgradeDialog(false);
        setReviewPlan(null);
        setReviewSubmitting(false);
        loadData();
        return;
      }

      // Free tier - subscription created directly
      if (data.is_free) {
        toast.success("Free subscription activated!");
        setShowUpgradeDialog(false);
        setReviewPlan(null);
        setReviewSubmitting(false);
        loadData();
        return;
      }

      // If subscription created successfully
      if (data.subscription_id && !data.requires_payment) {
        toast.success("Subscription activated successfully!");
        setShowUpgradeDialog(false);
        setReviewPlan(null);
        setReviewSubmitting(false);
        loadData();
        return;
      }

      // If payment authorization is required
      if (data.requires_payment || data.payment_url) {
        // Initialize payment to get authorization
        const paymentRes = await fetcher.post<{
          data: {
            payment_url: string | null;
            authorization_url?: string | null;
            order_id: string;
          };
        }>("/api/provider/subscription/initialize-payment", {
          plan_id: plan.plan_id,
          billing_period: plan.billing_period,
          ...(isInProviderAppWebView() ? { in_app: true } : {}),
        });

        const pay = (
          paymentRes as {
            data?: { payment_url?: string | null; authorization_url?: string | null };
          }
        ).data;
        const paymentUrl = pay?.authorization_url ?? pay?.payment_url;
        if (paymentUrl) {
          window.location.href = paymentUrl;
          return;
        }
      }

      // Fallback to direct payment URL if available
      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      toast.error("Could not start subscription checkout. Please try again or contact support.");
      setReviewPlan(null);
      setReviewSubmitting(false);
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : "Failed to upgrade subscription";
      toast.error(msg);
      console.error("Error upgrading subscription:", error);
      setReviewPlan(null);
      setReviewSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (isAppleBilled(subscription)) {
      toast.message(APPLE_BILLED_MESSAGE);
      openAppleSubscriptions();
      return;
    }
    if (
      !confirm(
        "Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period."
      )
    ) {
      return;
    }

    try {
      await fetcher.post("/api/provider/subscription/cancel");
      toast.success(
        "Subscription cancelled. You'll retain access until the end of your billing period."
      );
      await loadData();
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : "Failed to cancel subscription";
      toast.error(msg);
      console.error("Error cancelling subscription:", error);
    }
  };

  const handleRenew = async () => {
    if (isAppleBilled(subscription)) {
      toast.message(APPLE_BILLED_MESSAGE);
      openAppleSubscriptions();
      return;
    }
    try {
      const res = await fetcher.post<{
        data: { payment_url?: string | null; is_free?: boolean; message?: string };
      }>("/api/provider/subscription/renew", isInProviderAppWebView() ? { in_app: true } : {});
      const d = (
        res as { data?: { payment_url?: string | null; is_free?: boolean; message?: string } }
      ).data;
      if (d?.is_free) {
        toast.success(d.message ?? "Plan renewed.");
        await loadData();
        return;
      }
      const url = d?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("No payment link received. Please try again or contact support.");
    } catch (error) {
      toast.error("Failed to renew subscription");
      console.error("Error renewing subscription:", error);
    }
  };

  const handleBillingAction = async () => {
    if (isAppleBilled(subscription)) {
      openAppleSubscriptions();
      return;
    }
    if (subscription && subscriptionNeedsReactivation(subscription) && !isPaidPlan) {
      const freePlan = plans.find((p) => p.is_free || planDisplayPrice(p) === 0);
      if (freePlan) {
        await handleUpgrade(freePlan.id);
        return;
      }
    }

    if (
      subscription?.billing_issue?.action === "update_payment" ||
      subscription?.status === "past_due"
    ) {
      try {
        const res = await fetcher.get<{ data: { link: string } }>(
          "/api/provider/subscription/manage-link"
        );
        if (res.data?.link) {
          window.location.href = res.data.link;
          return;
        }
      } catch (err) {
        toast.error(
          "Could not generate card update link. You can also try completing payment below."
        );
      }
    }

    const latest = subscription?.latest_order;
    const retryPlan = latest?.plan_id
      ? plans.find(
          (p) =>
            p.plan_id === latest.plan_id &&
            (!latest.billing_period || p.billing_period === latest.billing_period)
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
  };

  /**
   * Persistent "Manage billing / update card" action for healthy paid
   * subscribers — reuses the same Paystack-hosted manage link as the
   * reactive past_due/billing_issue flow above, but is always available so a
   * provider can proactively swap cards without first hitting a payment
   * failure.
   */
  const handleManageCard = async () => {
    if (isAppleBilled(subscription)) {
      toast.message(APPLE_BILLED_MESSAGE);
      openAppleSubscriptions();
      return;
    }
    setManagingCard(true);
    try {
      const res = await fetcher.get<{ data: { link: string } }>(
        "/api/provider/subscription/manage-link"
      );
      if (res.data?.link) {
        window.location.href = res.data.link;
        return;
      }
      toast.error("Could not generate a card update link. Please try again.");
    } catch (err) {
      toast.error("Could not generate a card update link. Please try again.");
    } finally {
      setManagingCard(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout>
        <LoadingTimeout loadingMessage="Loading subscription..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !subscription) {
    return (
      <SettingsDetailLayout>
        <EmptyState
          title="Failed to load subscription"
          description={error}
          action={{
            label: "Retry",
            onClick: loadData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  // The joined plan from the subscription API uses price_monthly/price_yearly; normalise to SubscriptionPlan shape
  const rawPlan = subscription?.plan;
  const isFree =
    rawPlan?.is_free || (rawPlan?.price_monthly == null && rawPlan?.price_yearly == null);
  const bullets =
    rawPlan?.feature_bullets &&
    Array.isArray(rawPlan.feature_bullets) &&
    rawPlan.feature_bullets.length > 0
      ? rawPlan.feature_bullets
      : [];
  const currentPlanFromSubscription: SubscriptionPlan | null = rawPlan
    ? {
        id: rawPlan.id ?? "",
        plan_id: rawPlan.id ?? subscription?.plan_id ?? "",
        name: rawPlan.name ?? "",
        description: rawPlan.description ?? null,
        price:
          subscription?.billing_period === "yearly" && rawPlan.price_yearly != null
            ? Number(rawPlan.price_yearly)
            : Number(rawPlan.price_monthly ?? rawPlan.price_yearly ?? 0),
        currency: rawPlan.currency ?? "ZAR",
        billing_period: subscription?.billing_period ?? "monthly",
        features: bullets,
        is_free: Boolean(isFree),
      }
    : null;
  const currentPlan =
    currentPlanFromSubscription ||
    plans.find((p) => p.plan_id === subscription?.plan_id || p.id === subscription?.plan_id) ||
    null;
  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const isPaidPlan = Boolean(subscription && isPaidCurrentPlan(currentPlan));
  const billingLabel = subscription ? billingActionLabel(subscription, isPaidPlan) : null;
  const visibleBillingIssue = isPaidPlan ? subscription?.billing_issue : null;
  const showCancel = Boolean(
    subscription && subscription.status === "active" && !subscription.cancelled_at && isPaidPlan
  );

  return (
    <SettingsDetailLayout>
      <div className="mx-auto max-w-5xl">
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-pink-100/80 bg-gradient-to-br from-pink-50/90 via-white to-violet-50/70 px-5 py-8 md:px-8 md:py-10">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-pink-200/60 bg-white/80 px-3 py-1 text-xs font-medium text-pink-800">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Platform billing
              </div>
              <PageHeader
                title="Subscription"
                subtitle="Published plans for your region — same catalog as public pricing."
              />
            </div>
          </div>
        </div>

        {showCheckoutSuccessNudge && (
          <ProviderAppDownloadNudge
            successHeadline="Payment complete!"
            subtitle="Your subscription is active. Download the provider app to manage bookings on the go."
            showContinue
            continueLabel={checkoutReturnToDashboard ? "Go to dashboard" : "View subscription"}
            onContinue={() => {
              setShowCheckoutSuccessNudge(false);
              if (checkoutReturnToDashboard) {
                router.replace("/provider/dashboard");
              }
            }}
            className="mb-6"
          />
        )}

        {showInAppReturnBanner && (
          <div
            className={`mb-4 rounded-lg border p-4 text-center text-sm ${
              inAppReturnStatus === "failed"
                ? "border-red-200 bg-red-50 text-red-800"
                : inAppReturnStatus === "pending"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            <p className="font-medium">
              {inAppReturnStatus === "failed"
                ? "Payment not completed."
                : inAppReturnStatus === "pending"
                  ? "Payment pending."
                  : "Payment complete."}
            </p>
            <p className="mt-1">
              {inAppReturnStatus === "failed"
                ? "Return to the app and try another card or add funds before retrying."
                : inAppReturnStatus === "pending"
                  ? "Return to the app and refresh this screen in a moment."
                  : "Tap the button below to return to the app."}
            </p>
            <a
              href="provider://subscription/success"
              className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Return to app
            </a>
          </div>
        )}

        {subscription ? (
          <div className="space-y-8">
            <div className="rounded-2xl bg-gradient-to-br from-pink-500/[0.07] via-transparent to-violet-500/[0.06] p-[1px] shadow-sm">
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                        Your subscription
                        {subscription.status === "active" && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        )}
                        {subscription.status === "expired" && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                            Expired
                          </Badge>
                        )}
                        {subscription.status === "cancelled" && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            Cancelled
                          </Badge>
                        )}
                        {subscription.status === "active" && subscription.cancelled_at && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            Cancelling at period end
                          </Badge>
                        )}
                        {subscription.status === "past_due" && (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            Past Due
                          </Badge>
                        )}
                        {subscription.scheduled_plan_id && subscription.scheduled_change_at ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            Changes on {new Date(subscription.scheduled_change_at).toLocaleDateString()}
                            {subscription.scheduled_plan?.name
                              ? ` → ${subscription.scheduled_plan.name}`
                              : ""}
                          </Badge>
                        ) : null}
                        {isAppleBilled(subscription) ? (
                          <Badge variant="secondary" className="bg-violet-100 text-violet-800">
                            App Store
                          </Badge>
                        ) : null}
                      </CardTitle>
                      <div className="text-base text-gray-600 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                        {currentPlan?.description ? (
                          <PricingFeatureHtml
                            html={currentPlan.description}
                            className="block leading-relaxed"
                          />
                        ) : (
                          <span>{currentPlan?.name || "No plan selected"}</span>
                        )}
                      </div>
                      {isPaidPlan &&
                      subscription.status === "active" &&
                      !subscription.cancelled_at ? (
                        <p className="mt-2 text-sm text-gray-600">
                          {subscription.auto_renew
                            ? `Auto-renews${expiresAt ? ` on ${expiresAt.toLocaleDateString()}` : ""}.`
                            : `Paid until${expiresAt ? ` ${expiresAt.toLocaleDateString()}` : " the end of the period"}. Manual extension is available when you need it.`}
                        </p>
                      ) : null}
                      {currentPlan?.is_free ? (
                        <p className="mt-3 text-sm leading-relaxed text-amber-900/90">
                          You are on the free tier. Premium tools (recurring appointments,
                          automations, calendar sync, etc.) follow the feature switches on each
                          subscription plan in admin — upgrade below when a paid plan includes the
                          capability you need.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscription.status === "active" && expiresAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Expires on: {expiresAt.toLocaleDateString()}</span>
                    </div>
                  )}

                  {visibleBillingIssue ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <p className="font-semibold">
                        {visibleBillingIssue.type === "payment_failed"
                          ? "Payment was not completed"
                          : visibleBillingIssue.type === "past_due"
                            ? "Payment action needed"
                            : "Billing action needed"}
                      </p>
                      <p className="mt-1 leading-relaxed">{visibleBillingIssue.message}</p>
                    </div>
                  ) : null}

                  {isAppleBilled(subscription) ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                      <p className="font-semibold">Billed through the App Store</p>
                      <p className="mt-1 leading-relaxed">
                        Apple is the seller of record for this plan. Change, cancel, or update
                        payment in Apple ID → Subscriptions. Web and Android checkout stay closed
                        until this Apple subscription ends, so you are not charged twice.
                      </p>
                      <a
                        href={APPLE_SUBSCRIPTIONS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block font-medium text-violet-800 underline"
                      >
                        Manage in App Store
                      </a>
                    </div>
                  ) : null}

                  {currentPlan && (
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900">
                          {formatPlanPriceMain(currentPlan)}
                        </span>
                        {formatPlanPricePeriod(currentPlan) ? (
                          <span className="text-lg text-gray-600">
                            {formatPlanPricePeriod(currentPlan)}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900">What&apos;s included</p>
                        <ul className="space-y-3">
                          {(Array.isArray(currentPlan.features) ? currentPlan.features : []).map(
                            (feature, index) => (
                              <li
                                key={index}
                                className="flex items-start gap-3 text-sm text-gray-700"
                              >
                                <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                                <div className="min-w-0 flex-1 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                                  <PricingFeatureHtml html={feature} className="block" />
                                </div>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {subscription.status !== "active" && !billingLabel && (
                      <Button onClick={() => setShowUpgradeDialog(true)}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Choose Plan
                      </Button>
                    )}
                    {billingLabel ? (
                      <Button
                        onClick={handleBillingAction}
                        variant={subscription.status === "past_due" ? "default" : "outline"}
                      >
                        {billingLabel}
                      </Button>
                    ) : null}
                    {isPaidPlan && !billingLabel && !isAppleBilled(subscription) ? (
                      <Button
                        onClick={handleManageCard}
                        variant="outline"
                        disabled={managingCard}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {managingCard ? "Opening…" : "Manage billing / update card"}
                      </Button>
                    ) : null}
                    {showCancel ? (
                      <Button onClick={handleCancel} variant="outline" className="text-red-600">
                        {isAppleBilled(subscription)
                          ? "Cancel in App Store"
                          : "Cancel Subscription"}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-gray-900">
                    Change plan
                  </h3>
                  <p className="mt-1 max-w-xl text-sm text-gray-500">
                    {isAppleBilled(subscription)
                      ? "This plan is billed through the App Store. Plan changes and cancellation happen in Apple ID → Subscriptions, not here."
                      : "Only plans linked to an active public pricing card for your region are shown — same as your marketing site."}
                  </p>
                </div>
              </div>

              {plans.some((p) => !p.is_free) ? (
                <Tabs
                  value={billingTab}
                  onValueChange={(v) => setBillingTab(v as "monthly" | "yearly")}
                  className="w-full"
                >
                  <TabsList className="mb-6 grid h-11 w-full max-w-md grid-cols-2 rounded-full bg-gray-100/90 p-1">
                    <TabsTrigger
                      value="monthly"
                      className="rounded-full data-[state=active]:shadow-sm"
                    >
                      Monthly
                    </TabsTrigger>
                    <TabsTrigger
                      value="yearly"
                      className="rounded-full data-[state=active]:shadow-sm"
                    >
                      Yearly
                    </TabsTrigger>
                  </TabsList>
                  {visiblePlans.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                      {visiblePlans.map((plan) => {
                        const isCurrent = isActiveCurrentPlanSelection(subscription, plan);
                        const needsReactivate =
                          subscription?.plan_id === plan.plan_id &&
                          (subscription?.billing_period ?? "monthly") === plan.billing_period &&
                          subscriptionNeedsReactivation(subscription);
                        return (
                          <div
                            key={plan.id}
                            className={`relative flex flex-col rounded-2xl border bg-white/95 p-6 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md ${
                              plan.is_popular
                                ? "border-primary/40 ring-1 ring-primary/20"
                                : "border-gray-200/90"
                            } ${isCurrent ? "ring-2 ring-gray-400 ring-offset-2" : ""}`}
                          >
                            {plan.is_popular ? (
                              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white shadow">
                                Popular
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <Badge className="absolute -top-3 right-6 border-0 bg-gray-900 text-white hover:bg-gray-900">
                                Current
                              </Badge>
                            ) : null}
                            <div className="mb-5 mt-1">
                              <h4 className="text-lg font-bold tracking-tight text-gray-900">
                                {plan.name}
                              </h4>
                              {plan.description ? (
                                <div className="mt-2 text-sm leading-relaxed text-gray-600 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                                  <PricingFeatureHtml html={plan.description} className="block" />
                                </div>
                              ) : null}
                              <div className="mt-4 flex flex-wrap items-baseline gap-1">
                                <span className="text-3xl font-bold tabular-nums text-gray-900">
                                  {formatPlanPriceMain(plan)}
                                </span>
                                {formatPlanPricePeriod(plan) ? (
                                  <span className="text-sm font-medium text-gray-500">
                                    {formatPlanPricePeriod(plan)}
                                  </span>
                                ) : null}
                                {plan.currency && !plan.is_free ? (
                                  <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    {plan.currency}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <ul className="mb-6 flex-1 space-y-3 border-t border-gray-100 pt-4">
                              {(Array.isArray(plan.features) ? plan.features : [])
                                .slice(0, 8)
                                .map((feature, index) => (
                                  <li key={index} className="flex items-start gap-2.5 text-sm">
                                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                    <div className="min-w-0 flex-1 text-gray-700 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                                      <PricingFeatureHtml
                                        html={feature}
                                        className="block leading-snug"
                                      />
                                    </div>
                                  </li>
                                ))}
                              {(plan.features?.length ?? 0) > 8 ? (
                                <li className="pl-6 text-xs text-gray-400">+ more included</li>
                              ) : null}
                            </ul>
                            {!isCurrent || needsReactivate ? (
                              <Button
                                className={`mt-auto w-full rounded-xl py-5 text-base font-semibold ${
                                  plan.is_popular
                                    ? "bg-primary text-white hover:bg-primary-hover"
                                    : "bg-gray-900 text-white hover:bg-gray-800"
                                }`}
                                onClick={() => handleUpgrade(plan.id)}
                              >
                                {planUpgradeButtonLabel(subscription, plan)}
                              </Button>
                            ) : (
                              <div className="mt-auto rounded-xl bg-gray-50 py-3 text-center text-sm font-medium text-gray-500">
                                Your active selection
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
                      No {billingTab} options are published for your region. Try the other billing
                      period or ask an admin to enable pricing for this market.
                    </div>
                  )}
                </Tabs>
              ) : plans.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {visiblePlans.map((plan) => {
                    const isCurrent = isActiveCurrentPlanSelection(subscription, plan);
                    const needsReactivate =
                      subscription?.plan_id === plan.plan_id &&
                      (subscription?.billing_period ?? "monthly") === plan.billing_period &&
                      subscriptionNeedsReactivation(subscription);
                    return (
                      <div
                        key={plan.id}
                        className={`relative rounded-2xl border bg-white p-6 shadow-sm ${
                          isCurrent ? "ring-2 ring-gray-400 ring-offset-2" : "border-gray-200"
                        }`}
                      >
                        {isCurrent ? (
                          <Badge className="absolute right-4 top-4 border-0 bg-gray-900 text-white">
                            Current
                          </Badge>
                        ) : null}
                        <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                        <p className="mt-3 text-3xl font-bold">{formatPlanPriceMain(plan)}</p>
                        {!isCurrent || needsReactivate ? (
                          <Button
                            className="mt-6 w-full rounded-xl bg-primary py-5 text-white hover:bg-primary-hover"
                            onClick={() => handleUpgrade(plan.id)}
                          >
                            {planUpgradeButtonLabel(subscription, plan)}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-6 text-sm text-amber-950">
                  No purchasable plans are published for this workspace. In admin, open Finance →
                  Plans, enable <strong>Show on public pricing page</strong> for the tiers you want
                  providers to see, then refresh this page.
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No subscription yet"
            description="Choose a subscription plan to activate billing"
            action={{
              label: "Choose Plan",
              onClick: () => setShowUpgradeDialog(true),
            }}
          />
        )}

        <UpgradeDialog
          open={showUpgradeDialog}
          onClose={() => setShowUpgradeDialog(false)}
          plans={plans}
          onUpgrade={handleUpgrade}
        />

        <SubscriptionReviewDialog
          plan={reviewPlan}
          submitting={reviewSubmitting}
          onConfirm={() => {
            if (!reviewPlan) return;
            setReviewSubmitting(true);
            void proceedUpgrade(reviewPlan.id);
          }}
          onClose={() => {
            if (reviewSubmitting) return;
            setReviewPlan(null);
          }}
        />
      </div>

      {verifying ? (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/55 px-8 text-center">
          <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <p className="text-lg font-bold text-white">Confirming your payment…</p>
          <p className="mt-2 max-w-sm text-sm text-white/80">
            Don&apos;t close this tab — we&apos;re confirming with the payment provider and
            activating your plan.
          </p>
        </div>
      ) : null}
    </SettingsDetailLayout>
  );
}

function SubscriptionReviewDialog({
  plan,
  submitting,
  onConfirm,
  onClose,
}: {
  plan: SubscriptionPlan | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const priceLine = plan
    ? `${formatPlanPriceMain(plan)}${formatPlanPricePeriod(plan)}`
    : "";
  return (
    <Dialog
      open={plan != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review your plan</DialogTitle>
          <DialogDescription>
            Confirm the details below before paying securely.
          </DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pink-700">
                {plan.billing_period === "yearly" ? "Yearly plan" : "Monthly plan"}
              </p>
              <p className="mt-1 text-xl font-bold text-gray-950">{plan.name}</p>
              {plan.description ? (
                <div className="mt-1 text-sm leading-relaxed text-gray-600 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                  <PricingFeatureHtml html={plan.description} className="block" />
                </div>
              ) : null}
            </div>

            {Array.isArray(plan.features) && plan.features.length > 0 ? (
              <ul className="space-y-2">
                {plan.features.slice(0, 6).map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                      <PricingFeatureHtml html={feature} className="block leading-snug" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{plan.name}</span>
                <span className="text-sm font-medium text-gray-800">{priceLine}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-sm font-semibold text-gray-900">Total due now</span>
                <span className="text-base font-bold text-gray-950">{priceLine}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
              <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>
                This plan renews automatically each billing period. You can{" "}
                <span className="font-semibold text-gray-700">cancel anytime</span> and keep access
                until the end of the period you paid for.
              </span>
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
              <span>
                You&apos;re only charged after you confirm on the secure Paystack page. Your plan
                activates once payment is verified — never before.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Not now
              </Button>
              <Button onClick={onConfirm} disabled={submitting}>
                <CreditCard className="mr-2 h-4 w-4" />
                {submitting ? "Opening secure checkout…" : `Pay ${priceLine}`}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UpgradeDialog({
  open,
  onClose,
  plans,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  onUpgrade: (planId: string) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade Your Subscription</DialogTitle>
          <DialogDescription>
            Choose a plan to keep using Beautonomi's paid features.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedPlan === plan.id
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{plan.name}</h4>
                  <p className="text-sm text-gray-600">
                    {(plan as any).is_free || plan.price === 0
                      ? "Free"
                      : `${plan.currency} ${plan.price}/${plan.billing_period === "monthly" ? "month" : "year"}`}
                  </p>
                </div>
                <input
                  type="radio"
                  checked={selectedPlan === plan.id}
                  onChange={() => setSelectedPlan(plan.id)}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  onUpgrade(selectedPlan);
                }
              }}
              disabled={!selectedPlan}
            >
              Upgrade
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
