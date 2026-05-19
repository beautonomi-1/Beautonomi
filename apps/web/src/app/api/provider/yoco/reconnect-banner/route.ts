import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/yoco/reconnect-banner
 *
 * §Yoco-OAuth 2026-05: dismiss the "Card terminals now require a Yoco
 * reconnect" banner shown to providers whose `credential_mode = 'checkout'`.
 * Owner-only. The banner re-appears if `credential_mode` flips back to
 * checkout in the future (e.g. after OAuth disconnect).
 *
 * Body: `{ action: "dismiss" | "reset" }` (default: dismiss).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["provider_owner"], request);
    if (!auth) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id, supabase, {
      request,
    });
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { code: "PROVIDER_NOT_FOUND", message: "Provider not found" } },
        { status: 404 },
      );
    }

    let action: "dismiss" | "reset" = "dismiss";
    try {
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
      };
      if (body?.action === "reset") action = "reset";
    } catch {
      // Empty body is fine — default to dismiss.
    }

    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from("provider_yoco_integrations") as any)
      .update({
        reconnect_banner_dismissed_at:
          action === "reset" ? null : new Date().toISOString(),
      })
      .eq("provider_id", providerId);

    if (error) {
      console.error("Failed to update reconnect banner state:", error);
      return NextResponse.json(
        {
          data: null,
          error: { code: "UPDATE_FAILED", message: "Could not update banner state" },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: { action, ok: true }, error: null });
  } catch (err) {
    console.error("/api/provider/yoco/reconnect-banner error:", err);
    return NextResponse.json(
      {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
      },
      { status: 500 },
    );
  }
}
