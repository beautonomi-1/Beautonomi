"use client";

import React, { useState } from "react";
import PartnerNavbar from "../become-a-partner/components/partner-navbar";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import type { PricingFAQ, PricingPageContent, PricingPlan } from "./pricing-data";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-8 ${
                  plan.is_popular
                    ? "border-[#FF0077] shadow-xl scale-105 bg-white"
                    : "border-gray-200 bg-white"
                }`}
              >
                {plan.is_popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-[#FF0077] text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  {plan.currency ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                      {plan.currency}
                    </p>
                  ) : null}
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    {plan.period && <span className="text-gray-600">{plan.period}</span>}
                  </div>
                  {plan.description && <p className="text-gray-600">{plan.description}</p>}
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 text-gray-700 [&_a]:text-[#FF0077] [&_a]:underline [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
                        <PricingFeatureHtml html={feature} />
                      </div>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleGetStarted(plan.name, plan.id)}
                  className={`w-full py-6 text-lg font-semibold rounded-full ${
                    plan.is_popular
                      ? "bg-[#FF0077] hover:bg-[#D60565] text-white"
                      : "bg-gray-900 hover:bg-gray-800 text-white"
                  }`}
                >
                  {plan.cta_text}
                </Button>
              </div>
            ))}
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
