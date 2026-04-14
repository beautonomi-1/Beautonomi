import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getWasenderConfig, checkNumberOnWhatsApp, normalizePhoneForWasender } from "@/lib/whatsapp/wasender-client";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const phoneE164 = body.phone_e164?.trim();
    const leadId = body.lead_id;

    if (!phoneE164) return errorResponse("phone_e164 is required", "VALIDATION_ERROR", 400);

    const rl = checkRateLimit(tenantId, "whatsapp-verify");
    if (!rl.allowed) {
      return errorResponse(
        `Rate limited. Try again in ${rl.retryAfter ?? 60}s`,
        "RATE_LIMITED",
        429,
      );
    }

    const { data: cached } = await supabase
      .from("whatsapp_number_checks")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    const cachedRow = cached as { checked_at?: string; check_status?: string; is_on_whatsapp?: boolean } | null;

    if (cachedRow?.checked_at) {
      const cacheAge = Date.now() - new Date(cachedRow.checked_at).getTime();
      if (cacheAge < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return successResponse({
          phone_e164: phoneE164,
          check_status: cachedRow.check_status,
          is_on_whatsapp: cachedRow.is_on_whatsapp,
          cached: true,
          checked_at: cachedRow.checked_at,
        });
      }
    }

    const config = await getWasenderConfig(tenantId);
    if (!config) return errorResponse("WasenderAPI not configured", "NOT_CONFIGURED", 400);

    // Need a connected session for number verification
    const { data: sessions } = await supabase
      .from("whatsapp_sessions")
      .select("wasender_session_id")
      .eq("tenant_id", tenantId)
      .eq("status", "connected")
      .eq("is_active", true)
      .limit(1);

    const firstSession = (sessions as any[])?.[0];
    if (!firstSession) {
      return errorResponse("No connected WhatsApp session available", "NO_SESSION", 400);
    }

    let checkStatus: string;
    let isOnWhatsApp: boolean | null = null;

    try {
      const result = await checkNumberOnWhatsApp(
        config.baseUrl,
        config.pat,
        normalizePhoneForWasender(phoneE164),
      );
      isOnWhatsApp = result.exists;
      checkStatus = result.exists ? "verified" : "not_found";
    } catch {
      checkStatus = "failed";
    }

    await supabase.from("whatsapp_number_checks").upsert(
      {
        tenant_id: tenantId,
        phone_e164: phoneE164,
        is_on_whatsapp: isOnWhatsApp,
        check_status: checkStatus,
        checked_at: new Date().toISOString(),
        checked_by: user.id,
      },
      { onConflict: "tenant_id,phone_e164" },
    );

    if (leadId) {
      await supabase
        .from("provider_leads")
        .update({
          whatsapp_status: checkStatus,
          whatsapp_checked_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .eq("tenant_id", tenantId);
    }

    return successResponse({
      phone_e164: phoneE164,
      check_status: checkStatus,
      is_on_whatsapp: isOnWhatsApp,
      cached: false,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify number");
  }
}
