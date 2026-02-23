import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const membershipSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().min(1, "Currency is required"),
  billing_period: z.enum(["monthly", "yearly"]),
  features: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  max_bookings_per_month: z.number().positive().nullable().optional(),
  max_staff_members: z.number().positive().nullable().optional(),
  max_locations: z.number().positive().nullable().optional(),
});

/**
 * GET /api/admin/memberships
 * 
 * Get all membership plans
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const adminSupabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const is_active = searchParams.get("is_active");

    let query = adminSupabase
      .from("memberships")
      .select("*")
      .order("price", { ascending: true })
      .order("created_at", { ascending: false });

    if (is_active !== null) {
      query = query.eq("is_active", is_active === "true");
    }

    const { data: memberships, error } = await query;

    if (error) {
      throw error;
    }

    return successResponse({ memberships: memberships || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch memberships");
  }
}

/**
 * POST /api/admin/memberships
 * 
 * Create a new membership plan
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const validated = membershipSchema.parse(body);

    const adminSupabase = getSupabaseAdmin();

    // Check if membership name already exists
    const { data: existing } = await adminSupabase
      .from("memberships")
      .select("id")
      .eq("name", validated.name)
      .maybeSingle();

    if (existing) {
      return handleApiError(
        new Error("Membership name already exists"),
        "A membership plan with this name already exists",
        "DUPLICATE_MEMBERSHIP",
        400
      );
    }

    const { data: membership, error } = await adminSupabase
      .from("memberships")
      .insert({
        name: validated.name,
        description: validated.description || null,
        price: validated.price,
        currency: validated.currency,
        billing_period: validated.billing_period,
        features: validated.features,
        is_active: validated.is_active,
        max_bookings_per_month: validated.max_bookings_per_month || null,
        max_staff_members: validated.max_staff_members || null,
        max_locations: validated.max_locations || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ membership });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create membership");
  }
}
