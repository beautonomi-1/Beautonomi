import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/membership/cancel
 * Cancel active membership
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { cancellation_reason } = body;

    // Get active membership
    const { data: customerMembership, error: fetchError } = await supabase
      .from("customer_memberships")
      .select("*")
      .eq("customer_id", user.id)
      .eq("status", "active")
      .single();

    if (fetchError || !customerMembership) {
      return badRequestResponse("No active membership found");
    }

    // Cancel membership (keep active until expiry date, but set auto_renew to false)
    const { data: updatedMembership, error: updateError } = await supabase
      .from("customer_memberships")
      .update({
        auto_renew: false,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellation_reason || null,
      })
      .eq("id", customerMembership.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse({
      customer_membership: updatedMembership,
      message: "Membership cancelled. You can continue using benefits until expiry date.",
    });

  } catch (error) {
    return handleApiError(error, "Failed to cancel membership");
  }
}
