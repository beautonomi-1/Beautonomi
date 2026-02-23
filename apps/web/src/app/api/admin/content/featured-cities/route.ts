import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const citySchema = z.object({
  name: z.string().min(1, "City name is required"),
  country: z.string().min(1, "Country is required"),
  image_url: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

const _updateCitySchema = citySchema.partial();
void _updateCitySchema;

/**
 * GET /api/admin/content/featured-cities
 * 
 * Get all featured cities
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    // Get cities with provider count
    const { data: cities, error } = await supabase
      .from("featured_cities")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching featured cities:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch featured cities",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Get provider count for each city
    const citiesWithCounts = await Promise.all(
      (cities || []).map(async (city: any) => {
        const { count } = await supabase
          .from("providers")
          .select("*", { count: "exact", head: true })
          .eq("city", city.name)
          .eq("country", city.country)
          .eq("status", "active");

        return {
          ...city,
          provider_count: count || 0,
        };
      })
    );

    return NextResponse.json({
      data: citiesWithCounts,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/featured-cities:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch featured cities",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/content/featured-cities
 * 
 * Create a new featured city
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
    const validationResult = citySchema.safeParse(body);
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

    const { name, country, image_url, description, is_active } = validationResult.data;

    const { data: city, error } = await (supabase
      .from("featured_cities") as any)
      .insert({
        name,
        country,
        image_url: image_url || null,
        description: description || null,
        is_active,
      })
      .select()
      .single();

    if (error || !city) {
      console.error("Error creating featured city:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create featured city",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.content.featured_city.create",
      entity_type: "featured_city",
      entity_id: (city as any).id,
      metadata: { name, country, is_active },
    });

    return NextResponse.json({
      data: city,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/featured-cities:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create featured city",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

