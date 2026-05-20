import { NextRequest } from "next/server";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireAdminSection, successResponse } from "@/lib/supabase/api-helpers";

type GroupRow = Record<string, unknown> & {
  id: string;
  provider_id?: string | null;
  ref_number?: string | null;
  title?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  max_participants?: number | null;
  total_price?: number | null;
  booking_participants?: Array<Record<string, unknown>>;
  providers?: { id?: string | null; business_name?: string | null; tenant_id?: string | null } | null;
};

function safeLike(raw: string): string {
  return raw.replace(/[%_]/g, "").trim();
}

function mapGroup(row: GroupRow) {
  const participants = Array.isArray(row.booking_participants) ? row.booking_participants : [];
  return {
    id: row.id,
    ref_number: row.ref_number ?? row.id,
    title: row.title ?? "Group booking",
    status: row.status ?? "confirmed",
    scheduled_at: row.scheduled_at ?? null,
    provider_id: row.provider_id ?? null,
    provider_name: row.providers?.business_name ?? null,
    max_participants: Number(row.max_participants ?? 0) || null,
    participant_count: participants.length,
    total_price: Number(row.total_price ?? 0),
    participants,
  };
}

/**
 * GET /api/admin/group-bookings
 *
 * Admin list of group bookings scoped through providers.tenant_id because
 * group_bookings has no tenant_id column.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status")?.trim();
    const search = safeLike(searchParams.get("search") ?? "");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));
    const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
    const from = page * limit;

    let query = admin
      .from("group_bookings")
      .select(
        `
        id,
        provider_id,
        ref_number,
        title,
        status,
        scheduled_at,
        max_participants,
        total_price,
        created_at,
        updated_at,
        providers!inner(id, business_name, tenant_id),
        booking_participants(id, booking_id, participant_name, participant_email, participant_phone, is_primary_contact, checked_in_at, checked_out_at)
      `,
        { count: "exact" }
      )
      .eq("providers.tenant_id", tenantId)
      .order("scheduled_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`ref_number.ilike.%${search}%,title.ilike.%${search}%`);
    }

    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) throw error;

    return successResponse({
      group_bookings: ((data ?? []) as GroupRow[]).map(mapGroup),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group bookings");
  }
}
