import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { planFeaturesSchema } from "@beautonomi/subscription-features";

/**
 * DELETE /api/admin/subscription-plans/[id]
 * Soft-deactivate or hard-delete a subscription plan.
 * Uses soft-delete (is_active = false) if there are active subscribers,
 * hard delete otherwise.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    // Fetch the plan first
    const { data: plan, error: fetchErr } = await supabase
      .from("subscription_plans")
      .select("id, name, is_active")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!plan) return notFoundResponse("Subscription plan not found");

    // Any active subscriber anywhere blocks hard-delete (tenant filter would hide cross-market rows).
    const { count: activeCount } = await supabase
      .from("provider_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", id)
      .eq("status", "active");

    let action: "soft_delete" | "hard_delete";

    if ((activeCount ?? 0) > 0) {
      // Soft-delete: mark as inactive so existing subscribers keep it but no new ones can subscribe
      const { error: updateErr } = await supabase
        .from("subscription_plans")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
      action = "soft_delete";
    } else {
      // Hard delete: no active subscribers
      const { error: deleteErr } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", id);
      if (deleteErr) throw deleteErr;
      action = "hard_delete";
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: `admin.subscription_plan.${action}`,
      entity_type: "subscription_plan",
      entity_id: id,
      metadata: { name: (plan as { name?: string }).name, active_subscribers: activeCount ?? 0 },
    });

    return successResponse({
      action,
      message:
        action === "soft_delete"
          ? `Plan deactivated — ${activeCount} active subscriber(s) keep existing access`
          : "Plan deleted",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete subscription plan");
  }
}

/**
 * PATCH /api/admin/subscription-plans/[id]
 * Partial update of a plan (e.g. toggle is_active, rename).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json() as Record<string, unknown>;
    if (body.features !== undefined) {
      const parsed = planFeaturesSchema.safeParse(body.features);
      if (!parsed.success) {
        return errorResponse(
          "Invalid features payload",
          "VALIDATION_ERROR",
          400,
          parsed.error.issues,
        );
      }
      body.features = parsed.data;
    }
    const allowedFields = [
      "slug",
      "name",
      "description",
      "is_active",
      "is_popular",
      "display_order",
      "features",
      "price_monthly",
      "price_yearly",
      "apple_product_id_monthly",
      "apple_product_id_yearly",
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("subscription_plans")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "admin.subscription_plan.update",
      entity_type: "subscription_plan",
      entity_id: id,
      metadata: { updated_fields: Object.keys(updateData) },
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update subscription plan");
  }
}
