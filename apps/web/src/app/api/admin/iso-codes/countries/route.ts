import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

// ISO 3166-1 Country Code validation
const countrySchema = z.object({
  code: z.string().length(2, "Country code must be 2 characters (ISO 3166-1 alpha-2)").regex(/^[A-Z]{2}$/, "Must be uppercase letters"),
  code3: z.string().length(3, "Country code must be 3 characters (ISO 3166-1 alpha-3)").regex(/^[A-Z]{3}$/, "Must be uppercase letters").optional().nullable(),
  numeric_code: z.string().length(3, "Numeric code must be 3 digits (ISO 3166-1 numeric)").regex(/^[0-9]{3}$/).optional().nullable(),
  name: z.string().min(1, "Country name is required"),
  phone_country_code: z.string().regex(/^\+\d{1,4}$/, "Phone country code must be in format +XXX (ITU-T E.164)"),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

/**
 * GET /api/admin/iso-codes/countries
 * 
 * List all countries (ISO 3166-1) with phone codes (ITU-T E.164)
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: countries, error } = await supabase
      .from("iso_countries")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching countries:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch countries",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: countries || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/countries:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch countries",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/iso-codes/countries
 * 
 * Create a new country
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = countrySchema.safeParse(body);
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

    // If setting as default, unset other defaults
    if (validationResult.data.is_default) {
      await (supabase as any)
        .from("iso_countries")
        .update({ is_default: false })
        .neq("code", validationResult.data.code);
    }

    const { data: country, error } = await (supabase
      .from("iso_countries") as any)
      .insert({
        ...validationResult.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !country) {
      console.error("Error creating country:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create country",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_countries.create",
      entity_type: "iso_country",
      entity_id: (country as any).id || (country as any).code,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: country,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/countries:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create country",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
