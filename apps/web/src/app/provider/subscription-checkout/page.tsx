"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Check, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import PartnerNavbar from "../../become-a-partner/components/partner-navbar";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";

interface PricingPlanCheckout {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  features: string[];
  available_billing_periods: ("monthly" | "yearly")[];
  is_free?: boolean;
  subscription_plan_id?: string | null;
}

function CartCard({
  plan,
  billingPeriod,
  onBillingPeriodChange,
}: {
  plan: PricingPlanCheckout;
  billingPeriod: "monthly" | "yearly";
  onBillingPeriodChange: (period: "monthly" | "yearly") => void;
}) {
  const periods = plan.available_billing_periods;
  const { t } = useTranslation();
  const hasMultiple = periods.length > 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("web.provider.subscription.checkout.yourCart")}</h2>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-primary font-bold text-sm">B</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
          {plan.description ? (
            <div className="mt-0.5 text-sm text-gray-600 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
              <PricingFeatureHtml html={plan.description} className="block leading-snug" />
            </div>
          ) : null}
          {plan.is_free ? (
            <div className="mt-4">
              <p className="text-sm text-gray-600">{t("web.provider.subscription.checkout.freeNoBilling")}</p>
              <p className="mt-3 text-gray-900 font-semibold">{t("web.provider.subscription.free")}</p>
              <p className="text-xs text-gray-500 mt-1">{t("web.provider.subscription.checkout.noPaymentUpgrade")}</p>
            </div>
          ) : (
            <>
              <div className="mt-4">
                {hasMultiple ? (
                  <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    {periods.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => onBillingPeriodChange(p)}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                          billingPeriod === p
                            ? "bg-white text-primary shadow-sm border border-gray-200"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {p === "yearly" ? t("web.provider.subscription.checkout.months12") : t("web.provider.subscription.checkout.month1")}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    {billingPeriod === "yearly" ? t("web.provider.subscription.checkout.months12") : t("web.provider.subscription.checkout.month1")}
                  </p>
                )}
              </div>
              <p className="mt-3 text-gray-900 font-semibold">
                {plan.price}
                {plan.period || (billingPeriod === "monthly" ? t("web.provider.subscription.checkout.perMo") : t("web.provider.subscription.checkout.perYear"))}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {t("web.provider.subscription.checkout.renewsAt", { price: plan.price, period: billingPeriod === "monthly" ? t("web.provider.subscription.checkout.perMo") : t("web.provider.subscription.checkout.perYear") })}
              </p>
            </>
          )}
        </div>
      </div>
      {plan.is_popular && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Check className="w-3.5 h-3.5" />
          {t("web.provider.subscription.checkout.mostPopular")}
        </div>
      )}
    </div>
  );
}

function OrderSummaryCard({
  planName,
  priceDisplay,
  onSubmit,
  submitting,
  error,
  isFree,
}: {
  planName: string;
  priceDisplay: string;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  isFree?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isFree ? t("web.provider.subscription.checkout.planSummary") : t("web.provider.subscription.checkout.orderSummary")}
      </h2>
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-700">{planName}</span>
          <span className="font-medium text-gray-900">{priceDisplay}</span>
        </div>
      </div>
      {!isFree && (
        <div className="border-t border-gray-200 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t("web.provider.subscription.checkout.taxes")}</span>
            <span className="text-gray-900">—</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
            <span className="text-gray-900">{t("web.provider.subscription.checkout.total")}</span>
            <span className="text-primary">{priceDisplay}</span>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="mt-6 w-full py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-[#e6006b] transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {isFree ? t("web.provider.subscription.checkout.activating") : t("web.provider.subscription.checkout.redirectingPayment")}
          </>
        ) : isFree ? (
          t("web.provider.subscription.checkout.activateFreePlan")
        ) : (
          t("web.provider.subscription.checkout.continue")
        )}
      </button>
      {!isFree && (
        <>
          <p className="mt-4 text-xs text-gray-500 text-center">
            {t("web.provider.subscription.checkout.cancelAnytime")}
          </p>
          <p className="mt-1 text-xs text-gray-400 text-center">
            {t("web.provider.subscription.checkout.paystackRedirect")}
          </p>
        </>
      )}
      {isFree && (
        <p className="mt-4 text-xs text-gray-500 text-center">
          {t("web.provider.subscription.checkout.noPaymentImmediate")}
        </p>
      )}
      <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <Link href="/terms-and-condition" className="hover:text-gray-700">
          {t("web.provider.subscription.checkout.terms")}
        </Link>
        <Link href="/privacy-policy" className="hover:text-gray-700">
          {t("web.provider.subscription.checkout.privacy")}
        </Link>
      </div>
    </div>
  );
}

export default function SubscriptionCheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get("planId");
  const billingParam = searchParams.get("billing_period");
  const inApp = searchParams.get("in_app") === "1";
  const returnToDashboard = searchParams.get("return_to") === "dashboard";
  const { t } = useTranslation();

  const [plan, setPlan] = useState<PricingPlanCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    billingParam === "yearly" ? "yearly" : "monthly"
  );

  useEffect(() => {
    if (!planId) {
      setLoading(false);
      setError(t("web.provider.subscription.checkout.noPlanSelected"));
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetcher.get<{ data: PricingPlanCheckout }>(
          `/api/public/pricing/plans/${planId}`
        );
        const data = (res as any)?.data;
        if (!cancelled && data) {
          setPlan(data);
          if (data.available_billing_periods.length === 1) {
            setBillingPeriod(data.available_billing_periods[0]);
          } else if (
            billingParam === "yearly" &&
            data.available_billing_periods.includes("yearly")
          ) {
            setBillingPeriod("yearly");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof FetchError ? err.message : t("web.provider.subscription.checkout.planNotFound"));
          setPlan(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, billingParam]);

  const handleContinue = async () => {
    if (!planId || !plan) return;
    setSubmitting(true);
    setError(null);
    try {
      // Free plan: activate via the upgrade API using the linked subscription_plan_id
      if (plan.is_free && plan.subscription_plan_id) {
        const res = await fetcher.post<{
          data?: { is_free?: boolean; subscription_id?: string };
        }>("/api/provider/subscription/upgrade", {
          plan_id: plan.subscription_plan_id,
          billing_period: "monthly",
        });
        const data = (res as any)?.data;
        if (data?.is_free || data?.subscription_id) {
          toast.success(t("web.provider.subscription.checkout.freeActivated"));
          // In-app checkout should mirror paid flow completion so the native
          // WebView listener can close and return to the app screen.
          if (inApp) {
            const dashboardReturnParam = returnToDashboard ? "&return_to=dashboard" : "";
            router.push(
              `/provider/subscription?payment_success=true&in_app=1${dashboardReturnParam}`
            );
            return;
          }
          if (returnToDashboard) {
            router.replace("/provider/dashboard?subscription_success=1");
            return;
          }
          router.push("/provider/subscription");
          return;
        }
        setError(t("web.provider.subscription.checkout.freeActivateFailed"));
        return;
      }

      const subscriptionPlanId = plan.subscription_plan_id;
      if (!subscriptionPlanId) {
        setError(t("web.provider.subscription.checkout.planNotLinked"));
        return;
      }

      const upRes = await fetcher.post<{
        data?: {
          is_free?: boolean;
          subscription_id?: string;
          requires_payment?: boolean;
          authorization_url?: string;
          payment_url?: string;
        };
      }>("/api/provider/subscription/upgrade", {
        plan_id: subscriptionPlanId,
        billing_period: billingPeriod,
      });
      const upData = (upRes as { data?: Record<string, unknown> })?.data;
      if (upData?.subscription_id && !upData?.requires_payment) {
        toast.success(t("web.provider.subscription.checkout.subscriptionUpdated"));
        if (inApp) {
          const dashboardReturnParam = returnToDashboard ? "&return_to=dashboard" : "";
          router.push(`/provider/subscription?payment_success=true&in_app=1${dashboardReturnParam}`);
          return;
        }
        if (returnToDashboard) {
          router.replace("/provider/dashboard?subscription_success=1");
          return;
        }
        router.push("/provider/subscription");
        return;
      }

      let authUrl =
        (typeof upData?.authorization_url === "string" ? upData.authorization_url : null) ??
        (typeof upData?.payment_url === "string" ? upData.payment_url : null);

      if (!authUrl) {
        const initRes = await fetcher.post<{
          data?: { authorization_url?: string; payment_url?: string };
        }>("/api/provider/subscription/initialize-payment", {
          plan_id: subscriptionPlanId,
          billing_period: billingPeriod,
          ...(inApp && { in_app: true }),
        });
        const initData = (initRes as { data?: Record<string, unknown> })?.data;
        authUrl =
          (typeof initData?.authorization_url === "string" ? initData.authorization_url : null) ??
          (typeof initData?.payment_url === "string" ? initData.payment_url : null);
      }

      if (authUrl) {
        toast.success(t("web.provider.subscription.checkout.redirectingComplete"));
        window.location.href = authUrl;
        return;
      }
      setError(t("web.provider.subscription.checkout.noCheckoutUrl"));
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      const serverCode = fetchErr?.code as string | undefined;
      const serverMsg = fetchErr?.message;

      if (fetchErr?.status === 401) {
        toast.error(t("web.provider.subscription.checkout.signInRequired"));
        const inAppParam = inApp ? "&in_app=1" : "";
        const dashboardReturnParam = returnToDashboard ? "&return_to=dashboard" : "";
        const redirectPath = `/provider/subscription-checkout?planId=${planId}&billing_period=${billingPeriod}${inAppParam}${dashboardReturnParam}`;
        router.push(`/?login=true&redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }
      if (fetchErr?.status === 409) {
        toast.error(t("web.provider.subscription.checkout.alreadySubscribed"));
        router.push("/provider/subscription");
        return;
      }
      if (fetchErr?.status === 404) {
        setError(t("web.provider.subscription.checkout.providerNotFound"));
        return;
      }
      if (serverCode === "CONFIGURATION_ERROR") {
        setError(serverMsg || t("web.provider.subscription.checkout.planNotLinkedPaystack"));
        return;
      }
      if (serverCode === "PAYSTACK_ERROR") {
        setError(serverMsg || t("web.provider.subscription.checkout.paystackError"));
        return;
      }
      const msg = serverMsg || (err instanceof Error ? err.message : t("web.provider.subscription.checkout.checkoutFailed"));
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!planId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600 mb-4">{t("web.provider.subscription.checkout.noPlanSelected")}</p>
          <Link href="/pricing" className="text-primary font-medium hover:underline">
            {t("web.provider.subscription.checkout.viewPricing")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-24 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-gray-600">{t("web.provider.subscription.checkout.loadingPlan")}</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600 mb-4">{error || t("web.provider.subscription.checkout.planNotFound")}</p>
          <Link href="/pricing" className="text-primary font-medium hover:underline">
            {t("web.provider.subscription.checkout.viewPricing")}
          </Link>
        </div>
      </div>
    );
  }

  if (plan.available_billing_periods.length === 0 && !plan.is_free) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600 mb-4">
            {t("web.provider.subscription.checkout.planUnavailable")}
          </p>
          <Link href="/pricing" className="text-primary font-medium hover:underline">
            {t("web.provider.subscription.checkout.viewPricing")}
          </Link>
        </div>
      </div>
    );
  }

  const priceDisplay = plan.is_free
    ? t("web.provider.subscription.free")
    : `${plan.price}${plan.period || (billingPeriod === "monthly" ? t("web.provider.subscription.checkout.perMo") : t("web.provider.subscription.checkout.perYear"))}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <PartnerNavbar />
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 sm:mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("web.provider.subscription.checkout.backToPricing")}
        </Link>
        <div className="mb-5 sm:mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {plan.is_free ? t("web.provider.subscription.checkout.activateFreeTitle") : t("web.provider.subscription.checkout.completeSubscription")}
          </h1>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              plan.is_free
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-primary/10 text-primary ring-1 ring-primary/20"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            {plan.is_free ? t("web.provider.subscription.checkout.noPaymentNeeded") : t("web.provider.subscription.checkout.secureCardPayment")}
          </span>
        </div>
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{t("web.provider.subscription.checkout.whatHappensNext")}</span>{" "}
          {plan.is_free
            ? t("web.provider.subscription.checkout.freeNext")
            : t("web.provider.subscription.checkout.paidNext")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="order-2 md:order-1">
            <CartCard
              plan={plan}
              billingPeriod={billingPeriod}
              onBillingPeriodChange={setBillingPeriod}
            />
          </div>
          <div className="order-1 md:order-2">
            <div className="md:sticky md:top-8">
              <OrderSummaryCard
                planName={plan.name}
                priceDisplay={priceDisplay}
                onSubmit={handleContinue}
                submitting={submitting}
                error={error}
                isFree={plan.is_free}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
