/**
 * GET  /api/provider/terminal-orders  — list provider's own orders
 * POST /api/provider/terminal-orders  — place a new terminal order
 *
 * Gated by terminal_ecommerce_enabled.
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

const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  commercial_model: z.enum([
    "once_off_purchase", "rental", "subscription_bundle", "lease_to_own", "financed", "promotional",
  ]),
  quantity: z.number().int().min(1).default(1),
  delivery_address: z.record(z.string(), z.unknown()).optional().nullable(),
  subscription_id: z.string().uuid().optional().nullable(),
});

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
      .select("*, terminal_products(id, name, vendor, model, image_url)", { count: "exact" })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse("Failed to load orders", "LOAD_ERROR", 500, error);

    return successResponse({ orders: data ?? [], total: count ?? 0 });
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

    // Fetch product for pricing
    const { data: product, error: productErr } = await supabaseAdmin
      .from("terminal_products")
      .select("id, name, upfront_price, monthly_price, rental_price, accounting_model, currency, gl_revenue_account, gl_cogs_account, gl_inventory_account, gl_rental_income_account, tax_code, active")
      .eq("id", validation.data.product_id)
      .maybeSingle();

    if (productErr || !product || !(product as { active?: boolean }).active) {
      return errorResponse("Product not found or unavailable", "PRODUCT_NOT_FOUND", 404);
    }

    const p = product as {
      upfront_price?: number | null;
      monthly_price?: number | null;
      rental_price?: number | null;
      currency?: string;
      gl_revenue_account?: string | null;
      gl_cogs_account?: string | null;
      gl_inventory_account?: string | null;
      gl_rental_income_account?: string | null;
      tax_code?: string | null;
    };

    const commercialModel = validation.data.commercial_model;
    const unitPrice =
      commercialModel === "once_off_purchase" ? (p.upfront_price ?? 0)
      : commercialModel === "rental" ? (p.rental_price ?? p.monthly_price ?? 0)
      : (p.monthly_price ?? 0);

    const taxRate = 0.15; // VAT 15% — extend to use product tax_code
    const quantity = validation.data.quantity;
    const subtotal = unitPrice * quantity;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("terminal_orders")
      .insert({
        tenant_id: tenantId,
        provider_id: providerId,
        product_id: validation.data.product_id,
        commercial_model: commercialModel,
        quantity,
        unit_price: unitPrice,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: p.currency ?? "ZAR",
        delivery_address: validation.data.delivery_address ?? null,
        subscription_id: validation.data.subscription_id ?? null,
        order_status: "pending",
        fulfillment_status: "pending",
        invoice_status: "pending",
        gl_revenue_account: p.gl_revenue_account ?? null,
        gl_cogs_account: p.gl_cogs_account ?? null,
        gl_inventory_account: p.gl_inventory_account ?? null,
        gl_rental_income_account: p.gl_rental_income_account ?? null,
        tax_code: p.tax_code ?? null,
        accounting_sync_status: "pending",
      })
      .select()
      .single();

    if (orderErr) {
      return errorResponse("Failed to place order", "SAVE_ERROR", 500, orderErr);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "provider_owner",
      action: "provider.terminal_order.created",
      entity_type: "terminal_orders",
      entity_id: (order as { id?: string }).id ?? "",
      module: "terminal_commerce",
      after_json: order,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ order }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to place terminal order");
  }
}
