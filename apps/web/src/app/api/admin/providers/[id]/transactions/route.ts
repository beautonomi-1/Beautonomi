import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, getPaginationParams } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerExportRowsForTenant } from "@/lib/admin/finance-ledger-tenant";

function financeTransactionTypesForFilter(type: string | null): string[] | null {
  switch (type) {
    case "payment":
      return ["payment", "wallet_payment", "gift_card_payment", "charge", "additional_charge_payment"];
    case "earnings":
      return ["provider_earnings", "tip", "travel_fee", "cancellation_fee"];
    case "fee":
      return ["platform_fee", "service_fee", "commission"];
    case "refund":
      return ["refund"];
    case "payout":
      return ["payout"];
    default:
      return null;
  }
}

/**
 * GET /api/admin/providers/:id/transactions
 *
 * Provider-scoped finance ledger: payments, earnings, fees, refunds, tips, payouts.
 * Returns paginated rows + summary totals for the Transactions tab on provider detail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: providerId } = await params;

    if (!admin) {
      return NextResponse.json({
        data: [],
        summary: null,
        error: null,
        meta: { page: 1, limit: 50, total: 0, has_more: false },
      });
    }

    // Verify provider belongs to this tenant before exposing financial data.
    const { data: providerRow, error: providerErr } = await admin
      .from("providers")
      .select("id, business_name")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (providerErr) throw providerErr;
    if (!providerRow) {
      return NextResponse.json(
        { error: "Provider not found in this tenant" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const type = searchParams.get("type");

    const nowISO = new Date().toISOString();
    const defaultStart = new Date();
    defaultStart.setUTCDate(1);
    defaultStart.setUTCHours(0, 0, 0, 0);
    const rangeStart = startDate ?? defaultStart.toISOString();
    const rangeEnd = endDate ?? nowISO;
    const transactionTypes = financeTransactionTypesForFilter(type);

    let rows: Awaited<ReturnType<typeof fetchFinanceLedgerExportRowsForTenant>>;
    try {
      rows = await fetchFinanceLedgerExportRowsForTenant(
        admin,
        tenantId,
        { start: rangeStart, end: rangeEnd },
        transactionTypes
          ? { transactionTypes, restrictProviderIds: [providerId] }
          : { transactionType: type && type !== "all" ? type : null, restrictProviderIds: [providerId] }
      );
    } catch (err) {
      console.error("[provider/transactions] ledger fetch failed:", err);
      return NextResponse.json({
        data: [],
        summary: null,
        error: null,
        meta: { page, limit, total: 0, has_more: false },
      });
    }

    // Compute summary totals over the full (unpagged) result set.
    let gross = 0;
    let fees = 0;
    let commission = 0;
    let net = 0;
    let refunds = 0;
    let payouts = 0;

    for (const row of rows) {
      const txType = String((row as Record<string, unknown>).transaction_type ?? "");
      const amount = Number((row as Record<string, unknown>).amount ?? 0);
      const rowNet = Number((row as Record<string, unknown>).net ?? (row as Record<string, unknown>).amount ?? 0);

      if (
        txType === "payment" || txType === "wallet_payment" || txType === "gift_card_payment" ||
        txType === "charge" || txType === "additional_charge_payment" || txType === "provider_earnings" ||
        txType === "tip" || txType === "travel_fee" || txType === "cancellation_fee"
      ) {
        gross += amount;
        fees += Number((row as Record<string, unknown>).fees ?? 0);
        commission += Number((row as Record<string, unknown>).commission ?? 0);
        net += rowNet;
      } else if (txType === "refund") {
        refunds += Math.abs(rowNet);
      } else if (txType === "payout") {
        payouts += Math.abs(rowNet);
      }
    }

    const summary = {
      gross,
      fees,
      commission,
      net,
      refunds,
      payouts,
    };

    // Paginate after computing totals.
    const total = rows.length;
    const pageRows = rows.slice(offset, offset + limit);

    type TxRow = {
      id: string;
      booking_id?: string;
      transaction_type?: string;
      amount?: number;
      fees?: number;
      commission?: number;
      net?: number;
      created_at?: string;
      booking?: { booking_number?: string } | null;
    };

    const data = pageRows.map((tx) => {
      const row = tx as TxRow;
      return {
        id: row.id,
        transaction_type: row.transaction_type ?? "unknown",
        amount: Number(row.amount ?? 0),
        fees: Number(row.fees ?? 0),
        commission: Number(row.commission ?? 0),
        net: Number(row.net ?? row.amount ?? 0),
        created_at: row.created_at,
        booking: row.booking_id
          ? { id: row.booking_id, booking_number: row.booking?.booking_number }
          : null,
      };
    });

    return NextResponse.json({
      data,
      summary,
      error: null,
      meta: { page, limit, total, has_more: total > offset + limit },
    });
  } catch (error) {
    console.error("[provider/transactions] unexpected error:", error);
    return handleApiError(error, "Failed to fetch provider transactions");
  }
}
