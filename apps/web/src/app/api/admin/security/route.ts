import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

export async function GET(_req: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], req);
    const supabase = await getSupabaseServer(req);

    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("category", "security")
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;

    const defaults = {
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
      session: {
        max_duration_hours: 24,
        idle_timeout_minutes: 60,
        max_concurrent_sessions: 5,
      },
      data_retention: {
        enabled: false,
        retention_days: 365,
        auto_delete_inactive_accounts: false,
        inactive_threshold_days: 730,
      },
    };

    const settings = data?.value ? { ...defaults, ...data.value } : defaults;

    return successResponse(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], req);
    const supabase = await getSupabaseServer(req);
    const body = await req.json();

    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("category", "security")
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("platform_settings")
        .update({ value: body, updated_at: new Date().toISOString() })
        .eq("category", "security");
      if (error) throw error;
    } else {
      const { error } = await supabase.from("platform_settings").insert({
        category: "security",
        value: body,
      });
      if (error) throw error;
    }

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
