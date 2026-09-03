import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

const pauseSchema = z.object({
  provider_membership_id: z.string().uuid(),
  /** Pause until this ISO timestamp; omit for open-ended pause (auto_renew off). */
  paused_until: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/me/membership/pause
 * Pause a salon membership: skip auto-renew and optionally freeze until paused_until.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json().catch(() => ({}));
    const parsed = pauseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, "VALIDATION_ERROR", 400);
    }

    const { provider_membership_id, paused_until } = parsed.data;

    const { data: membership, error: findErr } = await supabase
      .from("user_memberships")
      .select("id, user_id, status, provider:providers(id, tenant_id)")
      .eq("id", provider_membership_id)
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    if (findErr) throw findErr;
    const provider = Array.isArray((membership as { provider?: unknown })?.provider)
      ? (membership as { provider?: Array<{ tenant_id?: string }> }).provider?.[0]
      : (membership as { provider?: { tenant_id?: string } | null })?.provider;

    if (!membership || provider?.tenant_id !== tenantId) {
      return successResponse({ paused: false, message: "No active membership found" });
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("user_memberships")
      .update({
        status: "paused",
        auto_renew: false,
        paused_until: paused_until ?? null,
        updated_at: nowIso,
      })
      .eq("id", provider_membership_id)
      .eq("user_id", user.id);

    if (updateErr) return handleApiError(updateErr, "Failed to pause membership");

    return successResponse({ paused: true, paused_until: paused_until ?? null });
  } catch (err) {
    return handleApiError(err, "Failed to pause membership");
  }
}
