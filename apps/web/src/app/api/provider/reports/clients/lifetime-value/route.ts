import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { canAccessReportType } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  CLIENT_METRICS_BASIS_NOTE,
  sumLedgerEarningsByCustomer,
} from "@/lib/reports/client-ledger-metrics";

type ClientSummary = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    // Check subscription allows advanced reports (client reports are advanced)
    const accessCheck = await canAccessReportType(user.id, "clients");
    if (!accessCheck.allowed) {
      return accessCheck.error!;
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);

    const locationId = request.nextUrl.searchParams.get("location_id") || undefined;
    // Get completed bookings only. CLV/spend should represent realized client value,
    // not future confirmed bookings or cancelled/no-show appointments.
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, customer_id, total_amount, scheduled_at, status")
      .eq("provider_id", providerId)
      .eq("status", "completed");
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Calculate lifetime value per client
    const clientMap = new Map<string, {
      customerId: string;
      totalSpent: number;
      totalEarned: number;
      totalBookings: number;
      firstVisit: Date;
      lastVisit: Date;
      averageBookingValue: number;
      daysSinceFirstVisit: number;
    }>();

    bookings?.forEach((booking) => {
      if (!booking.customer_id) return;
      const visitDate = new Date(booking.scheduled_at);
      const existing = clientMap.get(booking.customer_id) || {
        customerId: booking.customer_id,
        totalSpent: 0,
        totalEarned: 0,
        totalBookings: 0,
        firstVisit: visitDate,
        lastVisit: visitDate,
        averageBookingValue: 0,
        daysSinceFirstVisit: 0,
      };

      existing.totalSpent += Number(booking.total_amount || 0);
      existing.totalBookings += 1;
      if (visitDate < existing.firstVisit) existing.firstVisit = visitDate;
      if (visitDate > existing.lastVisit) existing.lastVisit = visitDate;
      clientMap.set(booking.customer_id, existing);
    });

    const ledgerByCustomer = await sumLedgerEarningsByCustomer(
      supabaseAdmin,
      providerId,
      new Date("2000-01-01T00:00:00.000Z"),
      new Date(),
      locationId,
      tz,
      (bookings ?? []).map((b) => ({ id: b.id, customer_id: b.customer_id })),
    );
    for (const [customerId, earned] of ledgerByCustomer.entries()) {
      const row = clientMap.get(customerId);
      if (row) row.totalEarned = earned;
    }

    // Calculate averages and enrich data
    const clientLTV = Array.from(clientMap.values()).map((client) => {
      const firstYmd = formatDateYmd(client.firstVisit, tz);
      const startAnchor = new Date(`${firstYmd}T12:00:00.000Z`);
      const endAnchor = new Date(`${todayYmd}T12:00:00.000Z`);
      const daysSinceFirst = Math.max(0, differenceInCalendarDays(endAnchor, startAnchor));
      return {
        ...client,
        averageBookingValue: client.totalBookings > 0 ? client.totalSpent / client.totalBookings : 0,
        daysSinceFirstVisit: daysSinceFirst,
        visitsPerMonth: daysSinceFirst > 0 ? (client.totalBookings / daysSinceFirst) * 30 : 0,
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);

    // Get client names
    const clientIds = clientLTV.map((c) => c.customerId);
    const { data: clients } = clientIds.length > 0
      ? await supabaseAdmin
          .from("users")
          .select("id, full_name, email")
          .in("id", clientIds)
      : { data: [] };

    const clientRows = (clients || []) as ClientSummary[];
    const clientNameMap = new Map<string, ClientSummary>(clientRows.map((c) => [c.id, c]));

    const enrichedLTV = clientLTV.map((client) => {
      const clientInfo = clientNameMap.get(client.customerId);
      return {
        ...client,
        clientName: clientInfo?.full_name || "Unknown",
        email: clientInfo?.email || "",
      };
    });

    // Summary metrics
    const totalClients = enrichedLTV.length;
    const averageLTV = totalClients > 0
      ? enrichedLTV.reduce((sum, c) => sum + c.totalSpent, 0) / totalClients
      : 0;
    const medianLTV = totalClients > 0
      ? enrichedLTV[Math.floor(totalClients / 2)]?.totalSpent || 0
      : 0;
    const totalLTV = enrichedLTV.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalLedgerEarnings = enrichedLTV.reduce((sum, c) => sum + (c.totalEarned ?? 0), 0);
    const averageLedgerEarnings =
      totalClients > 0 ? totalLedgerEarnings / totalClients : 0;
    const averageVisits = totalClients > 0
      ? enrichedLTV.reduce((sum, c) => sum + c.totalBookings, 0) / totalClients
      : 0;

    // Segment by LTV
    const highValue = enrichedLTV.filter((c) => c.totalSpent >= averageLTV * 1.5);
    const mediumValue = enrichedLTV.filter((c) => c.totalSpent >= averageLTV * 0.5 && c.totalSpent < averageLTV * 1.5);
    const lowValue = enrichedLTV.filter((c) => c.totalSpent < averageLTV * 0.5);

    return successResponse({
      totalClients,
      averageLTV,
      medianLTV,
      totalLTV,
      totalLedgerEarnings,
      averageLedgerEarnings,
      averageVisits,
      highValueClients: highValue.length,
      mediumValueClients: mediumValue.length,
      lowValueClients: lowValue.length,
      topClients: enrichedLTV.slice(0, 20),
      ltvSegments: [
        { segment: "High Value", count: highValue.length, avgLTV: highValue.length > 0 ? highValue.reduce((sum, c) => sum + c.totalSpent, 0) / highValue.length : 0 },
        { segment: "Medium Value", count: mediumValue.length, avgLTV: mediumValue.length > 0 ? mediumValue.reduce((sum, c) => sum + c.totalSpent, 0) / mediumValue.length : 0 },
        { segment: "Low Value", count: lowValue.length, avgLTV: lowValue.length > 0 ? lowValue.reduce((sum, c) => sum + c.totalSpent, 0) / lowValue.length : 0 },
      ],
      basisNote: `${CLIENT_METRICS_BASIS_NOTE} LTV segments use completed appointment booked gross; totalEarned is ledger recognized per client.`,
      reportBasis:
        "All-time completed bookings: totalSpent = sum of booking.total_amount (booked gross). totalEarned = sum of ledger recognized revenue per booking (provider take-home components). Cancellations and no-shows excluded.",
    });
  } catch (error) {
    return handleApiError(error, "LIFETIME_VALUE_ERROR", 500);
  }
}
