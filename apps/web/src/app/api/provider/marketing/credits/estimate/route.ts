import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMarketingBalance, priceFor } from "@/lib/marketing/credits";
import { resolveMarketingSendingContext } from "@/lib/marketing/sending-path";

const schema = z.object({
  channel: z.enum(["email", "sms", "whatsapp"]),
  recipients: z.coerce.number().int().min(1).max(100000),
});

/**
 * GET /api/provider/marketing/credits/estimate?channel=sms&recipients=100
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const parsed = schema.safeParse({
      channel: request.nextUrl.searchParams.get("channel"),
      recipients: request.nextUrl.searchParams.get("recipients"),
    });
    if (!parsed.success) {
      return handleApiError(parsed.error, "Invalid query", "VALIDATION_ERROR", 400);
    }

    const { channel, recipients } = parsed.data;
    const ctx = await resolveMarketingSendingContext(providerId, channel, supabase);
    const category = channel === "whatsapp" ? "marketing" : "default";
    const unitCost = ctx.debitsCredits ? await priceFor(supabase, channel, category) : 0;
    const estimatedCost = unitCost * recipients;
    const balance = await getMarketingBalance(supabase, providerId);
    const balanceAfter = balance.total_zar - estimatedCost;

    return successResponse({
      channel,
      recipients,
      unit_cost_zar: unitCost,
      estimated_cost_zar: estimatedCost,
      current_balance_zar: balance.total_zar,
      balance_after_zar: balanceAfter,
      sufficient: balanceAfter >= 0,
      debited_on_platform_path: ctx.debitsCredits,
      uses_platform_for_channel: ctx.usesPlatformForChannel,
      sending_mode: ctx.sendingMode,
    });
  } catch (error) {
    return handleApiError(error, "Failed to estimate marketing cost");
  }
}
