import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

// ISO 639-1 Language Code validation
const languageSchema = z.object({
  code: z.string().length(2, "Language code must be 2 characters (ISO 639-1)").regex(/^[a-z]{2}$/, "Must be lowercase letters"),
  name: z.string().min(1, "Language name is required"),
  native_name: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  rtl: z.boolean().default(false), // Right-to-left
});

/**
 * GET /api/admin/iso-codes/languages
 * 
 * List all languages (ISO 639-1)
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();

    const { data: languages, error } = await supabase
      .from("iso_languages")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching languages:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch languages",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: languages || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/languages:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch languages",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/iso-codes/languages
 * 
 * Create a new language (ISO 639-1)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validationResult = languageSchema.safeParse(body);
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
        .from("iso_languages")
        .update({ is_default: false })
        .neq("code", validationResult.data.code);
    }

    const { data: language, error } = await (supabase
      .from("iso_languages") as any)
      .insert({
        ...validationResult.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !language) {
      console.error("Error creating language:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create language",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_languages.create",
      entity_type: "iso_language",
      entity_id: (language as any).id || (language as any).code,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: language,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/languages:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create language",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
