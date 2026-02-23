import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateCurrencySchema = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().optional().nullable(),
  decimal_places: z.number().int().min(0).max(4).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/admin/iso-codes/currencies/[code]
 * 
 * Get a single currency
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

    const { data: currency, error } = await supabase
      .from("iso_currencies")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !currency) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Currency not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: currency,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/currencies/[code]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch currency",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/iso-codes/currencies/[code]
 * 
 * Update a currency
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

    const validationResult = updateCurrencySchema.safeParse(body);
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
        .neq("code", code.toUpperCase());
    }

    const { data: currency, error } = await (supabase
      .from("iso_currencies") as any)
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code.toUpperCase())
      .select()
      .single();

    if (error || !currency) {
      console.error("Error updating currency:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update currency",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_currencies.update",
      entity_type: "iso_currency",
      entity_id: code.toUpperCase(),
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: currency,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/currencies/[code]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update currency",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/iso-codes/currencies/[code]
 * 
 * Delete a currency (soft delete)
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

    // Check if currency is default
    const { data: currency } = await supabase
      .from("iso_currencies")
      .select("is_default")
      .eq("code", code.toUpperCase())
      .single();

    if ((currency as any)?.is_default) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete default currency",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase
      .from("iso_currencies") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("code", code.toUpperCase());

    if (error) {
      console.error("Error deleting currency:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete currency",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.iso_currencies.delete",
      entity_type: "iso_currency",
      entity_id: code.toUpperCase(),
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { code: code.toUpperCase(), deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/iso-codes/currencies/[code]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete currency",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
