import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

function deadlineDateAfterPeriodEnd(periodEndYmd: string): string {
  const ymd = periodEndYmd.slice(0, 10);
  const [y, m] = ymd.split("-").map(Number);
  let dm = m + 1;
  let dy = y;
  if (dm > 12) {
    dm = 1;
    dy += 1;
  }
  return `${dy}-${String(dm).padStart(2, "0")}-25`;
}

/**
 * PATCH /api/provider/finance/vat-reports/[id]/mark-remitted
 * 
 * Mark a VAT remittance period as remitted to SARS
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return errorResponse("Provider profile not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { period_start, period_end } = body;

    if (!period_start || !period_end) {
      return errorResponse("Period start and end dates are required", "VALIDATION_ERROR", 400);
    }

    // Find the reminder record.
    // When id is not a UUID (e.g. "new" sent by mobile when no prior reminder exists),
    // skip the id filter and look up by provider + period alone so the create-fallback
    // path below can create the first reminder for this period.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let reminderQuery = supabase
      .from("vat_remittance_reminders")
      .select("id, provider_id, remitted_to_sars")
      .eq("provider_id", providerId)
      .eq("period_start", period_start)
      .eq("period_end", period_end);
    if (isUuid) {
      reminderQuery = reminderQuery.eq("id", id);
    }
    const { data: reminder, error: reminderError } = await reminderQuery
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reminderError) throw reminderError;

    if (!reminder) {
      // If no reminder exists, create one (for periods that haven't had reminders sent yet)
      const { data: newReminder, error: createError } = await supabase
        .from("vat_remittance_reminders")
        .insert({
          provider_id: providerId,
          period_start,
          period_end,
          deadline_date: deadlineDateAfterPeriodEnd(period_end),
          days_before_deadline: 0, // Manual mark, not from reminder
          vat_amount: 0, // Will be calculated from transactions if needed
          remitted_to_sars: true,
          remitted_at: new Date().toISOString(),
          remitted_by: user.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      return successResponse({
        message: "Marked as remitted to SARS",
        reminder: newReminder,
      });
    }

    // Update existing reminder
    if (reminder.remitted_to_sars) {
      return errorResponse("This period has already been marked as remitted", "ALREADY_REMITTED", 400);
    }

    const { data: updatedReminder, error: updateError } = await supabase
      .from("vat_remittance_reminders")
      .update({
        remitted_to_sars: true,
        remitted_at: new Date().toISOString(),
        remitted_by: user.id,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse({
      message: "Marked as remitted to SARS",
      reminder: updatedReminder,
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark as remitted");
  }
}
