/**
 * GET /api/admin/control-plane/modules/ads/packs - List all impression packs (superadmin)
 * PATCH /api/admin/control-plane/modules/ads/packs - Bulk update packs (body: { packs: [{ id, price_zar?, is_active?, display_order? }] })
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ads_impression_packs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("impressions", { ascending: true });
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch packs");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const packs = Array.isArray(body.packs) ? body.packs : [];
    const supabase = getSupabaseAdmin();
    for (const p of packs) {
      if (!p.id) continue;
      const update: Record<string, unknown> = {};
      if (p.price_zar != null) update.price_zar = Number(p.price_zar);
      if (p.is_active != null) update.is_active = Boolean(p.is_active);
      if (p.display_order != null) update.display_order = Number(p.display_order);
      if (Object.keys(update).length > 0) {
        await supabase.from("ads_impression_packs").update(update).eq("id", p.id);
      }
    }
    const { data } = await supabase
      .from("ads_impression_packs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("impressions", { ascending: true });
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update packs");
  }
}
