import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  filterProductOrdersForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
} from "@/lib/reports/provider-report-utils";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  CARD_MACHINE_EXCEPTION_ROW_CAP,
  isPaycloudPaymentException,
  isYocoPaymentException,
  paycloudPaymentMatchesLocation,
  type PaycloudPaymentRow,
  type YocoPaymentRow,
  yocoPaymentMatchesLocation,
} from "@/lib/reports/card-machine-reconciliation-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const ID_CHUNK = 150;
const PAGE = 1000;

async function fetchAllYocoInWindow(
  admin: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<YocoPaymentRow[]> {
  const rows: YocoPaymentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("provider_yoco_payments")
      .select(
        "id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at",
      )
      .eq("provider_id", providerId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as YocoPaymentRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function fetchAllPaycloudInWindow(
  admin: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<PaycloudPaymentRow[]> {
  const rows: PaycloudPaymentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("provider_paycloud_payments")
      .select(
        "id, merchant_order_no, amount, expected_amount, amount_match_status, status, created_at, booking_id, sale_id, group_booking_id, product_order_id",
      )
      .eq("provider_id", providerId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as PaycloudPaymentRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function idsAtLocation(
  admin: SupabaseClient,
  table: "bookings" | "sales" | "group_bookings",
  ids: string[],
  locationId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data } = await admin.from(table).select("id").in("id", slice).eq("location_id", locationId);
    for (const row of data ?? []) {
      out.add((row as { id: string }).id);
    }
  }
  return out;
}

async function filterYocoByLocation(
  admin: SupabaseClient,
  rows: YocoPaymentRow[],
  locationId: string,
): Promise<YocoPaymentRow[]> {
  const bookingIds = rows.map((p) => p.appointment_id).filter(Boolean) as string[];
  const saleIds = rows.map((p) => p.sale_id).filter(Boolean) as string[];
  const matchingBookingIds = await idsAtLocation(admin, "bookings", bookingIds, locationId);
  const matchingSaleIds = await idsAtLocation(admin, "sales", saleIds, locationId);
  return rows.filter((p) => yocoPaymentMatchesLocation(p, locationId, matchingBookingIds, matchingSaleIds));
}

async function filterPaycloudByLocation(
  admin: SupabaseClient,
  providerId: string,
  rows: PaycloudPaymentRow[],
  locationId: string,
): Promise<PaycloudPaymentRow[]> {
  const bookingIds = rows.map((p) => p.booking_id).filter(Boolean) as string[];
  const saleIds = rows.map((p) => p.sale_id).filter(Boolean) as string[];
  const groupIds = rows.map((p) => p.group_booking_id).filter(Boolean) as string[];
  const orderIds = rows.map((p) => p.product_order_id).filter(Boolean) as string[];

  const matchingBookingIds = await idsAtLocation(admin, "bookings", bookingIds, locationId);
  const matchingSaleIds = await idsAtLocation(admin, "sales", saleIds, locationId);
  const matchingGroupIds = await idsAtLocation(admin, "group_bookings", groupIds, locationId);

  let matchingOrderIds = new Set<string>();
  if (orderIds.length > 0) {
    const orders: Array<{
      id: string;
      fulfillment_type?: string | null;
      collection_location_id?: string | null;
    }> = [];
    for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
      const slice = orderIds.slice(i, i + ID_CHUNK);
      const { data } = await admin
        .from("product_orders")
        .select("id, fulfillment_type, collection_location_id")
        .in("id", slice)
        .eq("provider_id", providerId);
      orders.push(...((data ?? []) as typeof orders));
    }
    const filtered = await filterProductOrdersForLocation(admin, providerId, orders, locationId);
    matchingOrderIds = new Set(filtered.map((o) => o.id));
  }

  return rows.filter((p) =>
    paycloudPaymentMatchesLocation(
      p,
      locationId,
      matchingBookingIds,
      matchingSaleIds,
      matchingGroupIds,
      matchingOrderIds,
    ),
  );
}

/**
 * GET /api/provider/reports/payments/card-machine-reconciliation
 * Yoco pending + PayCloud amount exceptions in the capture window; awaiting machine refunds always listed.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request, { reportType: "payments" });
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, admin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(admin, providerId);
    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    let yocoAll = await fetchAllYocoInWindow(admin, providerId, fromIso, toIso);
    let paycloudAll = await fetchAllPaycloudInWindow(admin, providerId, fromIso, toIso);

    if (locationId) {
      yocoAll = await filterYocoByLocation(admin, yocoAll, locationId);
      paycloudAll = await filterPaycloudByLocation(admin, providerId, paycloudAll, locationId);
    }

    const yocoExceptionsAll = yocoAll.filter((p) => isYocoPaymentException(p.status));
    const paycloudExceptionsAll = paycloudAll.filter((p) =>
      isPaycloudPaymentException(p.amount_match_status),
    );

    const exceptionsTruncated =
      yocoExceptionsAll.length > CARD_MACHINE_EXCEPTION_ROW_CAP ||
      paycloudExceptionsAll.length > CARD_MACHINE_EXCEPTION_ROW_CAP;

    const yoco = yocoExceptionsAll.slice(0, CARD_MACHINE_EXCEPTION_ROW_CAP);
    const paycloud = paycloudExceptionsAll.slice(0, CARD_MACHINE_EXCEPTION_ROW_CAP);

    let awaitingQuery = admin
      .from("booking_refunds")
      .select(
        "id, booking_id, amount, reason, machine_refund_provider, awaiting_machine_since, created_at, booking:bookings!inner(provider_id, booking_number, ref_number, location_id)",
      )
      .eq("status", "pending")
      .not("machine_refund_provider", "is", null)
      .eq("booking.provider_id", providerId)
      .order("awaiting_machine_since", { ascending: true })
      .limit(CARD_MACHINE_EXCEPTION_ROW_CAP);

    if (locationId) {
      awaitingQuery = awaitingQuery.eq("booking.location_id", locationId);
    }

    const { data: awaitingRows } = await awaitingQuery;
    const awaitingRefunds = (awaitingRows ?? []).map((r) => {
      const row = r as {
        id: string;
        booking_id: string;
        amount: number | string;
        reason: string | null;
        machine_refund_provider: string;
        awaiting_machine_since: string | null;
        created_at: string | null;
        booking?:
          | { booking_number?: string | null; ref_number?: string | null }
          | Array<{ booking_number?: string | null; ref_number?: string | null }>
          | null;
      };
      const booking = Array.isArray(row.booking) ? row.booking[0] : row.booking;
      return {
        id: row.id,
        booking_id: row.booking_id,
        booking_ref: booking?.ref_number || booking?.booking_number || null,
        amount: Number(row.amount ?? 0),
        reason: row.reason,
        provider: row.machine_refund_provider,
        since: row.awaiting_machine_since ?? row.created_at,
      };
    });
    const awaitingRefundTotal =
      Math.round(awaitingRefunds.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    const yocoPending = yocoExceptionsAll.length;
    const paycloudMismatch = paycloudExceptionsAll.length;
    const paymentExceptions = yocoPending + paycloudMismatch;

    let reportBasis =
      "Payment rows use each capture’s timestamp in your salon timezone. Yoco amounts are stored in cents; PayCloud and awaiting refunds are in major currency units.";
    if (locationId) {
      reportBasis +=
        " With a branch selected, only payments linked to that branch’s booking, sale, group booking, or product order are counted.";
    }
    if (exceptionsTruncated) {
      reportBasis += " Some exception rows are not shown — narrow the date range or branch to see more.";
    }

    return successResponse({
      yoco,
      paycloud,
      awaiting_refunds: awaitingRefunds,
      reportBasis,
      summary: {
        yoco_payments_in_window: yocoAll.length,
        paycloud_payments_in_window: paycloudAll.length,
        yoco_pending: yocoPending,
        paycloud_amount_mismatch: paycloudMismatch,
        payment_exceptions: paymentExceptions,
        /** @deprecated use payment_exceptions */
        exceptions: paymentExceptions,
        /** @deprecated use yoco_payments_in_window + paycloud_payments_in_window */
        total: yocoAll.length + paycloudAll.length,
        awaiting_refunds: awaitingRefunds.length,
        awaiting_refund_total: awaitingRefundTotal,
        exceptions_truncated: exceptionsTruncated,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
