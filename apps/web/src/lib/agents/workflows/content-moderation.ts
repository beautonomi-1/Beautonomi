/**
 * Content moderation sweep — human-gated proposals only.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";
import { resolveContentReportTenantId } from "../content-report-tenant";
import { callAgentLlm, parseLlmJson } from "../llm";
import { getImageSafetyScanner } from "@/lib/safety/image-safety-scanner";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { pickLatestGatewayModel, fetchLiveGatewayModels } from "@/lib/ai/gateway-models";

const PER_RUN_LIMIT = 20;

const COMMUNITY_POLICY = `
Beautonomi community standards:
- No CSAM, illegal exploitation, or trafficking content.
- No graphic violence or hardcore pornography in public UGC.
- No harassment, hate speech, spam, or misleading medical claims.
- Beauty procedure photos may be allowed but ambiguous medical claims need human review.
Illegal/exploitative suspicion must escalate to humans and legal — never auto-suspend.
`.trim();

type ModerationLlmOutput = {
  recommendation: "no_action" | "propose_hide" | "needs_human" | "escalate_legal";
  reason: string;
  confidence: number;
  suggested_report_reason?: string;
};

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "23505" || /duplicate|unique/i.test(String((err as { message?: string })?.message ?? err));
}

async function resolveSafeguardModel(environment: string): Promise<string> {
  const runtime = await resolveAiRuntime(environment, null);
  const enabledSafeguard = runtime.catalog.find((c) => c.enabled && /gpt-oss-safeguard/i.test(c.id));
  if (enabledSafeguard) return enabledSafeguard.id;
  try {
    const live = await fetchLiveGatewayModels();
    const safeguard = pickLatestGatewayModel(live, "openai", (m) => /gpt-oss-safeguard/i.test(m.id));
    if (safeguard) return safeguard.id;
  } catch {
    // fall through
  }
  return runtime.config.defaultModelId;
}

export async function runContentModerationSweep(environment?: string): Promise<
  { skipped: true; reason: string } | { proposals: number; errors: string[] }
> {
  const agentModule = await loadAgentModuleConfig(environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("content-moderator");
  if (!def) return { skipped: true, reason: "content_moderator_not_configured" };
  const op = await loadAgentOperationalState("content-moderator");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  const env = agentModule.environment;
  const safeguardModel =
    (def as { preferred_model_id?: string | null }).preferred_model_id ?? (await resolveSafeguardModel(env));
  const scanner = getImageSafetyScanner();

  const { data: reports } = await supabase
    .from("content_reports")
    .select("id, target_type, target_id, reason, details, reporter_id, tenant_id, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(PER_RUN_LIMIT);

  let proposals = 0;
  const errors: string[] = [];

  for (const report of reports ?? []) {
    try {
      const tenantId = await resolveContentReportTenantId(supabase, report);
      if (!tenantId) {
        errors.push(`report:${report.id}:tenant_unresolved`);
        continue;
      }

      let caption = "";
      let mediaUrls: string[] = [];
      if (report.target_type === "explore_post") {
        const { data: post } = await supabase
          .from("explore_posts")
          .select("caption, media_urls")
          .eq("id", report.target_id)
          .maybeSingle();
        caption = String((post as { caption?: string } | null)?.caption ?? "");
        mediaUrls = ((post as { media_urls?: string[] } | null)?.media_urls ?? []).filter(Boolean);
      }

      let imageVerdict = null as Awaited<ReturnType<typeof scanner.scanImageUrls>> | null;
      if (mediaUrls.length && (def as { vision_enabled?: boolean }).vision_enabled !== false) {
        imageVerdict = await scanner.scanImageUrls({
          urls: mediaUrls,
          policySummary: COMMUNITY_POLICY,
          environment: env,
          tenantId,
        });
      }

      const llm = await callAgentLlm({
        system: [
          "You are a safety classifier using a customizable policy (openai/gpt-oss-safeguard style).",
          COMMUNITY_POLICY,
          "Output JSON only. Never recommend auto-suspension.",
        ].join("\n"),
        user: JSON.stringify({
          report_reason: report.reason,
          reporter_note: String((report as { details?: string | null }).details ?? "").slice(0, 2000),
          target_type: report.target_type,
          caption: caption.slice(0, 2000),
          image_scan: imageVerdict,
        }),
        schema: {
          type: "object",
          properties: {
            recommendation: {
              type: "string",
              enum: ["no_action", "propose_hide", "needs_human", "escalate_legal"],
            },
            reason: { type: "string" },
            confidence: { type: "number" },
            suggested_report_reason: { type: "string" },
          },
          required: ["recommendation", "reason", "confidence"],
        },
        modelId: safeguardModel,
        task: "classification",
        agentId: def.id,
        tenantId,
        featureKey: "agent.content-moderator",
        visionEnabled: false,
      });

      const parsed =
        llm.configured && llm.success === true ? parseLlmJson<ModerationLlmOutput>(llm.text) : null;
      const recommendation = parsed?.recommendation ?? "needs_human";
      if (recommendation === "no_action") continue;

      const actionType =
        recommendation === "propose_hide" ? "moderation.hide" : "moderation.briefing";
      const riskLevel = recommendation === "escalate_legal" ? 3 : recommendation === "propose_hide" ? 2 : 1;

      await proposeAgentAction({
        tenantId,
        agentId: def.id,
        policyVersion: def.active_version,
        actionType,
        targetType: report.target_type,
        targetId: report.id,
        riskLevel,
        reasoningSummary: parsed?.reason ?? "Moderation review recommended.",
        proposedPayload: {
          report_id: report.id,
          content_target_type: report.target_type,
          content_target_id: report.target_id,
          recommendation,
          image_scan: imageVerdict,
          suggested_report_reason: parsed?.suggested_report_reason ?? null,
          confidence: parsed?.confidence ?? null,
          model_id: llm.configured && llm.success === true ? llm.model : safeguardModel,
        },
        idempotencyKey: `moderation:${report.id}:${recommendation}`,
      });
      proposals += 1;
    } catch (err) {
      if (!isDuplicate(err)) errors.push(`report:${report.id}:${String(err).slice(0, 120)}`);
    }
  }

  return { proposals, errors };
}
