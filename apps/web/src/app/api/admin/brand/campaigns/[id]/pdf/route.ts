import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { createBrandPdf, pdfResponse, pdfToBuffer } from "@/lib/brand-marketing/pdf/document";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const kind = new URL(request.url).searchParams.get("kind") ?? "plan";
    const supabase = getSupabaseAdmin();
    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("*, brand_placements(*)")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Not found", "NOT_FOUND", 404);

    const title =
      kind === "closeout"
        ? `Close-out: ${campaign.name}`
        : `Media plan: ${campaign.name}`;
    const doc = createBrandPdf(title);
    doc.text(`Stage: ${campaign.stage}`);
    doc.text(`Budget envelope: ${campaign.budget_envelope ?? "—"}`);
    doc.text(`Flight: ${campaign.flight_start ?? "—"} → ${campaign.flight_end ?? "—"}`);
    if (kind === "closeout") {
      doc.moveDown();
      doc.text(`Worked: ${campaign.closeout_worked ?? "—"}`);
      doc.text(`Did not: ${campaign.closeout_did_not ?? "—"}`);
      doc.text(`Run again: ${campaign.closeout_run_again ?? "—"}`);
    } else {
      doc.moveDown().text("Placements:");
      for (const p of campaign.brand_placements ?? []) {
        doc.text(`• ${p.name ?? p.channel_key} — budget ${p.budget ?? "—"}`);
      }
    }

    const buffer = await pdfToBuffer(doc);
    return pdfResponse(buffer, `brand-campaign-${kind}-${id.slice(0, 8)}.pdf`);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export campaign PDF");
  }
}
