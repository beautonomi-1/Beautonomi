import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
  requireRoleInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/provider/services/[id]/variants/[variantId]/reorder
 *
 * Reorder a variant within its parent service by swapping `variant_sort_order`
 * with the neighbour above / below. Body:
 *   { direction: "up" | "down" }
 *
 * §Provider-audit 2026-04 (catalogue round 2): mobile now supports variant
 * reordering. Pattern mirrors /api/provider/services/[id]/reorder.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  try {
    const { id: serviceId, variantId } = await params;

    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json().catch(() => null)) as
      | { direction?: "up" | "down"; variant_sort_order?: number }
      | null;
    if (!body) return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);

    const { data: current } = await supabase
      .from("offerings")
      .select("id, variant_sort_order")
      .eq("id", variantId)
      .eq("provider_id", providerId)
      .eq("parent_service_id", serviceId)
      .eq("service_type", "variant")
      .maybeSingle();

    if (!current) return notFoundResponse("Variant not found");

    if (body.direction === "up" || body.direction === "down") {
      const step = body.direction === "up" ? -1 : 1;
      const currentOrder = current.variant_sort_order ?? 0;
      const newOrder = Math.max(0, currentOrder + step);

      if (newOrder === currentOrder) {
        return successResponse({
          id: variantId,
          variant_sort_order: currentOrder,
          moved: false,
        });
      }

      const { data: neighbour } = await supabase
        .from("offerings")
        .select("id, variant_sort_order")
        .eq("provider_id", providerId)
        .eq("parent_service_id", serviceId)
        .eq("service_type", "variant")
        .eq("variant_sort_order", newOrder)
        .neq("id", variantId)
        .maybeSingle();

      if (neighbour) {
        await supabase
          .from("offerings")
          .update({ variant_sort_order: currentOrder })
          .eq("id", neighbour.id);
      }

      const { data: updated, error } = await supabase
        .from("offerings")
        .update({ variant_sort_order: newOrder })
        .eq("id", variantId)
        .select("id, variant_sort_order")
        .single();

      if (error) throw error;
      return successResponse({ ...updated, moved: true });
    }

    if (
      typeof body.variant_sort_order === "number" &&
      Number.isFinite(body.variant_sort_order)
    ) {
      const { data: updated, error } = await supabase
        .from("offerings")
        .update({
          variant_sort_order: Math.max(0, Math.floor(body.variant_sort_order)),
        })
        .eq("id", variantId)
        .select("id, variant_sort_order")
        .single();
      if (error) throw error;
      return successResponse(updated);
    }

    return errorResponse(
      "Provide { direction: 'up'|'down' } or { variant_sort_order: number }",
      "VALIDATION_ERROR",
      400,
    );
  } catch (error) {
    return handleApiError(error, "Failed to reorder variant");
  }
}
