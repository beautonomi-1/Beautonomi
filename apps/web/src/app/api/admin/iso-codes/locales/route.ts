import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

// ISO 639-1 + ISO 3166-1 Locale Code validation (e.g., en-US, en-ZA)
const localeSchema = z.object({
  code: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, "Locale code must be in format 'll-CC' (e.g., en-US, en-ZA)"),
  language_code: z.string().length(2).regex(/^[a-z]{2}$/, "Language code must be 2 lowercase letters (ISO 639-1)"),
  country_code: z.string().length(2).regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters (ISO 3166-1)"),
  name: z.string().min(1, "Locale name is required"),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

/**
 * GET /api/admin/iso-codes/locales
 * 
 * List all locales (ISO 639-1 + ISO 3166-1)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: locales, error } = await supabase
      .from("iso_locales")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching locales:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch locales",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: locales || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/locales:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch locales",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/iso-codes/locales
 * 
 * Create a new locale
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = localeSchema.safeParse(body);
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

    // Verify language and country codes exist
    const [languageCheck, countryCheck] = await Promise.all([
      supabase.from("iso_languages").select("code").eq("code", validationResult.data.language_code).single(),
      supabase.from("iso_countries").select("code").eq("code", validationResult.data.country_code).single(),
    ]);

    if (!languageCheck.data) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Language code '${validationResult.data.language_code}' does not exist`,
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    if (!countryCheck.data) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Country code '${validationResult.data.country_code}' does not exist`,
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults
    if (validationResult.data.is_default) {
      await (supabase as any)
        .from("iso_locales")
        .update({ is_default: false })
        .neq("code", validationResult.data.code);
    }

    const { data: locale, error } = await (supabase
      .from("iso_locales") as any)
      .insert({
        ...validationResult.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !locale) {
      console.error("Error creating locale:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create locale",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_locales.create",
      entity_type: "iso_locale",
      entity_id: (locale as any).id || (locale as any).code,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: locale,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/locales:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create locale",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
