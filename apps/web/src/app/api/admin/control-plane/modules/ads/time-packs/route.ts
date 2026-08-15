/**
 * GET /api/admin/control-plane/modules/ads/time-packs - List all time packs
 * PATCH /api/admin/control-plane/modules/ads/time-packs - Bulk update time packs
 */

import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ads_time_packs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("duration_days", { ascending: true });
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch time packs");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const packs = Array.isArray(body.packs) ? body.packs : [];
    const supabase = getSupabaseAdmin();
    for (const p of packs) {
      if (!p.id) continue;
      const update: Record<string, any> = {};
      if (p.price_zar != null) update.price_zar = Number(p.price_zar);
      if (p.is_active != null) update.is_active = Boolean(p.is_active);
      if (p.display_order != null) update.display_order = Number(p.display_order);
      if (p.label != null) update.label = String(p.label);
      if (p.apple_product_id !== undefined) update.apple_product_id = p.apple_product_id || null;
      if (Object.keys(update).length > 0) {
        const { error: updateErr } = await supabase.from("ads_time_packs").update(update).eq("id", p.id);
        if (updateErr) console.error(`Failed to update time pack ${p.id}:`, updateErr);
      }
    }
    const { data } = await supabase
      .from("ads_time_packs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("duration_days", { ascending: true });
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update time packs");
  }
}
