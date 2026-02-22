import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updateCountrySchema = z.object({
  code3: z.string().length(3).regex(/^[A-Z]{3}$/).optional().nullable(),
  numeric_code: z.string().length(3).regex(/^[0-9]{3}$/).optional().nullable(),
  name: z.string().min(1).optional(),
  phone_country_code: z.string().regex(/^\+\d{1,4}$/).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/admin/iso-codes/countries/[code]
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

    const { data: country, error } = await supabase
      .from("iso_countries")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !country) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Country not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: country,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch country",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/iso-codes/countries/[code]
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

    const validationResult = updateCountrySchema.safeParse(body);
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
        .neq("code", code.toUpperCase());
    }

    const { data: country, error } = await (supabase
      .from("iso_countries") as any)
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code.toUpperCase())
      .select()
      .single();

    if (error || !country) {
      console.error("Error updating country:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update country",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: country,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update country",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/iso-codes/countries/[code]
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

    // Check if country is default
    const { data: country } = await supabase
      .from("iso_countries")
      .select("is_default")
      .eq("code", code.toUpperCase())
      .single();

    if ((country as any)?.is_default) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete default country",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase
      .from("iso_countries") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("code", code.toUpperCase());

    if (error) {
      console.error("Error deleting country:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete country",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { code: code.toUpperCase(), deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete country",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
