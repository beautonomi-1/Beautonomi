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
import { useTranslation } from "@beautonomi/i18n";
import { formatCurrency } from "@/lib/utils";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

type SubLabels = (key: string, opts?: Record<string, unknown>) => string;

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

function formatPlanPriceMain(plan: SubscriptionPlan, tx: SubLabels): string {
  const p = planDisplayPrice(plan);
  if (plan.is_free || p === 0) return tx("free");
  return formatCurrency(p, plan.currency || "ZAR");
}

function formatPlanPricePeriod(plan: SubscriptionPlan, tx: SubLabels): string {
  if (plan.is_free || planDisplayPrice(plan) === 0) return "";
  return plan.billing_period === "monthly" ? tx("perMonth") : tx("perYear");
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
  plan: SubscriptionPlan,
  tx: SubLabels,
): string {
  const same =
    sub?.plan_id === plan.plan_id &&
    (sub?.billing_period ?? "monthly") === plan.billing_period;
  if (same && subscriptionNeedsReactivation(sub) && (plan.is_free || planDisplayPrice(plan) === 0)) {
    return tx("reactivateFreePlan");
  }
  if (plan.is_free || planDisplayPrice(plan) === 0) return tx("activateFreePlan");
  return tx("continueWithPlan");
}

function billingActionLabel(
  subscription: ProviderSubscription,
  isPaidPlan: boolean,
  tx: SubLabels,
): string | null {
  if (!isPaidPlan) {
    if (subscriptionNeedsReactivation(subscription)) return tx("reactivateFreePlan");
    return null;
  }
  if (isAppleBillingActive(subscription.billing_provider, subscription.status)) {
    if (subscription.status === "past_due") return tx("updatePaymentAppStore");
    if (subscription.cancelled_at || subscription.auto_renew === false) return tx("resumeInAppStore");
    return null;
  }
  if (subscription.status === "past_due") return tx("payNowUpdateCard");
  if (subscription.paystack_sync_pending) return tx("completeBilling");
  if (subscription.billing_issue?.action === "retry_payment") return tx("retryPayment");
  if (subscription.billing_issue?.action === "complete_payment") return tx("completePayment");
  if (subscription.cancelled_at) return tx("resumeBilling");
  if (subscription.status === "expired" || subscription.status === "cancelled")
    return tx("reactivatePlan");
  if (subscription.status === "active" && subscription.auto_renew === false) return tx("extendPlan");
  return null;
}

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const tx = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.subscription.${key}`, opts) as string;
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

      const loadedSubscription = (subscriptionRes as any)?.data ?? null;
      setSubscription(loadedSubscription);
      const rawPlans = (plansRes as { data?: SubscriptionPlan[] })?.data ?? [];
      setPlans(Array.isArray(rawPlans) ? rawPlans : []);
      return loadedSubscription;
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? tx("loadTimeout")
          : err instanceof FetchError
            ? err.message
            : tx("loadFailed");
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
        toast.info(tx("paymentCancelled"));
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
        toast.success(tx("paymentSuccess"));
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
        toast.error(loaded?.billing_issue?.message ?? tx("paymentFailedDefault"));
      } else {
        toast.info(tx("paymentPending"));
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
      toast.error(tx("appleBilledMessage"));
      return;
    }
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      toast.error(tx("planNotFound"));
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
      toast.error(tx("appleBilledMessage"));
      setReviewPlan(null);
      setReviewSubmitting(false);
      return;
    }
    try {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) throw new Error(tx("planNotFound"));

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
        const when = data.changes_on
          ? new Date(data.changes_on).toLocaleDateString()
          : tx("periodEnd");
        toast.success(tx("planChangeScheduled", { when }));
        setShowUpgradeDialog(false);
        setReviewPlan(null);
        setReviewSubmitting(false);
        loadData();
        return;
      }

      // Free tier - subscription created directly
      if (data.is_free) {
        toast.success(tx("freeActivated"));
        setShowUpgradeDialog(false);
        setReviewPlan(null);
        setReviewSubmitting(false);
        loadData();
        return;
      }

      // If subscription created successfully
      if (data.subscription_id && !data.requires_payment) {
        toast.success(tx("subscriptionActivated"));
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

      toast.error(tx("checkoutFailed"));
      setReviewPlan(null);
      setReviewSubmitting(false);
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : tx("upgradeFailed");
      toast.error(msg);
      console.error("Error upgrading subscription:", error);
      setReviewPlan(null);
      setReviewSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (isAppleBilled(subscription)) {
      toast.message(tx("appleBilledMessage"));
      openAppleSubscriptions();
      return;
    }
    if (
      !confirm(tx("cancelConfirm"))
    ) {
      return;
    }

    try {
      await fetcher.post("/api/provider/subscription/cancel");
      toast.success(tx("cancelSuccess"));
      await loadData();
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : tx("cancelFailed");
      toast.error(msg);
      console.error("Error cancelling subscription:", error);
    }
  };

  const handleRenew = async () => {
    if (isAppleBilled(subscription)) {
      toast.message(tx("appleBilledMessage"));
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
        toast.success(d.message ?? tx("planRenewed"));
        await loadData();
        return;
      }
      const url = d?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error(tx("noPaymentLink"));
    } catch (error) {
      toast.error(tx("renewFailed"));
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
        toast.error(tx("cardUpdateLinkFailed"));
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
      toast.message(tx("appleBilledMessage"));
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
      toast.error(tx("cardUpdateFailed"));
    } catch (err) {
      toast.error(tx("cardUpdateFailed"));
    } finally {
      setManagingCard(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout>
        <LoadingTimeout loadingMessage={tx("loading")} />
      </SettingsDetailLayout>
    );
  }

  if (error && !subscription) {
    return (
      <SettingsDetailLayout>
        <EmptyState
          title={tx("loadErrorTitle")}
          description={error}
          action={{
            label: tx("retry"),
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
  const billingLabel = subscription ? billingActionLabel(subscription, isPaidPlan, tx) : null;
  const visibleBillingIssue = subscription?.billing_issue ?? null;
  const appleLocked = isAppleBilled(subscription);
  const showCancel = Boolean(
    subscription &&
      subscription.status === "active" &&
      !subscription.cancelled_at &&
      isPaidPlan &&
      !appleLocked
  );

  return (
    <SettingsDetailLayout>
      <div className="mx-auto max-w-5xl">
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-pink-100/80 bg-gradient-to-br from-pink-50/90 via-white to-violet-50/70 px-5 py-8 md:px-8 md:py-10">
          <div
            className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-pink-200/60 bg-white/80 px-3 py-1 text-xs font-medium text-pink-800">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {tx("platformBilling")}
              </div>
              <PageHeader
                title={tx("pageTitle")}
                subtitle={tx("pageSubtitle")}
              />
            </div>
          </div>
        </div>

        {showCheckoutSuccessNudge && (
          <ProviderAppDownloadNudge
            successHeadline={tx("paymentCompleteHeadline")}
            subtitle={tx("paymentCompleteSubtitle")}
            showContinue
            continueLabel={
              checkoutReturnToDashboard ? tx("goToDashboard") : tx("viewSubscription")
            }
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
                ? tx("returnBannerFailedTitle")
                : inAppReturnStatus === "pending"
                  ? tx("returnBannerPendingTitle")
                  : tx("returnBannerSuccessTitle")}
            </p>
            <p className="mt-1">
              {inAppReturnStatus === "failed"
                ? tx("returnBannerFailedBody")
                : inAppReturnStatus === "pending"
                  ? tx("returnBannerPendingBody")
                  : tx("returnBannerSuccessBody")}
            </p>
            <a
              href="provider://subscription/success"
              className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              {tx("returnToApp")}
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
                        {tx("yourSubscription")}
                        {subscription.status === "active" && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            {tx("statusActive")}
                          </Badge>
                        )}
                        {subscription.status === "expired" && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                            {tx("statusExpired")}
                          </Badge>
                        )}
                        {subscription.status === "cancelled" && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            {tx("statusCancelled")}
                          </Badge>
                        )}
                        {subscription.status === "active" && subscription.cancelled_at && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            {tx("statusCancellingAtEnd")}
                          </Badge>
                        )}
                        {subscription.status === "past_due" && (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            {tx("statusPastDue")}
                          </Badge>
                        )}
                        {subscription.scheduled_plan_id && subscription.scheduled_change_at ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {tx("changesOn", {
                              date: new Date(subscription.scheduled_change_at).toLocaleDateString(),
                              plan: subscription.scheduled_plan?.name
                                ? tx("changesOnPlanSuffix", {
                                    name: subscription.scheduled_plan.name,
                                  })
                                : "",
                            })}
                          </Badge>
                        ) : null}
                        {isAppleBilled(subscription) ? (
                          <Badge variant="secondary" className="bg-violet-100 text-violet-800">
                            {tx("appStoreBadge")}
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
                          <span>{currentPlan?.name || tx("noPlanSelected")}</span>
                        )}
                      </div>
                      {isPaidPlan &&
                      subscription.status === "active" &&
                      !subscription.cancelled_at ? (
                        <p className="mt-2 text-sm text-gray-600">
                          {subscription.auto_renew
                            ? tx("autoRenews", {
                                date: expiresAt
                                  ? tx("autoRenewsOn", {
                                      date: expiresAt.toLocaleDateString(),
                                    })
                                  : "",
                              })
                            : tx("paidUntil", {
                                date: expiresAt
                                  ? ` ${expiresAt.toLocaleDateString()}`
                                  : tx("paidUntilEnd"),
                              }) + tx("manualExtensionNote")}
                        </p>
                      ) : null}
                      {currentPlan?.is_free ? (
                        <p className="mt-3 text-sm leading-relaxed text-amber-900/90">
                          {tx("freeTierNote")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscription.status === "active" && expiresAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{tx("expiresOn", { date: expiresAt.toLocaleDateString() })}</span>
                    </div>
                  )}

                  {visibleBillingIssue ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <p className="font-semibold">
                        {visibleBillingIssue.type === "payment_failed"
                          ? tx("billingIssuePaymentFailed")
                          : visibleBillingIssue.type === "past_due"
                            ? tx("billingIssuePastDue")
                            : tx("billingIssueDefault")}
                      </p>
                      <p className="mt-1 leading-relaxed">{visibleBillingIssue.message}</p>
                    </div>
                  ) : null}

                  {isAppleBilled(subscription) ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                      <p className="font-semibold">{tx("appleBillingTitle")}</p>
                      <p className="mt-1 leading-relaxed">{tx("appleBillingBody")}</p>
                      <a
                        href={APPLE_SUBSCRIPTIONS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block font-medium text-violet-800 underline"
                      >
                        {tx("manageInAppStore")}
                      </a>
                    </div>
                  ) : null}

                  {currentPlan && (
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900">
                          {formatPlanPriceMain(currentPlan, tx)}
                        </span>
                        {formatPlanPricePeriod(currentPlan, tx) ? (
                          <span className="text-lg text-gray-600">
                            {formatPlanPricePeriod(currentPlan, tx)}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900">{tx("whatsIncluded")}</p>
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
                        <CreditCard className="me-2 h-4 w-4" />
                        {tx("choosePlan")}
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
                        <CreditCard className="me-2 h-4 w-4" />
                        {managingCard ? tx("opening") : tx("manageBilling")}
                      </Button>
                    ) : null}
                    {showCancel ? (
                      <Button onClick={handleCancel} variant="outline" className="text-red-600">
                        {isAppleBilled(subscription)
                          ? tx("cancelInAppStore")
                          : tx("cancelSubscription")}
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
                    {tx("changePlan")}
                  </h3>
                  <p className="mt-1 max-w-xl text-sm text-gray-500">
                    {isAppleBilled(subscription)
                      ? tx("changePlanAppleNote")
                      : tx("changePlanWebNote")}
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
                      {tx("monthly")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="yearly"
                      className="rounded-full data-[state=active]:shadow-sm"
                    >
                      {tx("yearly")}
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
                              <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white shadow">
                                {tx("popular")}
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <Badge className="absolute -top-3 end-6 border-0 bg-gray-900 text-white hover:bg-gray-900">
                                {tx("current")}
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
                                  {formatPlanPriceMain(plan, tx)}
                                </span>
                                {formatPlanPricePeriod(plan, tx) ? (
                                  <span className="text-sm font-medium text-gray-500">
                                    {formatPlanPricePeriod(plan, tx)}
                                  </span>
                                ) : null}
                                {plan.currency && !plan.is_free ? (
                                  <span className="ms-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
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
                                <li className="ps-6 text-xs text-gray-400">{tx("moreIncluded")}</li>
                              ) : null}
                            </ul>
                            {!isCurrent || needsReactivate ? (
                              appleLocked && !plan.is_free ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="mt-auto w-full rounded-xl py-5 text-base font-semibold"
                                  disabled
                                >
                                  {tx("manageInAppStore")}
                                </Button>
                              ) : (
                              <Button
                                className={`mt-auto w-full rounded-xl py-5 text-base font-semibold ${
                                  plan.is_popular
                                    ? "bg-primary text-white hover:bg-primary-hover"
                                    : "bg-gray-900 text-white hover:bg-gray-800"
                                }`}
                                onClick={() => handleUpgrade(plan.id)}
                                disabled={appleLocked && !plan.is_free}
                              >
                                {planUpgradeButtonLabel(subscription, plan, tx)}
                              </Button>
                              )
                            ) : (
                              <div className="mt-auto rounded-xl bg-gray-50 py-3 text-center text-sm font-medium text-gray-500">
                                {tx("activeSelection")}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
                      {tx("noPlansForPeriod", { period: billingTab })}
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
                          <Badge className="absolute end-4 top-4 border-0 bg-gray-900 text-white">
                            {tx("current")}
                          </Badge>
                        ) : null}
                        <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                        <p className="mt-3 text-3xl font-bold">{formatPlanPriceMain(plan, tx)}</p>
                        {!isCurrent || needsReactivate ? (
                          appleLocked && !plan.is_free ? (
                            <Button type="button" variant="outline" className="mt-6 w-full rounded-xl py-5" disabled>
                              {tx("manageInAppStore")}
                            </Button>
                          ) : (
                            <Button
                              className="mt-6 w-full rounded-xl bg-primary py-5 text-white hover:bg-primary-hover"
                              onClick={() => handleUpgrade(plan.id)}
                              disabled={appleLocked && !plan.is_free}
                            >
                              {planUpgradeButtonLabel(subscription, plan, tx)}
                            </Button>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-6 text-sm text-amber-950">
                  {tx("noPurchasablePlans")}
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title={tx("noSubscriptionTitle")}
            description={tx("noSubscriptionDesc")}
            action={{
              label: tx("choosePlan"),
              onClick: () => setShowUpgradeDialog(true),
            }}
          />
        )}

        <UpgradeDialog
          open={showUpgradeDialog}
          onClose={() => setShowUpgradeDialog(false)}
          plans={plans}
          onUpgrade={handleUpgrade}
          appleLocked={appleLocked}
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
          <p className="text-lg font-bold text-white">{tx("verifyingTitle")}</p>
          <p className="mt-2 max-w-sm text-sm text-white/80">{tx("verifyingBody")}</p>
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
  const { t } = useTranslation();
  const tx = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.subscription.${key}`, opts) as string;
  const priceLine = plan
    ? `${formatPlanPriceMain(plan, tx)}${formatPlanPricePeriod(plan, tx)}`
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
          <DialogTitle>{tx("reviewTitle")}</DialogTitle>
          <DialogDescription>{tx("reviewDesc")}</DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pink-700">
                {plan.billing_period === "yearly" ? tx("yearlyPlan") : tx("monthlyPlan")}
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
                <span className="text-sm font-semibold text-gray-900">{tx("totalDueNow")}</span>
                <span className="text-base font-bold text-gray-950">{priceLine}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
              <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>{tx("renewNote")}</span>
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
              <span>{tx("paystackNote")}</span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                {tx("notNow")}
              </Button>
              <Button onClick={onConfirm} disabled={submitting}>
                <CreditCard className="me-2 h-4 w-4" />
                {submitting ? tx("openingCheckout") : tx("payAmount", { amount: priceLine })}
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
  appleLocked,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  onUpgrade: (planId: string) => void;
  appleLocked: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.subscription.${key}`, opts) as string;
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
          <DialogTitle>{tx("upgradeDialogTitle")}</DialogTitle>
          <DialogDescription>{tx("upgradeDialogDesc")}</DialogDescription>
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
                      ? tx("free")
                      : tx("priceWithPeriod", {
                          currency: plan.currency,
                          price: plan.price,
                          periodShort:
                            plan.billing_period === "monthly"
                              ? tx("billingPeriodMonthShort")
                              : tx("billingPeriodYearShort"),
                        })}
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
              {tx("dialogCancel")}
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  onUpgrade(selectedPlan);
                }
              }}
              disabled={!selectedPlan || appleLocked}
            >
              {appleLocked ? tx("manageInAppStore") : tx("upgrade")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
