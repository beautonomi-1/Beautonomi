import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updateLocaleSchema = z.object({
  name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/admin/iso-codes/locales/[code]
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
    const supabase = await getSupabaseServer(request);

    const { data: locale, error } = await supabase
      .from("iso_locales")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !locale) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Locale not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: locale,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch locale",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/iso-codes/locales/[code]
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
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = updateLocaleSchema.safeParse(body);
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
        .from("iso_locales")
        .update({ is_default: false })
        .neq("code", code);
    }

    const { data: locale, error } = await (supabase
      .from("iso_locales") as any)
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code)
      .select()
      .single();

    if (error || !locale) {
      console.error("Error updating locale:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update locale",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: locale,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update locale",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/iso-codes/locales/[code]
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
    const supabase = await getSupabaseServer(request);

    // Check if locale is default
    const { data: locale } = await supabase
      .from("iso_locales")
      .select("is_default")
      .eq("code", code)
      .single();

    if ((locale as any)?.is_default) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete default locale",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase
      .from("iso_locales") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("code", code);

    if (error) {
      console.error("Error deleting locale:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete locale",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { code, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete locale",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
