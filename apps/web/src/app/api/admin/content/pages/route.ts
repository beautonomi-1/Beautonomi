import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const pageContentSchema = z.object({
  page_slug: z.string().min(1, "Page slug is required"),
  section_key: z.string().min(1, "Section key is required"),
  content_type: z.enum(["text", "html", "json", "image", "video"]),
  content: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const _updatePageContentSchema = pageContentSchema.partial();
void _updatePageContentSchema;

/**
 * GET /api/admin/content/pages
 * 
 * Get all page content, optionally filtered by page_slug
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const pageSlug = searchParams.get("page_slug");

    let query = supabase
      .from("page_content")
      .select("*")
      .order("page_slug", { ascending: true })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (pageSlug) {
      query = query.eq("page_slug", pageSlug);
    }

    const { data: pages, error } = await query;

    if (error) {
      console.error("Error fetching page content:", error);
      // Return empty array instead of 500 error
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    // Transform database fields to frontend format
    const transformedPages = (pages || []).map((p: any) => ({
      ...p,
      order: p.display_order || 0, // Map display_order to order for frontend
    }));

    return NextResponse.json({
      data: transformedPages || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/pages:", error);
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
 * POST /api/admin/content/pages
 * 
 * Create new page content
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Validate request body
    const validationResult = pageContentSchema.safeParse(body);
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

    const { page_slug, section_key, content_type, content, metadata, order, is_active } =
      validationResult.data;

    // Check if content already exists for this page_slug + section_key
    const { data: existing } = await supabase
      .from("page_content")
      .select("id")
      .eq("page_slug", page_slug)
      .eq("section_key", section_key)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Content already exists for this page and section",
            code: "DUPLICATE_ERROR",
          },
        },
        { status: 409 }
      );
    }

    const { data: pageContent, error } = await supabase
      .from("page_content")
      .insert({
        page_slug,
        section_key,
        content_type,
        content,
        metadata: metadata || {},
        display_order: order, // Map order to display_order for database
        is_active,
      })
      .select()
      .single();

    if (error || !pageContent) {
      console.error("Error creating page content:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create page content",
            code: "CREATE_ERROR",
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
    console.error("Unexpected error in /api/admin/content/pages:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
