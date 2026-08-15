import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";
import { signApplePromotionalOffer } from "@/lib/iap/apple/promotional-offer";

const querySchema = z.object({
  product_id: z.string().min(3),
  offer_id: z.string().min(1),
});

/**
 * GET /api/provider/iap/offer-signature
 * Server signature for a StoreKit promotional offer (DiscountOfferInputIOS).
 * Introductory offers apply in StoreKit without this. Win-back offers are
 * presented by the App Store, not signed with this payload.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const parsed = querySchema.safeParse({
      product_id: request.nextUrl.searchParams.get("product_id") ?? "",
      offer_id: request.nextUrl.searchParams.get("offer_id") ?? "",
    });
    if (!parsed.success) {
      return errorResponse("product_id and offer_id are required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const config = await loadAppleIapConfig(supabase);
    if (!config) {
      return errorResponse("Apple in-app purchases are not configured", "IAP_NOT_CONFIGURED", 503);
    }

    const signature = signApplePromotionalOffer(config, {
      productId: parsed.data.product_id,
      offerId: parsed.data.offer_id,
      appAccountToken: providerId,
    });

    return successResponse({ offer: signature, provider_id: providerId });
  } catch (error) {
    return handleApiError(error);
  }
}
