import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/bookings
 * 
 * Export bookings as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:bookings");
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
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const status = searchParams.get("status");

    let query = supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        status,
        payment_status,
        total_amount,
        created_at,
        scheduled_at,
        customer:users!bookings_customer_id_fkey(id, email, full_name),
        provider:providers!bookings_provider_id_fkey(id, business_name)
      `);

    // Apply filters
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: bookings, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching bookings:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch bookings",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform data for CSV
    const csvData = (bookings || []).map((booking: any) => ({
      "Booking ID": booking.id,
      "Booking Number": booking.booking_number,
      "Status": booking.status,
      "Payment Status": booking.payment_status,
      "Total Amount": booking.total_amount,
      "Created At": booking.created_at,
      "Scheduled At": booking.scheduled_at,
      "Customer ID": booking.customer?.id || "",
      "Customer Email": booking.customer?.email || "",
      "Customer Name": booking.customer?.full_name || "",
      "Provider ID": booking.provider?.id || "",
      "Provider Name": booking.provider?.business_name || "",
    }));

    const csv = arrayToCSV(csvData);
    const filename = generateCSVFilename("bookings-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/export/bookings:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to export bookings",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

