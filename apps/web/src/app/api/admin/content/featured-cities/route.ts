import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const citySchema = z.object({
  name: z.string().min(1, "City name is required"),
  country: z.string().min(1, "Country is required"),
  country_code: z.string().optional(),
  city_code: z.string().optional(),
  image_url: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().min(0).optional().default(0),
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
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const scoped = await fetchScopedListMerged<{ name: string; country: string; [key: string]: unknown }>({
      supabase,
      table: "featured_cities",
      tenantId,
      select: "*",
      dedupeKey: (city) => `${city.country}:${city.name}`.toLowerCase(),
      orderBy: { column: "display_order", ascending: true },
    });
    const cities = scoped.data;

    type CityRow = { name: string; country: string; [key: string]: unknown };
    const citiesWithCounts = await Promise.all(
      (cities || []).map(async (city: CityRow) => {
        const { count } = await supabase
          .from("providers")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
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
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const body = await request.json();

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

    const { name, country, image_url, description, is_active, display_order } = validationResult.data;
    const countryCode = validationResult.data.country_code || slugify(country);
    const cityCode = validationResult.data.city_code || slugify(name);

    const { data: city, error } = await admin
      .from("featured_cities")
      .insert({
        tenant_id: tenantId,
        name,
        country,
        country_code: countryCode,
        city_code: cityCode,
        image_url: image_url || null,
        description: description || null,
        is_active,
        display_order,
      })
      .select()
      .single();

    if (error || !city) {
      console.error("Error creating featured city:", error);
      const msg = error?.message?.includes("duplicate")
        ? `A featured city "${name}" already exists for ${country}`
        : "Failed to create featured city";
      return NextResponse.json(
        {
          data: null,
          error: { message: msg, code: "CREATE_ERROR" },
        },
        { status: error?.message?.includes("duplicate") ? 409 : 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content.featured_city.create",
      entity_type: "featured_city",
      entity_id: (city as { id: string }).id,
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

