import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const DEFAULT_SETTINGS = {
  stall_threshold_hours: 24,
  dropoff_threshold_hours: 168,
  auto_assign_enabled: false,
  auto_sms_on_stall: false,
  sla_contact_stalled_hours: 4,
  sla_contact_dropped_hours: 24,
};

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const allSettings = (settings?.settings as Record<string, unknown>) || {};
    const opsSettings = (allSettings.provider_ops as Record<string, unknown>) || {};

    return successResponse({
      ...DEFAULT_SETTINGS,
      ...opsSettings,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch settings");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingSettings =
      (existing?.settings as Record<string, unknown>) || {};
    const existingOps =
      (existingSettings.provider_ops as Record<string, unknown>) || {};

    const updatedOps = { ...existingOps, ...body };
    const updatedSettings = { ...existingSettings, provider_ops: updatedOps };

    if (existing) {
      const { error: updateErr } = await supabase
        .from("platform_settings")
        .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from("platform_settings")
        .insert({
          tenant_id: tenantId,
          settings: updatedSettings,
          is_active: true,
        });
      if (insertErr) throw insertErr;
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.settings.update",
      entity_type: "platform_settings",
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      changed_fields: Object.keys(body),
      ...extractRequestMeta(request),
    });

    return successResponse({ ...DEFAULT_SETTINGS, ...updatedOps });
  } catch (error) {
    return handleApiError(error, "Failed to update settings");
  }
}
