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
      "Choose the plan that's right for your business. All plans include a 14-day free trial.",
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
    }));

    return { plans: normalizedPlans, faqs, pageContent };
  } catch (error) {
    console.error("Failed to load pricing page data:", error);
    return { plans: [], faqs: [], pageContent: fallbackContent };
  }
}
