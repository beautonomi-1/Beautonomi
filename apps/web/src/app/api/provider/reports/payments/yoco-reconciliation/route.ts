import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";

export type YocoLinkKind = "booking" | "sale" | "none";

export interface YocoReconciliationRow {
  id: string;
  yoco_payment_id: string;
  /** Amount in cents (schema); divide by 100 for display currency. */
  amount: number;
  currency: string;
  status: string;
  appointment_id: string | null;
  sale_id: string | null;
  created_at: string;
  link_kind: YocoLinkKind;
  /** True only when link_kind is booking and a completed booking_payments row exists with payment_provider=yoco and payment_provider_id=yoco_payment_id. */
  booking_synced: boolean;
}

export interface YocoReconciliationSummary {
  /** Rows returned after filters (≤ limit). */
  total: number;
  /** Rows with appointment_id set (booking takes precedence over sale when both exist). */
  with_booking: number;
  /** Rows linked to a legacy sale row only (sale_id set, no appointment_id). */
  with_sale_only: number;
  /** Terminal/Yoco rows not linked to a booking or sale on record. */
  unlinked: number;
  /** Subset of booking-linked rows that have a matching booking_payments row. */
  synced: number;
  /** Booking-linked rows without a matching booking_payments row (webhook/booking payment gap). */
  not_synced: number;
}

export interface YocoReconciliationResponse {
  payments: YocoReconciliationRow[];
  summary: YocoReconciliationSummary;
  timezone: string;
  fromYmd: string;
  toYmd: string;
  /** Max rows returned (cap 500). */
  limit: number;
  reportBasis: string;
  basis: {
    source: string;
    syncDefinition: string;
    amountUnits: string;
    locationFilter: string;
  };
  /** When location_id is set: rows must link to a booking or sale at that branch; unlinked rows are omitted. */
  note?: string;
}

const ID_CHUNK = 150;

function linkKind(p: { appointment_id: string | null; sale_id: string | null }): YocoLinkKind {
  if (p.appointment_id) return "booking";
  if (p.sale_id) return "sale";
  return "none";
}

/**
 * GET /api/provider/reports/payments/yoco-reconciliation
 *
 * Lists `provider_yoco_payments` for the provider in the **capture timestamp window**
 * (provider timezone bounds). Compares booking-linked rows to `booking_payments` where
 * `payment_provider = 'yoco'` and `payment_provider_id` matches `yoco_payment_id`.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { data: providerRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId =
      (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(
      searchParams,
      reportContext.timezone,
      { defaultDays: 30, maxDays: MAX_REPORT_DAYS },
    );
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 500);
    const locationId = searchParams.get("location_id") || undefined;

    const { data: yocoPayments, error: yocoError } = await supabaseAdmin
      .from("provider_yoco_payments")
      .select("id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (yocoError) throw yocoError;

    let payments = (yocoPayments || []) as Array<{
      id: string;
      yoco_payment_id: string;
      amount: number;
      currency: string;
      status: string;
      appointment_id: string | null;
      sale_id: string | null;
      created_at: string;
    }>;

    if (locationId && payments.length > 0) {
      const bookingIds = payments.map((p) => p.appointment_id).filter(Boolean) as string[];
      const saleIds = payments.map((p) => p.sale_id).filter(Boolean) as string[];
      const matchingBookingIds = new Set<string>();
      const matchingSaleIds = new Set<string>();

      for (let i = 0; i < bookingIds.length; i += ID_CHUNK) {
        const slice = bookingIds.slice(i, i + ID_CHUNK);
        const { data: bookingRows } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .in("id", slice)
          .eq("location_id", locationId);
        for (const row of bookingRows ?? []) {
          matchingBookingIds.add((row as { id: string }).id);
        }
      }

      for (let i = 0; i < saleIds.length; i += ID_CHUNK) {
        const slice = saleIds.slice(i, i + ID_CHUNK);
        const { data: saleRows } = await supabaseAdmin
          .from("sales")
          .select("id")
          .in("id", slice)
          .eq("location_id", locationId);
        for (const row of saleRows ?? []) {
          matchingSaleIds.add((row as { id: string }).id);
        }
      }

      payments = payments.filter((p) =>
        (p.appointment_id && matchingBookingIds.has(p.appointment_id)) ||
          (p.sale_id && matchingSaleIds.has(p.sale_id)),
      );
    }

    const withBooking = payments.filter((p) => !!p.appointment_id);
    const yocoIdsWithBooking = withBooking.map((p) => p.yoco_payment_id);

    const syncedSet = new Set<string>();
    if (yocoIdsWithBooking.length > 0) {
      for (let i = 0; i < yocoIdsWithBooking.length; i += ID_CHUNK) {
        const slice = yocoIdsWithBooking.slice(i, i + ID_CHUNK);
        let bpSyncQuery = supabaseAdmin
          .from("booking_payments")
          .select("payment_provider_id")
          .eq("payment_provider", "yoco")
          .in("payment_provider_id", slice);
        if (providerTenantId) {
          bpSyncQuery = bpSyncQuery.eq("tenant_id", providerTenantId);
        }
        const { data: bpRows } = await bpSyncQuery;
        for (const r of bpRows || []) {
          const id = (r as { payment_provider_id?: string }).payment_provider_id;
          if (id) syncedSet.add(id);
        }
      }
    }

    const rows: YocoReconciliationRow[] = payments.map((p) => {
      const lk = linkKind(p);
      const synced = lk === "booking" && syncedSet.has(p.yoco_payment_id);
      return {
        id: p.id,
        yoco_payment_id: p.yoco_payment_id,
        amount: Number(p.amount ?? 0),
        currency: p.currency,
        status: p.status,
        appointment_id: p.appointment_id,
        sale_id: p.sale_id,
        created_at: p.created_at,
        link_kind: lk,
        booking_synced: synced,
      };
    });

    const withBookingCount = rows.filter((r) => r.link_kind === "booking").length;
    const withSaleOnlyCount = rows.filter((r) => r.link_kind === "sale").length;
    const unlinkedCount = rows.filter((r) => r.link_kind === "none").length;
    const syncedCount = rows.filter((r) => r.booking_synced).length;
    const notSyncedCount = rows.filter((r) => r.link_kind === "booking" && !r.booking_synced).length;

    const reportBasis =
      `Rows from provider_yoco_payments with capture timestamps ${fromYmd}–${toYmd} (${reportContext.timezone}), newest first, capped at ${limit} rows. ` +
      `Amounts are stored in cents. Booking sync means a booking_payments row exists with payment_provider "yoco" and payment_provider_id equal to this row's Yoco payment id (typically after webhook/booking flow). ` +
      `Sale-linked or unlinked terminal payments are listed for visibility but do not use booking_payments sync checks.`;

    const response: YocoReconciliationResponse = {
      payments: rows,
      summary: {
        total: rows.length,
        with_booking: withBookingCount,
        with_sale_only: withSaleOnlyCount,
        unlinked: unlinkedCount,
        synced: syncedCount,
        not_synced: notSyncedCount,
      },
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      limit,
      reportBasis,
      basis: {
        source: "provider_yoco_payments filtered by created_at in the provider timezone window.",
        syncDefinition:
          'For booking-linked rows only: matched when at least one booking_payments row has payment_provider = "yoco" and payment_provider_id = yoco_payment_id (tenant-scoped when tenant_id is present).',
        amountUnits: "amount column is cents per schema — divide by 100 for major currency units in UI.",
        locationFilter: locationId
          ? "Only Yoco rows linked to a booking or sale whose location_id matches the selected branch are included; completely unlinked payments are excluded from this scoped view."
          : "All provider Yoco rows in the window are included.",
      },
      note: locationId
        ? "Branch filter: unlinked Yoco payments (no booking or sale id) are hidden because they cannot be attributed to a location."
        : undefined,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to load Yoco reconciliation report");
  }
}
