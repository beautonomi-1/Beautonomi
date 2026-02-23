import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/transactions
 * 
 * Export payment transactions as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:transactions");
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

    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Simplified query without foreign key join to avoid potential issues
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
        booking_id
      `);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: transactions, error } = await query.order("created_at", { ascending: false });

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

    // Fetch booking data separately if needed
    const bookingIds = [
      ...new Set(
        (transactions || [])
          .map((tx: any) => tx.booking_id)
          .filter(Boolean)
      ),
    ];

    let bookingMap = new Map();
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number")
        .in("id", bookingIds);

      if (bookings) {
        bookingMap = new Map(bookings.map((b: any) => [b.id, b]));
      }
    }

    // Transform data for CSV
    const csvData = (transactions || []).map((tx: any) => {
      const booking = tx.booking_id ? bookingMap.get(tx.booking_id) : null;
      return {
        "Transaction ID": tx.id,
        "Reference": tx.reference,
        "Amount": tx.amount,
        "Fees": tx.fees,
        "Net Amount": tx.net_amount,
        "Status": tx.status,
        "Provider": tx.provider,
        "Created At": tx.created_at,
        "Booking ID": booking?.id || "",
        "Booking Number": booking?.booking_number || "",
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

