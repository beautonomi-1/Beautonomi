import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/cancellation-policy
 *
 * Returns the cancellation policy for a provider, enriched with the provider's
 * no-show fee settings and currency so the shape matches the hold API response.
 * This ensures the no-show fee line is visible on the express-booking review step
 * (StepReview) and legacy payment step before a hold is created.
 */
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

    // Fetch cancellation policy and provider no-show / currency in parallel
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

    const [policyResult, providerResult] = await Promise.all([
      query
        .order("location_type", { ascending: false }) // specific location first
        .order("is_default", { ascending: false })    // default policy first
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("providers")
        .select("currency, no_show_fee_enabled, no_show_fee_amount")
        .eq("id", providerId)
        .maybeSingle(),
    ]);

    if (policyResult.error) {
      return handleApiError(
        new Error("Failed to fetch cancellation policy"),
        "CANCELLATION_POLICY_FETCH_ERROR",
        500
      );
    }

    const provider = providerResult.data as {
      currency?: string | null;
      no_show_fee_enabled?: boolean | null;
      no_show_fee_amount?: number | null;
    } | null;

    // Merge provider no-show / currency into the policy row so the response
    // shape matches what the booking-holds API returns — enabling StepReview
    // and step-payment to show no-show fee before the hold is created.
    const enrich = (policy: Record<string, unknown>) => ({
      ...policy,
      no_show_fee_enabled: Boolean(provider?.no_show_fee_enabled),
      no_show_fee_amount:
        provider?.no_show_fee_enabled && provider?.no_show_fee_amount != null
          ? Number(provider.no_show_fee_amount)
          : null,
      currency: (policy.currency as string | null) ?? provider?.currency ?? null,
    });

    if (policyResult.data && policyResult.data.length > 0) {
      return successResponse([enrich(policyResult.data[0] as Record<string, unknown>)]);
    }

    // No configured policy — return canonical default (24h cutoff, 15min grace, no refund)
    return successResponse([
      enrich({
        policy_text:
          "Cancellations must be made at least 24 hours before your appointment. Late cancellations are non-refundable.",
        hours_before_cutoff: 24,
        grace_window_minutes: 15,
        late_cancellation_type: "no_refund",
        refund_percentage: 0,
        location_type: null,
      }),
    ]);
  } catch (error) {
    return handleApiError(error, "CANCELLATION_POLICY_ERROR", 500);
  }
}
