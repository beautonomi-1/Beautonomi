import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/export/bookings
 * 
 * Export bookings as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:bookings");
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
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const scheduledDate = searchParams.get("scheduled_date") || searchParams.get("date");
    const status = searchParams.get("status");

    let query = supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        status,
        payment_status,
        total_amount,
        booking_source,
        created_at,
        scheduled_at,
        customer:users!bookings_customer_id_fkey(id, email, full_name),
        provider:providers!bookings_provider_id_fkey(id, business_name)
      `)
      .eq("tenant_id", tenantId);

    // Apply filters
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (scheduledDate) {
      const start = new Date(scheduledDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query = query.gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString());
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

    // Transform data for CSV (Supabase returns relations as arrays)
    type BookingRow = {
      id: string;
      booking_number?: string;
      status?: string;
      payment_status?: string;
      booking_source?: string | null;
      total_amount?: number;
      created_at?: string;
      scheduled_at?: string;
      customer?: { id?: string; email?: string; full_name?: string }[] | { id?: string; email?: string; full_name?: string };
      provider?: { id?: string; business_name?: string }[] | { id?: string; business_name?: string };
    };
    const csvData = (bookings || []).map((booking: BookingRow) => {
      const c = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer;
      const p = Array.isArray(booking.provider) ? booking.provider[0] : booking.provider;
      return {
        "Booking ID": booking.id,
        "Booking Number": booking.booking_number ?? "",
        "Status": booking.status ?? "",
        "Payment Status": booking.payment_status ?? "",
        "Booking Source": booking.booking_source ?? "online",
        "Total Amount": booking.total_amount ?? "",
        "Created At": booking.created_at ?? "",
        "Scheduled At": booking.scheduled_at ?? "",
        "Customer ID": c?.id ?? "",
        "Customer Email": c?.email ?? "",
        "Customer Name": c?.full_name ?? "",
        "Provider ID": p?.id ?? "",
        "Provider Name": p?.business_name ?? "",
      };
    });

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

