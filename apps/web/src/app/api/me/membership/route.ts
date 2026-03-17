import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/membership
 *
 * Returns the current user's active memberships:
 * - membership: platform membership (customer_memberships + memberships) if any
 * - provider_memberships: active salon/provider plans (user_memberships + membership_plans)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    // 1) Platform membership (customer_memberships + memberships)
    const { data: activeRows, error: cmError } = await supabase
      .from("customer_memberships")
      .select(
        `
        id,
        status,
        started_at,
        expires_at,
        auto_renew,
        membership:memberships(id, name, description, price, currency, billing_period)
      `
      )
      .eq("customer_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false });

    let hasPlatformMembership = false;
    let membership: {
      id: string;
      name: string;
      description?: string;
      billing_cycle: string;
      expires_at: string | null;
      auto_renew: boolean;
    } | null = null;
    let benefits: { name: string; description?: string }[] = [];

    if (!cmError && activeRows && activeRows.length > 0) {
      const first = activeRows[0] as any;
      const plan = first?.membership;
      if (first && plan) {
        hasPlatformMembership = true;
        try {
          const { data: benefitRows } = await supabase
            .from("membership_benefits")
            .select("benefit_name, benefit_description")
            .eq("membership_id", plan.id)
            .eq("is_active", true)
            .order("display_order");
          benefits = (benefitRows || []).map((b: any) => ({
            name: b.benefit_name,
            description: b.benefit_description ?? undefined,
          }));
        } catch {
          // ignore
        }
        membership = {
          id: first.id,
          name: plan.name,
          description: plan.description ?? undefined,
          billing_cycle: plan.billing_period === "yearly" ? "yearly" : "monthly",
          expires_at: first.expires_at ?? null,
          auto_renew: first.auto_renew !== false,
        };
      }
    }

    // 2) Salon/provider memberships (user_memberships + membership_plans + providers)
    const { data: umRows, error: umError } = await (supabase
      .from("user_memberships") as any)
      .select(
        `
        id,
        provider_id,
        plan_id,
        status,
        started_at,
        expires_at,
        plan:membership_plans(id, name, description, price_monthly, currency, discount_percent),
        provider:providers(id, business_name, slug)
      `
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false, nullsFirst: false });

    const provider_memberships: {
      id: string;
      provider_id: string;
      provider_name: string;
      provider_slug: string | null;
      plan_id: string;
      plan_name: string;
      plan_description: string | null;
      discount_percent: number;
      price_monthly: number;
      currency: string;
      expires_at: string | null;
      started_at: string;
    }[] = [];

    if (!umError && umRows && Array.isArray(umRows)) {
      for (const row of umRows as any[]) {
        const plan = row.plan;
        const provider = row.provider;
        if (plan && provider) {
          provider_memberships.push({
            id: row.id,
            provider_id: row.provider_id,
            provider_name: (provider.business_name || "Provider").trim(),
            provider_slug: provider.slug ?? null,
            plan_id: row.plan_id,
            plan_name: (plan.name || "Plan").trim(),
            plan_description: plan.description ?? null,
            discount_percent: Number(plan.discount_percent ?? 0),
            price_monthly: Number(plan.price_monthly ?? 0),
            currency: plan.currency || "ZAR",
            expires_at: row.expires_at ?? null,
            started_at: row.started_at || new Date().toISOString(),
          });
        }
      }
    }

    return successResponse({
      has_membership: hasPlatformMembership,
      membership,
      benefits,
      savings: { this_month: 0, lifetime: 0 },
      provider_memberships,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership");
  }
}
