import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/auth/mfa-policy
 * Public: whether platform security policy expects 2FA for admins (from platform_settings).
 * Anonymous clients may read active platform_settings (RLS).
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();
    const { data: row } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const settings = (row?.settings as Record<string, unknown> | undefined) ?? {};
    const security = (settings.security as Record<string, unknown> | undefined) ?? {};
    const tf =
      (security.two_factor as
        | { enabled?: boolean; required_for_admins?: boolean; required_roles?: unknown }
        | undefined) ?? {};

    return NextResponse.json({
      data: {
        two_factor_enabled: tf.enabled === true,
        // Default is true (Part L): superadmin + admin_finance must use MFA when 2FA is enabled.
        two_factor_required_for_admins: tf.required_for_admins !== false,
        two_factor_required_roles: Array.isArray(tf.required_roles)
          ? (tf.required_roles as unknown[]).filter((r): r is string => typeof r === "string")
          : ["superadmin", "admin_finance"],
      },
    });
  } catch {
    return NextResponse.json({
      data: {
        two_factor_enabled: false,
        two_factor_required_for_admins: false,
      },
    });
  }
}
