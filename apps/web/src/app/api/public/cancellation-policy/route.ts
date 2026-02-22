import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get("provider_id");
    const locationType = searchParams.get("location_type"); // 'at_salon' or 'at_home' or null

    if (!providerId) {
      return handleApiError(
        new Error("provider_id is required"),
        "MISSING_PROVIDER_ID",
        400
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // First try to get policy for specific location type if provided
    let query = supabaseAdmin
      .from("cancellation_policies")
      .select("*")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (locationType) {
      query = query.or(`location_type.eq.${locationType},location_type.is.null`);
    } else {
      query = query.is("location_type", null);
    }

    const { data: policies, error } = await query.order("location_type", { ascending: false }); // null last

    if (error) {
      return handleApiError(
        new Error("Failed to fetch cancellation policy"),
        "CANCELLATION_POLICY_FETCH_ERROR",
        500
      );
    }

    // Return the first matching policy (specific location type takes precedence)
    if (policies && policies.length > 0) {
      return successResponse([policies[0]]);
    }

    // If no policy found, return default policy
    return successResponse([{
      policy_text: "Cancellations must be made at least 24 hours before your appointment. Cancellations made within 24 hours may be subject to a cancellation fee.",
      hours_before_cutoff: 24,
      late_cancellation_type: "no_refund",
      location_type: null,
    }]);
  } catch (error) {
    return handleApiError(error, "CANCELLATION_POLICY_ERROR", 500);
  }
}
