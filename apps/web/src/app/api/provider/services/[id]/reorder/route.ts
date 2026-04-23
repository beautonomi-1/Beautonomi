import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * PATCH /api/provider/services/[id]/reorder
 *
 * Reorder a single service within the provider's catalogue by swapping its
 * `display_order` with the neighbour above / below. Body:
 *   { direction: "up" | "down" }
 *
 * §Provider-audit 2026-04 (catalogue round 2): the mobile catalogue screen
 * was calling this route already but it did not exist on the server, so
 * reordering silently no-opped (or returned a 405). Introduced to match the
 * `/api/provider/categories/[id]` pattern and bring mobile to parity with
 * web drag-to-reorder.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user!.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json().catch(() => null)) as
      | { direction?: "up" | "down"; display_order?: number }
      | null;
    if (!body) return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);

    // Confirm the service belongs to this provider and is a top-level service
    // (reorder does not apply to child variants — those use variant_sort_order).
    const { data: current } = await supabase
      .from("offerings")
      .select("id, display_order, parent_service_id, service_type")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!current) return notFoundResponse("Service not found");
    if (current.parent_service_id || current.service_type === "variant") {
      return errorResponse(
        "Variants are reordered via /variants/[variantId]/reorder",
        "VALIDATION_ERROR",
        400,
      );
    }

    // Simple bump-and-swap reorder by direction.
    if (body.direction === "up" || body.direction === "down") {
      const step = body.direction === "up" ? -1 : 1;
      const currentOrder = current.display_order ?? 0;
      const newOrder = Math.max(0, currentOrder + step);

      if (newOrder === currentOrder) {
        return successResponse({ id, display_order: currentOrder, moved: false });
      }

      const { data: neighbour } = await supabase
        .from("offerings")
        .select("id, display_order")
        .eq("provider_id", providerId)
        .is("parent_service_id", null)
        .neq("service_type", "variant")
        .neq("service_type", "addon")
        .eq("display_order", newOrder)
        .neq("id", id)
        .maybeSingle();

      if (neighbour) {
        await supabase
          .from("offerings")
          .update({ display_order: currentOrder })
          .eq("id", neighbour.id);
      }

      const { data: updated, error } = await supabase
        .from("offerings")
        .update({ display_order: newOrder })
        .eq("id", id)
        .select("id, display_order")
        .single();

      if (error) throw error;
      return successResponse({ ...updated, moved: true });
    }

    // Direct set: body.display_order — used by drag-to-sort UIs.
    if (typeof body.display_order === "number" && Number.isFinite(body.display_order)) {
      const { data: updated, error } = await supabase
        .from("offerings")
        .update({ display_order: Math.max(0, Math.floor(body.display_order)) })
        .eq("id", id)
        .select("id, display_order")
        .single();
      if (error) throw error;
      return successResponse(updated);
    }

    return errorResponse(
      "Provide { direction: 'up'|'down' } or { display_order: number }",
      "VALIDATION_ERROR",
      400,
    );
  } catch (error) {
    return handleApiError(error, "Failed to reorder service");
  }
}
