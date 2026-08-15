import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { quoteRatesForProvider } from "@/lib/orders/shipping";

const bodySchema = z.object({
  destination: z.object({
    name: z.string().trim().min(1).optional(),
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    region: z.string().trim().optional(),
    postalCode: z.string().trim().min(1),
    country: z.string().trim().min(2).max(56).optional(),
  }),
});

/**
 * POST /api/provider/shipping-quotes
 * Live courier rates for a destination using the provider's selected courier.
 * Customer checkout still uses configured delivery fees — this is booking cost, not buyer price.
 * @tenant-hint scoped by provider_id from getProviderIdForUser
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Enter a delivery address with line 1, city, and postal code.", "VALIDATION_ERROR", 400);
    }

    const dest = parsed.data.destination;
    const result = await quoteRatesForProvider(supabase, providerId, {
      name: dest.name ?? "Customer",
      line1: dest.line1,
      line2: dest.line2,
      city: dest.city,
      region: dest.region,
      postalCode: dest.postalCode,
      country: dest.country ?? "ZA",
    });
    return successResponse(result);
  } catch (err) {
    return handleApiError(err, "Failed to quote shipping rates");
  }
}
