import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/yoco/oauth/disconnect
 *
 * Owner-only. Deletes all OAuth tokens (both environments) for the provider
 * and downgrades the integration row's `credential_mode`:
 *   - If a dashboard secret_key is still stored → 'checkout' (Checkout API
 *     online payments keep working).
 *   - Otherwise                                   → 'none'.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } },
        { status: 404 }
      );
    }

    const admin = getSupabaseAdmin();

    // Wipe the tokens.
    const { error: deleteError } = await (admin.from("provider_yoco_oauth_tokens") as any)
      .delete()
      .eq("provider_id", providerId);
    if (deleteError) {
      console.error("Failed to delete provider_yoco_oauth_tokens:", deleteError);
      return NextResponse.json(
        { data: null, error: { message: "Failed to disconnect", code: "DELETE_ERROR" } },
        { status: 500 }
      );
    }

    // Re-evaluate credential_mode based on what credentials remain.
    const { data: integration } = await (admin.from("provider_yoco_integrations") as any)
      .select("secret_key")
      .eq("provider_id", providerId)
      .maybeSingle();

    const integrationRow = integration as { secret_key?: string | null } | null;
    const stillHasCheckoutKey = !!integrationRow?.secret_key?.trim();
    const newMode = stillHasCheckoutKey ? "checkout" : "none";

    await (admin.from("provider_yoco_integrations") as any)
      .update({
        credential_mode: newMode,
        ...(newMode === "checkout" ? { reconnect_banner_dismissed_at: null } : {}),
        // If they have no credentials at all, also flip is_enabled off so the
        // app stops showing "Connected".
        ...(stillHasCheckoutKey ? {} : { is_enabled: false }),
        last_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", providerId);

    return NextResponse.json({
      data: { disconnected: true, credential_mode: newMode },
      error: null,
    });
  } catch (error: any) {
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      return NextResponse.json(
        { data: null, error: { message: msg, code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    console.error("/api/provider/yoco/oauth/disconnect error:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to disconnect", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
