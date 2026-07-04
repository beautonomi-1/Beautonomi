/**
 * PATCH /api/admin/commercial/terminal-products/[id] — update product
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

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  vendor: z.string().min(1).max(100).optional(),
  model: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  device_type: z.string().optional().nullable(),
  currency: z.string().optional(),
  upfront_price: z.number().optional().nullable(),
  monthly_price: z.number().optional().nullable(),
  rental_price: z.number().optional().nullable(),
  subscription_plan_eligible: z.boolean().optional(),
  active: z.boolean().optional(),
  display_order: z.number().int().optional(),
  accounting_model: z
    .enum(["once_off_purchase", "rental", "subscription_bundle", "lease_to_own", "promotional"])
    .optional()
    .nullable(),
  stock_status: z
    .enum(["in_stock", "low_stock", "out_of_stock", "discontinued", "coming_soon"])
    .optional(),
  fulfillment_type: z
    .enum(["shipping", "courier", "collection", "digital_activation"])
    .optional()
    .nullable(),
  sku: z.string().optional().nullable(),
  product_code: z.string().optional().nullable(),
  gl_revenue_account: z.string().optional().nullable(),
  gl_cogs_account: z.string().optional().nullable(),
  gl_inventory_account: z.string().optional().nullable(),
  gl_rental_income_account: z.string().optional().nullable(),
  tax_code: z.string().optional().nullable(),
  requires_integration_setup: z.boolean().optional(),
  integration_vendor_slug: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await supabase
      .from("terminal_products")
      .select("*")
      .eq("id", params.id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .maybeSingle();

    if (loadErr) {
      return errorResponse("Failed to load product", "LOAD_ERROR", 500, loadErr);
    }
    if (!existing) {
      return errorResponse("Product not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const validation = updateProductSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { data, error } = await supabase
      .from("terminal_products")
      .update(validation.data)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return errorResponse("Failed to update product", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_product.updated",
      entity_type: "terminal_products",
      entity_id: params.id,
      module: "terminal_commerce",
      before_json: existing,
      after_json: data,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ product: data });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal product");
  }
}
