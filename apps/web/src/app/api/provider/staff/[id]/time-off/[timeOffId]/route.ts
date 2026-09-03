import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { notifyStaffUser } from "@/lib/notifications/notify-staff-event";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["approved", "denied"]),
});

/**
 * PATCH /api/provider/staff/[id]/time-off/[timeOffId]
 * Owner/manager approves or denies a pending time-off request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; timeOffId: string }> },
) {
  try {
    const manageCheck = await requirePermission("manage_team", request);
    if (!manageCheck.authorized) return manageCheck.response!;
    const { user } = manageCheck;

    const { id, timeOffId } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const staffId = await resolveProviderStaffRowId(supabase, providerId, id);
    if (!staffId) return notFoundResponse("Staff member not found");

    const { data: row, error: fetchErr } = await supabase
      .from("staff_time_off")
      .select("id, staff_id, status, start_date, end_date, type")
      .eq("id", timeOffId)
      .eq("staff_id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) return notFoundResponse("Time off request not found");
    if ((row as { status?: string }).status !== "pending") {
      return errorResponse("Only pending requests can be updated", "INVALID_STATE", 400);
    }

    const { error: updateErr } = await supabase
      .from("staff_time_off")
      .update({
        status: parsed.data.status,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", timeOffId);

    if (updateErr) throw updateErr;

    const startDate = (row as { start_date: string }).start_date;
    const endDate = (row as { end_date: string }).end_date || startDate;

    if (parsed.data.status === "denied") {
      // Pending day-off rows for the request window are removed.
      await supabase
        .from("staff_days_off")
        .delete()
        .eq("staff_id", staffId)
        .eq("provider_id", providerId)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("is_approved", false);
    } else {
      // Approval: flip pending rows and make sure every day in the window has
      // an approved staff_days_off row (availability engines read both tables).
      await supabase
        .from("staff_days_off")
        .update({ is_approved: true })
        .eq("staff_id", staffId)
        .eq("provider_id", providerId)
        .gte("date", startDate)
        .lte("date", endDate);

      const rows: Array<{ staff_id: string; provider_id: string; date: string; is_approved: boolean; type: string | null }> = [];
      const cursor = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T00:00:00Z`);
      for (let i = 0; i < 62 && cursor.getTime() <= end.getTime(); i++) {
        rows.push({
          staff_id: staffId,
          provider_id: providerId,
          date: cursor.toISOString().slice(0, 10),
          is_approved: true,
          type: (row as { type?: string | null }).type ?? null,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("staff_days_off")
          .upsert(rows, { onConflict: "staff_id,date", ignoreDuplicates: true });
        if (upsertErr) {
          console.warn("[time-off approve] staff_days_off upsert failed:", upsertErr.message);
        }
      }
    }

    await notifyStaffUser(
      staffId,
      parsed.data.status === "approved" ? "staff_time_off_approved" : "staff_time_off_denied",
      {
        title: parsed.data.status === "approved" ? "Time off approved" : "Time off denied",
        message:
          parsed.data.status === "approved"
            ? `Your time off (${(row as { start_date: string }).start_date}) was approved.`
            : `Your time off request (${(row as { start_date: string }).start_date}) was denied.`,
      },
    );

    return successResponse({ id: timeOffId, status: parsed.data.status });
  } catch (error) {
    return handleApiError(error, "Failed to update time off request");
  }
}
