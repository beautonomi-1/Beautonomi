import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const couponSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().optional(),
  description: z.string().optional(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().positive("Discount value must be positive"),
  currency: z.string().optional(),
  min_purchase_amount: z.number().min(0).default(0),
  max_discount_amount: z.number().positive().optional(),
  valid_from: z.string().datetime().optional(),
  valid_until: z.string().datetime().optional(),
  max_uses: z.number().int().positive().optional(),
  max_uses_per_user: z.number().int().positive().default(1),
  is_active: z.boolean().default(true),
});

/**
 * GET /api/coupons
 * 
 * Get all active coupons (public) or all coupons (admin)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    // If code provided, validate coupon
    if (code) {
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (error || !coupon) {
        return successResponse({
          valid: false,
          coupon: null,
          message: "Invalid or expired coupon code",
        });
      }

      // Check validity dates
      const now = new Date();
      if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        return successResponse({
          valid: false,
          coupon: null,
          message: "Coupon is not yet valid",
        });
      }

      if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        return successResponse({
          valid: false,
          coupon: null,
          message: "Coupon has expired",
        });
      }

      // Check max uses
      if (coupon.max_uses) {
        const { count } = await supabase
          .from("user_coupons")
          .select("*", { count: "exact", head: true })
          .eq("coupon_id", coupon.id);

        if ((count || 0) >= coupon.max_uses) {
          return successResponse({
            valid: false,
            coupon: null,
            message: "Coupon has reached maximum uses",
          });
        }
      }

      return successResponse({
        valid: true,
        coupon,
      });
    }

    // Get all active coupons (public)
    const { data: coupons, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse({ coupons: coupons || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch coupons");
  }
}

/**
 * POST /api/coupons
 * 
 * Create a new coupon (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validated = couponSchema.parse(body);

    // Check if code already exists
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", validated.code.toUpperCase())
      .single();

    if (existing) {
      return errorResponse(
        "Coupon code already exists",
        "DUPLICATE_CODE",
        400
      );
    }

    // Create coupon
    const { data: coupon, error } = await supabase
      .from("coupons")
      .insert({
        code: validated.code.toUpperCase(),
        name: validated.name,
        description: validated.description,
        discount_type: validated.discount_type,
        discount_value: validated.discount_value,
        currency: validated.currency,
        min_purchase_amount: validated.min_purchase_amount,
        max_discount_amount: validated.max_discount_amount,
        valid_from: validated.valid_from,
        valid_until: validated.valid_until,
        max_uses: validated.max_uses,
        max_uses_per_user: validated.max_uses_per_user,
        is_active: validated.is_active,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      coupon,
      message: "Coupon created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create coupon");
  }
}
