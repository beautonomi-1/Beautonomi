import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updatePageContentSchema = z.object({
  page_slug: z.string().min(1).optional(),
  section_key: z.string().min(1).optional(),
  content_type: z.enum(["text", "html", "json", "image", "video"]).optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/content/pages/[id]
 * 
 * Get single page content by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: pageContent, error } = await supabase
      .from("page_content")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !pageContent) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Page content not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: pageContent,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/pages/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/content/pages/[id]
 * 
 * Update page content
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updatePageContentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (validationResult.data.page_slug !== undefined)
      updateData.page_slug = validationResult.data.page_slug;
    if (validationResult.data.section_key !== undefined)
      updateData.section_key = validationResult.data.section_key;
    if (validationResult.data.content_type !== undefined)
      updateData.content_type = validationResult.data.content_type;
    if (validationResult.data.content !== undefined)
      updateData.content = validationResult.data.content;
    if (validationResult.data.metadata !== undefined)
      updateData.metadata = validationResult.data.metadata;
    if (validationResult.data.order !== undefined)
      updateData.display_order = validationResult.data.order;
    if (validationResult.data.is_active !== undefined)
      updateData.is_active = validationResult.data.is_active;

    updateData.updated_at = new Date().toISOString();

    const { data: pageContent, error } = await supabase
      .from("page_content")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !pageContent) {
      console.error("Error updating page content:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update page content",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: pageContent,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/pages/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/content/pages/[id]
 * 
 * Delete page content (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: pageContent, error } = await (supabase
      .from("page_content") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !pageContent) {
      console.error("Error deleting page content:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete page content",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { message: "Page content deleted successfully" },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/pages/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
