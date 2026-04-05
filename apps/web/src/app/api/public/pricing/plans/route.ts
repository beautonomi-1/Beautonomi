import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/public/pricing/plans
 *
 * Active pricing plans with feature lines for marketing / native onboarding.
 * Does not expose Paystack plan codes.
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    const scopedPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "pricing_plans",
      tenantId,
      select: "id, name, price, period, description, cta_text, is_popular, display_order",
      apply: (q) => q.eq("is_active", true),
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const plans = scopedPlans.data as Array<{ id: string; name: string; price: string; period: string | null; description: string | null; cta_text: string; is_popular: boolean; display_order: number }>;

    if (!plans?.length) {
      return NextResponse.json({ data: [] });
    }

    const withFeatures = await Promise.all(
      plans.map(async (plan) => {
        const { data: features } = await supabase
          .from("pricing_plan_features")
          .select("feature_text")
          .eq("plan_id", plan.id)
          .order("display_order", { ascending: true });

        return {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          period: plan.period,
          description: plan.description,
          cta_text: plan.cta_text,
          is_popular: plan.is_popular,
          features: features?.map((f) => f.feature_text).filter(Boolean) ?? [],
        };
      }),
    );

    return NextResponse.json({ data: withFeatures });
  } catch (e) {
    console.error("GET /api/public/pricing/plans:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
