import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * PATCH /api/admin/promotions/[id]
 * 
 * Update a promotion
 */
const updatePromotionSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  value: z.number().or(z.string()).optional(),
  min_purchase: z.number().or(z.string()).nullable().optional(),
  max_discount: z.number().or(z.string()).nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  usage_limit: z.number().or(z.string()).nullable().optional(),
  is_active: z.boolean().optional(),
  applicable_to: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updatePromotionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Verify promotion exists
    const { data: existingPromotion } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!existingPromotion) {
      return notFoundResponse("Promotion not found");
    }

    // Update promotion - map frontend fields to database fields
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.code !== undefined) updateData.code = body.code.toUpperCase();
    if (body.type !== undefined) {
      // Map 'fixed_amount' to 'fixed' for database enum
      updateData.type = body.type === 'fixed_amount' ? 'fixed' : body.type;
    }
    if (body.value !== undefined) updateData.value = parseFloat(body.value);
    if (body.min_purchase !== undefined)
      updateData.min_purchase_amount = body.min_purchase ? parseFloat(body.min_purchase) : null;
    if (body.max_discount !== undefined)
      updateData.max_discount_amount = body.max_discount ? parseFloat(body.max_discount) : null;
    if (body.start_date !== undefined) {
      updateData.valid_from = new Date(body.start_date).toISOString();
    }
    if (body.end_date !== undefined) {
      updateData.valid_until = new Date(body.end_date).toISOString();
    }
    if (body.usage_limit !== undefined)
      updateData.usage_limit = body.usage_limit ? parseInt(body.usage_limit) : null;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    // Note: applicable_to is derived from applicable_categories/applicable_providers arrays
    // We don't update it directly

    const { data: updatedPromotion, error: updateError } = await supabase
      .from("promotions")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateError || !updatedPromotion) {
      console.error("Error updating promotion:", updateError);
      return handleApiError(updateError, "Failed to update promotion");
    }

    const row = updatedPromotion as Record<string, any>;

    // Transform response to match frontend format
    const transformedPromotion = {
      ...row,
      type: row.type === 'fixed' ? 'fixed_amount' : row.type, // Map 'fixed' to 'fixed_amount' for frontend
      start_date: row.valid_from,
      end_date: row.valid_until,
      min_purchase: row.min_purchase_amount,
      max_discount: row.max_discount_amount,
      used_count: row.usage_count,
      applicable_to: row.applicable_categories?.length > 0 
        ? "category" 
        : row.applicable_providers?.length > 0 
        ? "provider" 
        : "all",
    };

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.promotion.update",
      entity_type: "promotion",
      entity_id: id,
      module: "marketing",
      risk_level: "critical",
      retention_tier: "operational",
      status: "succeeded",
      after_json: updateData,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(transformedPromotion);
  } catch (error) {
    return handleApiError(error, "Failed to update promotion");
  }
}

/**
 * DELETE /api/admin/promotions/[id]
 * 
 * Delete a promotion
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    // Verify promotion exists
    const { data: existingPromotion } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!existingPromotion) {
      return notFoundResponse("Promotion not found");
    }

    // Delete promotion
    const { error: deleteError } = await supabase
      .from("promotions")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      return handleApiError(deleteError, "Failed to delete promotion");
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.promotion.delete",
      entity_type: "promotion",
      entity_id: id,
      module: "marketing",
      risk_level: "critical",
      retention_tier: "operational",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete promotion");
  }
}
