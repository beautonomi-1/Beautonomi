import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { computeProductOrderDeliveryQuote } from "@/lib/orders/product-order-delivery-quote";

const bodySchema = z.object({
  provider_id: z.string().uuid(),
  delivery_address_id: z.string().uuid(),
});

/**
 * POST /api/me/orders/delivery-preview
 * Server-side delivery fee + radius preview (uses cart + weight_grams).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const parsed = bodySchema.parse(await request.json());

    const { data: cartItems, error: cartErr } = await (supabase.from("cart_items") as any)
      .select(
        `
        quantity,
        product:products (
          retail_price, weight_grams
        ),
        product_variant:product_variants (
          retail_price
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("provider_id", parsed.provider_id);

    if (cartErr) throw cartErr;
    if (!cartItems?.length) {
      return errorResponse("No cart items found for this provider", "EMPTY_CART", 400);
    }

    const result = await computeProductOrderDeliveryQuote({
      supabase,
      userId: user.id,
      providerId: parsed.provider_id,
      deliveryAddressId: parsed.delivery_address_id,
      cartItems,
    });

    if (result.ok === false) {
      const messages: Record<string, string> = {
        ADDRESS_NOT_FOUND: "Delivery address not found.",
        DELIVERY_RADIUS_EXCEEDED: "Delivery address is outside this provider's delivery radius.",
        DELIVERY_ADDRESS_UNVERIFIED:
          "We could not verify this address for delivery. Please confirm it on the map.",
      };
      return errorResponse(messages[result.code], result.code, 400);
    }

    return successResponse(result.quote);
  } catch (err) {
    return handleApiError(err);
  }
}
