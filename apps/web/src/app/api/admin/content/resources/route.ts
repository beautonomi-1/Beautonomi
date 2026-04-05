import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

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
      table: "resources",
      tenantId,
      select: "*",
      dedupeKey: (row) => String(row.slug ?? row.id ?? ""),
      orderBy: { column: "created_at", ascending: false },
    });
    const resources = scoped.data;

    type ResourceRow = { category?: string; thumbnail_url?: string | null; is_published?: boolean; [key: string]: unknown };
    const transformedResources = (resources || []).map((r: ResourceRow) => ({
      ...r,
      type: r.category ?? "article",
      url: r.thumbnail_url ?? null,
      is_active: r.is_published,
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
        tenant_id: tenantId,
        title,
        slug,
        content,
        description: content.substring(0, 200), // Use first 200 chars as description
        category: type, // Map type to category
        is_published: is_active,
        author_id: user.id,
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
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content.resource.create",
      entity_type: "content_resource",
      entity_id: (resource as { id: string }).id,
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

