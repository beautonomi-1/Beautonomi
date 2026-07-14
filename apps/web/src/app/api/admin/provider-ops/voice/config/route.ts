import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  getCallsIntegrationConfig,
  isTwilioVoiceEnabled,
} from "@/lib/integrations/calls-config";

/**
 * GET /api/admin/provider-ops/voice/config
 * Availability for the in-browser dialer (provider-ops admins).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const status = await getCallsIntegrationConfig(supabase, tenantId);

    return successResponse({
      enabled: isTwilioVoiceEnabled(status),
      configured: status.twilioVoiceConfigured,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch voice config");
  }
}
