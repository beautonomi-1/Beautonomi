/**
 * GET /api/admin/control-plane/integrations/didit
 *
 * Returns Didit integration health (env var presence, last webhook received).
 * Never exposes secret values.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_DIDIT_WORKFLOW_ID,
  diditEnvPresent,
  getEffectiveDiditWorkflowId,
  getEffectiveDiditKybWorkflowId,
  kybEnvPresent,
} from "@/lib/identity-verification/provider/didit-provider";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = getSupabaseAdmin();

    const { data: lastEvent } = await supabase
      .from("identity_verification_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const missingEnvVars: string[] = [];
    if (!process.env.DIDIT_API_KEY) missingEnvVars.push("DIDIT_API_KEY");
    if (!process.env.DIDIT_WEBHOOK_SECRET) missingEnvVars.push("DIDIT_WEBHOOK_SECRET");

    const workflowIdEnvSet = Boolean(process.env.DIDIT_WORKFLOW_ID);
    const kybWorkflowIdEnvSet = Boolean(process.env.DIDIT_KYB_WORKFLOW_ID);
    const effectiveWorkflowId = getEffectiveDiditWorkflowId();
    const effectiveKybWorkflowId = getEffectiveDiditKybWorkflowId();
    const webhookUrl = appUrl ? `${appUrl}/api/webhooks/didit` : null;
    const webhookUrlUsesWww = webhookUrl?.includes("://www.") ?? false;
    const webhookUrlMayRedirect =
      Boolean(webhookUrl) &&
      !webhookUrlUsesWww &&
      !webhookUrl.includes("localhost");

    return successResponse({
      api_key_set:         Boolean(process.env.DIDIT_API_KEY),
      workflow_id_set:     workflowIdEnvSet,
      workflow_id_source:  workflowIdEnvSet ? "env" : "default",
      effective_workflow_id: effectiveWorkflowId,
      default_workflow_id: DEFAULT_DIDIT_WORKFLOW_ID,
      kyb_workflow_id_set: kybWorkflowIdEnvSet,
      effective_kyb_workflow_id: effectiveKybWorkflowId,
      kyb_env_complete: kybEnvPresent(),
      webhook_secret_set:  Boolean(process.env.DIDIT_WEBHOOK_SECRET),
      missing_env_vars:    missingEnvVars,
      base_url:            process.env.DIDIT_BASE_URL ?? "https://verification.didit.me",
      environment:         process.env.DIDIT_ENVIRONMENT ?? "production",
      env_complete:        diditEnvPresent(),
      webhook_url:         webhookUrl,
      webhook_url_uses_www: webhookUrlUsesWww,
      webhook_url_may_redirect: webhookUrlMayRedirect,
      recommended_webhook_url: "https://www.beautonomi.com/api/webhooks/didit",
      last_webhook_received_at: (lastEvent as { received_at?: string } | null)?.received_at ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
