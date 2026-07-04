/**
 * GET /api/provider/terminal-products
 * Provider-facing catalog of active terminal products with checkout eligibility.
 */

import { NextRequest } from "next/server";
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
import { getTerminalCheckoutEligibility } from "@/lib/terminal/terminal-checkout-eligibility";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    }

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_PRODUCT_CATALOG,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal products are not available yet.", "FEATURE_DISABLED", 403);
    }

    const { data, error } = await supabaseAdmin
      .from("terminal_products")
      .select(
        "id, name, vendor, model, description, image_url, device_type, currency, upfront_price, monthly_price, rental_price, subscription_plan_eligible, accounting_model, stock_status, fulfillment_type, product_code, sku, requires_integration_setup, integration_vendor_slug",
      )
      .eq("active", true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("display_order", { ascending: true });

    if (error) {
      return errorResponse("Failed to load products", "LOAD_ERROR", 500, error);
    }

    const products = await Promise.all(
      (data ?? []).map(async (product) => {
        const eligibility = await getTerminalCheckoutEligibility(
          supabaseAdmin,
          providerId,
          product as Parameters<typeof getTerminalCheckoutEligibility>[2],
          tenantId,
        );
        return {
          ...product,
          checkout_options: eligibility.options,
          subscription_bundle: eligibility.bundle,
        };
      }),
    );

    return successResponse({ products });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal products");
  }
}
