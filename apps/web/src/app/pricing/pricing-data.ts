import { getSupabasePublicAnon } from "@/lib/supabase/public-anon";
import { headers } from "next/headers";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

export type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  features: string[];
  /** Display currency label for the card (e.g. ZAR), from pricing_plans.currency */
  currency: string | null;
  /** Linked subscription plan id — lets signed-in providers see Current/Upgrade context. */
  subscriptionPlanId: string | null;
};

export type PricingFAQ = {
  id: string;
  question: string;
  answer: string;
};

export type PricingPageContent = {
  heroTitle: string;
  heroDescription: string;
  /** Optional footnote under the hero (e.g. "All prices in South African Rand") — Admin → Content → pricing → currency_note */
  currencyNote: string | null;
};

export async function getPricingPageData(): Promise<{
  plans: PricingPlan[];
  faqs: PricingFAQ[];
  pageContent: PricingPageContent;
}> {
  const fallbackContent: PricingPageContent = {
    heroTitle: "Simple, transparent pricing",
    heroDescription:
      "Choose the plan that fits your team. Edit this line in Admin → Content → slug \"pricing\" → section hero_description.",
    currencyNote: null,
  };

  try {
    const supabase = getSupabasePublicAnon();
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    const req = new Request("https://tenant-resolve.local/", { headers: { host } });
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?.id ?? "";

    const [plansScoped, faqsScoped, contentScoped] = await Promise.all([
      fetchScopedListMerged<Record<string, any>>({
        supabase,
        table: "pricing_plans",
        tenantId,
        select: "*",
        apply: (q) => q.eq("is_active", true),
        dedupeKey: (row) => String(row.name ?? row.id ?? ""),
        orderBy: { column: "display_order", ascending: true },
      }),
      fetchScopedListMerged<Record<string, any>>({
        supabase,
        table: "pricing_faqs",
        tenantId,
        select: "*",
        apply: (q) => q.eq("is_active", true),
        dedupeKey: (row) => String(row.question ?? row.id ?? ""),
        orderBy: { column: "display_order", ascending: true },
      }),
      fetchScopedListMerged<Record<string, any>>({
        supabase,
        table: "page_content",
        tenantId,
        select: "section_key, content",
        apply: (q) =>
          q.eq("page_slug", "pricing").eq("is_active", true).in("section_key", [
            "hero_title",
            "hero_description",
            "currency_note",
          ]),
        dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      }),
    ]);

    const plans = plansScoped.data || [];
    const faqs =
      faqsScoped.data?.map((faq) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
      })) || [];

    const pageContent = { ...fallbackContent };
    for (const item of contentScoped.data || []) {
      if (item.section_key === "hero_title") pageContent.heroTitle = item.content;
      if (item.section_key === "hero_description") pageContent.heroDescription = item.content;
      if (item.section_key === "currency_note") pageContent.currencyNote = item.content?.trim() || null;
    }

    const planIds = plans.map((p) => p.id);
    const featuresMap = new Map<string, string[]>();
    if (planIds.length > 0) {
      const { data: features } = await supabase
        .from("pricing_plan_features")
        .select("plan_id, feature_text")
        .in("plan_id", planIds)
        .order("display_order", { ascending: true });
      for (const f of features || []) {
        const arr = featuresMap.get(f.plan_id) || [];
        arr.push(f.feature_text);
        featuresMap.set(f.plan_id, arr);
      }
    }

    const normalizedPlans: PricingPlan[] = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      period: plan.period,
      description: plan.description,
      cta_text: plan.cta_text,
      is_popular: plan.is_popular,
      features: featuresMap.get(plan.id) || [],
      currency: (plan.currency as string | null | undefined) ?? null,
      subscriptionPlanId: (plan.subscription_plan_id as string | null | undefined) ?? null,
    }));

    // Canonical tier order for the public page: Free first, then ascending
    // monthly price (e.g. Free → Growth → Scale), with "Contact sales"-style
    // plans (no numeric price) last. Array.sort is stable, so plans that tie
    // on rank keep their admin-defined display_order. This guarantees a
    // logical price progression even if display_order values are stale.
    const priceRank = (plan: PricingPlan): number => {
      const raw = (plan.price ?? "").toLowerCase().trim();
      if (!raw || raw.includes("free")) return 0;
      const digits = raw.replace(/[^0-9.]/g, "");
      if (!digits) return Number.MAX_SAFE_INTEGER;
      const value = parseFloat(digits);
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    };
    const orderedPlans = [...normalizedPlans].sort(
      (a, b) => priceRank(a) - priceRank(b),
    );

    return { plans: orderedPlans, faqs, pageContent };
  } catch (error) {
    console.error("Failed to load pricing page data:", error);
    return { plans: [], faqs: [], pageContent: fallbackContent };
  }
}
