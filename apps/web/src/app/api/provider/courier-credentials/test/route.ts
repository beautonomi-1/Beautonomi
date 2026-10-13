import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isProviderOwner } from "@/lib/auth/permissions";
import { quoteRatesForProvider } from "@/lib/orders/shipping";
import { markProviderCourierVerified } from "@/lib/orders/provider-shipping-credentials";
import type { ShippingProviderId } from "@beautonomi/shipping";

const bodySchema = z.object({
  courier: z.enum(["aramex", "courier-guy", "bob-go"]).optional(),
  destination: z
    .object({
      line1: z.string().trim().min(1).default("1 Test Street"),
      city: z.string().trim().min(1).default("Cape Town"),
      postalCode: z.string().trim().min(1).default("8001"),
      country: z.string().trim().default("ZA"),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const owner = await isProviderOwner(user.id, request);
    if (!owner) {
      return errorResponse("Only the business owner can test courier credentials", "FORBIDDEN", 403);
    }

    const parsed = bodySchema.parse(await request.json().catch(() => ({})));

    const { data: config } = await (supabase.from("provider_shipping_config") as any)
      .select("shipping_provider_preference")
      .eq("provider_id", providerId)
      .maybeSingle();

    const courier = (parsed.courier ??
      (config as { shipping_provider_preference?: ShippingProviderId | null } | null)
        ?.shipping_provider_preference) as ShippingProviderId | null | undefined;

    if (!courier) {
      return errorResponse("Select a courier preference before testing.", "VALIDATION_ERROR", 400);
    }

    const dest = parsed.destination ?? {
      line1: "1 Test Street",
      city: "Cape Town",
      postalCode: "8001",
      country: "ZA",
    };

    const result = await quoteRatesForProvider(
      supabase,
      providerId,
      {
        name: "Test customer",
        line1: dest.line1,
        city: dest.city,
        postalCode: dest.postalCode,
        country: dest.country,
      },
      { preferenceOverride: courier },
    );

    if (result.ok && !result.skipped && !result.error) {
      await markProviderCourierVerified(getSupabaseAdmin(), providerId, courier);
    }

    return successResponse({ result, verified: Boolean(result.ok && !result.skipped && !result.error) });
  } catch (err) {
    return handleApiError(err, "Failed to test courier connection");
  }
}
