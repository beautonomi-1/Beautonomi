import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

// Schema for validating profile question updates
const profileQuestionUpdateSchema = z.object({
  question_label: z.string().min(1).max(200).optional(),
  question_description: z.string().max(500).nullable().optional(),
  input_type: z.enum(['input', 'textarea', 'select']).optional(),
  input_placeholder: z.string().max(200).nullable().optional(),
  max_chars: z.number().int().min(0).max(1000).optional(),
  icon_name: z.string().max(100).nullable().optional(),
  display_order: z.number().int().min(0).optional(),
  section: z.enum(['profile', 'about', 'preferences', 'interests']).optional(),
  is_active: z.boolean().optional(),
  is_required: z.boolean().optional(),
}).partial();

/**
 * GET /api/admin/content/profile-questions/[id]
 * Get a specific profile question
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: question, error } = await supabase
      .from("profile_questions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Profile question not found");
      }
      throw error;
    }

    return successResponse(question);
  } catch (error) {
    return handleApiError(error, "Failed to fetch profile question");
  }
}

/**
 * PUT /api/admin/content/profile-questions/[id]
 * Update a profile question
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const body = await request.json();
    const supabase = await getSupabaseServer(request);

    const validationResult = profileQuestionUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData = {
      ...validationResult.data,
      updated_by: user.id,
    };

    const { data: question, error } = await supabase
      .from("profile_questions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Profile question not found");
      }
      throw error;
    }

    return successResponse(question);
  } catch (error) {
    return handleApiError(error, "Failed to update profile question");
  }
}

/**
 * DELETE /api/admin/content/profile-questions/[id]
 * Delete a profile question (soft delete by setting is_active = false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Soft delete by setting is_active = false
    const { data: question, error } = await supabase
      .from("profile_questions")
      .update({ is_active: false, updated_by: user.id })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Profile question not found");
      }
      throw error;
    }

    return successResponse(question);
  } catch (error) {
    return handleApiError(error, "Failed to delete profile question");
  }
}
