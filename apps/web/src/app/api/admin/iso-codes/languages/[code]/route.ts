import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updateLanguageSchema = z.object({
  name: z.string().min(1).optional(),
  native_name: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  rtl: z.boolean().optional(),
});

/**
 * GET /api/admin/iso-codes/languages/[code]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { code } = await params;
    const supabase = await getSupabaseServer();

    const { data: language, error } = await supabase
      .from("iso_languages")
      .select("*")
      .eq("code", code.toLowerCase())
      .single();

    if (error || !language) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Language not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: language,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch language",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/iso-codes/languages/[code]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { code } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validationResult = updateLanguageSchema.safeParse(body);
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
        .neq("code", code.toLowerCase());
    }

    const { data: language, error } = await (supabase
      .from("iso_languages") as any)
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code.toLowerCase())
      .select()
      .single();

    if (error || !language) {
      console.error("Error updating language:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update language",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: language,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update language",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/iso-codes/languages/[code]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { code } = await params;
    const supabase = await getSupabaseServer();

    // Check if language is default
    const { data: language } = await supabase
      .from("iso_languages")
      .select("is_default")
      .eq("code", code.toLowerCase())
      .single();

    if ((language as any)?.is_default) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete default language",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase
      .from("iso_languages") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("code", code.toLowerCase());

    if (error) {
      console.error("Error deleting language:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete language",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { code: code.toLowerCase(), deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete language",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
