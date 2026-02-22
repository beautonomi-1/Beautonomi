import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const resourceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  type: z.enum(["article", "guide", "video"]),
  url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

const _updateResourceSchema = resourceSchema.partial();
void _updateResourceSchema;

/**
 * GET /api/admin/content/resources
 * 
 * Get all resources
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    
    // Return empty array if query fails instead of 500 error
    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    const { data: resources, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching resources:", error);
      // Return empty array instead of 500 error
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    // Transform database fields to frontend format
    const transformedResources = (resources || []).map((r: any) => ({
      ...r,
      type: r.category || 'article', // Map category to type
      url: r.thumbnail_url || null, // Use thumbnail_url as url
      is_active: r.is_published, // Map is_published to is_active
    }));

    return NextResponse.json({
      data: transformedResources || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/resources:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch resources",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/content/resources
 * 
 * Create a new resource
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
    const validationResult = resourceSchema.safeParse(body);
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

    const { title, content, type, is_active } = validationResult.data;

    // Map frontend fields to database fields
    // Database has: title, slug, description, content, category, tags, thumbnail_url, author_id, is_published
    // Frontend sends: title, content, type, url, is_active
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const { data: resource, error } = await supabase
      .from("resources")
      .insert({
        title,
        slug,
        content,
        description: content.substring(0, 200), // Use first 200 chars as description
        category: type, // Map type to category
        is_published: is_active,
        author_id: auth.user.id,
      })
      .select()
      .single();

    if (error || !resource) {
      console.error("Error creating resource:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create resource",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.resource.create",
      entity_type: "content_resource",
      entity_id: (resource as any).id,
      metadata: { title, type, is_active },
    });

    return NextResponse.json({
      data: resource,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/resources:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create resource",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

