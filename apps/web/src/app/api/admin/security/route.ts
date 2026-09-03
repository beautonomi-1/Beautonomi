import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta, computeChangedFields } from "@/lib/audit/audit";
import { isValidAllowlistEntry } from "@/lib/security/admin-ip-allowlist";
import {
  DEFAULT_ADMIN_SESSION_MAX_AGE_MINUTES,
  DEFAULT_MFA_REQUIRED_ADMIN_ROLES,
} from "@/lib/supabase/api-helpers";

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
    /** Part L: when 2FA is enabled, superadmin + admin_finance must complete MFA (AAL2). */
    required_for_admins: true,
    required_roles: [...DEFAULT_MFA_REQUIRED_ADMIN_ROLES] as string[],
  },
  /** IPs / CIDRs allowed to reach /admin and /api/admin. Empty = no restriction. Enforced in proxy.ts. */
  admin_ip_allowlist: [] as string[],
  /** Minutes since sign-in after which admin APIs return 401 SESSION_EXPIRED. 0 disables. */
  admin_session_max_age: DEFAULT_ADMIN_SESSION_MAX_AGE_MINUTES,
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
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);

    const { data: row, error } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const settings = (row as { settings?: Record<string, any> } | null)?.settings ?? {};
    const security = (settings.security as Record<string, any>) ?? {};
    const merged = {
      password_policy: { ...DEFAULTS.password_policy, ...(security.password_policy as object) },
      two_factor: { ...DEFAULTS.two_factor, ...(security.two_factor as object) },
      rate_limiting: { ...DEFAULTS.rate_limiting, ...(security.rate_limiting as object) },
      data_retention: { ...DEFAULTS.data_retention, ...(security.data_retention as object) },
      admin_ip_allowlist: Array.isArray(security.admin_ip_allowlist)
        ? (security.admin_ip_allowlist as unknown[]).filter((v): v is string => typeof v === "string")
        : DEFAULTS.admin_ip_allowlist,
      admin_session_max_age:
        typeof security.admin_session_max_age === "number" && security.admin_session_max_age >= 0
          ? security.admin_session_max_age
          : DEFAULTS.admin_session_max_age,
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
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, req);
    const supabase = await getSupabaseServer(req);
    const body = await req.json();

    // ── Validate the Part L security controls ────────────────────────────────
    if (body.admin_ip_allowlist !== undefined) {
      if (!Array.isArray(body.admin_ip_allowlist)) {
        return errorResponse("admin_ip_allowlist must be an array of IPs / CIDRs", "VALIDATION_ERROR", 400);
      }
      const entries = (body.admin_ip_allowlist as unknown[]).map((v) => String(v ?? "").trim()).filter(Boolean);
      const invalid = entries.filter((e) => !isValidAllowlistEntry(e));
      if (invalid.length > 0) {
        return errorResponse(`Invalid allowlist entries: ${invalid.join(", ")}`, "VALIDATION_ERROR", 400);
      }
      if (entries.length > 200) {
        return errorResponse("admin_ip_allowlist supports at most 200 entries", "VALIDATION_ERROR", 400);
      }
      // Refuse to lock the caller out: their current IP must match (unless the list is being cleared).
      const callerIp = extractRequestMeta(req).ip_address;
      if (entries.length > 0 && callerIp) {
        const { ipAllowed } = await import("@/lib/security/admin-ip-allowlist");
        if (!ipAllowed(callerIp, entries)) {
          return errorResponse(
            `Your current IP (${callerIp}) is not in the allowlist — add it before saving`,
            "SELF_LOCKOUT",
            400,
          );
        }
      }
      body.admin_ip_allowlist = entries;
    }
    if (body.admin_session_max_age !== undefined) {
      const n = Number(body.admin_session_max_age);
      if (!Number.isInteger(n) || n < 0 || n > 7 * 24 * 60) {
        return errorResponse(
          "admin_session_max_age must be whole minutes between 0 (disabled) and 10080",
          "VALIDATION_ERROR",
          400,
        );
      }
      body.admin_session_max_age = n;
    }
    if (body.two_factor?.required_roles !== undefined) {
      if (
        !Array.isArray(body.two_factor.required_roles) ||
        !(body.two_factor.required_roles as unknown[]).every((r) => typeof r === "string")
      ) {
        return errorResponse("two_factor.required_roles must be an array of role names", "VALIDATION_ERROR", 400);
      }
    }

    const { data: row, error: fetchError } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let rowId: string;
    let currentSettings: Record<string, any>;

    if (row) {
      rowId = (row as { id: string }).id;
      currentSettings = (row as { settings?: Record<string, any> }).settings ?? {};
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

    const currentSecurity = (currentSettings.security as Record<string, any>) ?? {};
    const updatedSecurity = {
      ...currentSecurity,
      password_policy: body.password_policy ?? currentSecurity.password_policy,
      two_factor: body.two_factor ?? currentSecurity.two_factor,
      rate_limiting: body.rate_limiting ?? currentSecurity.rate_limiting,
      data_retention: body.data_retention ?? currentSecurity.data_retention,
      admin_ip_allowlist: body.admin_ip_allowlist ?? currentSecurity.admin_ip_allowlist,
      admin_session_max_age: body.admin_session_max_age ?? currentSecurity.admin_session_max_age,
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

    const reqMeta = extractRequestMeta(req);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "security_settings_updated",
      entity_type: "platform_settings",
      entity_id: rowId,
      module: "operations",
      risk_level: "critical",
      retention_tier: "access",
      before_json: currentSecurity,
      after_json: updatedSecurity,
      changed_fields: computeChangedFields(currentSecurity, updatedSecurity),
      metadata: { updated_fields: Object.keys(body) },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ message: "Security settings updated" });
  } catch (error) {
    return handleApiError(error);
  }
}
