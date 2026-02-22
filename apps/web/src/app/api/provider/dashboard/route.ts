import { NextRequest } from 'next/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // Require provider_owner or provider_staff role
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Get location_id from query params if provided
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('location_id');

    // Use service role client for all queries to avoid RLS infinite recursion
    // This is safe because we're already authenticated and checking user_id matches
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
      .select('id, status, business_name, rating_average, review_count')
      .eq('id', providerId)
      .maybeSingle();
    if (providerError || !providerData) {
      return handleApiError(
        new Error(providerError?.message ?? 'Provider not found'),
        'PROVIDER_FETCH_ERROR',
        500
      );
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Optimize: Get only necessary fields for faster queries
    // Load status, created_at, scheduled_at, and location_type in parallel with finance data
    // Build bookings query with optional location filter
    // IMPORTANT: Include 'id' and 'location_type' fields for location filtering and metrics
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('id, status, created_at, scheduled_at, location_id, location_type')
      .eq('provider_id', providerId);
    
    // If location filter is provided, show bookings for that location
    // When no location is selected, show all bookings (including those with NULL location_id)
    // Note: Bookings with NULL location_id (walk-in clients) are only shown when no location filter is applied
    if (locationId) {
      bookingsQuery = bookingsQuery.eq('location_id', locationId);
    }
    // When no locationId is provided, the query will return all bookings including NULL location_id

    // For finance transactions, we need to filter by location through bookings
    // This requires a join or subquery. For now, we'll filter finance transactions
    // by checking if they're related to bookings with the selected location
    const financeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, created_at, booking_id")
      .eq("provider_id", providerId);
    
    // If location filter is provided, we'll need to filter finance transactions
    // by joining with bookings. For performance, we'll do this in memory after fetching
    const [bookingsResult, ledgerResult] = await Promise.all([
      bookingsQuery,
      financeQuery
    ]);

    if (bookingsResult.error) {
      throw bookingsResult.error;
    }

    const allBookings = bookingsResult.data || [];
    const totalBookings = allBookings.length;
    
    // Debug: Log booking statuses to help diagnose issues
    if (process.env.NODE_ENV === 'development') {
      const statusCounts = allBookings.reduce((acc: Record<string, number>, booking: any) => {
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
      }, {});
      console.log('Dashboard booking status counts:', {
        total: totalBookings,
        statusCounts,
        locationId: locationId || 'all',
      });
    }
    
    // Count by status (single pass through array - faster than multiple filters)
    let confirmedBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    let noShowBookings = 0;
    let pendingBookings = 0;
    
    // Count by location_type for at-home vs at-salon breakdown
    let atHomeBookings = 0;
    let atSalonBookings = 0;
    let atHomeCompleted = 0;
    let atSalonCompleted = 0;
    let atHomeConfirmed = 0;
    let atSalonConfirmed = 0;
    let atHomePending = 0;
    let atSalonPending = 0;
    let atHomeCancelled = 0;
    let atSalonCancelled = 0;
    let atHomeNoShow = 0;
    let atSalonNoShow = 0;
    
    for (const booking of allBookings) {
      // Count by status
      switch (booking.status) {
        case 'confirmed': 
          confirmedBookings++; 
          if (booking.location_type === 'at_home') atHomeConfirmed++;
          else if (booking.location_type === 'at_salon') atSalonConfirmed++;
          break;
        case 'completed': 
          completedBookings++; 
          if (booking.location_type === 'at_home') atHomeCompleted++;
          else if (booking.location_type === 'at_salon') atSalonCompleted++;
          break;
        case 'cancelled': 
          cancelledBookings++; 
          if (booking.location_type === 'at_home') atHomeCancelled++;
          else if (booking.location_type === 'at_salon') atSalonCancelled++;
          break;
        case 'no_show': 
          noShowBookings++; 
          if (booking.location_type === 'at_home') atHomeNoShow++;
          else if (booking.location_type === 'at_salon') atSalonNoShow++;
          break;
        case 'pending': 
          pendingBookings++; 
          if (booking.location_type === 'at_home') atHomePending++;
          else if (booking.location_type === 'at_salon') atSalonPending++;
          break;
        // Note: 'in_progress' status exists but is not shown in dashboard status breakdown
        // It's counted in active_bookings calculation
      }
      
      // Count by location_type
      if (booking.location_type === 'at_home') {
        atHomeBookings++;
      } else if (booking.location_type === 'at_salon') {
        atSalonBookings++;
      }
    }

    // Revenue streams from finance ledger (already loaded in parallel above)
    let rows = ledgerResult.data || [];
    
    // Filter finance transactions by location if location_id is provided
    // We need to join with bookings to get location_id
    if (locationId && rows.length > 0) {
      // Get booking IDs for the selected location
      const locationBookingIds = new Set(
        allBookings.map((b: any) => b.id)
      );
      
      // Filter finance transactions to only those related to bookings in this location
      rows = rows.filter((r: any) => {
        // If transaction has booking_id, check if booking is in selected location
        if (r.booking_id) {
          return locationBookingIds.has(r.booking_id);
        }
        // For transactions without booking_id (e.g., gift cards, memberships),
        // we might want to include them or exclude them based on business logic
        // For now, exclude them when filtering by location
        return false;
      });
    }
    
    // Optimize: Pre-filter and pre-parse dates for faster processing
    const parsedRows = rows.map((r: any) => ({
      ...r,
      createdDate: new Date(r.created_at),
      netValue: Number(r.net ?? r.amount ?? 0),
      amountValue: Number(r.amount || 0),
    }));

    // Optimized sum functions - single pass with pre-parsed data
    const sumNet = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.netValue;
      }
      return sum;
    };

    const sumAmount = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.amountValue;
      }
      return sum;
    };

    // Total provider revenue is the provider earnings stream (includes bookings, add-ons, gift cards, memberships, and refund impacts).
    const providerEarningsTotal = sumNet(["provider_earnings"]);
    const totalRevenue = providerEarningsTotal;

    // Gross sales (for reporting) — does not change provider net directly here.
    const giftCardSalesTotal = sumAmount(["gift_card_sale"]);
    const membershipSalesTotal = sumAmount(["membership_sale"]);

    // Travel fees (separate from provider_earnings, goes 100% to provider)
    const travelFeesToday = sumNet(["travel_fee"], startOfToday);
    const travelFeesThisMonth = sumNet(["travel_fee"], startOfMonth);
    const travelFeesLastMonth = sumNet(["travel_fee"], startOfLastMonth, endOfLastMonth);
    const travelFeesTotal = sumNet(["travel_fee"]);

    // Refund impact on provider earnings (negative provider_earnings rows) - optimized
    let refundsTotal = 0;
    for (const r of parsedRows) {
      if (r.transaction_type === "provider_earnings" && r.netValue < 0) {
        refundsTotal += r.netValue;
      }
    }

    const revenueToday = sumNet(["provider_earnings"], startOfToday);
    const revenueThisWeek = sumNet(["provider_earnings"], startOfWeek);
    const revenueThisMonth = sumNet(["provider_earnings"], startOfMonth);
    const revenueLastMonth = sumNet(["provider_earnings"], startOfLastMonth, endOfLastMonth);

    const revenueGrowth =
      revenueLastMonth !== 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / Math.abs(revenueLastMonth)) * 100)
        : 0;

    // Calculate time-based metrics in single pass (optimized)
    let upcomingBookingsToday = 0;
    let bookingsScheduledThisWeek = 0;
    let bookingsScheduledThisMonth = 0;
    
    const todayEnd = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfNextWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    for (const booking of allBookings) {
      const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
      
      if (!scheduledDate) continue; // Skip unscheduled bookings
      
      // Upcoming bookings today (scheduled for today, not created today)
      if (booking.status === 'confirmed' && scheduledDate >= startOfToday && scheduledDate < todayEnd) {
        upcomingBookingsToday++;
      }
      
      // Bookings scheduled this week (not created this week)
      if (scheduledDate >= startOfWeek && scheduledDate < startOfNextWeek) {
        bookingsScheduledThisWeek++;
      }
      
      // Bookings scheduled this month (not created this month)
      if (scheduledDate >= startOfMonth && scheduledDate < startOfNextMonth) {
        bookingsScheduledThisMonth++;
      }
    }

    // Calculate available balance and pending payments
    // For available balance: filter provider_earnings by location, but include all payouts (provider-level)
    const financeBalanceQuery = supabaseAdmin
      .from('finance_transactions')
      .select('amount, net, transaction_type, booking_id')
      .eq('provider_id', providerId)
      .in('transaction_type', ['provider_earnings', 'payout', 'platform_fee']);
    
    const { data: financeData } = await financeBalanceQuery;
    
    let availableBalance = 0;
    const locationBookingIdsSet = locationId ? new Set(allBookings.map((b: any) => b.id)) : null;
    
    for (const txn of (financeData || [])) {
      if (txn.transaction_type === 'provider_earnings') {
        // Filter provider_earnings by location if location_id is provided
        if (locationId && locationBookingIdsSet) {
          if (txn.booking_id && locationBookingIdsSet.has(txn.booking_id)) {
            availableBalance += Number(txn.net || 0);
          }
          // Skip transactions without booking_id when filtering by location
        } else {
          // No location filter - include all provider_earnings
          availableBalance += Number(txn.net || 0);
        }
      } else if (txn.transaction_type === 'payout') {
        // Payouts are provider-level, not location-specific, so always include
        availableBalance -= Number(txn.amount || 0);
      }
    }
    
    // Calculate pending payments (unpaid bookings)
    let unpaidBookingsQuery = supabaseAdmin
      .from('bookings')
      .select('total_amount, payment_status')
      .eq('provider_id', providerId)
      .in('payment_status', ['pending', 'partially_paid'])
      .not('status', 'in', '(cancelled,no_show)');
    
    if (locationId) {
      unpaidBookingsQuery = unpaidBookingsQuery.eq('location_id', locationId);
    }
    
    const { data: unpaidBookings } = await unpaidBookingsQuery;
    
    const pendingPaymentsAmount = unpaidBookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
    const pendingPaymentsCount = unpaidBookings?.length || 0;
    
    // Calculate performance metrics
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShowBookings / totalBookings) * 100 : 0;

    // Fetch gamification data (points, badge, milestones) - use admin client
    const { data: gamificationData } = await supabaseAdmin
      .from('provider_points')
      .select(`
        total_points,
        lifetime_points,
        current_tier_points,
        badge_earned_at,
        badge_expires_at,
        provider_badges!provider_points_current_badge_id_fkey (
          id,
          name,
          slug,
          description,
          icon_url,
          tier,
          color,
          requirements,
          benefits
        )
      `)
      .eq('provider_id', providerId)
      .maybeSingle();

    const { data: milestones } = await supabaseAdmin
      .from('provider_milestones')
      .select('milestone_type, achieved_at')
      .eq('provider_id', providerId)
      .order('achieved_at', { ascending: false })
      .limit(10);

    const { data: recentTransactions } = await supabaseAdmin
      .from('provider_point_transactions')
      .select('points, source, description, created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Calculate progress to next badge
    let progressToNextBadge = null;
    const badge = Array.isArray(gamificationData?.provider_badges) ? gamificationData?.provider_badges?.[0] : gamificationData?.provider_badges;
    if (gamificationData) {
      const currentTier = badge?.tier || 0;
      const currentPoints = gamificationData.total_points || 0;
      
      // Fetch all active badges to find the next one
      const { data: allBadges } = await supabaseAdmin
        .from('provider_badges')
        .select('id, name, tier, color, requirements')
        .eq('is_active', true)
        .order('tier', { ascending: true });
      
      if (allBadges && allBadges.length > 0) {
        const nextBadge = allBadges.find(b => b.tier > currentTier);
        if (nextBadge) {
          const requiredPoints = (nextBadge.requirements as any)?.points || 0;
          const pointsNeeded = Math.max(0, requiredPoints - currentPoints);
          const progressPercentage = requiredPoints > 0 
            ? Math.min(100, Math.round((currentPoints / requiredPoints) * 100))
            : 0;
          
          progressToNextBadge = {
            badge: {
              id: nextBadge.id,
              name: nextBadge.name,
              tier: nextBadge.tier,
              color: nextBadge.color,
              requirements: nextBadge.requirements,
            },
            current_points: currentPoints,
            required_points: requiredPoints,
            points_needed: pointsNeeded,
            progress_percentage: progressPercentage,
          };
        }
      }
    }

    const gamification = gamificationData ? {
      total_points: gamificationData.total_points || 0,
      lifetime_points: gamificationData.lifetime_points || 0,
      current_tier_points: gamificationData.current_tier_points || 0,
      current_badge: badge ? {
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        icon_url: badge.icon_url,
        tier: badge.tier,
        color: badge.color,
        requirements: badge.requirements,
        benefits: badge.benefits,
      } : null,
      badge_earned_at: gamificationData.badge_earned_at,
      badge_expires_at: gamificationData.badge_expires_at,
      milestones: milestones || [],
      recent_transactions: recentTransactions || [],
      progress_to_next_badge: progressToNextBadge,
    } : null;

    const response = successResponse({
      // Booking counts
      total_bookings: totalBookings,
      active_bookings: totalBookings - cancelledBookings - noShowBookings,
      confirmed_bookings: confirmedBookings,
      completed_bookings: completedBookings,
      cancelled_bookings: cancelledBookings,
      no_show_bookings: noShowBookings,
      pending_bookings: pendingBookings,
      
      // Location type breakdown
      at_home_bookings: atHomeBookings,
      at_salon_bookings: atSalonBookings,
      at_home_completed: atHomeCompleted,
      at_salon_completed: atSalonCompleted,
      at_home_confirmed: atHomeConfirmed,
      at_salon_confirmed: atSalonConfirmed,
      at_home_pending: atHomePending,
      at_salon_pending: atSalonPending,
      at_home_cancelled: atHomeCancelled,
      at_salon_cancelled: atSalonCancelled,
      at_home_no_show: atHomeNoShow,
      at_salon_no_show: atSalonNoShow,
      
      // Revenue - Current period (primary)
      revenue_today: revenueToday,
      revenue_this_week: revenueThisWeek,
      revenue_this_month: revenueThisMonth,
      revenue_growth: revenueGrowth,
      
      // Revenue - Lifetime (secondary)
      lifetime_revenue: totalRevenue,
      
      // Financial status
      available_balance: Math.max(0, availableBalance),
      pending_payments_amount: pendingPaymentsAmount,
      pending_payments_count: pendingPaymentsCount,
      
      // Revenue streams
      service_earnings_total: providerEarningsTotal,
      gift_card_sales_total: giftCardSalesTotal,
      membership_sales_total: membershipSalesTotal,
      refunds_total: Math.abs(refundsTotal), // Show as positive number
      
      // Travel fees breakdown
      travel_fees_total: travelFeesTotal,
      travel_fees_today: travelFeesToday,
      travel_fees_this_month: travelFeesThisMonth,
      travel_fees_last_month: travelFeesLastMonth,
      
      // Performance metrics
      completion_rate: completionRate,
      no_show_rate: noShowRate,
      average_rating: providerData?.rating_average || 0,
      total_reviews: providerData?.review_count || 0,
      
      // Schedule (by scheduled_at, not created_at)
      appointments_today: upcomingBookingsToday,
      appointments_this_week: bookingsScheduledThisWeek,
      appointments_this_month: bookingsScheduledThisMonth,
      
      // Gamification
      gamification: gamification,
    });

    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    // Log the full error object for better debugging
    console.error('Error loading dashboard:', error);
    return handleApiError(error, 'Failed to load dashboard data');
  }
}
