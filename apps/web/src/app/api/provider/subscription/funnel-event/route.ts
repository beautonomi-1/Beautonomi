import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import {
  trackProviderCheckoutFunnel,
  type ProviderCheckoutFunnelEvent,
} from "@/lib/analytics/provider-subscription-funnel";

const bodySchema = z.object({
  event: z.enum([
    "provider_checkout_plan_selected",
    "provider_checkout_started",
    "provider_checkout_completed",
    "provider_checkout_abandoned",
  ]),
  properties: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/provider/subscription/funnel-event
 * Client-side checkout funnel events (e.g. abandon on return from hosted checkout).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const body = bodySchema.parse(await request.json());
    trackProviderCheckoutFunnel(
      body.event as ProviderCheckoutFunnelEvent,
      body.properties ?? {},
      user.id,
    );
    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((i) => i.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to record funnel event");
  }
}
