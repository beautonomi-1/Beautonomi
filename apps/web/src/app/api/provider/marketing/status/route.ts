import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkMarketingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { getMarketingBalance } from "@/lib/marketing/credits";
import { resolveMarketingSendingContext } from "@/lib/marketing/sending-path";

/**
 * GET /api/provider/marketing/status
 * Platform sending mode, credit balance, and integration hints.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const marketingAccess = await checkMarketingFeatureAccess(providerId, supabase);
    const balance = await getMarketingBalance(supabase, providerId);
    const ctx = await resolveMarketingSendingContext(providerId, null, supabase);

    return successResponse({
      use_platform_credentials: marketingAccess.usePlatformCredentials,
      custom_integrations: marketingAccess.customIntegrations,
      marketing_enabled: marketingAccess.enabled,
      channels: marketingAccess.channels,
      balance,
      has_own_twilio: ctx.integrations.hasOwnTwilioSms || ctx.integrations.hasOwnTwilioWhatsapp,
      has_own_email: ctx.integrations.hasOwnEmail,
      sending_mode: ctx.sendingMode,
      platform_available: marketingAccess.usePlatformCredentials,
      credits_apply_on: marketingAccess.usePlatformCredentials
        ? ["email", "sms", "whatsapp"].filter(
            (ch) =>
              marketingAccess.channels.includes(ch) &&
              !(
                (ch === "email" && ctx.integrations.hasOwnEmail) ||
                (ch === "sms" && ctx.integrations.hasOwnTwilioSms) ||
                (ch === "whatsapp" && ctx.integrations.hasOwnTwilioWhatsapp)
              ),
          )
        : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch marketing status");
  }
}
