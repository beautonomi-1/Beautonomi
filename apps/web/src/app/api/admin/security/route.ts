import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const DEFAULTS = {
  password_policy: {
    min_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_special_chars: false,
    max_age_days: 90,
  },
  two_factor: {
    enabled: false,
    required_for_admins: false,
  },
  rate_limiting: {
    enabled: true,
    max_attempts: 5,
    window_minutes: 15,
    lockout_minutes: 30,
  },
  data_retention: {
    enabled: false,
    retention_days: 365,
    auto_delete_inactive_accounts: false,
    inactive_threshold_days: 730,
  },
};

/**
 * GET /api/admin/security
 * Returns security policy settings from platform_settings.settings.security
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { data: row, error } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const settings = (row as { settings?: Record<string, unknown> } | null)?.settings ?? {};
    const security = (settings.security as Record<string, unknown>) ?? {};
    const merged = {
      password_policy: { ...DEFAULTS.password_policy, ...(security.password_policy as object) },
      two_factor: { ...DEFAULTS.two_factor, ...(security.two_factor as object) },
      rate_limiting: { ...DEFAULTS.rate_limiting, ...(security.rate_limiting as object) },
      data_retention: { ...DEFAULTS.data_retention, ...(security.data_retention as object) },
    };

    return successResponse(merged);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/admin/security
 * Updates platform_settings.settings.security (superadmin only)
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], req);
    const supabase = await getSupabaseServer(req);
    const body = await req.json();

    const { data: row, error: fetchError } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let rowId: string;
    let currentSettings: Record<string, unknown>;

    if (row) {
      rowId = (row as { id: string }).id;
      currentSettings = (row as { settings?: Record<string, unknown> }).settings ?? {};
    } else {
      // No active row: create one so security settings can be stored
      const { data: inserted, error: insertError } = await supabase
        .from("platform_settings")
        .insert({ settings: { security: {} }, is_active: true })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError || new Error("Failed to create platform settings row");
      rowId = (inserted as { id: string }).id;
      currentSettings = {};
    }

    const currentSecurity = (currentSettings.security as Record<string, unknown>) ?? {};
    const updatedSecurity = {
      ...currentSecurity,
      password_policy: body.password_policy ?? currentSecurity.password_policy,
      two_factor: body.two_factor ?? currentSecurity.two_factor,
      rate_limiting: body.rate_limiting ?? currentSecurity.rate_limiting,
      data_retention: body.data_retention ?? currentSecurity.data_retention,
    };
    const updatedSettings = {
      ...currentSettings,
      security: updatedSecurity,
    };

    const { error: updateError } = await supabase
      .from("platform_settings")
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);

    if (updateError) throw updateError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "security_settings_updated",
      entity_type: "platform_settings",
      metadata: { updated_fields: Object.keys(body) },
    });

    return successResponse({ message: "Security settings updated" });
  } catch (error) {
    return handleApiError(error);
  }
}
