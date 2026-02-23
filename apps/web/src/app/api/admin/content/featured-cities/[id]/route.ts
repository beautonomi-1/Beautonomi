import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateCitySchema = z.object({
  name: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  image_url: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/content/featured-cities/[id]
 * 
 * Get a single featured city
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

    const { data: city, error } = await supabase
      .from("featured_cities")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !city) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Featured city not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get provider count
    const { count } = await supabase
      .from("providers")
      .select("*", { count: "exact", head: true })
      .eq("city", (city as any).name)
      .eq("country", (city as any).country)
      .eq("status", "active");

    return NextResponse.json({
      data: {
        ...(city as Record<string, unknown>),
        provider_count: count || 0,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/featured-cities/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch featured city",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/content/featured-cities/[id]
 * 
 * Update a featured city
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
    const validationResult = updateCitySchema.safeParse(body);
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

    const { data: city, error } = await (supabase
      .from("featured_cities") as any)
      .update(validationResult.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !city) {
      console.error("Error updating featured city:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update featured city",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.featured_city.update",
      entity_type: "featured_city",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: city,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/featured-cities/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update featured city",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/content/featured-cities/[id]
 * 
 * Delete a featured city (soft delete)
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
    const { data: city, error } = await (supabase
      .from("featured_cities") as any)
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !city) {
      console.error("Error deleting featured city:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete featured city",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.featured_city.delete",
      entity_type: "featured_city",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/featured-cities/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete featured city",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
