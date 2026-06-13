import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim()?.toLowerCase();
    const { page, limit } = getPaginationParams(request);

    const { data: providers, error } = await supabase
      .from("providers")
      .select(
        `
        id,
        user_id,
        business_name,
        slug,
        status,
        is_verified,
        onboarding_state,
        created_at,
        provider_locations (id, city, country, address_line1, latitude, longitude)
      `
      )
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "pending_approval"])
      .order("created_at", { ascending: true });
    if (error) throw error;

    const userIds = (providers || [])
      .map((p: { user_id: string }) => p.user_id)
      .filter(Boolean) as string[];

    const usersMap = new Map<
      string,
      { id: string; full_name: string; email: string }
    >();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const u of users || []) {
        usersMap.set(
          u.id,
          u as { id: string; full_name: string; email: string }
        );
      }
    }

    let enriched = (providers || []).map((p: Record<string, unknown>) => {
      const locations = (p.provider_locations as Array<Record<string, unknown>>) || [];
      const owner = usersMap.get(p.user_id as string);

      const firstLocation = locations[0];
      const hasCoordinates =
        firstLocation?.latitude != null && firstLocation?.longitude != null;
      const hasAddressLine =
        typeof firstLocation?.address_line1 === "string" &&
        firstLocation.address_line1.trim().length > 0;

      const gates = {
        has_location: locations.length > 0 && (hasAddressLine || hasCoordinates),
        has_coordinates: hasCoordinates,
        has_business_name: !!p.business_name,
        is_verified: !!p.is_verified,
      };
      const allGatesPassed =
        gates.has_location && gates.has_business_name && gates.is_verified;

      return {
        ...p,
        owner_name: owner?.full_name || null,
        owner_email: owner?.email || null,
        activation_gates: gates,
        ready_to_activate: allGatesPassed,
        days_waiting: Math.floor(
          (Date.now() - new Date(p.created_at as string).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      };
    });

    if (search) {
      enriched = enriched.filter((p) => {
        const raw = p as Record<string, unknown>;
        const bn = (typeof raw.business_name === "string" ? raw.business_name : "").toLowerCase();
        const on = (p.owner_name || "").toLowerCase();
        const oe = (p.owner_email || "").toLowerCase();
        return bn.includes(search) || on.includes(search) || oe.includes(search);
      });
    }

    const total = enriched.length;
    const offset = (page - 1) * limit;
    const paginated = enriched.slice(offset, offset + limit);

    return successResponse({
      data: paginated,
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch activation queue");
  }
}
