import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const overridesSchema = z.object({
  commission_override: z.number().min(0).max(100).optional().nullable(),
  is_featured: z.boolean().optional(),
  priority: z.number().int().min(0).optional().nullable(),
});

/**
 * PUT /api/admin/providers/[id]/overrides
 * 
 * Update provider overrides (commission, featured status, priority)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Validate request body
    const validationResult = overridesSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    // Verify provider exists
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", id)
      .single();

    if (!provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Update provider with overrides
    const updateData: any = {};
    if (validationResult.data.commission_override !== undefined) {
      updateData.commission_override = validationResult.data.commission_override;
    }
    if (validationResult.data.is_featured !== undefined) {
      updateData.is_featured = validationResult.data.is_featured;
    }
    if (validationResult.data.priority !== undefined) {
      updateData.priority = validationResult.data.priority;
    }

    const { data: updatedProvider, error } = await (supabase
      .from("providers") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !updatedProvider) {
      console.error("Error updating provider overrides:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update provider overrides",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.provider.overrides.update",
      entity_type: "provider",
      entity_id: id,
      metadata: updateData,
    });

    return NextResponse.json({
      data: updatedProvider,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/providers/[id]/overrides:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update provider overrides",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
