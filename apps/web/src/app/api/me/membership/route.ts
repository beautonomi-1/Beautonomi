import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/membership
 *
 * Returns the current user's active membership (if any) and benefits.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

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

    if (cmError) {
      return successResponse({
        has_membership: false,
        membership: null,
        benefits: [],
        savings: { this_month: 0, lifetime: 0 },
      });
    }

    const first = activeRows?.[0] as any;
    const plan = first?.membership;

    if (!first || !plan) {
      return successResponse({
        has_membership: false,
        membership: null,
        benefits: [],
        savings: { this_month: 0, lifetime: 0 },
      });
    }

    let benefits: { name: string; description?: string }[] = [];
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

    const membership = {
      id: first.id,
      name: plan.name,
      description: plan.description ?? undefined,
      billing_cycle: plan.billing_period === "yearly" ? "yearly" : "monthly",
      expires_at: first.expires_at,
      auto_renew: first.auto_renew !== false,
    };

    return successResponse({
      has_membership: true,
      membership,
      benefits,
      savings: { this_month: 0, lifetime: 0 },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership");
  }
}
