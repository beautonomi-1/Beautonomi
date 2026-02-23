import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateFaqSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  category: z.string().optional(),
  order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/content/faqs/[id]
 * 
 * Get a single FAQ
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: faq, error } = await supabase
      .from("faqs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !faq) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "FAQ not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: faq,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/faqs/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch FAQ",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/content/faqs/[id]
 * 
 * Update an FAQ
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateFaqSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    const { data: faq, error } = await (supabase
      .from("faqs") as any)
      .update(validationResult.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !faq) {
      console.error("Error updating FAQ:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update FAQ",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.faq.update",
      entity_type: "faq",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: faq,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/faqs/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update FAQ",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/content/faqs/[id]
 * 
 * Delete an FAQ (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Soft delete by setting is_active to false
    const { data: faq, error } = await (supabase
      .from("faqs") as any)
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !faq) {
      console.error("Error deleting FAQ:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete FAQ",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.faq.delete",
      entity_type: "faq",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/faqs/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete FAQ",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
