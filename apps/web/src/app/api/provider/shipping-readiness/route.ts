import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { computeShippingReadiness } from "@/lib/orders/shipping-readiness";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: configRow } = await (supabase.from("provider_shipping_config") as any)
      .select("offers_delivery, offers_collection, shipping_provider_preference")
      .eq("provider_id", providerId)
      .maybeSingle();

    const config = configRow ?? {
      offers_delivery: false,
      offers_collection: true,
      shipping_provider_preference: null,
    };

    const readiness = await computeShippingReadiness(getSupabaseAdmin(), providerId, config);
    return successResponse({ readiness, config });
  } catch (err) {
    return handleApiError(err, "Failed to compute shipping readiness");
  }
}
