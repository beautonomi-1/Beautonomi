import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updateTimezoneSchema = z.object({
  name: z.string().min(1).optional(),
  utc_offset: z.string().regex(/^[+-]\d{2}:\d{2}$/).optional(),
  country_code: z.string().length(2).regex(/^[A-Z]{2}$/).optional().nullable(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/admin/iso-codes/timezones/[code]
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

    const { data: timezone, error } = await supabase
      .from("iso_timezones")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !timezone) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Timezone not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: timezone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch timezone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/iso-codes/timezones/[code]
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

    const validationResult = updateTimezoneSchema.safeParse(body);
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
        .from("iso_timezones")
        .update({ is_default: false })
        .neq("code", code);
    }

    const { data: timezone, error } = await (supabase
      .from("iso_timezones") as any)
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code)
      .select()
      .single();

    if (error || !timezone) {
      console.error("Error updating timezone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update timezone",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: timezone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update timezone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/iso-codes/timezones/[code]
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

    // Check if timezone is default
    const { data: timezone } = await supabase
      .from("iso_timezones")
      .select("is_default")
      .eq("code", code)
      .single();

    if ((timezone as any)?.is_default) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete default timezone",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase
      .from("iso_timezones") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("code", code);

    if (error) {
      console.error("Error deleting timezone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete timezone",
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
          message: "Failed to delete timezone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
