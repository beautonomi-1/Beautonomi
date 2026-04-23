import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

type VariantRow = {
  option_values?: Record<string, string>;
  sort_order?: number;
  sku?: string;
  barcode?: string | null;
  measure?: string | null;
  amount?: number | null;
  quantity?: number;
  low_stock_level?: number;
  reorder_quantity?: number;
  supply_price?: number;
  retail_price?: number;
  markup?: number | null;
  image_url?: string | null;
};

function sortVariants<T extends { sort_order?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * GET /api/admin/ecommerce/catalog/[id]
 * Full product + variants (tenant-scoped), for admin SPA editor.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: row, error } = await admin
      .from("products")
      .select("*, product_variants(*), provider:providers!inner(id, tenant_id, business_name)")
      .eq("id", id)
      .eq("provider.tenant_id", tenantId)
      .single();

    if (error || !row) return notFoundResponse("Product not found");

    const raw = row as Record<string, unknown> & { product_variants?: unknown[] };
    const variants = sortVariants((Array.isArray(raw.product_variants) ? raw.product_variants : []) as Record<
      string,
      unknown
    >[]);
    const { product_variants: _pv, ...product } = raw;
    return successResponse({ ...product, variants });
  } catch (error) {
    return handleApiError(error, "Failed to fetch product");
  }
}

/**
 * PATCH /api/admin/ecommerce/catalog/[id]
 * Tenant-scoped product update (parity with provider portal fields + variants replace).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const { data: existing, error: exErr } = await admin
      .from("products")
      .select("id, provider_id, provider:providers!inner(tenant_id)")
      .eq("id", id)
      .eq("provider.tenant_id", tenantId)
      .maybeSingle();

    if (exErr) throw exErr;
    if (!existing) return notFoundResponse("Product not found");

    const providerId = (existing as { provider_id?: string }).provider_id;
    if (!providerId) return notFoundResponse("Product not found");

    const updateData: Record<string, unknown> = {};
    const assign = (key: string, val: unknown) => {
      if (val !== undefined) updateData[key] = val;
    };

    assign("name", body.name);
    assign("barcode", body.barcode);
    assign("brand", body.brand);
    assign("measure", body.measure);
    assign("amount", body.amount !== undefined ? Number(body.amount) : undefined);
    assign("short_description", body.short_description);
    assign("description", body.description);
    assign("category", body.category);
    assign("supplier", body.supplier);
    assign("sku", body.sku);
    if (body.quantity !== undefined) assign("quantity", parseInt(String(body.quantity), 10));
    if (body.low_stock_level !== undefined) assign("low_stock_level", parseInt(String(body.low_stock_level), 10));
    if (body.reorder_quantity !== undefined) assign("reorder_quantity", parseInt(String(body.reorder_quantity), 10));
    if (body.supply_price !== undefined) assign("supply_price", parseFloat(String(body.supply_price)));
    if (body.retail_price !== undefined) assign("retail_price", parseFloat(String(body.retail_price)));
    assign("retail_sales_enabled", body.retail_sales_enabled);
    assign("markup", body.markup);
    if (body.tax_rate !== undefined) assign("tax_rate", parseFloat(String(body.tax_rate)));
    assign("team_member_commission_enabled", body.team_member_commission_enabled);
    assign("track_stock_quantity", body.track_stock_quantity);
    assign("receive_low_stock_notifications", body.receive_low_stock_notifications);
    assign("image_urls", body.image_urls);
    assign("is_active", body.is_active);
    assign("has_variants", body.has_variants);
    assign("variant_option_types", body.variant_option_types);

    if (Object.keys(updateData).length === 0 && !Array.isArray(body.variants)) {
      return errorResponse("No updatable fields provided", "VALIDATION_ERROR", 400);
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updatedProduct, error: updateError } = await admin
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedProduct) {
      console.error("admin ecommerce catalog PATCH:", updateError);
      return handleApiError(updateError || new Error("update failed"), "Failed to update product");
    }

    const variantsPayload = body.variants;
    if (Array.isArray(variantsPayload)) {
      const { error: delErr } = await admin.from("product_variants").delete().eq("product_id", id);
      if (delErr) throw delErr;
      if (variantsPayload.length > 0) {
        const providerShort = providerId.substring(0, 4).toUpperCase();
        const baseTs = Date.now().toString().slice(-6);
        const variantRows = variantsPayload.map((v: VariantRow, idx: number) => ({
          product_id: id,
          option_values: v.option_values || {},
          sort_order: v.sort_order ?? idx,
          sku: v.sku || `PROD-${providerShort}-${baseTs}-V${idx + 1}`,
          barcode: v.barcode || null,
          measure: v.measure || null,
          amount: v.amount ?? null,
          quantity: v.quantity ?? 0,
          low_stock_level: v.low_stock_level ?? 5,
          reorder_quantity: v.reorder_quantity ?? 0,
          supply_price: parseFloat(String(v.supply_price ?? 0)),
          retail_price: parseFloat(String(v.retail_price ?? 0)),
          markup: v.markup ?? null,
          image_url: v.image_url || null,
        }));
        const { error: insErr } = await admin.from("product_variants").insert(variantRows);
        if (insErr) throw insErr;
      }
    }

    const { data: final, error: finErr } = await admin
      .from("products")
      .select("*, product_variants(*)")
      .eq("id", id)
      .single();
    if (finErr) throw finErr;

    const fv = (final as Record<string, unknown> & { product_variants?: unknown[] }).product_variants;
    const variants = sortVariants((Array.isArray(fv) ? fv : []) as Record<string, unknown>[]);
    const { product_variants: __, ...rest } = (final || updatedProduct) as Record<string, unknown> & {
      product_variants?: unknown;
    };

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "admin.product.update",
      entity_type: "product",
      entity_id: id,
      metadata: {
        updated_fields: [...Object.keys(updateData), ...(Array.isArray(body.variants) ? ["variants"] : [])],
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: (user as { role?: string }).role === "superadmin",
    });

    return successResponse({ ...rest, variants });
  } catch (error) {
    return handleApiError(error, "Failed to update product");
  }
}
