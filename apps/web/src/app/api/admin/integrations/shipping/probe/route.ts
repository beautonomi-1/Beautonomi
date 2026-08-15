import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getShippingProvider, ShippingProviderNotConfiguredError } from "@beautonomi/shipping";
import { loadEcommerceShippingRuntime } from "@/lib/orders/shipping-secrets";

const bodySchema = z.object({
  provider: z.enum(["aramex", "courier-guy", "bob-go"]),
});

const SAMPLE = {
  origin: {
    name: "Beautonomi probe",
    line1: "1 Rivonia Road",
    city: "Sandton",
    postalCode: "2196",
    country: "ZA",
  },
  destination: {
    name: "Customer",
    line1: "1 Long Street",
    city: "Cape Town",
    postalCode: "8001",
    country: "ZA",
  },
  parcels: [
    {
      weightKg: 0.5,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
      description: "Admin connection probe",
    },
  ],
};

/**
 * POST /api/admin/integrations/shipping/probe
 * Live rate quote only — does not create a waybill.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Choose a courier to probe.", "VALIDATION_ERROR", 400);
    }
    const providerId = parsed.data.provider;
    const supabase = getSupabaseAdmin();
    const runtime = await loadEcommerceShippingRuntime(supabase);
    const courier = getShippingProvider(providerId, runtime.credentials);
    const quotes = await courier.quoteRates(SAMPLE);
    return successResponse({
      ok: true,
      provider: providerId,
      quotes: quotes.map((q) => ({
        service: q.service,
        amount: q.amount,
        currency: q.currency,
        etaDays: q.etaDays,
      })),
    });
  } catch (error) {
    if (error instanceof ShippingProviderNotConfiguredError) {
      return errorResponse(
        `Courier "${error.providerId}" is not configured.`,
        "NOT_CONFIGURED",
        400,
      );
    }
    return handleApiError(error, "Courier probe failed");
  }
}
