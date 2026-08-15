import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  STATIC_APPLE_CATALOG,
  computeAppleTargetPriceZar,
  nearestApplePricePointZar,
} from "@/lib/iap/apple/product-catalog";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";

const patchSchema = z.object({
  products: z
    .array(
      z.object({
        product_id: z.string().min(1),
        apple_price_zar: z.number().min(0).optional(),
        is_active: z.boolean().optional(),
      }),
    )
    .min(1),
});

function webPriceForProduct(productId: string): number {
  return STATIC_APPLE_CATALOG.find((s) => s.productId === productId)?.webPriceZar ?? 0;
}

/** GET /api/admin/monetization/apple/products */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const config = await loadAppleIapConfig(supabase);
    const commissionRate = config?.commissionRate ?? 0.15;

    const { data: dbProducts, error } = await supabase
      .from("apple_iap_products")
      .select("*")
      .order("kind")
      .order("product_id");
    if (error) throw error;

    const { data: plans } = await supabase
      .from("subscription_plans")
      .select("id, slug, apple_product_id_monthly, apple_product_id_yearly, price_monthly, price_yearly, is_active");
    const { data: timePacks } = await supabase
      .from("ads_time_packs")
      .select("id, duration_days, apple_product_id, price_zar, is_active");
    const { data: impressionPacks } = await supabase
      .from("ads_impression_packs")
      .select("id, impressions, apple_product_id, price_zar, is_active");

    const planByProductId = new Map<string, Record<string, unknown>>();
    for (const plan of plans ?? []) {
      const row = plan as Record<string, unknown>;
      const monthly = String(row.apple_product_id_monthly ?? "");
      const yearly = String(row.apple_product_id_yearly ?? "");
      if (monthly) planByProductId.set(monthly, row);
      if (yearly) planByProductId.set(yearly, row);
    }
    const packByProductId = new Map<string, Record<string, unknown>>();
    for (const pack of [...(timePacks ?? []), ...(impressionPacks ?? [])]) {
      const row = pack as Record<string, unknown>;
      const pid = String(row.apple_product_id ?? "");
      if (pid) packByProductId.set(pid, row);
    }

    const items = (dbProducts ?? []).map((raw) => {
      const p = raw as Record<string, unknown>;
      const productId = String(p.product_id ?? "");
      const staticRow = STATIC_APPLE_CATALOG.find((s) => s.productId === productId);
      const linkedPlan = planByProductId.get(productId);
      const linkedPack = packByProductId.get(productId);

      let webPriceZar = staticRow?.webPriceZar ?? 0;
      if (linkedPlan) {
        if (productId.includes(".yearly") && linkedPlan.price_yearly != null) {
          webPriceZar = Number(linkedPlan.price_yearly);
        } else if (linkedPlan.price_monthly != null) {
          webPriceZar = Number(linkedPlan.price_monthly);
        }
      } else if (linkedPack?.price_zar != null) {
        webPriceZar = Number(linkedPack.price_zar);
      } else {
        webPriceZar = webPriceForProduct(productId);
      }

      const targetApplePriceZar = computeAppleTargetPriceZar(webPriceZar, commissionRate);
      const storedApplePriceZar = Number(p.apple_price_zar ?? 0);
      const suggestedPricePoint = nearestApplePricePointZar(targetApplePriceZar);
      const priceDrift =
        storedApplePriceZar > 0 &&
        Math.abs(storedApplePriceZar - targetApplePriceZar) > 0.01;
      const ascDrift =
        p.asc_reported_price_zar != null &&
        Math.abs(Number(p.asc_reported_price_zar) - storedApplePriceZar) > 0.01;

      const mappingOk = Boolean(linkedPlan || linkedPack || staticRow);
      const mappingActive =
        linkedPlan?.is_active !== false && linkedPack?.is_active !== false;

      return {
        product_id: productId,
        kind: p.kind,
        ref_table: p.ref_table,
        ref_key: p.ref_key,
        reference_name: p.reference_name,
        display_name: p.display_name,
        is_active: p.is_active,
        apple_price_zar: storedApplePriceZar,
        apple_price_point: p.apple_price_point != null ? Number(p.apple_price_point) : null,
        asc_reported_price_zar: p.asc_reported_price_zar != null ? Number(p.asc_reported_price_zar) : null,
        asc_synced_at: p.asc_synced_at ?? null,
        web_price_zar: webPriceZar,
        target_apple_price_zar: targetApplePriceZar,
        suggested_price_point: suggestedPricePoint,
        drift: {
          price: priceDrift,
          asc: ascDrift,
          any: priceDrift || ascDrift,
        },
        mapping: {
          ok: mappingOk,
          active: mappingActive,
          linked_plan_id: linkedPlan?.id ?? null,
          linked_pack_id: linkedPack?.id ?? null,
        },
        updated_at: p.updated_at,
      };
    });

    return successResponse({
      commission_rate: commissionRate,
      items,
      summary: {
        total: items.length,
        active: items.filter((i) => i.is_active).length,
        drift_count: items.filter((i) => i.drift.any).length,
        unmapped_count: items.filter((i) => !i.mapping.ok).length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/admin/monetization/apple/products */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = patchSchema.safeParse(await request.json());
    if (!body.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, body.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const updated: string[] = [];

    for (const item of body.data.products) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (item.apple_price_zar !== undefined) patch.apple_price_zar = item.apple_price_zar;
      if (item.is_active !== undefined) patch.is_active = item.is_active;
      const { error } = await supabase
        .from("apple_iap_products")
        .update(patch)
        .eq("product_id", item.product_id);
      if (error) throw error;
      updated.push(item.product_id);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.products.updated",
      entity_type: "apple_iap_products",
      after_json: { product_ids: updated },
    });

    return successResponse({ ok: true, updated });
  } catch (error) {
    return handleApiError(error);
  }
}
