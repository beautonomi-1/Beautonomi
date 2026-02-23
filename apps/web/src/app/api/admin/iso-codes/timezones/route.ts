import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

// IANA Timezone validation
const timezoneSchema = z.object({
  code: z.string().min(1, "Timezone code is required"), // IANA timezone (e.g., Africa/Johannesburg)
  name: z.string().min(1, "Timezone name is required"),
  utc_offset: z.string().regex(/^[+-]\d{2}:\d{2}$/, "UTC offset must be in format +/-HH:MM"),
  country_code: z.string().length(2).regex(/^[A-Z]{2}$/).optional().nullable(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

/**
 * GET /api/admin/iso-codes/timezones
 * 
 * List all timezones (IANA)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: timezones, error } = await supabase
      .from("iso_timezones")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching timezones:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch timezones",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: timezones || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/timezones:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch timezones",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/iso-codes/timezones
 * 
 * Create a new timezone
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = timezoneSchema.safeParse(body);
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
        .neq("code", validationResult.data.code);
    }

    const { data: timezone, error } = await (supabase
      .from("iso_timezones") as any)
      .insert({
        ...validationResult.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !timezone) {
      console.error("Error creating timezone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create timezone",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_timezones.create",
      entity_type: "iso_timezone",
      entity_id: (timezone as any).id || (timezone as any).code,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: timezone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/timezones:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create timezone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
