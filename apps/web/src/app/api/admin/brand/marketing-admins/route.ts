import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";

/** Eligible go-live second approvers: marketing admins in this market plus superadmins, excluding the caller. */
export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data: members, error: memErr } = await supabase
      .from("user_tenant_roles")
      .select("user_id")
      .eq("tenant_id", access.tenantId)
      .eq("is_active", true)
      .limit(500);
    if (memErr) throw memErr;
    const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];

    const [marketing, supers] = await Promise.all([
      memberIds.length
        ? supabase
            .from("users")
            .select("id, full_name, email, role")
            .in("id", memberIds)
            .eq("role", "admin_marketing")
        : Promise.resolve({ data: [], error: null }),
      supabase.from("users").select("id, full_name, email, role").eq("role", "superadmin").limit(50),
    ]);
    if (marketing.error) throw marketing.error;
    if (supers.error) throw supers.error;

    const seen = new Set<string>();
    const items = [...(marketing.data ?? []), ...(supers.data ?? [])]
      .filter((u) => {
        if (u.id === access.user.id || seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      })
      .map((u) => ({
        id: u.id as string,
        name: (u.full_name as string | null) || (u.email as string | null) || u.id,
        email: (u.email as string | null) ?? null,
        role: u.role as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return successResponse({ items });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list marketing admins");
  }
}
