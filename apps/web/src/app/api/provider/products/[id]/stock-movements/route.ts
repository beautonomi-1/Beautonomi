import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { adjustProductStock, mapReasonToMovementType } from "@/lib/products/stock-movements";
import { z } from "zod";

const postSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, "Delta must be non-zero"),
  reason: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
  product_variant_id: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/provider/products/[id]/stock-movements
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id: productId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!product) return notFoundResponse("Product not found");

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
    const variantId = searchParams.get("variant_id");

    let query = supabase
      .from("stock_movements")
      .select(
        "id, product_id, product_variant_id, movement_type, quantity_delta, quantity_after, reason, note, reference_type, reference_id, actor_user_id, created_at",
      )
      .eq("product_id", productId)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (variantId) {
      query = query.eq("product_variant_id", variantId);
    }

    const { data: movements, error } = await query;
    if (error) throw error;

    return successResponse({ movements: movements ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch stock movements");
  }
}

/**
 * POST /api/provider/products/[id]/stock-movements
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id: productId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid request",
        "VALIDATION_ERROR",
        400,
      );
    }

    const { delta, reason, note, product_variant_id } = parsed.data;
    const movementType = mapReasonToMovementType(reason, delta);

    try {
      const { newQuantity, movementId } = await adjustProductStock(supabase, {
        providerId,
        productId,
        productVariantId: product_variant_id ?? null,
        delta,
        movementType,
        reason,
        note: note ?? null,
        actorUserId: user.id,
      });

      return successResponse({
        movement_id: movementId,
        new_quantity: newQuantity,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stock adjustment failed";
      if (msg.includes("Insufficient") || msg.includes("variants")) {
        return errorResponse(msg, "STOCK_ERROR", 400);
      }
      throw e;
    }
  } catch (error) {
    return handleApiError(error, "Failed to adjust stock");
  }
}
