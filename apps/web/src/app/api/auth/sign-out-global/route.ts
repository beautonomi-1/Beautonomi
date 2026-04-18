/**
 * POST /api/auth/sign-out-global
 *
 * Wave 2.4 (audit 2026-04 final 100/100): revoke ALL sessions for the
 * currently authenticated user across every device. The standard
 * sign-out endpoint only invalidates the calling browser/app session,
 * which is useless for the canonical "I lost my phone" or "I clicked the
 * Sign me out everywhere button in Security Settings" recovery flow.
 *
 * Implementation note: Supabase `auth.signOut({ scope: 'global' })`
 * invalidates every refresh token issued to the user, so all active
 * sessions are forced to re-authenticate on their next API call.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/audit";

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      // Best-effort audit, non-fatal.
      try {
        await writeAuditLog({
          actor_user_id: user.id,
          actor_role: (user.app_metadata as { role?: string } | null)?.role ?? null,
          action: "user.global_sign_out_failed",
          entity_type: "user",
          entity_id: user.id,
          metadata: { reason: error.message },
        });
      } catch {
        // Audit failure must never break the response
      }
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to sign out everywhere" },
        { status: 500 },
      );
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user.app_metadata as { role?: string } | null)?.role ?? null,
        action: "user.global_sign_out",
        entity_type: "user",
        entity_id: user.id,
        metadata: { initiated_via: "settings.security" },
      });
    } catch {
      // Audit failure must never break the response
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to sign out everywhere" },
      { status: 500 },
    );
  }
}
