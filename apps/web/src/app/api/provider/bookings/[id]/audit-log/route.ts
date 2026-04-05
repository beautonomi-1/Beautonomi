import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";

/**
 * GET /api/provider/bookings/[id]/audit-log
 * 
 * Get audit log for a specific booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse([]);
    }

    // Verify booking belongs to provider
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, location_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return successResponse([]);
    }

    const supabaseAdminAudit = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminAudit,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    // Get audit log entries
    const { data: auditLogs, error } = await supabase
      .from("booking_audit_log")
      .select(`
        *,
        created_by_user:users!booking_audit_log_created_by_fkey(full_name, email)
      `)
      .eq("booking_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching audit log:", error);
      return successResponse([]);
    }

    // Transform to include user names
    const transformedLogs = (auditLogs || []).map((log: any) => ({
      id: log.id,
      booking_id: log.booking_id,
      event_type: log.event_type,
      event_data: log.event_data,
      created_by: log.created_by,
      created_by_name: log.created_by_user?.full_name || log.created_by_user?.email || "System",
      created_at: log.created_at,
    }));

    return successResponse(transformedLogs);
  } catch (error) {
    return handleApiError(error, "Failed to fetch audit log");
  }
}
