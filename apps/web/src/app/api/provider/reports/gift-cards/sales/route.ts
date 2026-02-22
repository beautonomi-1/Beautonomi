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
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Platform-only gift cards - providers don't sell gift cards
    // This report now shows gift cards redeemed at this provider (via bookings)
    // Get gift card redemptions for this provider's bookings
    const { data: bookingsWithGiftCards, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('id, gift_card_id, gift_card_amount, scheduled_at')
      .eq('provider_id', providerId)
      .not('gift_card_id', 'is', null)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (bookingsError) {
      if (
        bookingsError.message.includes('bookings') ||
        bookingsError.message.includes('relation') ||
        bookingsError.message.includes('does not exist')
      ) {
        return successResponse({
          totalGiftCardsSold: 0,
          totalRevenue: 0,
          averageGiftCardValue: 0,
          giftCardSales: [],
        });
      }
      throw bookingsError;
    }

    // Get gift card redemptions for these bookings
    const bookingIds = bookingsWithGiftCards?.map(b => b.id) || [];
    let redemptionsQuery = supabaseAdmin
      .from('gift_card_redemptions')
      .select('id, gift_card_id, booking_id, amount, currency, status, captured_at')
      .eq('status', 'captured')
      .not('captured_at', 'is', null)
      .gte('captured_at', fromDate.toISOString())
      .lte('captured_at', toDate.toISOString());

    if (bookingIds.length > 0) {
      redemptionsQuery = redemptionsQuery.in('booking_id', bookingIds);
    } else {
      return successResponse({
        totalGiftCardsSold: 0,
        totalRevenue: 0,
        averageGiftCardValue: 0,
        giftCardSales: [],
      });
    }

    const { data: redemptions, error: redemptionsError } = await redemptionsQuery;

    if (redemptionsError) {
      if (
        redemptionsError.message.includes('gift_card_redemptions') ||
        redemptionsError.message.includes('relation') ||
        redemptionsError.message.includes('does not exist')
      ) {
        return successResponse({
          totalGiftCardsSold: 0,
          totalRevenue: 0,
          averageGiftCardValue: 0,
          giftCardSales: [],
        });
      }
      throw redemptionsError;
    }

    // Report shows gift cards redeemed at this provider (not sold by provider)
    const totalGiftCardsSold = redemptions?.length || 0; // Actually redemptions, not sales
    const totalRevenue = redemptions?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    const averageGiftCardValue = totalGiftCardsSold > 0 ? totalRevenue / totalGiftCardsSold : 0;

    // Group by amount
    const amountMap = new Map<number, number>();
    redemptions?.forEach((redemption) => {
      const amount = Number(redemption.amount || 0);
      amountMap.set(amount, (amountMap.get(amount) || 0) + 1);
    });

    const giftCardSales = Array.from(amountMap.entries())
      .map(([amount, count]) => ({
        amount,
        count,
        revenue: amount * count,
        percentage: totalGiftCardsSold > 0 ? (count / totalGiftCardsSold) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return successResponse({
      totalGiftCardsSold: totalGiftCardsSold, // Actually redemptions (gift cards used at this provider)
      totalRevenue: totalRevenue, // Total value of gift cards redeemed
      averageGiftCardValue: averageGiftCardValue,
      giftCardSales: giftCardSales, // Breakdown by redemption amount
      note: "Platform sells all gift cards. This report shows gift cards redeemed at your business.",
    });
  } catch (error) {
    return handleApiError(error, "GIFT_CARD_SALES_ERROR", 500);
  }
}
