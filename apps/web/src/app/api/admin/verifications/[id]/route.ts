import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

// Schema for verification review
const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).nullable().optional(),
});

/**
 * GET /api/admin/verifications/[id]
 * Get a specific verification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: verification, error } = await supabase
      .from("user_verifications")
      .select(`
        *,
        user:users!user_verifications_user_id_fkey (
          id,
          full_name,
          email,
          phone,
          avatar_url
        ),
        reviewer:users!user_verifications_reviewed_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Verification not found");
      }
      throw error;
    }

    return successResponse(verification);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verification");
  }
}

/**
 * PATCH /api/admin/verifications/[id]
 * Review a verification (approve or reject)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const body = await request.json();
    const supabase = await getSupabaseServer(request);

    const validationResult = reviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { status, rejection_reason } = validationResult.data;

    // Update verification
    const { data: verification, error: updateError } = await supabase
      .from("user_verifications")
      .update({
        status,
        rejection_reason: status === 'rejected' ? rejection_reason : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id)
      .select(`
        *,
        user:users!user_verifications_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return notFoundResponse("Verification not found");
      }
      throw updateError;
    }

    // The trigger will automatically update the users table

    return successResponse(verification);
  } catch (error) {
    return handleApiError(error, "Failed to review verification");
  }
}
