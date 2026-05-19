import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

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
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    
    // Return empty array if query fails instead of 500 error
    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "faqs",
      tenantId,
      select: "*",
      dedupeKey: (row) => `${String(row.category ?? "")}::${String(row.question ?? "")}`,
      orderBy: { column: "display_order", ascending: true },
    });
    const faqs = scoped.data;

    type FaqRow = { display_order?: number; [key: string]: unknown };
    const transformedFaqs = (faqs || []).map((f: FaqRow) => ({
      ...f,
      order: f.display_order ?? 0,
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
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
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
        tenant_id: tenantId,
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
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content.faq.create",
      entity_type: "faq",
      entity_id: (faq as { id: string }).id,
      metadata: { category, order, is_active },
    });

    const row = faq as { display_order?: number } & Record<string, unknown>;
    return NextResponse.json({
      data: { ...row, order: row.display_order ?? 0 },
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

