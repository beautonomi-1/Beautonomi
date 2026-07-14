import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  generateTwilioVoiceAccessToken,
  resolveTwilioVoiceCredentials,
} from "@/lib/integrations/twilio";
import {
  getCallsIntegrationConfig,
  isTwilioVoiceEnabled,
} from "@/lib/integrations/calls-config";

const TOKEN_TTL_SECONDS = 3600;

/**
 * POST /api/admin/provider-ops/voice/token
 * Issue a Twilio Voice SDK access token for the authenticated admin.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const callsStatus = await getCallsIntegrationConfig(supabase, tenantId);
    if (!isTwilioVoiceEnabled(callsStatus)) {
      return errorResponse(
        "Twilio Voice is disabled. A superadmin can enable it under Admin → Integrations → Calls.",
        "VOICE_DISABLED",
        403,
      );
    }

    const creds = await resolveTwilioVoiceCredentials(supabase, tenantId);
    if (!creds) {
      return errorResponse(
        "Twilio Voice not configured. Add API key, TwiML app, and voice from-number in Admin → Integrations → Calls.",
        "CONFIGURATION_ERROR",
        503,
      );
    }

    const token = generateTwilioVoiceAccessToken(creds, user.id, TOKEN_TTL_SECONDS);

    return successResponse({
      token,
      identity: user.id,
      expires_in: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    return handleApiError(error, "Failed to issue voice token");
  }
}
