import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { canAccessReportType } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";

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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    // Get all bookings
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, total_amount, scheduled_at, status")
      .eq("provider_id", providerId)
      .in("status", ["confirmed", "completed"]);

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

    // Calculate averages and enrich data
    const clientLTV = Array.from(clientMap.values()).map((client) => {
      const daysSinceFirst = Math.floor(
        (new Date().getTime() - client.firstVisit.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...client,
        averageBookingValue: client.totalBookings > 0 ? client.totalSpent / client.totalBookings : 0,
        daysSinceFirstVisit: daysSinceFirst,
        visitsPerMonth: daysSinceFirst > 0 ? (client.totalBookings / daysSinceFirst) * 30 : 0,
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);

    // Get client names
    const clientIds = clientLTV.map((c) => c.customerId);
    const { data: clients } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email")
      .in("id", clientIds);

    const clientNameMap = new Map(clients?.map((c) => [c.id, c]) || []);

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
    });
  } catch (error) {
    return handleApiError(error, "LIFETIME_VALUE_ERROR", 500);
  }
}
