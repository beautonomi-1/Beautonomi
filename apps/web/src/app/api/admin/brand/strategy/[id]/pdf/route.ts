import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { getStrategyById, rollupStrategyBudgets } from "@/lib/brand-marketing/strategy";
import type { StrategyTree } from "@/lib/brand-marketing/strategy-types";
import { buildStrategyScorecard } from "@/lib/brand-marketing/scorecard";
import { getKpiByKey } from "@/lib/brand-marketing/kpis";
import { createBrandPdf, pdfResponse, pdfToBuffer } from "@/lib/brand-marketing/pdf/document";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();
    const loaded = await getStrategyById(supabase, access.tenantId, id);
    if (!loaded) return errorResponse("Not found", "NOT_FOUND", 404);
    const strategy: StrategyTree = loaded;

    const rollup = await rollupStrategyBudgets(supabase, access.tenantId, id);
    const scorecard = await buildStrategyScorecard(supabase, access.tenantId, strategy);

    const doc = createBrandPdf(`Brand strategy ${strategy.year}`);
    doc.text(`Status: ${strategy.status}`);
    doc.text(`Positioning: ${strategy.positioning ?? "—"}`);
    doc.text(`Promise: ${strategy.brand_promise ?? "—"}`);
    doc.moveDown();
    doc.fontSize(12).fillColor("#000").text("Pillars & plans");
    doc.fontSize(10).fillColor("#444");
    for (const pillar of strategy.brand_pillars ?? []) {
      doc.text(`• ${pillar.name}`);
      for (const plan of pillar.brand_plans ?? []) {
        doc.text(`  Q${plan.quarter}: budget ${plan.budget ?? 0}`);
      }
    }
    doc.moveDown();
    doc.text(`Health score: ${scorecard.health_score}`);
    for (const row of scorecard.kpis) {
      const label = getKpiByKey(row.kpi_key)?.label ?? row.kpi_key;
      doc.text(`${label}: ${row.actual} / ${row.target} (${row.status})`);
    }
    doc.moveDown();
    doc.text("Budget rollup");
    for (const r of rollup) {
      doc.text(`Plan Q${r.quarter}: budget ${r.plan_budget}, spend ${r.known_spend}`);
    }

    const buffer = await pdfToBuffer(doc);
    return pdfResponse(buffer, `brand-strategy-${strategy.year}.pdf`);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export strategy PDF");
  }
}
