import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";
import { sumKnownSpendForTenant } from "@/lib/brand-marketing/metrics";
import { rollupPackByPillar } from "@/lib/brand-marketing/pack-rollup-pillars";
import { createBrandPdf, pdfResponse, pdfToBuffer } from "@/lib/brand-marketing/pdf/document";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const preset = (new URL(request.url).searchParams.get("period") ?? "this_quarter") as Parameters<
      typeof resolveUtcPeriod
    >[0];
    const period = resolveUtcPeriod(preset);
    const supabase = getSupabaseAdmin();
    const spend = await sumKnownSpendForTenant(supabase, access.tenantId, period);

    const doc = createBrandPdf(`Brand pack — ${period.label}`);
    doc.text(`Period: ${period.start.toISOString().slice(0, 10)} → ${period.end.toISOString().slice(0, 10)}`);
    doc.text(`Known spend: ${spend.known}`);
    doc.moveDown();
    const pillars = await rollupPackByPillar(supabase, access.tenantId, period);
    doc.text("Roll-up by pillar");
    for (const p of pillars) {
      doc.text(`${p.pillar_name}: spend ${p.known_spend}, envelope ${p.budget_envelope}, plan budget ${p.plan_budget}`);
    }

    const buffer = await pdfToBuffer(doc);
    return pdfResponse(buffer, `brand-pack-${period.start.toISOString().slice(0, 10)}.pdf`);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export pack PDF");
  }
}
