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
    const tf = (security.two_factor as { enabled?: boolean; required_for_admins?: boolean } | undefined) ?? {};

    return NextResponse.json({
      data: {
        two_factor_enabled: tf.enabled === true,
        two_factor_required_for_admins: tf.required_for_admins === true,
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
