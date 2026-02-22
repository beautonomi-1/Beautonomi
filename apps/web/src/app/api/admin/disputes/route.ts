import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/disputes
 * 
 * Fetch all disputes with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // all, open, resolved, closed
    const openedBy = searchParams.get("opened_by"); // customer, provider, admin
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("booking_disputes")
      .select(`
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
        booking:bookings(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name, owner_name, owner_email)
        )
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (openedBy) {
      query = query.eq("opened_by", openedBy);
    }

    const { data: disputes, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase.from("booking_disputes").select("*", { count: "exact", head: true });

    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }

    if (openedBy) {
      countQuery = countQuery.eq("opened_by", openedBy);
    }

    const { count } = await countQuery;

    // Get statistics
    const { data: stats } = await supabase
      .from("booking_disputes")
      .select("status, opened_by, resolution");

    const statistics = {
      total: stats?.length || 0,
      open: stats?.filter((d) => d.status === "open").length || 0,
      resolved: stats?.filter((d) => d.status === "resolved").length || 0,
      closed: stats?.filter((d) => d.status === "closed").length || 0,
      by_opener: {
        customer: stats?.filter((d) => d.opened_by === "customer").length || 0,
        provider: stats?.filter((d) => d.opened_by === "provider").length || 0,
        admin: stats?.filter((d) => d.opened_by === "admin").length || 0,
      },
      by_resolution: {
        refund_full: stats?.filter((d) => d.resolution === "refund_full").length || 0,
        refund_partial: stats?.filter((d) => d.resolution === "refund_partial").length || 0,
        deny: stats?.filter((d) => d.resolution === "deny").length || 0,
      },
    };

    return successResponse({
      disputes: disputes || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch disputes");
  }
}
