import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";

type StaffTimeCardRow = {
  id: string;
  staff_id: string;
  staff?: { name?: string | null } | null;
  date: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  notes?: string | null;
  total_hours?: number | null;
};

/**
 * GET /api/provider/time-clock
 * 
 * Get all time cards for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse([]);
    }

    // Build query
    let query = supabase
      .from("staff_time_cards")
      .select(`
        *,
        staff:staff_id(id, name, email)
      `)
      .eq("provider_id", providerId)
      .order("date", { ascending: false })
      .order("clock_in_time", { ascending: false });

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data: timeCards, error } = await query;

    if (error) {
      if (isMissingRelationError(error)) {
        return migrationRequiredResponse("Staff time tracking");
      }
      throw error;
    }

    // §Provider-audit 2026-04 (round 7): return raw ISO alongside the
    // locale-formatted string. The mobile "Edit time card" sheet prefilled
    // fields with the US-locale string ("02:45 PM") and then POSTed that
    // straight back, guaranteeing a 400. Expose the unformatted timestamps
    // so clients can parse them into the device's local HH:MM for editing.
    const transformed = ((timeCards || []) as StaffTimeCardRow[]).map((card) => ({
      id: card.id,
      team_member_id: card.staff_id,
      team_member_name: card.staff?.name || "Unknown",
      date: card.date,
      clock_in_time: card.clock_in_time ? new Date(card.clock_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
      clock_out_time: card.clock_out_time ? new Date(card.clock_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
      clock_in_at: card.clock_in_time ?? null,
      clock_out_at: card.clock_out_time ?? null,
      notes: card.notes ?? null,
      total_hours: card.total_hours || null,
      status: card.clock_out_time ? "clocked_out" : "clocked_in",
    }));

    return successResponse(transformed);
  } catch (error) {
    return handleApiError(error, "Failed to fetch time cards");
  }
}

/**
 * POST /api/provider/time-clock/clock-in-pin
 * 
 * Clock in using PIN
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { pin } = body;

    if (!pin || pin.length !== 4) {
      return errorResponse("Invalid PIN", "INVALID_PIN", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    }

    // Find staff member by PIN
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, name, time_clock_enabled")
      .eq("provider_id", providerId)
      .eq("time_clock_pin", pin)
      .eq("time_clock_enabled", true)
      .single();

    if (staffError || !staff) {
      return errorResponse("Invalid PIN", "INVALID_PIN", 401);
    }

    // Check if already clocked in
    const today = new Date().toISOString().split('T')[0];
    const { data: activeTimeCard } = await supabase
      .from("staff_time_cards")
      .select("id")
      .eq("staff_id", staff.id)
      .eq("date", today)
      .is("clock_out_time", null)
      .maybeSingle();

    if (activeTimeCard) {
      return errorResponse("Already clocked in", "ALREADY_CLOCKED_IN", 400);
    }

    // Create time card entry
    const now = new Date();
    const { data: timeCard, error: insertError } = await supabase
      .from("staff_time_cards")
      .insert({
        staff_id: staff.id,
        provider_id: providerId,
        date: today,
        clock_in_time: now.toISOString(),
        clock_out_time: null,
      })
      .select()
      .single();

    if (insertError) {
      if (isMissingRelationError(insertError)) {
        return migrationRequiredResponse("Staff time tracking");
      }
      throw insertError;
    }

    return successResponse({
      id: timeCard.id,
      staff_id: staff.id,
      team_member_name: staff.name,
      date: today,
      clock_in_time: timeCard.clock_in_time,
      clock_out_time: null,
      status: "clocked_in",
    });
  } catch (error) {
    return handleApiError(error, "Failed to clock in with PIN");
  }
}
