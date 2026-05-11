"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Calendar, Sparkles } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  status: "active" | "expired" | "cancelled" | "past_due" | "trial";
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
  billing_issue?: {
    type: "past_due" | "sync_pending" | "payment_failed" | "payment_pending" | string;
    message: string;
    action: "pay_now" | "update_payment" | "retry_payment" | "complete_payment" | string;
  } | null;
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

function billingActionLabel(subscription: ProviderSubscription, isPaidPlan: boolean): string | null {
  if (!isPaidPlan) return null;
  if (subscription.status === "past_due") return "Pay now / update card";
  if (subscription.paystack_sync_pending) return "Complete billing";
  if (subscription.billing_issue?.action === "retry_payment") return "Retry payment";
  if (subscription.billing_issue?.action === "complete_payment") return "Complete payment";
  if (subscription.cancelled_at) return "Resume billing";
  if (subscription.status === "expired" || subscription.status === "cancelled") return "Reactivate plan";
  if (subscription.status === "active" && subscription.auto_renew === false) return "Extend plan";
  return null;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<ProviderSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showInAppReturnBanner, setShowInAppReturnBanner] = useState(false);
  const [inAppReturnStatus, setInAppReturnStatus] = useState<"success" | "failed" | "pending" | null>(null);
  const [billingTab, setBillingTab] = useState<"monthly" | "yearly">("monthly");

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
    const inApp = urlParams.get("in_app") === "1";
    const reference = urlParams.get("reference") || urlParams.get("trxref");

    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function init() {
      if (isPaymentSuccess && reference) {
        try {
          await fetcher.get(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        } catch {
          // Webhooks still reconcile this path; the banner below reflects the latest order state.
        }
      }

      const loaded = await loadData();
      if (!isPaymentSuccess) return;

      const latestStatus = loaded?.latest_order?.status;
      const failed = latestStatus === "failed" || loaded?.billing_issue?.type === "payment_failed";
      const pending = latestStatus === "pending" || loaded?.billing_issue?.type === "payment_pending";
      const status = failed ? "failed" : pending ? "pending" : "success";

      setInAppReturnStatus(status);
      if (inApp) setShowInAppReturnBanner(true);

      if (status === "success") {
        toast.success("Payment successful! Your subscription is being activated...");
        timeout = setTimeout(() => loadData(), 2000);
      } else if (status === "failed") {
        toast.error(loaded?.billing_issue?.message ?? "Payment was not completed. Please try another card or add funds.");
      } else {
        toast.info("Payment is still pending. We'll update your subscription once the bank confirms it.");
      }

      const cleanSearch = inApp ? "?in_app=1" : "";
      window.history.replaceState({}, "", window.location.pathname + cleanSearch);

      if (inApp && typeof window !== "undefined") {
        const win = window as Window & { ReactNativeWebView?: { postMessage: (data: string) => void } };
        if (win.ReactNativeWebView?.postMessage && status !== "pending") {
          timeout = setTimeout(() => {
            win.ReactNativeWebView?.postMessage(
              JSON.stringify({ type: status === "success" ? "subscription_success" : "subscription_failed" })
            );
          }, 1500);
        }
      }
    }

    init();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const handleUpgrade = async (planId: string) => {
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
        } 
      }>(
        "/api/provider/subscription/upgrade",
        { plan_id: plan.plan_id, billing_period: plan.billing_period }
      );

      const data = (res as any).data;

      // Free tier - subscription created directly
      if (data.is_free) {
        toast.success("Free subscription activated!");
        setShowUpgradeDialog(false);
        loadData();
        return;
      }

      // If subscription created successfully
      if (data.subscription_id && !data.requires_payment) {
        toast.success("Subscription activated successfully!");
        setShowUpgradeDialog(false);
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
        }>(
          "/api/provider/subscription/initialize-payment",
          {
            plan_id: plan.plan_id,
            billing_period: plan.billing_period,
            ...(isInProviderAppWebView() ? { in_app: true } : {}),
          }
        );

        const pay = (paymentRes as { data?: { payment_url?: string | null; authorization_url?: string | null } })
          .data;
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

      toast.success("Subscription checkout started");
      setShowUpgradeDialog(false);
    } catch (error) {
      const msg =
        error instanceof FetchError ? error.message : "Failed to upgrade subscription";
      toast.error(msg);
      console.error("Error upgrading subscription:", error);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.")) {
      return;
    }

    try {
      await fetcher.post("/api/provider/subscription/cancel");
      toast.success("Subscription cancelled. You'll retain access until the end of your billing period.");
      await loadData();
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : "Failed to cancel subscription";
      toast.error(msg);
      console.error("Error cancelling subscription:", error);
    }
  };

  const handleRenew = async () => {
    try {
      const res = await fetcher.post<{
        data: { payment_url?: string | null; is_free?: boolean; message?: string };
      }>("/api/provider/subscription/renew", isInProviderAppWebView() ? { in_app: true } : {});
      const d = (res as { data?: { payment_url?: string | null; is_free?: boolean; message?: string } }).data;
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
    const latest = subscription?.latest_order;
    const retryPlan = latest?.plan_id
      ? plans.find(
          (p) =>
            p.plan_id === latest.plan_id &&
            (!latest.billing_period || p.billing_period === latest.billing_period)
        )
      : null;

    if (retryPlan && (subscription?.billing_issue?.action === "retry_payment" || subscription?.billing_issue?.action === "complete_payment")) {
      await handleUpgrade(retryPlan.id);
      return;
    }

    await handleRenew();
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
    rawPlan?.is_free ||
    (rawPlan?.price_monthly == null && rawPlan?.price_yearly == null);
  const bullets =
    rawPlan?.feature_bullets && Array.isArray(rawPlan.feature_bullets) && rawPlan.feature_bullets.length > 0
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
  const showCancel =
    Boolean(subscription && subscription.status === "active" && !subscription.cancelled_at && isPaidPlan);

  return (
    <SettingsDetailLayout>
      <div className="mx-auto max-w-5xl">
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-pink-100/80 bg-gradient-to-br from-pink-50/90 via-white to-violet-50/70 px-5 py-8 md:px-8 md:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF0077]/10 blur-3xl" aria-hidden />
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
                    {subscription.status === "trial" && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        Trial
                      </Badge>
                    )}
                    {subscription.status === "past_due" && (
                      <Badge variant="secondary" className="bg-red-100 text-red-800">
                        Past Due
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-base text-gray-600">
                    {currentPlan?.description || currentPlan?.name || "No plan selected"}
                  </CardDescription>
                  {isPaidPlan && subscription.status === "active" && !subscription.cancelled_at ? (
                    <p className="mt-2 text-sm text-gray-600">
                      {subscription.auto_renew
                        ? `Auto-renews${expiresAt ? ` on ${expiresAt.toLocaleDateString()}` : ""}.`
                        : `Paid until${expiresAt ? ` ${expiresAt.toLocaleDateString()}` : " the end of the period"}. Manual extension is available when you need it.`}
                    </p>
                  ) : null}
                  {currentPlan?.is_free ? (
                    <p className="mt-3 text-sm leading-relaxed text-amber-900/90">
                      You are on the free tier. Premium tools (recurring appointments, automations, calendar sync, etc.)
                      follow the feature switches on each subscription plan in admin — upgrade below when a paid plan
                      includes the capability you need.
                    </p>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription.status === "active" && expiresAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Expires on: {expiresAt.toLocaleDateString()}
                  </span>
                </div>
              )}

              {subscription.billing_issue ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-semibold">
                    {subscription.billing_issue.type === "payment_failed"
                      ? "Payment was not completed"
                      : subscription.billing_issue.type === "past_due"
                        ? "Payment action needed"
                        : "Billing action needed"}
                  </p>
                  <p className="mt-1 leading-relaxed">{subscription.billing_issue.message}</p>
                </div>
              ) : null}

              {currentPlan && (
                <div>
                  <div className="mb-2 flex flex-wrap items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">{formatPlanPriceMain(currentPlan)}</span>
                    {formatPlanPricePeriod(currentPlan) ? (
                      <span className="text-lg text-gray-600">{formatPlanPricePeriod(currentPlan)}</span>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900">What&apos;s included</p>
                    <ul className="space-y-3">
                      {(Array.isArray(currentPlan.features) ? currentPlan.features : []).map((feature, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm text-gray-700">
                          <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#FF0077]" />
                          <div className="min-w-0 flex-1 [&_a]:text-[#FF0077] [&_a]:underline [&_p]:m-0">
                            <PricingFeatureHtml html={feature} className="block" />
                          </div>
                        </li>
                      ))}
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
                  <Button onClick={handleBillingAction} variant={subscription.status === "past_due" ? "default" : "outline"}>
                    {billingLabel}
                  </Button>
                ) : null}
                {showCancel ? (
                  <Button onClick={handleCancel} variant="outline" className="text-red-600">
                    Cancel Subscription
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          </div>

          <div>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-gray-900">Change plan</h3>
                <p className="mt-1 max-w-xl text-sm text-gray-500">
                  Only plans linked to an active public pricing card for your region are shown — same as your marketing site.
                </p>
              </div>
            </div>

            {plans.some((p) => !p.is_free) ? (
              <Tabs value={billingTab} onValueChange={(v) => setBillingTab(v as "monthly" | "yearly")} className="w-full">
                <TabsList className="mb-6 grid h-11 w-full max-w-md grid-cols-2 rounded-full bg-gray-100/90 p-1">
                  <TabsTrigger value="monthly" className="rounded-full data-[state=active]:shadow-sm">
                    Monthly
                  </TabsTrigger>
                  <TabsTrigger value="yearly" className="rounded-full data-[state=active]:shadow-sm">
                    Yearly
                  </TabsTrigger>
                </TabsList>
                  {visiblePlans.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                      {visiblePlans.map((plan) => {
                        const isCurrent =
                          subscription?.plan_id === plan.plan_id &&
                          (subscription?.billing_period ?? "monthly") === plan.billing_period;
                        return (
                          <div
                            key={plan.id}
                            className={`relative flex flex-col rounded-2xl border bg-white/95 p-6 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md ${
                              plan.is_popular
                                ? "border-[#FF0077]/40 ring-1 ring-[#FF0077]/20"
                                : "border-gray-200/90"
                            } ${isCurrent ? "ring-2 ring-gray-400 ring-offset-2" : ""}`}
                          >
                            {plan.is_popular ? (
                              <span className="absolute -top-3 left-6 rounded-full bg-[#FF0077] px-3 py-0.5 text-xs font-semibold text-white shadow">
                                Popular
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <Badge className="absolute -top-3 right-6 border-0 bg-gray-900 text-white hover:bg-gray-900">
                                Current
                              </Badge>
                            ) : null}
                            <div className="mb-5 mt-1">
                              <h4 className="text-lg font-bold tracking-tight text-gray-900">{plan.name}</h4>
                              {plan.description ? (
                                <p className="mt-2 text-sm leading-relaxed text-gray-600">{plan.description}</p>
                              ) : null}
                              <div className="mt-4 flex flex-wrap items-baseline gap-1">
                                <span className="text-3xl font-bold tabular-nums text-gray-900">
                                  {formatPlanPriceMain(plan)}
                                </span>
                                {formatPlanPricePeriod(plan) ? (
                                  <span className="text-sm font-medium text-gray-500">{formatPlanPricePeriod(plan)}</span>
                                ) : null}
                                {plan.currency && !plan.is_free ? (
                                  <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    {plan.currency}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <ul className="mb-6 flex-1 space-y-3 border-t border-gray-100 pt-4">
                              {(Array.isArray(plan.features) ? plan.features : []).slice(0, 8).map((feature, index) => (
                                <li key={index} className="flex items-start gap-2.5 text-sm">
                                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#FF0077]" />
                                  <div className="min-w-0 flex-1 text-gray-700 [&_a]:text-[#FF0077] [&_a]:underline [&_p]:m-0">
                                    <PricingFeatureHtml html={feature} className="block leading-snug" />
                                  </div>
                                </li>
                              ))}
                              {(plan.features?.length ?? 0) > 8 ? (
                                <li className="pl-6 text-xs text-gray-400">+ more included</li>
                              ) : null}
                            </ul>
                            {!isCurrent ? (
                              <Button
                                className={`mt-auto w-full rounded-xl py-5 text-base font-semibold ${
                                  plan.is_popular
                                    ? "bg-[#FF0077] text-white hover:bg-[#D60565]"
                                    : "bg-gray-900 text-white hover:bg-gray-800"
                                }`}
                                onClick={() => handleUpgrade(plan.id)}
                              >
                                {subscription?.status === "trial" ? "Upgrade from trial" : "Continue with this plan"}
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
                      No {billingTab} options are published for your region. Try the other billing period or ask an admin
                      to enable pricing for this market.
                    </div>
                  )}
              </Tabs>
            ) : plans.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {visiblePlans.map((plan) => {
                  const isCurrent =
                    subscription?.plan_id === plan.plan_id &&
                    (subscription?.billing_period ?? "monthly") === plan.billing_period;
                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-2xl border bg-white p-6 shadow-sm ${
                        isCurrent ? "ring-2 ring-gray-400 ring-offset-2" : "border-gray-200"
                      }`}
                    >
                      {isCurrent ? (
                        <Badge className="absolute right-4 top-4 border-0 bg-gray-900 text-white">Current</Badge>
                      ) : null}
                      <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                      <p className="mt-3 text-3xl font-bold">{formatPlanPriceMain(plan)}</p>
                      {!isCurrent ? (
                        <Button className="mt-6 w-full rounded-xl bg-[#FF0077] py-5 text-white hover:bg-[#D60565]" onClick={() => handleUpgrade(plan.id)}>
                          Continue
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-6 text-sm text-amber-950">
                No purchasable plans are published for this workspace. In admin, open Finance → Plans, enable{" "}
                <strong>Show on public pricing page</strong> for the tiers you want providers to see, then refresh this
                page.
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
      </div>
    </SettingsDetailLayout>
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade Your Subscription</DialogTitle>
          <DialogDescription>
            Choose a plan to continue using Beautonomi after your free trial
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedPlan === plan.id
                  ? "border-[#FF0077] bg-pink-50"
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
