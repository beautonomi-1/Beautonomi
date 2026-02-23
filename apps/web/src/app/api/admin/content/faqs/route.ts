import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const faqSchema = z.object({
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
  category: z.string().optional().default("general"),
  order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const _updateFaqSchema = faqSchema.partial();
void _updateFaqSchema;

/**
 * GET /api/admin/content/faqs
 * 
 * Get all FAQs
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    
    // Return empty array if query fails instead of 500 error
    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    const { data: faqs, error } = await supabase
      .from("faqs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching FAQs:", error);
      // Return empty array instead of 500 error
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    // Transform database fields to frontend format
    const transformedFaqs = (faqs || []).map((f: any) => ({
      ...f,
      order: f.display_order || 0, // Map display_order to order for frontend
    }));

    return NextResponse.json({
      data: transformedFaqs || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/faqs:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch FAQs",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/content/faqs
 * 
 * Create a new FAQ
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = faqSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    const { question, answer, category, order, is_active } = validationResult.data;

    const { data: faq, error } = await supabase
      .from("faqs")
      .insert({
        question,
        answer,
        category,
        display_order: order,
        is_active,
      })
      .select()
      .single();

    if (error || !faq) {
      console.error("Error creating FAQ:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create FAQ",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.faq.create",
      entity_type: "faq",
      entity_id: (faq as any).id,
      metadata: { category, order, is_active },
    });

    return NextResponse.json({
      data: faq,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/faqs:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create FAQ",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

