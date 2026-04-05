import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerExportRowsForTenant } from "@/lib/admin/finance-ledger-tenant";

/**
 * GET /api/admin/finance/transactions
 * 
 * Get financial transactions with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page: 1,
          limit: 50,
          total: 0,
          has_more: false,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const type = searchParams.get("type"); // payment, refund, payout, fee

    const nowISO = new Date().toISOString();
    const defaultStart = new Date();
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 365);
    const rangeStart = startDate || defaultStart.toISOString();
    const rangeEnd = endDate || nowISO;

    let merged: Awaited<ReturnType<typeof fetchFinanceLedgerExportRowsForTenant>>;
    try {
      merged = await fetchFinanceLedgerExportRowsForTenant(
        supabase,
        tenantId,
        { start: rangeStart, end: rangeEnd },
        { transactionType: type && type !== "all" ? type : null }
      );
    } catch (err) {
      console.error("Error fetching transactions:", err);
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page,
          limit,
          total: 0,
          has_more: false,
        },
      });
    }

    const total = merged.length;
    const pageRows = merged.slice(offset, offset + limit);

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

    const transformedTransactions = pageRows.map((tx) => {
      const row = tx as TxRow;
      return {
        id: row.id,
        transaction_type: row.transaction_type || "unknown",
        amount: Number(row.amount ?? 0),
        fees: Number(row.fees ?? 0),
        commission: Number(row.commission ?? 0),
        net: Number(row.net ?? row.amount ?? 0),
        created_at: row.created_at,
        booking: row.booking_id
          ? {
              id: row.booking_id,
              booking_number: row.booking?.booking_number,
            }
          : null,
      };
    });

    return NextResponse.json({
      data: transformedTransactions,
      error: null,
      meta: {
        page,
        limit,
        total,
        has_more: total > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/finance/transactions:", error);
    return handleApiError(error, "Failed to fetch transactions");
  }
}

