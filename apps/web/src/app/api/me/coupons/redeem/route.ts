import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { code } = body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json(
        { error: "Coupon code is required" },
        { status: 400 }
      );
    }

    // Find the coupon by code
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json(
        { error: "Invalid or expired coupon code" },
        { status: 404 }
      );
    }

    // Check if coupon is still valid
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json(
        { error: "This coupon is not yet valid" },
        { status: 400 }
      );
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json(
        { error: "This coupon has expired" },
        { status: 400 }
      );
    }

    // Check if user has already redeemed this coupon
    const { data: existingRedemption, error: redemptionCheckError } = await supabase
      .from('user_coupons')
      .select('id')
      .eq('user_id', user.id)
      .eq('coupon_id', coupon.id)
      .single();

    if (redemptionCheckError && redemptionCheckError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine
      throw redemptionCheckError;
    }

    if (existingRedemption) {
      return NextResponse.json(
        { error: "You have already redeemed this coupon" },
        { status: 400 }
      );
    }

    // Check usage limits
    if (coupon.max_uses_per_user) {
      const { count, error: countError } = await supabase
        .from('user_coupons')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('coupon_id', coupon.id);

      if (countError) {
        throw countError;
      }

      if (count && count >= coupon.max_uses_per_user) {
        return NextResponse.json(
          { error: "You have reached the maximum uses for this coupon" },
          { status: 400 }
        );
      }
    }

    // Create user_coupon record
    const { data: _userCoupon, error: insertError } = await supabase
      .from('user_coupons')
      .insert({
        user_id: user.id,
        coupon_id: coupon.id,
        is_active: true,
        redeemed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist, return a helpful error
      if (insertError.code === '42P01') {
        return NextResponse.json(
          { error: "Coupon system is not yet available. Please contact support." },
          { status: 503 }
        );
      }
      throw insertError;
    }

    return successResponse({
      message: "Coupon redeemed successfully",
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to redeem coupon");
  }
}
