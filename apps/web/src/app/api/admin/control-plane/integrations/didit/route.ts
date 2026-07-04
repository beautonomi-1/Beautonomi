/**
 * GET /api/admin/control-plane/integrations/didit
 *
 * Returns Didit integration health (env var presence, last webhook received).
 * Never exposes secret values.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { diditEnvPresent } from "@/lib/identity-verification/provider/didit-provider";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = getSupabaseAdmin();

    // Get last webhook received timestamp
    const { data: lastEvent } = await supabase
      .from("identity_verification_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return successResponse({
      api_key_set:         Boolean(process.env.DIDIT_API_KEY),
      workflow_id_set:     Boolean(process.env.DIDIT_WORKFLOW_ID),
      webhook_secret_set:  Boolean(process.env.DIDIT_WEBHOOK_SECRET),
      base_url:            process.env.DIDIT_BASE_URL ?? "https://verification.didit.me",
      environment:         process.env.DIDIT_ENVIRONMENT ?? "production",
      env_complete:        diditEnvPresent(),
      last_webhook_received_at: (lastEvent as { received_at?: string } | null)?.received_at ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
