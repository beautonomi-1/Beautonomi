import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, handleApiError, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

/**
 * GET /api/admin/finance/transactions
 * 
 * Get financial transactions with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = await getSupabaseServer(request);

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

    // Get transactions from finance_transactions table
    let query = supabase
      .from("finance_transactions")
      .select("*", { count: "exact" });

    // Apply filters
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (type && type !== "all") {
      query = query.eq("transaction_type", type);
    }

    // Apply pagination
    const { data: transactions, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching transactions:", error);
      // Return empty array instead of error to prevent crashes
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

    // Fetch related booking data separately if needed
    type TxRow = { id: string; booking_id?: string; transaction_type?: string; amount?: number; fees?: number; commission?: number; net?: number; created_at?: string };
    type BookingRef = { id: string; booking_number?: string };
    const bookingIds = [
      ...new Set(
        (transactions || []).map((t: TxRow) => t.booking_id).filter(Boolean)
      ),
    ];

    let bookingMap = new Map<string, BookingRef>();
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number")
        .in("id", bookingIds);
      if (bookings) {
        bookingMap = new Map(bookings.map((b: BookingRef) => [b.id, b]));
      }
    }

    const transformedTransactions = (transactions || []).map((tx: TxRow) => ({
      id: tx.id,
      transaction_type: tx.transaction_type || "unknown",
      amount: Number(tx.amount ?? 0),
      fees: Number(tx.fees ?? 0),
      commission: Number(tx.commission ?? 0),
      net: Number(tx.net ?? tx.amount ?? 0),
      created_at: tx.created_at,
      booking: tx.booking_id
        ? bookingMap.get(tx.booking_id) || null
        : null,
    }));

    return NextResponse.json({
      data: transformedTransactions,
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/finance/transactions:", error);
    return handleApiError(error, "Failed to fetch transactions");
  }
}

