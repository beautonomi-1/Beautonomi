/**
 * GET  /api/provider/terminal-orders  — list provider's own orders
 * POST /api/provider/terminal-orders  — place a new terminal order (Paystack path)
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
import { createTerminalOrderForProvider } from "@/lib/terminal/create-terminal-order";
import { resolveIntegrationSetupUrl } from "@/lib/terminal/resolve-integration-setup-url";

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

const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  commercial_model: z.enum(["once_off_purchase", "rental"]),
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

const ORDER_SELECT = `
  *,
  terminal_products(id, name, vendor, model, image_url, requires_integration_setup, integration_vendor_slug),
  terminal_collection_locations(id, name, address)
`;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
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

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal ordering is not available yet.", "FEATURE_DISABLED", 403);
    }

    const { data, error, count } = await supabaseAdmin
      .from("terminal_orders")
      .select(ORDER_SELECT, { count: "exact" })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse("Failed to load orders", "LOAD_ERROR", 500, error);

    const orders = (data ?? []).map((row) => {
      const tp = (row as { terminal_products?: Record<string, unknown> }).terminal_products;
      const setupUrl =
        tp && typeof tp === "object"
          ? resolveIntegrationSetupUrl(
              {
                vendor: String((tp as { vendor?: string }).vendor ?? ""),
                integration_vendor_slug: (tp as { integration_vendor_slug?: string | null })
                  .integration_vendor_slug,
              },
              String((row as { id?: string }).id ?? ""),
            )
          : null;
      return { ...row, integration_setup_url: setupUrl };
    });

    return successResponse({ orders, total: count ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal orders");
  }
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

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal ordering is not available yet.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    try {
      const { order, requires_payment } = await createTerminalOrderForProvider(
        supabaseAdmin,
        providerId,
        tenantId,
        validation.data,
      );

      const reqMeta = extractRequestMeta(request);
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "provider_owner",
        action: "provider.terminal_order.created",
        entity_type: "terminal_orders",
        entity_id: String(order.id ?? ""),
        module: "terminal_commerce",
        after_json: order,
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });

      return successResponse({ order, requires_payment }, 201);
    } catch (createErr) {
      const message = createErr instanceof Error ? createErr.message : "Failed to place order";
      return errorResponse(message, "CREATE_ERROR", 400, createErr);
    }
  } catch (error) {
    return handleApiError(error, "Failed to place terminal order");
  }
}
