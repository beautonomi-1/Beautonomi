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

    const supabase = getSupabaseAdmin();
    const { data: brief } = await supabase
      .from("brand_briefs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!brief) return errorResponse("Not found", "NOT_FOUND", 404);

    const doc = createBrandPdf(`Campaign brief: ${brief.name}`);
    doc.fontSize(12).fillColor("#000").text(`Objective: ${brief.objective ?? "—"}`);
    doc.text(`Budget envelope: ${brief.budget_envelope ?? "—"}`);
    doc.text(`Flight: ${brief.flight_start ?? "—"} → ${brief.flight_end ?? "—"}`);
    doc.text(`Proposition: ${brief.proposition ?? "—"}`);
    doc.text(`Insight: ${brief.insight ?? "—"}`);
    doc.text(`Channels: ${(brief.channels_requested ?? []).join(", ") || "—"}`);

    const buffer = await pdfToBuffer(doc);
    return pdfResponse(buffer, `brand-brief-${id.slice(0, 8)}.pdf`);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export brief PDF");
  }
}
