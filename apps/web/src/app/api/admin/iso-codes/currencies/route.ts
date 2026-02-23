import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

// ISO 4217 Currency Code validation
const currencySchema = z.object({
  code: z.string().length(3, "Currency code must be 3 characters (ISO 4217)").regex(/^[A-Z]{3}$/, "Must be uppercase letters"),
  name: z.string().min(1, "Currency name is required"),
  symbol: z.string().optional().nullable(),
  decimal_places: z.number().int().min(0).max(4).default(2),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

/**
 * GET /api/admin/iso-codes/currencies
 * 
 * List all currencies (ISO 4217)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: currencies, error } = await supabase
      .from("iso_currencies")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching currencies:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch currencies",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: currencies || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/currencies:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch currencies",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/iso-codes/currencies
 * 
 * Create a new currency (ISO 4217)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = currencySchema.safeParse(body);
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
        .from("iso_currencies")
        .update({ is_default: false })
        .neq("code", validationResult.data.code);
    }

    const { data: currency, error } = await (supabase
      .from("iso_currencies") as any)
      .insert({
        ...validationResult.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !currency) {
      console.error("Error creating currency:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create currency",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_currencies.create",
      entity_type: "iso_currency",
      entity_id: (currency as any).id || (currency as any).code,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: currency,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/currencies:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create currency",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
