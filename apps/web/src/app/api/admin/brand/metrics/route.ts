import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { convertAmount } from "@/lib/brand-marketing/fx";
import { loadTenantCurrency } from "@/lib/brand-marketing/tenant";

const entrySchema = z.object({
  placement_id: z.string().uuid(),
  metric_key: z.string(),
  value: z.coerce.number(),
  unit: z.string().default("count"),
  as_of: z.string(),
  original_currency: z.string().optional(),
  original_amount: z.coerce.number().optional(),
  supersedes_id: z.string().uuid().optional(),
  voided: z.boolean().optional(),
  void_reason: z.string().optional(),
  source: z.enum(["measured", "entered", "amplitude_pointer"]).default("entered"),
  confidence: z
    .enum(["measured", "entered", "estimated", "unattributable", "amplitude"])
    .default("entered"),
});

const bodySchema = z.object({
  entries: z.array(entrySchema).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { entries } = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const reportingCurrency = await loadTenantCurrency(supabase, access.tenantId);

    const placementIds = [...new Set(entries.map((e) => e.placement_id))];
    const { data: ownedPlacements } = await supabase
      .from("brand_placements")
      .select("id")
      .eq("tenant_id", access.tenantId)
      .in("id", placementIds);
    if ((ownedPlacements ?? []).length !== placementIds.length) {
      return errorResponse("Placement not found in this market", "NOT_FOUND", 404);
    }

    const rows = [];
    for (const e of entries) {
      let converted_amount: number | null = null;
      let missingFx = false;
      if (e.original_currency && e.original_amount != null) {
        const fx = await convertAmount(
          supabase,
          e.original_amount,
          e.original_currency,
          reportingCurrency,
          e.as_of.slice(0, 10),
        );
        converted_amount = fx.converted;
        missingFx = fx.missingRate;
      } else if (e.metric_key === "spend") {
        converted_amount = e.value;
      }

      rows.push({
        tenant_id: access.tenantId,
        placement_id: e.placement_id,
        metric_key: e.metric_key,
        value: e.value,
        unit: e.unit,
        as_of: e.as_of.slice(0, 10),
        original_currency: e.original_currency,
        original_amount: e.original_amount,
        converted_amount,
        source: e.source,
        confidence: missingFx ? "entered" : e.confidence,
        author_id: access.user.id,
        supersedes_id: e.supersedes_id,
        voided: e.voided ?? false,
        void_reason: e.void_reason,
      });
    }

    const { data, error } = await supabase.from("brand_metric_entries").insert(rows).select("*");
    if (error) throw error;

    for (const e of entries) {
      if (!e.supersedes_id) continue;
      await supabase
        .from("brand_metric_entries")
        .update({
          voided: true,
          void_reason: e.voided ? (e.void_reason ?? "Voided") : "Superseded by correction",
        })
        .eq("id", e.supersedes_id)
        .eq("tenant_id", access.tenantId)
        .eq("placement_id", e.placement_id);
    }

    await supabase
      .from("brand_placements")
      .update({ last_metric_at: new Date().toISOString() })
      .in("id", placementIds);

    return successResponse({ items: data ?? [] });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to save brand metrics");
  }
}
