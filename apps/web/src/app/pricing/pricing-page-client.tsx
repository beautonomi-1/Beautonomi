"use client";

import React, { useEffect, useState } from "react";
import PartnerNavbar from "../become-a-partner/components/partner-navbar";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import type { PricingFAQ, PricingPageContent, PricingPlan } from "./pricing-data";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";

/** Avoid awkward pairs like price "Free" with period "Free /month" from legacy CMS rows. */
function displayPriceAndPeriod(plan: PricingPlan): { price: string; period: string | null } {
  const price = (plan.price ?? "").trim();
  let period = plan.period?.trim() || null;
  const priceLower = price.toLowerCase();
  // Free plans read better without a billing period ("Free" not "Free /month").
  if (priceLower === "free") return { price, period: null };
  if (!period) return { price, period: null };
  const pLower = period.toLowerCase();
  if (pLower.startsWith("free")) {
    const rest = period.replace(/^free\s*/i, "").trim();
    period = rest.length ? rest : null;
  }
  return { price, period };
}

/** Numeric tier rank from a display price ("Free"/"R0" → 0, "R99" → 99). */
function parsePriceRank(price: string): number {
  const raw = (price ?? "").toLowerCase().trim();
  if (!raw || raw.includes("free")) return 0;
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return Number.MAX_SAFE_INTEGER;
  const value = parseFloat(digits);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Current subscription context for a signed-in provider viewing the page. */
type ProviderPlanContext = {
  planId: string | null;
  /** Monthly price of the current plan, for upgrade/downgrade direction. */
  rank: number;
  /** Whether the current plan is the free tier — lets us match the free card even if it isn't FK-linked. */
  isFree: boolean;
  /** Whether the current plan is live (active/trial) — gates the "Current plan" label. */
  active: boolean;
};

interface PricingPageClientProps {
  pricingPlans: PricingPlan[];
  faqs: PricingFAQ[];
  pageContent: PricingPageContent;
}

export default function PricingPageClient({
  pricingPlans,
  faqs,
  pageContent,
}: PricingPageClientProps) {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Only set for a signed-in provider with a known plan; drives the
  // Current/Upgrade/Switch CTA labels. Stays null for public visitors and
  // signed-in customers, who keep the acquisition copy from the CMS.
  const [providerPlan, setProviderPlan] = useState<ProviderPlanContext | null>(null);

  const isProvider = role === "provider_owner" || role === "provider_staff";

  useEffect(() => {
    if (!user || !isProvider) {
      setProviderPlan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/provider/subscription", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: {
            plan_id?: string | null;
            status?: string | null;
            plan?: {
              id?: string | null;
              is_free?: boolean | null;
              price_monthly?: number | null;
              price_yearly?: number | null;
            } | null;
          } | null;
        };
        const sub = json?.data;
        if (cancelled || !sub) return;
        const planId = sub.plan_id ?? sub.plan?.id ?? null;
        if (!planId) return;
        const isFree =
          sub.plan?.is_free === true ||
          (sub.plan?.price_monthly == null && sub.plan?.price_yearly == null);
        const rawRank = isFree
          ? 0
          : Number(sub.plan?.price_monthly ?? sub.plan?.price_yearly ?? 0);
        setProviderPlan({
          planId,
          rank: Number.isFinite(rawRank) ? rawRank : 0,
          isFree,
          active: sub.status === "active" || sub.status === "trial",
        });
      } catch {
        // Non-fatal: fall back to the public acquisition CTA.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isProvider]);

  /**
   * Context-aware CTA: public visitors / signed-in customers see the CMS
   * acquisition copy; a signed-in provider sees their subscription state.
   */
  const resolveCta = (plan: PricingPlan): { label: string; disabled: boolean } => {
    if (!providerPlan) return { label: plan.cta_text, disabled: false };
    const cardRank = parsePriceRank(plan.price);
    // Prefer an exact FK match; fall back to free↔free matching so the free card
    // still reads "Current plan" even if its subscription_plan_id link was
    // cleared via the CMS (the free card is the only R0 tier).
    const linkMatch =
      !!plan.subscriptionPlanId && plan.subscriptionPlanId === providerPlan.planId;
    const freeMatch = providerPlan.isFree && cardRank === 0;
    if (providerPlan.active && (linkMatch || freeMatch)) {
      return { label: "Current plan", disabled: true };
    }
    if (cardRank > providerPlan.rank) return { label: "Upgrade", disabled: false };
    return { label: "Switch plan", disabled: false };
  };

  const handleGetStarted = (planName: string, planId?: string) => {
    if (isLoading) return;

    if (!user) {
      if (planId) {
        sessionStorage.setItem("selectedPlanId", planId);
        sessionStorage.setItem("selectedPlanName", planName);
      }
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      if (planId) {
        router.push(`/provider/subscription-checkout?planId=${planId}`);
      } else {
        router.push("/provider/dashboard");
      }
    } else {
      const params = new URLSearchParams();
      if (planId) {
        params.set("planId", planId);
        params.set("planName", planName);
      }
      router.push(`/provider/onboarding?${params.toString()}`);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <PartnerNavbar />

      <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-4">
            {pageContent.heroTitle}
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
            {pageContent.heroDescription}
          </p>
          {pageContent.currencyNote ? (
            <p className="text-sm text-gray-500 max-w-2xl mx-auto mt-4">{pageContent.currencyNote}</p>
          ) : null}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        {pricingPlans.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No pricing plans available at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {pricingPlans.map((plan) => {
              const { price: displayPrice, period: displayPeriod } = displayPriceAndPeriod(plan);
              const cta = resolveCta(plan);
              const isCurrentPlan = cta.disabled;
              return (
                <div
                  key={plan.id}
                  className={`relative flex h-full flex-col rounded-2xl border bg-white p-8 transition-all duration-200 ${
                    isCurrentPlan
                      ? "border-gray-300 ring-1 ring-gray-200"
                      : plan.is_popular
                        ? "border-primary shadow-xl ring-1 ring-primary/15 md:z-10 md:scale-105"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                  }`}
                >
                  {isCurrentPlan ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center rounded-full bg-gray-900 px-4 py-1 text-sm font-semibold text-white shadow-sm">
                        Your plan
                      </span>
                    </div>
                  ) : plan.is_popular ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center rounded-full bg-primary px-4 py-1 text-sm font-semibold text-white shadow-sm">
                        Most Popular
                      </span>
                    </div>
                  ) : null}

                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    {plan.currency ? (
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                        {plan.currency}
                      </p>
                    ) : null}
                    <div className="flex items-baseline justify-center gap-1 mb-2">
                      <span className="text-4xl font-bold text-gray-900 tracking-tight">{displayPrice}</span>
                      {displayPeriod ? <span className="text-gray-500">{displayPeriod}</span> : null}
                    </div>
                    {plan.description && (
                      <p className="text-sm leading-relaxed text-gray-600">{plan.description}</p>
                    )}
                  </div>

                  <ul className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1 text-gray-700 [&_a]:text-primary [&_a]:underline [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
                          <PricingFeatureHtml html={feature} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => {
                      if (!cta.disabled) handleGetStarted(plan.name, plan.id);
                    }}
                    disabled={cta.disabled}
                    aria-disabled={cta.disabled}
                    className={`mt-auto w-full py-6 text-lg font-semibold rounded-full transition-all ${
                      cta.disabled
                        ? "bg-gray-100 text-gray-500 hover:bg-gray-100 cursor-default"
                        : plan.is_popular
                          ? "bg-primary hover:bg-primary-hover text-white shadow-sm hover:shadow-md"
                          : "bg-gray-900 hover:bg-gray-800 text-white"
                    }`}
                  >
                    {cta.label}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-gray-50 py-12 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Frequently asked questions
          </h2>
          {faqs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No FAQs available at the moment.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {faqs.map((faq) => (
                <div key={faq.id}>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="signup"
        redirectContext="provider"
        skipDefaultSignupRedirect
        onAuthSuccess={() => {
          const planId = sessionStorage.getItem("selectedPlanId");
          const planName = sessionStorage.getItem("selectedPlanName");
          sessionStorage.removeItem("selectedPlanId");
          sessionStorage.removeItem("selectedPlanName");
          if (planId && (role === "provider_owner" || role === "provider_staff")) {
            router.push(`/provider/subscription-checkout?planId=${planId}`);
          } else if (planId && planName) {
            const params = new URLSearchParams();
            params.set("planId", planId);
            params.set("planName", planName);
            router.push(`/provider/onboarding?${params.toString()}`);
          } else {
            router.push("/provider/onboarding");
          }
        }}
      />
    </div>
  );
}
