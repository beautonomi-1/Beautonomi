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
    const { data: current } = await supabase
      .from("offerings")
      .select("id, display_order, parent_service_id, service_type, provider_category_id")
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

    // Category-scoped neighbour swap by direction.
    if (body.direction === "up" || body.direction === "down") {
      const { data: siblings } = await supabase
        .from("offerings")
        .select("id, display_order, provider_category_id")
        .eq("provider_id", providerId)
        .is("parent_service_id", null)
        .neq("service_type", "variant")
        .eq("provider_category_id", current.provider_category_id);

      const ordered = (siblings ?? []).sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.id.localeCompare(b.id),
      );
      const idx = ordered.findIndex((s) => s.id === id);
      if (idx < 0) {
        return notFoundResponse("Service not found in category");
      }

      const targetIdx = body.direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= ordered.length) {
        return errorResponse(
          "Cannot move service further in this direction within the category",
          "REORDER_BOUND",
          422,
        );
      }

      const neighbour = ordered[targetIdx];
      const currentOrder = current.display_order ?? idx;
      const neighbourOrder = neighbour.display_order ?? targetIdx;

      await supabase
        .from("offerings")
        .update({ display_order: neighbourOrder })
        .eq("id", id);

      await supabase
        .from("offerings")
        .update({ display_order: currentOrder })
        .eq("id", neighbour.id);

      const { data: updated, error } = await supabase
        .from("offerings")
        .select("id, display_order")
        .eq("id", id)
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
