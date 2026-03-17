/**
 * GET /api/admin/content/learning/categories/[id]
 * PUT /api/admin/content/learning/categories/[id]
 * DELETE /api/admin/content/learning/categories/[id]
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  icon: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  audience: z.enum(["general", "customer", "provider", "internal"]).optional(),
  visibility: z.enum(["public", "internal"]).optional(),
  parent_id: z.string().uuid().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, _request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("learning_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: "Category not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("Unexpected error in GET learning category:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch category", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

/** Check if setting parent_id would create a cycle (parent must not be self or descendant of self). */
async function wouldCreateCycle(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  categoryId: string,
  newParentId: string | null
): Promise<boolean> {
  if (!newParentId || newParentId === categoryId) return newParentId === categoryId;
  let currentId: string | null = newParentId;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === categoryId) return true;
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const { data: cat } = await supabase
      .from("learning_categories")
      .select("parent_id")
      .eq("id", currentId)
      .single();
    currentId = cat?.parent_id ?? null;
  }
  return false;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
        },
        { status: 400 }
      );
    }

    if (parsed.data.parent_id !== undefined) {
      const cycle = await wouldCreateCycle(supabase, id, parsed.data.parent_id);
      if (cycle) {
        return NextResponse.json(
          { data: null, error: { message: "Parent would create a cycle", code: "VALIDATION_ERROR" } },
          { status: 400 }
        );
      }
    }

    const { data: row, error } = await supabase
      .from("learning_categories")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      console.error("Error updating learning category:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to update category", code: "UPDATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.category.update",
      entity_type: "learning_category",
      entity_id: id,
      metadata: parsed.data,
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("Unexpected error in PUT learning category:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to update category", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, _request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data: children } = await supabase
      .from("learning_categories")
      .select("id")
      .eq("parent_id", id)
      .limit(1);
    if (children && children.length > 0) {
      return NextResponse.json(
        { data: null, error: { message: "Cannot delete: category has sub-categories. Move or delete them first.", code: "HAS_CHILDREN" } },
        { status: 400 }
      );
    }
    const { count: articleCount } = await supabase
      .from("learning_articles")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if (articleCount && articleCount > 0) {
      return NextResponse.json(
        { data: null, error: { message: `Cannot delete: category has ${articleCount} article(s). Move them to another category first.`, code: "HAS_ARTICLES" } },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("learning_categories").delete().eq("id", id);

    if (error) {
      console.error("Error deleting learning category:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to delete category", code: "DELETE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.category.delete",
      entity_type: "learning_category",
      entity_id: id,
      metadata: {},
    });

    return NextResponse.json({ data: { id, deleted: true }, error: null });
  } catch (err) {
    console.error("Unexpected error in DELETE learning category:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to delete category", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
