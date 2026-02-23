import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

// Schema for validating profile question updates
const profileQuestionSchema = z.object({
  question_key: z.string().min(1).max(100),
  question_label: z.string().min(1).max(200),
  question_description: z.string().max(500).nullable().optional(),
  input_type: z.enum(['input', 'textarea', 'select']),
  input_placeholder: z.string().max(200).nullable().optional(),
  max_chars: z.number().int().min(0).max(1000).optional(),
  icon_name: z.string().max(100).nullable().optional(),
  display_order: z.number().int().min(0),
  section: z.enum(['profile', 'about', 'preferences', 'interests']),
  is_active: z.boolean().optional(),
  is_required: z.boolean().optional(),
});

/**
 * GET /api/admin/content/profile-questions
 * Get all profile questions (for admin)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data: questions, error } = await supabase
      .from("profile_questions")
      .select("*")
      .order("section", { ascending: true })
      .order("display_order", { ascending: true });

    if (error) throw error;

    return successResponse(questions);
  } catch (error) {
    return handleApiError(error, "Failed to fetch profile questions");
  }
}

/**
 * POST /api/admin/content/profile-questions
 * Create a new profile question
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const body = await request.json();
    const supabase = await getSupabaseServer(request);

    const validationResult = profileQuestionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const questionData = {
      ...validationResult.data,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data: question, error } = await supabase
      .from("profile_questions")
      .insert(questionData)
      .select()
      .single();

    if (error) throw error;

    return successResponse(question);
  } catch (error) {
    return handleApiError(error, "Failed to create profile question");
  }
}
