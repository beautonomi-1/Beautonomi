import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy } from "@/lib/bookings/cancellation-policy";

/**
 * GET /api/public/cancellation-policy
 *
 * Returns the cancellation policy for a provider, enriched with the provider's
 * no-show fee settings and currency so the shape matches the hold API response.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get("provider_id");
    const locationType = (searchParams.get("location_type") as "at_salon" | "at_home" | null) || "at_salon";

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

    const [policy, providerResult] = await Promise.all([
      getCancellationPolicy(supabaseAdmin, providerId, locationType),
      supabaseAdmin
        .from("providers")
        .select("currency, no_show_fee_enabled, no_show_fee_amount")
        .eq("id", providerId)
        .maybeSingle(),
    ]);

    const provider = providerResult.data as {
      currency?: string | null;
      no_show_fee_enabled?: boolean | null;
      no_show_fee_amount?: number | null;
    } | null;

    if (!policy) {
      return successResponse([]);
    }

    return successResponse([
      {
        ...policy,
        no_show_fee_enabled: Boolean(provider?.no_show_fee_enabled),
        no_show_fee_amount:
          provider?.no_show_fee_enabled && provider?.no_show_fee_amount != null
            ? Number(provider.no_show_fee_amount)
            : null,
        currency: provider?.currency ?? null,
      },
    ]);
  } catch (error) {
    return handleApiError(error, "CANCELLATION_POLICY_ERROR", 500);
  }
}
