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

    // Get gift card redemptions via bookings (redemptions are linked to bookings)
    // First, get all bookings for this provider that used gift cards
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
          totalRedemptions: 0,
          totalRedeemedValue: 0,
          averageRedemptionValue: 0,
          redemptionRate: 0,
          redemptions: [],
        });
      }
      throw bookingsError;
    }

    // Get gift card redemptions from gift_card_redemptions table
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
      // No bookings with gift cards, return empty
      return successResponse({
        totalRedemptions: 0,
        totalRedeemedValue: 0,
        averageRedemptionValue: 0,
        redemptionRate: 0,
        redemptions: [],
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
          totalRedemptions: 0,
          totalRedeemedValue: 0,
          averageRedemptionValue: 0,
          redemptionRate: 0,
          redemptions: [],
        });
      }
      throw redemptionsError;
    }

    // Platform-only gift cards - can't calculate redemption rate per provider
    // Redemption rate would need to track all platform gift cards vs. redemptions at this provider
    // For now, we'll show redemption count and value only
    const _totalGiftCards = 0; // Not applicable - platform sells all gift cards
    const totalRedemptions = redemptions?.length || 0;
    const totalRedeemedValue = redemptions?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    const averageRedemptionValue = totalRedemptions > 0 ? totalRedeemedValue / totalRedemptions : 0;
    const redemptionRate = 0; // Not applicable - platform-wide gift cards can't calculate per-provider rate

    return successResponse({
      totalRedemptions,
      totalRedeemedValue,
      averageRedemptionValue,
      redemptionRate, // Not applicable for platform-wide gift cards
      redemptions: redemptions?.slice(0, 20).map((r: any) => ({
        id: r.id,
        gift_card_id: r.gift_card_id,
        booking_id: r.booking_id,
        amount: Number(r.amount || 0),
        currency: r.currency,
        captured_at: r.captured_at,
      })) || [],
      note: "Platform sells all gift cards. This report shows gift cards redeemed at your business.",
    });
  } catch (error) {
    return handleApiError(error, "GIFT_CARD_REDEMPTIONS_ERROR", 500);
  }
}
