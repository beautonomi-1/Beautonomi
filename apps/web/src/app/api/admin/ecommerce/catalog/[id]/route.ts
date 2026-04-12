import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * PATCH /api/admin/ecommerce/catalog/[id]
 * Toggle is_active, retail_sales_enabled, or update price for a provider product.
 * Admin can change product status without accessing the provider portal.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const body = await request.json() as Record<string, unknown>;
    const allowedFields = ["is_active", "retail_sales_enabled", "retail_price", "quantity"];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return handleApiError(new Error("No updatable fields provided"), "No updatable fields", "VALIDATION_ERROR", 400);
    }

    updateData.updated_at = new Date().toISOString();

    const { data: product, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select("id, name, is_active, retail_sales_enabled, retail_price")
      .single();

    if (error || !product) return notFoundResponse("Product not found");

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "admin.product.update",
      entity_type: "product",
      entity_id: id,
      metadata: { updated_fields: Object.keys(updateData) },
    });

    return successResponse(product);
  } catch (error) {
    return handleApiError(error, "Failed to update product");
  }
}
