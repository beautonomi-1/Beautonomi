/**
 * POST /api/provider/terminal-orders/allocate-from-subscription
 * Allocate a subscription-included terminal (no Paystack checkout).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { allocateTerminalFromSubscription } from "@/lib/terminal/create-terminal-order";

const deliveryAddressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
    contact_name: z.string().optional(),
    contact_phone: z.string().optional(),
  })
  .optional()
  .nullable();

const bodySchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  fulfillment_type: z.enum(["shipping", "courier", "collection", "digital_activation"]).optional(),
  delivery_address: deliveryAddressSchema,
  collection_location_id: z.string().uuid().optional().nullable(),
});

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    const ecommerceEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE,
      tenantId,
    );
    const bundleEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_SUBSCRIPTION_BUNDLE,
      tenantId,
    );
    if (!ecommerceEnabled || !bundleEnabled) {
      return errorResponse("Subscription terminal allocation is not available.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    try {
      const { order } = await allocateTerminalFromSubscription(
        supabaseAdmin,
        providerId,
        tenantId,
        validation.data,
      );

      const reqMeta = extractRequestMeta(request);
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "provider_owner",
        action: "provider.terminal_order.allocated_from_subscription",
        entity_type: "terminal_orders",
        entity_id: String(order.id ?? ""),
        module: "terminal_commerce",
        after_json: order,
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });

      return successResponse({ order, requires_payment: false }, 201);
    } catch (allocErr) {
      const message = allocErr instanceof Error ? allocErr.message : "Allocation failed";
      return errorResponse(message, "ALLOCATE_ERROR", 400, allocErr);
    }
  } catch (error) {
    return handleApiError(error, "Failed to allocate terminal from subscription");
  }
}
