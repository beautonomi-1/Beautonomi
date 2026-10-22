"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Check, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";
import { ONBOARDING_BTN_PRIMARY } from "./onboarding-styles";

const FEATURE_PREVIEW = 6;

type PublicPricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  features: string[];
  is_free?: boolean;
  currency?: string | null;
};

export type PlanSelectionData = {
  selected_plan_id?: string;
  no_plans_available?: boolean;
};

type Props = {
  data: Partial<PlanSelectionData>;
  updateData: (updates: Partial<PlanSelectionData>) => void;
};

function formatZeroPrice(currency: string | null | undefined): string {
  const c = (currency ?? "ZAR").toUpperCase();
  if (c === "ZAR") return "R0";
  if (c === "USD") return "$0";
  if (c === "GBP") return "£0";
  return `0 ${c}`;
}

function planDisplayPrice(plan: PublicPricingPlan, t: (k: string) => string): {
  main: string;
  caption: string | null;
} {
  const isFree = plan.is_free === true || /free/i.test(plan.price ?? "");
  if (isFree) {
    const period = plan.period?.trim() || "/ month";
    return {
      main: `${formatZeroPrice(plan.currency)} ${period}`,
      caption: t("web.provider.onboarding.plan.freeForever"),
    };
  }
  return { main: plan.price, caption: plan.period };
}

function sortPlansFreeFirst(plans: PublicPricingPlan[]): PublicPricingPlan[] {
  return [...plans].sort((a, b) => {
    const aFree = a.is_free ? 1 : 0;
    const bFree = b.is_free ? 1 : 0;
    if (aFree !== bFree) return bFree - aFree;
    return 0;
  });
}

export function Step14PlanSelection({ data, updateData }: Props) {
  const { t } = useTranslation();
  const [pricingPlans, setPricingPlans] = useState<PublicPricingPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const selectedPlanIdRef = useRef(data.selected_plan_id);
  selectedPlanIdRef.current = data.selected_plan_id;

  const loadPlans = useCallback(async () => {
    try {
      setIsLoadingPlans(true);
      setLoadError(false);
      const res = await fetcher.get<{ data: PublicPricingPlan[] }>("/api/public/pricing/plans");
      const raw = Array.isArray(res.data) ? res.data : [];
      const sorted = sortPlansFreeFirst(raw);
      setPricingPlans(sorted);
      const sel = selectedPlanIdRef.current;
      if (sel && !sorted.find((p) => p.id === sel)) {
        updateData({ selected_plan_id: undefined });
      }
      updateData({ no_plans_available: sorted.length === 0 });
    } catch (error) {
      console.error("Error loading pricing plans:", error);
      setLoadError(true);
      toast.error(t("web.provider.onboarding.toast.plansFailed"));
    } finally {
      setIsLoadingPlans(false);
    }
  }, [t, updateData]);

  useEffect(() => {
    void loadPlans();
    // Mount-only initial load; retry uses loadPlans() explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pricingPlans.length === 0) return;
    if (data.selected_plan_id?.trim()) return;
    const free = pricingPlans.find((p) => p.is_free);
    const popular = pricingPlans.find((p) => p.is_popular);
    const chosen = free ?? popular ?? pricingPlans[0];
    updateData({ selected_plan_id: chosen.id, no_plans_available: false });
  }, [pricingPlans, data.selected_plan_id, updateData]);

  const selectPlan = useCallback(
    (id: string) => updateData({ selected_plan_id: id, no_plans_available: false }),
    [updateData],
  );

  const onPlanKeyDown = useCallback(
    (e: KeyboardEvent, planId: string, index: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPlan(planId);
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
        return;
      }
      e.preventDefault();
      const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      const next = pricingPlans[index + delta];
      if (next) selectPlan(next.id);
    },
    [pricingPlans, selectPlan],
  );

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-6 py-5 shadow-sm sm:rounded-3xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary-hover" aria-hidden />
          <span className="text-sm font-medium text-slate-800">
            {t("web.provider.onboarding.review.loadingPlans")}
          </span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-12 text-center space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("web.provider.onboarding.toast.plansFailed")}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => void loadPlans()}>
          {t("web.provider.common.tryAgain")}
        </Button>
      </div>
    );
  }

  if (pricingPlans.length === 0) {
    return (
      <div className="py-12 text-center">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("web.provider.onboarding.plan.noPlansAvailable")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedPlan = pricingPlans.find((p) => p.id === data.selected_plan_id) ?? null;
  const selectedIsFree = selectedPlan?.is_free === true;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 text-center shadow-sm sm:rounded-3xl sm:p-8">
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t("web.provider.onboarding.plan.chooseYourPlan")}
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600 sm:mt-3 sm:text-base">
          {t("web.provider.onboarding.plan.planIntro")}
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6"
        role="radiogroup"
        aria-label={t("web.provider.onboarding.plan.planRadiogroupLabel")}
      >
        {pricingPlans.map((plan, index) => {
          const isSelected = data.selected_plan_id === plan.id;
          const planIsFree = plan.is_free === true;
          const priceBlock = planDisplayPrice(plan, t);
          const expanded = expandedPlanIds.has(plan.id);
          const visibleFeatures = expanded ? plan.features : plan.features.slice(0, FEATURE_PREVIEW);
          const hiddenCount = plan.features.length - FEATURE_PREVIEW;

          return (
            <div
              key={plan.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectPlan(plan.id)}
              onKeyDown={(e) => onPlanKeyDown(e, plan.id, index)}
              className={`relative flex cursor-pointer flex-col rounded-2xl border-2 p-5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 sm:rounded-3xl sm:p-7 ${
                isSelected
                  ? "border-primary bg-primary-soft/40 ring-2 ring-primary/25"
                  : plan.is_popular
                    ? "border-slate-300 bg-white hover:border-primary/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {isSelected ? (
                <div
                  className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary-hover text-white"
                  aria-hidden
                >
                  <Check className="h-4 w-4" />
                </div>
              ) : null}

              {plan.is_popular ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {t("web.provider.onboarding.plan.mostPopularLower")}
                  </span>
                </div>
              ) : null}

              <div className="mb-5 text-center sm:mb-6">
                <h4 className="text-xl font-bold text-slate-900">{plan.name}</h4>
                <div className="mb-1 mt-2 flex flex-col items-center">
                  <span className="text-3xl font-bold text-slate-900">{priceBlock.main}</span>
                  {priceBlock.caption ? (
                    <span className="text-xs font-medium text-slate-600">{priceBlock.caption}</span>
                  ) : null}
                </div>
                {plan.description ? (
                  <div className="text-sm text-slate-600 [&_a]:text-primary-hover [&_a]:underline [&_p]:m-0">
                    <PricingFeatureHtml html={plan.description} className="block leading-snug" />
                  </div>
                ) : null}
              </div>

              <ul className="mb-4 flex-1 space-y-2.5 sm:space-y-3">
                {visibleFeatures.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover sm:h-5 sm:w-5" aria-hidden />
                    <div className="min-w-0 flex-1 text-sm text-slate-800 [&_a]:text-primary-hover [&_a]:underline [&_p]:m-0">
                      <PricingFeatureHtml html={feature} className="block leading-snug" />
                    </div>
                  </li>
                ))}
              </ul>

              {plan.features.length > FEATURE_PREVIEW ? (
                <button
                  type="button"
                  className="mb-4 text-sm font-semibold text-primary-hover underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPlanIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(plan.id)) next.delete(plan.id);
                      else next.add(plan.id);
                      return next;
                    });
                  }}
                >
                  {expanded
                    ? t("web.provider.onboarding.plan.showLessFeatures")
                    : t("web.provider.onboarding.plan.showAllFeatures")}
                  {!expanded && hiddenCount > 0 ? ` (+${hiddenCount})` : ""}
                </button>
              ) : null}

              <div
                className={`mb-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                  planIsFree ? "bg-emerald-50 text-emerald-800" : "bg-primary-soft text-primary-hover"
                }`}
              >
                {planIsFree ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    <span>{t("web.provider.onboarding.plan.activatesInstantly")}</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    <span>{t("web.provider.onboarding.plan.securePayment")}</span>
                  </>
                )}
              </div>

              <div
                className={`mt-auto flex h-11 w-full items-center justify-center rounded-2xl ${
                  isSelected ? ONBOARDING_BTN_PRIMARY : "bg-slate-100 text-slate-700"
                }`}
              >
                {isSelected ? (
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" aria-hidden />
                    <span className="font-semibold">{t("web.provider.onboarding.plan.selected")}</span>
                  </div>
                ) : (
                  <span className="font-semibold">{t("web.provider.onboarding.plan.selectPlan")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.selected_plan_id && selectedPlan ? (
        <Alert
          className={`rounded-2xl sm:rounded-3xl ${
            selectedIsFree ? "border-emerald-200 bg-emerald-50" : "border-primary/25 bg-primary-soft/50"
          }`}
        >
          <Check className={`h-4 w-4 ${selectedIsFree ? "text-emerald-800" : "text-primary-hover"}`} />
          <AlertDescription
            className={`text-sm leading-relaxed ${selectedIsFree ? "text-emerald-950" : "text-slate-900"}`}
          >
            {selectedIsFree
              ? t("web.provider.onboarding.plan.summaryFree", { name: selectedPlan.name })
              : t("web.provider.onboarding.plan.summaryPaid")}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="rounded-2xl border-slate-200 bg-slate-50 sm:rounded-3xl">
          <AlertCircle className="h-4 w-4 text-slate-700" />
          <AlertDescription className="text-sm leading-relaxed text-slate-800">
            {t("web.provider.onboarding.plan.selectPlanToContinue")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
