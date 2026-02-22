import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateMembershipSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  currency: z.string().min(1).optional(),
  billing_period: z.enum(["monthly", "yearly"]).optional(),
  features: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  max_bookings_per_month: z.number().positive().nullable().optional(),
  max_staff_members: z.number().positive().nullable().optional(),
  max_locations: z.number().positive().nullable().optional(),
}).partial();

/**
 * GET /api/admin/memberships/[id]
 * 
 * Get a specific membership plan
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const adminSupabase = getSupabaseAdmin();

    const { data: membership, error } = await adminSupabase
      .from("memberships")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ membership });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership");
  }
}

/**
 * PUT /api/admin/memberships/[id]
 * 
 * Update a membership plan
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const body = await request.json();
    const validated = updateMembershipSchema.parse(body);

    const adminSupabase = getSupabaseAdmin();

    // If name is being updated, check for duplicates
    if (validated.name) {
      const { data: existing } = await adminSupabase
        .from("memberships")
        .select("id")
        .eq("name", validated.name)
        .neq("id", id)
        .maybeSingle();

      if (existing) {
        return handleApiError(
          new Error("Membership name already exists"),
          "A membership plan with this name already exists",
          "DUPLICATE_MEMBERSHIP",
          400
        );
      }
    }

    const { data: membership, error } = await adminSupabase
      .from("memberships")
      .update(validated)
      .eq("id", id)
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
    return handleApiError(error, "Failed to update membership");
  }
}

/**
 * PATCH /api/admin/memberships/[id]
 * 
 * Partially update a membership plan
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

/**
 * DELETE /api/admin/memberships/[id]
 * 
 * Delete a membership plan
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const adminSupabase = getSupabaseAdmin();

    // Check if any providers are using this membership
    const { data: providers } = await adminSupabase
      .from("providers")
      .select("id")
      .eq("membership_id", id)
      .limit(1);

    if (providers && providers.length > 0) {
      return handleApiError(
        new Error("Membership in use"),
        "Cannot delete membership plan that is currently assigned to providers",
        "MEMBERSHIP_IN_USE",
        400
      );
    }

    const { error } = await adminSupabase
      .from("memberships")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Membership plan deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete membership plan");
  }
}
