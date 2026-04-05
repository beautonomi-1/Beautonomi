import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import type { OrphanPaymentTxRow } from "@/lib/admin/payment-transactions-tenant-scope";
import { fetchNonBookingPaymentTxsForTenantExport } from "@/lib/admin/payment-transactions-tenant-scope";

type PaymentTxExportRow = OrphanPaymentTxRow;

/**
 * GET /api/admin/export/transactions
 * 
 * Export payment transactions as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = checkRateLimit(user.id, "export:transactions");
    if (!allowed) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            code: "RATE_LIMIT_EXCEEDED",
          },
        },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        }
      );
    }

    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Database connection failed",
            code: "DATABASE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("payment_transactions")
      .select(`
        id,
        reference,
        amount,
        fees,
        net_amount,
        status,
        provider,
        created_at,
        booking_id,
        metadata,
        booking:bookings!inner(tenant_id)
      `)
      .eq("booking.tenant_id", tenantId);

    if (status) {
      query = query.eq("status", status);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const [bookingLinkedResult, orphanRows] = await Promise.all([
      query.order("created_at", { ascending: false }),
      fetchNonBookingPaymentTxsForTenantExport(supabase, tenantId, {
        status,
        startDate,
        endDate,
      }),
    ]);

    const { data: bookingLinked, error } = bookingLinkedResult;

    if (error) {
      console.error("Error fetching transactions:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch transactions",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const byId = new Map<string, PaymentTxExportRow>();
    for (const row of bookingLinked || []) {
      byId.set((row as PaymentTxExportRow).id, row as PaymentTxExportRow);
    }
    for (const row of orphanRows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    const transactions = Array.from(byId.values()).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    // Fetch booking data separately if needed
    const bookingIds = [
      ...new Set(transactions.map((tx) => tx.booking_id).filter(Boolean) as string[]),
    ];

    let bookingMap = new Map();
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number")
        .eq("tenant_id", tenantId)
        .in("id", bookingIds);

      if (bookings) {
        bookingMap = new Map(bookings.map((b: { id: string; booking_number?: string }) => [b.id, b]));
      }
    }

    // Transform data for CSV
    type BookingRef = { id?: string; booking_number?: string };
    const csvData = transactions.map((tx: PaymentTxExportRow) => {
      const booking = tx.booking_id ? (bookingMap.get(tx.booking_id) as BookingRef | undefined) : null;
      const metaKind = tx.metadata && typeof tx.metadata.kind === "string" ? tx.metadata.kind : "";
      return {
        "Transaction ID": tx.id,
        "Reference": tx.reference ?? "",
        "Amount": tx.amount ?? "",
        "Fees": tx.fees ?? "",
        "Net Amount": tx.net_amount ?? "",
        "Status": tx.status ?? "",
        "Provider": tx.provider ?? "",
        "Created At": tx.created_at ?? "",
        "Metadata kind": metaKind,
        "Booking ID": booking?.id ?? "",
        "Booking Number": booking?.booking_number ?? "",
      };
    });

    const csv = arrayToCSV(csvData);
    const filename = generateCSVFilename("transactions-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/export/transactions:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to export transactions",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

