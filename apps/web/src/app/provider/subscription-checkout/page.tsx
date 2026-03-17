"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Check, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import PartnerNavbar from "../../become-a-partner/components/partner-navbar";

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
  const hasMultiple = periods.length > 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your cart</h2>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
          <span className="text-[#FF0077] font-bold text-sm">B</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
          {plan.description && (
            <p className="text-sm text-gray-600 mt-0.5">{plan.description}</p>
          )}
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
                        ? "bg-white text-[#FF0077] shadow-sm border border-gray-200"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {p === "yearly" ? "12 months" : "1 month"}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {billingPeriod === "yearly" ? "12 months" : "1 month"}
              </p>
            )}
          </div>
          <p className="mt-3 text-gray-900 font-semibold">
            {plan.price}
            {plan.period || (billingPeriod === "monthly" ? "/mo" : "/year")}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Renews at {plan.price}
            {billingPeriod === "monthly" ? "/mo" : "/year"}. Cancel anytime.
          </p>
        </div>
      </div>
      {plan.is_popular && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FF0077]/10 px-3 py-1 text-xs font-medium text-[#FF0077]">
          <Check className="w-3.5 h-3.5" />
          Most popular
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
}: {
  planName: string;
  priceDisplay: string;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Order summary</h2>
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-700">{planName}</span>
          <span className="font-medium text-gray-900">{priceDisplay}</span>
        </div>
      </div>
      <div className="border-t border-gray-200 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Taxes</span>
          <span className="text-gray-900">—</span>
        </div>
        <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
          <span className="text-gray-900">Total</span>
          <span className="text-[#FF0077]">{priceDisplay}</span>
        </div>
      </div>
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
        className="mt-6 w-full py-3.5 bg-[#FF0077] text-white rounded-xl font-semibold hover:bg-[#e6006b] transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Redirecting to payment…
          </>
        ) : (
          "Continue"
        )}
      </button>
      <p className="mt-4 text-xs text-gray-500 text-center">
        14-day free trial. Cancel anytime.
      </p>
      <p className="mt-1 text-xs text-gray-400 text-center">
        You&apos;ll be redirected to Paystack to complete payment securely.
      </p>
      <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <Link href="/terms-and-condition" className="hover:text-gray-700">
          Terms of service
        </Link>
        <Link href="/privacy-policy" className="hover:text-gray-700">
          Privacy policy
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
      setError("No plan selected.");
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
          } else if (billingParam === "yearly" && data.available_billing_periods.includes("yearly")) {
            setBillingPeriod("yearly");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof FetchError ? err.message : "Plan not found.");
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
      const res = await fetcher.post<{
        data?: { authorization_url?: string };
        error?: { message?: string; code?: string };
      }>("/api/provider/subscriptions/create", {
        plan_id: planId,
        billing_period: billingPeriod,
        ...(inApp && { in_app: true }),
      });
      const data = (res as any)?.data;
      const authUrl = data?.authorization_url;
      if (authUrl) {
        toast.success("Redirecting to complete payment…");
        window.location.href = authUrl;
        return;
      }
      setError("Could not start payment. Please try again.");
    } catch (err) {
      const msg =
        err instanceof FetchError
          ? err.message
          : "Checkout failed. Please try again.";
      if (err instanceof FetchError && err.status === 401) {
        toast.error("Please sign in to complete your subscription.");
        const inAppParam = inApp ? "&in_app=1" : "";
        const redirectPath = `/provider/subscription-checkout?planId=${planId}&billing_period=${billingPeriod}${inAppParam}`;
        router.push(`/?login=true&redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }
      if (err instanceof FetchError && err.status === 409) {
        toast.error("You already have an active subscription.");
        router.push("/provider/subscription");
        return;
      }
      if (err instanceof FetchError && err.status === 404) {
        setError("Provider not found. Please complete onboarding first.");
        return;
      }
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
          <p className="text-gray-600 mb-4">No plan selected.</p>
          <Link
            href="/pricing"
            className="text-[#FF0077] font-medium hover:underline"
          >
            View pricing plans
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
          <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
          <p className="text-gray-600">Loading plan…</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600 mb-4">{error || "Plan not found."}</p>
          <Link
            href="/pricing"
            className="text-[#FF0077] font-medium hover:underline"
          >
            View pricing plans
          </Link>
        </div>
      </div>
    );
  }

  if (plan.available_billing_periods.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PartnerNavbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600 mb-4">
            This plan is not available for subscription at the moment. Please
            contact support or choose another plan.
          </p>
          <Link
            href="/pricing"
            className="text-[#FF0077] font-medium hover:underline"
          >
            View pricing plans
          </Link>
        </div>
      </div>
    );
  }

  const priceDisplay = `${plan.price}${plan.period || (billingPeriod === "monthly" ? "/mo" : "/year")}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <PartnerNavbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to pricing
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-8">
          Complete your subscription
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
