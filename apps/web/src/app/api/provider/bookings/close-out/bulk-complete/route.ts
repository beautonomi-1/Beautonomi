import { NextRequest } from "next/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isBulkCloseOutCompleteStatus } from "@/lib/bookings/lifecycle-close-out";
import { evaluateSingleBookingCompletion } from "@/lib/bookings/completion-guards";
import {
  isAlreadyStartedForCompletion,
  isAtHomeCloseOutBlocked,
} from "@/lib/bookings/close-out-bulk-complete";
import { countOpenProductOrdersForBooking } from "@/lib/orders/count-open-product-orders-for-booking";

const BULK_COMPLETE_SELECT =
  "id, status, payment_status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, group_booking_id, location_type, current_stage, additional_charges(amount, status)";

async function parseApiError(res: Response): Promise<{ message?: string; code?: string }> {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string } };
    return { message: parsed.error?.message ?? raw, code: parsed.error?.code };
  } catch {
    return { message: raw };
  }
}

function forwardClientHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const name of [
    "cookie",
    "authorization",
    "x-provider-id",
    "x-app",
    "user-agent",
    "x-forwarded-host",
    "x-active-market-country",
  ]) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function postProviderBookingAction(
  request: NextRequest,
  bookingId: string,
  segment: "start-service" | "complete-service",
): Promise<{ ok: boolean; message?: string; code?: string }> {
  const url = new URL(`/api/provider/bookings/${bookingId}/${segment}`, request.url);
  const res = await fetch(url, {
    method: "POST",
    headers: forwardClientHeaders(request),
    body: JSON.stringify(
      segment === "start-service" ? { suppress_customer_notice: true } : {},
    ),
  });
  if (res.ok) return { ok: true };
  const err = await parseApiError(res);
  return { ok: false, message: err.message, code: err.code };
}

/**
 * POST /api/provider/bookings/close-out/bulk-complete
 * Complete close-out bookings: preflight completion guards, start-service when needed, then complete-service.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json()) as { booking_ids?: string[] };
    const bookingIds = Array.isArray(body.booking_ids)
      ? body.booking_ids.filter((id) => typeof id === "string" && id.length > 0)
      : [];

    if (bookingIds.length === 0) {
      return errorResponse("booking_ids is required", "VALIDATION_ERROR", 400);
    }

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select(BULK_COMPLETE_SELECT)
      .eq("provider_id", providerId)
      .in("id", bookingIds);

    if (error) throw error;

    const byId = new Map((bookings ?? []).map((b) => [b.id as string, b]));
    const results: Array<{
      id: string;
      ok: boolean;
      error?: string;
      code?: string;
      balance_due?: number;
      retry?: boolean;
      products_still_open?: number;
    }> = [];

    for (const id of bookingIds) {
      const booking = byId.get(id);
      if (!booking) {
        results.push({ id, ok: false, error: "Booking not found", code: "NOT_FOUND" });
        continue;
      }

      const status = String(booking.status ?? "");
      if (!isBulkCloseOutCompleteStatus(status)) {
        results.push({ id, ok: false, error: "status_not_eligible", code: "status_not_eligible" });
        continue;
      }

      if (isAtHomeCloseOutBlocked(booking)) {
        results.push({
          id,
          ok: false,
          error: "Complete the previous house-call step before starting service.",
          code: "HOUSECALL_STAGE_REQUIRED",
        });
        continue;
      }

      const completionCheck = await evaluateSingleBookingCompletion(admin, {
        providerId,
        booking: booking as never,
        allowUnpaid: false,
      });
      if (!completionCheck.allowed) {
        const blocker = completionCheck.blockers[0];
        results.push({
          id,
          ok: false,
          error: blocker?.message,
          code: blocker?.code,
          balance_due: completionCheck.balanceDue > 0 ? completionCheck.balanceDue : undefined,
        });
        continue;
      }

      const startedInThisRequest = !isAlreadyStartedForCompletion(booking);
      if (startedInThisRequest) {
        const start = await postProviderBookingAction(request, id, "start-service");
        if (!start.ok) {
          results.push({
            id,
            ok: false,
            error: start.message,
            code: start.code ?? "START_SERVICE_FAILED",
          });
          continue;
        }
      }

      const complete = await postProviderBookingAction(request, id, "complete-service");
      const productsStillOpen = complete.ok
        ? await countOpenProductOrdersForBooking(admin, id, providerId)
        : undefined;
      results.push({
        id,
        ok: complete.ok,
        error: complete.ok ? undefined : complete.message,
        code: complete.ok ? undefined : complete.code ?? "COMPLETE_SERVICE_FAILED",
        retry: !complete.ok && startedInThisRequest ? true : undefined,
        products_still_open: productsStillOpen && productsStillOpen > 0 ? productsStillOpen : undefined,
      });
    }

    const completed = results.filter((r) => r.ok).length;
    try {
      const { trackServer } = await import("@/lib/analytics/amplitude/server");
      const { EVENT_BOOKING_CLOSEOUT_BULK_COMPLETED } = await import(
        "@/lib/analytics/amplitude/types"
      );
      await trackServer(
        EVENT_BOOKING_CLOSEOUT_BULK_COMPLETED,
        { provider_id: providerId, completed, requested: bookingIds.length },
        user.id,
        { insertId: `booking_closeout_bulk_completed:${providerId}:${Date.now()}` },
      );
    } catch {
      // analytics is non-blocking
    }

    return successResponse({
      completed,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to bulk complete bookings");
  }
}