import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/membership/usage?provider_membership_id=
 * Bookings where this customer's salon membership discount was applied.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const membershipId = new URL(request.url).searchParams.get("provider_membership_id");
    if (!membershipId) {
      return errorResponse("provider_membership_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: membership, error: findErr } = await supabase
      .from("user_memberships")
      .select("id, user_id, provider_id, plan_id, started_at, expires_at, status")
      .eq("id", membershipId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!membership) {
      return errorResponse("Membership not found", "NOT_FOUND", 404);
    }

    const row = membership as {
      provider_id: string;
      started_at?: string | null;
    };

    let query = supabase
      .from("bookings")
      .select(
        "id, booking_number, scheduled_at, status, total_amount, membership_discount_amount, currency, provider_id",
      )
      .eq("customer_id", user.id)
      .eq("provider_id", row.provider_id)
      .gt("membership_discount_amount", 0)
      .order("scheduled_at", { ascending: false })
      .limit(100);

    if (row.started_at) {
      query = query.gte("scheduled_at", row.started_at);
    }

    const { data: bookings, error: bookErr } = await query;
    if (bookErr) throw bookErr;

    const usage = (bookings ?? []) as Array<{
      id: string;
      booking_number?: string | null;
      scheduled_at?: string | null;
      status?: string | null;
      total_amount?: number | string | null;
      membership_discount_amount?: number | string | null;
      currency?: string | null;
    }>;

    const discountTotal = usage.reduce((s, b) => s + Number(b.membership_discount_amount ?? 0), 0);

    return successResponse({
      membership_id: membershipId,
      bookings: usage.map((b) => ({
        id: b.id,
        booking_number: b.booking_number ?? null,
        scheduled_at: b.scheduled_at ?? null,
        status: b.status ?? null,
        total_amount: Number(b.total_amount ?? 0),
        membership_discount_amount: Number(b.membership_discount_amount ?? 0),
        currency: b.currency ?? "ZAR",
      })),
      booking_count: usage.length,
      discount_total: discountTotal,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load membership usage");
  }
}
