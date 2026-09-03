import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  findFutureBookingsForStaff,
  futureBookingsConflictResponse,
} from "@/lib/provider/find-future-bookings-for-staff";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (!staff) return notFoundResponse("Staff member not found");

    const body = await request.json();
    const { service_ids, force } = body;

    if (!Array.isArray(service_ids)) {
      return handleApiError(new Error("service_ids must be an array"), "VALIDATION_ERROR", 400);
    }

    const removedIds: string[] = [];
    if (!force) {
      const { data: current } = await supabase
        .from("staff_services")
        .select("offering_id")
        .eq("staff_id", id);
      const nextSet = new Set(service_ids as string[]);
      for (const row of current ?? []) {
        const oid = (row as { offering_id: string }).offering_id;
        if (!nextSet.has(oid)) removedIds.push(oid);
      }
      if (removedIds.length > 0) {
        const conflicts = await findFutureBookingsForStaff(supabase, providerId, id, {
          serviceIds: removedIds,
        });
        if (conflicts.length > 0) {
          return errorResponse(
            futureBookingsConflictResponse(conflicts).message,
            "FUTURE_BOOKINGS_CONFLICT",
            409,
            futureBookingsConflictResponse(conflicts),
          );
        }
      }
    }

    await supabase.from("staff_services").delete().eq("staff_id", id);

    if (service_ids.length > 0) {
      const inserts = service_ids.map((sid: string) => ({
        staff_id: id,
        offering_id: sid,
        provider_id: providerId,
      }));

      const { error } = await supabase.from("staff_services").insert(inserts);
      if (error) throw error;
    }

    // staff_services is the single source of eligibility; the legacy
    // provider_staff.assigned_service_ids array is no longer written (872 backfill).
    return successResponse({ success: true, service_ids });
  } catch (error) {
    return handleApiError(error, "Failed to update staff services");
  }
}
