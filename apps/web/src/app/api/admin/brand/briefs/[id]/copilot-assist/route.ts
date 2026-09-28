import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { runBriefCopilotAssist, type BriefAssistKind } from "@/lib/brand-marketing/copilot-assist";

const bodySchema = z.object({
  kind: z.enum(["tighten_proposition", "suggest_reasons", "suggest_deliverables", "draft_from_idea"]),
  idea: z.string().optional(),
  proposition: z.string().optional(),
  channels: z.array(z.string()).optional(),
  campaign_type: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const result = runBriefCopilotAssist({
      kind: body.kind as BriefAssistKind,
      idea: body.idea,
      proposition: body.proposition,
      channels: body.channels,
      campaign_type: body.campaign_type,
    });
    return successResponse(result);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Brief assist failed");
  }
}
