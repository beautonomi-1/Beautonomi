import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { dispatchCampaign, type DispatchableCampaign } from "@/lib/marketing/dispatch-campaign";

/**
 * POST /api/provider/campaigns/[id]/send
 *
 * Send a campaign immediately. Recipient resolution, plan gating, merge-tag
 * personalization, and billing are handled by the shared dispatchCampaign
 * pipeline (also used by the scheduled-campaign cron).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (campaignError || !campaign) {
      return notFoundResponse("Campaign not found");
    }

    const result = await dispatchCampaign(supabase, campaign as DispatchableCampaign);
    if (!result.ok) {
      return errorResponse(
        result.message ?? "Failed to send campaign",
        result.code ?? "SEND_FAILED",
        result.status ?? 400,
      );
    }

    return successResponse({
      message: `Campaign sent to ${result.sentCount ?? 0} recipients`,
      sent_count: result.sentCount ?? 0,
      failed_count: result.failedCount ?? 0,
    });
  } catch (error: any) {
    console.error("Error sending campaign:", error);
    return handleApiError(error, "Failed to send campaign");
  }
}
