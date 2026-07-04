/**
 * GET  /api/admin/commercial/terminal-products  — list products
 * POST /api/admin/commercial/terminal-products  — create product
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const productSchema = z.object({
  name: z.string().min(1).max(200),
  vendor: z.string().min(1).max(100),
  model: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  device_type: z.string().optional().nullable(),
  currency: z.string().default("ZAR"),
  upfront_price: z.number().optional().nullable(),
  monthly_price: z.number().optional().nullable(),
  rental_price: z.number().optional().nullable(),
  subscription_plan_eligible: z.boolean().default(false),
  active: z.boolean().default(true),
  display_order: z.number().int().default(0),
  accounting_model: z.enum(["once_off_purchase", "rental", "subscription_bundle", "lease_to_own", "promotional"]).optional().nullable(),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock", "discontinued", "coming_soon"]).default("in_stock"),
  fulfillment_type: z.enum(["shipping", "courier", "collection", "digital_activation"]).optional().nullable(),
  sku: z.string().optional().nullable(),
  product_code: z.string().optional().nullable(),
  gl_revenue_account: z.string().optional().nullable(),
  gl_cogs_account: z.string().optional().nullable(),
  gl_inventory_account: z.string().optional().nullable(),
  gl_rental_income_account: z.string().optional().nullable(),
  tax_code: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error, count } = await supabase
      .from("terminal_products")
      .select("*", { count: "exact" })
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("Failed to load terminal products", "LOAD_ERROR", 500, error);
    }

    return successResponse({ items: data ?? [], total: count ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal products");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_PRODUCT_CATALOG,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal product catalog is not enabled.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const validation = productSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { data, error } = await supabase
      .from("terminal_products")
      .insert({ ...validation.data, tenant_id: tenantId })
      .select()
      .single();

    if (error) {
      return errorResponse("Failed to create product", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_product.created",
      entity_type: "terminal_products",
      entity_id: (data as { id?: string }).id ?? "",
      module: "terminal_commerce",
      after_json: data,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ product: data }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create terminal product");
  }
}
