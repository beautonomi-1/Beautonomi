import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  ACTIVE_PROVIDER_ID_COOKIE,
  isValidUUID,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/memberships
 * Lists salons the user owns or is active staff on (multi-org switcher).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "customer", "superadmin"],
      request,
    );
    const admin = getSupabaseAdmin();

    const { data: owned } = await admin
      .from("providers")
      .select("id, business_name, status, slug")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const { data: staffRows } = await admin
      .from("provider_staff")
      .select("provider_id, role, providers:provider_id(id, business_name, status, slug)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const map = new Map<
      string,
      {
        provider_id: string;
        business_name: string;
        status: string | null;
        slug: string | null;
        relationship: "owner" | "staff";
        staff_role: string | null;
      }
    >();

    for (const row of owned ?? []) {
      map.set(row.id, {
        provider_id: row.id,
        business_name: row.business_name ?? "Business",
        status: (row as { status?: string }).status ?? null,
        slug: (row as { slug?: string | null }).slug ?? null,
        relationship: "owner",
        staff_role: "owner",
      });
    }

    for (const row of staffRows ?? []) {
      const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      if (!prov?.id || map.has(prov.id)) continue;
      map.set(prov.id, {
        provider_id: prov.id,
        business_name: prov.business_name ?? "Business",
        status: (prov as { status?: string | null }).status ?? null,
        slug: (prov as { slug?: string | null }).slug ?? null,
        relationship: "staff",
        staff_role: row.role ?? "employee",
      });
    }

    const memberships = Array.from(map.values());
    const supabase = await getSupabaseServer(request);
    const activeId = await getProviderIdForUser(user.id, supabase, { request });

    return successResponse({
      memberships,
      active_provider_id: activeId,
      has_multiple: memberships.length > 1,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load memberships");
  }
}

/**
 * POST /api/provider/memberships/switch
 * Body: { provider_id: uuid }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json().catch(() => ({}));
    const providerId =
      typeof body.provider_id === "string" && isValidUUID(body.provider_id.trim())
        ? body.provider_id.trim()
        : null;
    if (!providerId) {
      return handleApiError(new Error("provider_id is required"), "Validation error", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const allowed = await userHasProviderAccessAdmin(admin, user.id, providerId);
    if (!allowed) {
      return handleApiError(new Error("Forbidden"), "Forbidden", "FORBIDDEN", 403);
    }

    const response = successResponse({ active_provider_id: providerId });
    response.cookies.set(ACTIVE_PROVIDER_ID_COOKIE, providerId, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return handleApiError(error, "Failed to switch provider");
  }
}
