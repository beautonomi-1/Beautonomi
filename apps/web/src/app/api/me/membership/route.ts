import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/membership
 * Get current user's active membership and benefits
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active membership
    const { data: customerMembership, error: membershipError } = await supabase
      .from("customer_memberships")
      .select(`
        *,
        membership:memberships (
          id,
          name,
          description,
          price,
          billing_cycle,
          discount_percentage,
          discount_type,
          is_active
        )
      `)
      .eq("customer_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      throw membershipError;
    }

    if (!customerMembership) {
      return successResponse({
        has_membership: false,
        membership: null,
        benefits: [],
      });
    }

    // Get membership benefits
    const { data: benefits, error: benefitsError } = await supabase
      .from("membership_benefits")
      .select("*")
      .eq("membership_id", customerMembership.membership.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (benefitsError) {
      throw benefitsError;
    }

    // Calculate savings (from bookings with membership discount)
    const { data: savingsData } = await supabase
      .from("bookings")
      .select("membership_discount_amount")
      .eq("customer_id", user.id)
      .eq("membership_id", customerMembership.membership.id)
      .gte("created_at", customerMembership.started_at);

    const lifetime_savings = savingsData?.reduce((sum, b) => sum + (b.membership_discount_amount || 0), 0) || 0;
    
    // This month's savings
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    
    const { data: monthSavingsData } = await supabase
      .from("bookings")
      .select("membership_discount_amount")
      .eq("customer_id", user.id)
      .eq("membership_id", customerMembership.membership.id)
      .gte("created_at", thisMonthStart.toISOString());

    const month_savings = monthSavingsData?.reduce((sum, b) => sum + (b.membership_discount_amount || 0), 0) || 0;

    return successResponse({
      has_membership: true,
      membership: {
        id: customerMembership.id,
        membership_id: customerMembership.membership.id,
        name: customerMembership.membership.name,
        description: customerMembership.membership.description,
        price: customerMembership.membership.price,
        billing_cycle: customerMembership.membership.billing_cycle,
        discount_percentage: customerMembership.membership.discount_percentage,
        discount_type: customerMembership.membership.discount_type,
        status: customerMembership.status,
        started_at: customerMembership.started_at,
        expires_at: customerMembership.expires_at,
        auto_renew: customerMembership.auto_renew,
        member_since: customerMembership.started_at,
      },
      benefits: benefits?.map(b => ({
        type: b.benefit_type,
        name: b.benefit_name,
        description: b.benefit_description,
        value: b.benefit_value,
      })) || [],
      savings: {
        this_month: month_savings,
        lifetime: lifetime_savings,
      },
    });

  } catch (error) {
    return handleApiError(error, "Failed to fetch membership");
  }
}
