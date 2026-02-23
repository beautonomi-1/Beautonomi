import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const serviceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  category_id: z.string().uuid("Category ID must be a valid UUID"),
  subcategory_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  default_duration_minutes: z.number().int().min(1, "Duration must be at least 1 minute"),
  default_buffer_minutes: z.number().int().min(0, "Buffer must be non-negative").optional().default(0),
  allowed_location_types: z.array(z.enum(["at_home", "at_salon"])).min(1, "At least one location type is required"),
  is_active: z.boolean().optional().default(true),
});

// Reserved for PATCH validation
const _updateServiceSchema = serviceSchema.partial();
void _updateServiceSchema;

/**
 * GET /api/admin/catalog/services
 * 
 * Get all master services with category names
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");

    // Get services without join first
    let query = supabase
      .from("master_services")
      .select("*");

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: services, error } = await query.order("name", { ascending: true });

    if (error) {
      console.error("Error fetching services:", error);
      return NextResponse.json(
        {
          data: [],
          error: null,
        },
        { status: 200 }
      );
    }

    // Fetch category names separately
    const categoryIds = [...new Set((services || []).map((s: any) => s.category_id).filter(Boolean))];
    let categoriesData: any[] = [];
    
    if (categoryIds.length > 0) {
      try {
        const { data, error: categoriesError } = await supabase
          .from("global_service_categories")
          .select("id, name, slug")
          .in("id", categoryIds);
        
        if (!categoriesError) {
          categoriesData = data || [];
        }
      } catch (e) {
        console.error("Error fetching categories:", e);
      }
    }
    
    const categoriesMap = new Map(categoriesData.map((c: any) => [c.id, c]));

    // Transform to include category_name
    const transformedServices = (services || []).map((service: any) => ({
      ...service,
      category_name: categoriesMap.get(service.category_id)?.name || null,
    }));

    return NextResponse.json({
      data: transformedServices,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/services:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch services",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/catalog/services
 * 
 * Create a new master service
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = serviceSchema.safeParse(body);
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

    const {
      name,
      slug,
      category_id,
      subcategory_id,
      description,
      default_duration_minutes,
      default_buffer_minutes,
      allowed_location_types,
      is_active,
    } = validationResult.data;

    // Verify category exists in global_service_categories
    const { data: category } = await supabase
      .from("global_service_categories")
      .select("id")
      .eq("id", category_id)
      .single();

    if (!category) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Category not found",
            code: "CATEGORY_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check if slug already exists
    const { data: existing } = await supabase
      .from("master_services")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Service with this slug already exists",
            code: "DUPLICATE_SLUG",
          },
        },
        { status: 409 }
      );
    }

    const { data: service, error } = await (supabase
      .from("master_services") as any)
      .insert({
        name,
        slug: slug.toLowerCase(),
        category_id,
        subcategory_id: subcategory_id || null,
        description: description || null,
        default_duration_minutes,
        default_buffer_minutes: default_buffer_minutes || 0,
        allowed_location_types,
        is_active,
      })
      .select()
      .single();

    if (error || !service) {
      console.error("Error creating service:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create service",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.catalog.service.create",
      entity_type: "master_service",
      entity_id: (service as any).id,
      metadata: { name, slug: slug.toLowerCase(), category_id, subcategory_id, is_active },
    });

    return NextResponse.json({
      data: service,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/services:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create service",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

