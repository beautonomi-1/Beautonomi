import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
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
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 90);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get all bookings for this provider (simplified query to avoid nested join issues)
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        customer_id,
        total_amount,
        scheduled_at,
        status
      `)
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return handleApiError(
        new Error(`Failed to fetch bookings: ${bookingsError.message}`),
        'BOOKINGS_FETCH_ERROR',
        500
      );
    }

    // Get client information separately
    const clientIds = new Set<string>();
    bookings?.forEach((booking: any) => {
      if (booking.customer_id) {
        clientIds.add(booking.customer_id);
      }
    });

    const clientInfoMap = new Map<string, { full_name: string }>();
    if (clientIds.size > 0) {
      const { data: clients, error: clientError } = await supabaseAdmin
        .from("users")
        .select("id, full_name")
        .in("id", Array.from(clientIds));

      if (clientError) {
        console.warn("Error fetching clients:", clientError);
      } else {
        clients?.forEach((client: any) => {
          clientInfoMap.set(client.id, {
            full_name: client.full_name || "Unknown",
          });
        });
      }
    }

    // Get all unique clients
    const clientMap = new Map<string, {
      clientId: string;
      clientName: string;
      totalBookings: number;
      totalSpent: number;
      lastVisit: string;
      firstVisit: string;
      bookings: any[];
    }>();

    bookings?.forEach((booking: any) => {
      const clientId = booking.customer_id;
      const clientInfo = clientInfoMap.get(clientId) || { full_name: "Unknown" };
      const existing = clientMap.get(clientId) || {
        clientId,
        clientName: clientInfo.full_name,
        totalBookings: 0,
        totalSpent: 0,
        lastVisit: booking.scheduled_at,
        firstVisit: booking.scheduled_at,
        bookings: [],
      };

      existing.totalBookings += 1;
      existing.totalSpent += Number(booking.total_amount || 0);
      existing.bookings.push(booking);

      if (new Date(booking.scheduled_at) > new Date(existing.lastVisit)) {
        existing.lastVisit = booking.scheduled_at;
      }
      if (new Date(booking.scheduled_at) < new Date(existing.firstVisit)) {
        existing.firstVisit = booking.scheduled_at;
      }

      clientMap.set(clientId, existing);
    });

    const clients = Array.from(clientMap.values());
    const totalClients = clients.length;

    // Get new clients (first booking in date range)
    const newClients = clients.filter((client) => {
      const firstVisit = new Date(client.firstVisit);
      return firstVisit >= fromDate && firstVisit <= toDate;
    }).length;

    // Get returning clients (more than 1 booking)
    const returningClients = clients.filter((c) => c.totalBookings > 1).length;

    // Calculate averages
    const averageBookingsPerClient =
      totalClients > 0
        ? clients.reduce((sum, c) => sum + c.totalBookings, 0) / totalClients
        : 0;

    const averageLifetimeValue =
      totalClients > 0
        ? clients.reduce((sum, c) => sum + c.totalSpent, 0) / totalClients
        : 0;

    // Get reviews for completed bookings to calculate average ratings
    const completedBookingIds = bookings
      ?.filter((b: any) => b.status === 'completed')
      .map((b: any) => b.id) || [];

    const reviewsMap = new Map<string, number[]>();
    
    if (completedBookingIds.length > 0) {
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .from('reviews')
        .select('booking_id, rating')
        .in('booking_id', completedBookingIds)
        .not('rating', 'is', null);

      if (!reviewsError && reviews) {
        reviews.forEach((review: any) => {
          const booking = bookings?.find((b: any) => b.id === review.booking_id);
          if (booking?.customer_id) {
            if (!reviewsMap.has(booking.customer_id)) {
              reviewsMap.set(booking.customer_id, []);
            }
            reviewsMap.get(booking.customer_id)!.push(review.rating);
          }
        });
      }
    }

    // Get top clients by revenue
    const topClients = clients
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((client) => {
        // Calculate average rating for this client from reviews
        const clientRatings = reviewsMap.get(client.clientId) || [];
        const averageRating = clientRatings.length > 0
          ? clientRatings.reduce((sum, rating) => sum + rating, 0) / clientRatings.length
          : 0;

        return {
          clientId: client.clientId,
          clientName: client.clientName,
          totalBookings: client.totalBookings,
          totalSpent: client.totalSpent,
          lastVisit: client.lastVisit,
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
        };
      });

    // Calculate retention rate (simplified - clients who returned)
    const retentionRate =
      totalClients > 0 ? (returningClients / totalClients) * 100 : 0;

    return successResponse({
      totalClients,
      newClients,
      returningClients,
      averageBookingsPerClient,
      averageLifetimeValue,
      topClients,
      clientRetention: {
        period: `${Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))} days`,
        retentionRate,
      },
    });
  } catch (error) {
    console.error("Error in client summary report:", error);
    return handleApiError(error, "Failed to generate client summary report");
  }
}
