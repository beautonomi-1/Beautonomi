import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/on-demand/requests/[id]
 * Get a single on-demand request (customer only, RLS enforced).
 * Lazy expiry: if status is requested and expires_at has passed, mark expired and return updated row.
 *
 * @tenant-hint Row is loaded with the user-scoped Supabase client (RLS). Service role is only used for
 * the idempotent expiry update and to read provider display name by provider_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const { data, error } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFoundResponse("Request not found");

    const now = new Date().toISOString();
    let payload = data as Record<string, unknown>;
    if (data.status === "requested" && data.expires_at && data.expires_at <= now) {
      const admin = getSupabaseAdmin();
      const { data: updated } = await admin
        .from("on_demand_requests")
        .update({ status: "expired", updated_at: now })
        .eq("id", id)
        .eq("status", "requested")
        .select()
        .maybeSingle();
      payload = (updated ?? { ...data, status: "expired", updated_at: now }) as Record<string, unknown>;
    }

    const admin = getSupabaseAdmin();
    const providerId = payload.provider_id as string | undefined;
    if (providerId) {
      const { data: providerRow } = await admin
        .from("providers")
        .select("business_name")
        .eq("id", providerId)
        .maybeSingle();
      payload = { ...payload, provider_name: (providerRow as { business_name?: string } | null)?.business_name ?? null };
    }
    return successResponse(payload);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch on-demand request");
  }
}
