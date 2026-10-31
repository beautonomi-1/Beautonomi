import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/compliance/lookup-provider/[id]
 *
 * Superadmin only. Platform-wide provider lookup for compliance purge confirmation (no tenant scope).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: prov, error } = await admin
      .from("providers")
      .select("id, email, billing_email, user_id, tenant_id, business_name")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[compliance/lookup-provider] providers lookup:", error);
      return handleApiError(error, "Failed to lookup provider");
    }

    if (!prov) {
      return notFoundResponse("Provider not found");
    }

    const ownerUserId = prov.user_id as string | null;
    let ownerEmail: string | null = null;
    if (ownerUserId) {
      const { data: ownerRow } = await admin
        .from("users")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();
      ownerEmail = (ownerRow as { email?: string | null } | null)?.email ?? null;
    }

    return successResponse({
      id: prov.id,
      email: prov.email ?? null,
      billing_email: prov.billing_email ?? null,
      tenant_id: prov.tenant_id ?? null,
      business_name: prov.business_name ?? null,
      owner: ownerUserId
        ? {
            user_id: ownerUserId,
            email: ownerEmail,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to lookup provider");
  }
}
