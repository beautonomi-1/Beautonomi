import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/disputes
 *
 * Fetch all disputes for this tenant with filtering, search, and pagination.
 *
 * Query params:
 *   status    - all | open | resolved | closed
 *   opened_by - customer | provider | admin
 *   search    - free-text search over booking_number, customer name/email,
 *               provider business_name, and dispute reason
 *   page      - 1-indexed (default 1)
 *   limit     - rows per page (default 50, max 100)
 *   offset    - raw offset (overrides page when provided)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDERS_OPERATIONS,
      request
    );
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const openedBy = searchParams.get("opened_by");
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const rawOffset = searchParams.get("offset");
    const offset = rawOffset !== null
      ? Math.max(0, parseInt(rawOffset, 10) || 0)
      : (page - 1) * limit;

    // ---- Server-side full-text search (pre-resolve IDs) ------------------
    // When a search term is present we resolve matching booking IDs up-front
    // (booking_number, customer name/email, provider name, dispute reason).
    let searchDisputeIds: string[] | null = null;

    if (search) {
      const safe = search.replace(/[%_]/g, "");

      const [bookingsRes, customersRes, providersRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("booking_number", `%${safe}%`)
          .limit(500),
        supabase
          .from("users")
          .select("id")
          .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
          .limit(500),
        supabase
          .from("providers")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("business_name", `%${safe}%`)
          .limit(500),
      ]);

      const bookingIds = (bookingsRes.data ?? []).map((b: { id: string }) => b.id);
      const customerIds = (customersRes.data ?? []).map((u: { id: string }) => u.id);
      const providerIds = (providersRes.data ?? []).map((p: { id: string }) => p.id);

      // Resolve dispute IDs matching booking_number / customer / provider hits
      const disputeIdSets: string[] = [];

      const filterBookingIds = [
        ...bookingIds,
        // Customer/provider hits require a second hop through bookings
      ];

      if (customerIds.length) {
        const { data: custBookings } = await supabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("customer_id", customerIds)
          .limit(500);
        filterBookingIds.push(...(custBookings ?? []).map((b: { id: string }) => b.id));
      }

      if (providerIds.length) {
        const { data: provBookings } = await supabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("provider_id", providerIds)
          .limit(500);
        filterBookingIds.push(...(provBookings ?? []).map((b: { id: string }) => b.id));
      }

      // Collect all dispute IDs that match booking-level hits
      if (filterBookingIds.length) {
        const { data: bookingDisputes } = await supabase
          .from("booking_disputes")
          .select("id")
          .in("booking_id", [...new Set(filterBookingIds)])
          .limit(2000);
        disputeIdSets.push(...(bookingDisputes ?? []).map((d: { id: string }) => d.id));
      }

      // Also match reason column directly
      if (safe) {
        const { data: reasonDisputes } = await supabase
          .from("booking_disputes")
          .select("id")
          .ilike("reason", `%${safe}%`)
          .limit(2000);
        disputeIdSets.push(...(reasonDisputes ?? []).map((d: { id: string }) => d.id));
      }

      searchDisputeIds = [...new Set(disputeIdSets)];
      // No matches → return empty immediately
      if (searchDisputeIds.length === 0) {
        return successResponse({
          disputes: [],
          pagination: { page, limit, total: 0, total_pages: 0 },
          statistics: {
            total: 0,
            open: 0,
            resolved: 0,
            closed: 0,
            by_opener: { customer: 0, provider: 0, admin: 0 },
            by_resolution: { refund_full: 0, refund_partial: 0, deny: 0 },
          },
        });
      }
    }

    // ---- Main query -------------------------------------------------------
    let query = supabase
      .from("booking_disputes")
      .select(
        `
        id,
        booking_id,
        reason,
        description,
        opened_by,
        status,
        opened_at,
        resolved_at,
        resolution,
        refund_amount,
        notes,
        created_at,
        updated_at,
        booking:bookings!inner(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          tenant_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name)
        )
      `
      )
      .eq("booking.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (openedBy) {
      query = query.eq("opened_by", openedBy);
    }
    if (searchDisputeIds !== null) {
      query = query.in("id", searchDisputeIds);
    }

    // ---- Count query (mirrors filters without range) ----------------------
    let countQuery = supabase
      .from("booking_disputes")
      .select("id, booking:bookings!inner(tenant_id)", { count: "exact", head: true })
      .eq("booking.tenant_id", tenantId);

    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }
    if (openedBy) {
      countQuery = countQuery.eq("opened_by", openedBy);
    }
    if (searchDisputeIds !== null) {
      countQuery = countQuery.in("id", searchDisputeIds);
    }

    const [{ data: disputes, error }, { count }] = await Promise.all([
      query,
      countQuery,
    ]);

    if (error) {
      throw error;
    }

    // ---- Statistics -------------------------------------------------------
    // Tenant-scoped, and constrained to the search result set when a search is
    // active so tab counts stay consistent with the filtered list (a no-match
    // search returns zeroed stats above). Status/page filters are intentionally
    // NOT applied so each tab shows its own count.
    let statsQuery = supabase
      .from("booking_disputes")
      .select(
        "status, opened_by, resolution, booking:bookings!inner(tenant_id)"
      )
      .eq("booking.tenant_id", tenantId);
    if (searchDisputeIds !== null) {
      statsQuery = statsQuery.in("id", searchDisputeIds);
    }
    const { data: stats } = await statsQuery;

    const statistics = {
      total: stats?.length ?? 0,
      open: stats?.filter((d) => d.status === "open").length ?? 0,
      resolved: stats?.filter((d) => d.status === "resolved").length ?? 0,
      closed: stats?.filter((d) => d.status === "closed").length ?? 0,
      by_opener: {
        customer: stats?.filter((d) => d.opened_by === "customer").length ?? 0,
        provider: stats?.filter((d) => d.opened_by === "provider").length ?? 0,
        admin: stats?.filter((d) => d.opened_by === "admin").length ?? 0,
      },
      by_resolution: {
        refund_full:
          stats?.filter((d) => d.resolution === "refund_full").length ?? 0,
        refund_partial:
          stats?.filter((d) => d.resolution === "refund_partial").length ?? 0,
        deny: stats?.filter((d) => d.resolution === "deny").length ?? 0,
      },
    };

    const total = count ?? 0;
    return successResponse({
      disputes: disputes ?? [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch disputes");
  }
}
