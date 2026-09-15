/**
 * Pluggable vision safety scanner — default uses callLlm + cheap Gateway VLM.
 * Vendor implementations (Hive, PhotoDNA-class) can replace scanImageUrls later.
 */
import { callLlm } from "@/lib/ai/call-llm";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { modelHasVision, pickLatestGatewayModel, fetchLiveGatewayModels } from "@/lib/ai/gateway-models";
import { routeModel } from "@beautonomi/agent-model-router";

export type ImageScanVerdict = "safe" | "needs_human" | "likely_violation";

export type ImageScanResult = {
  verdict: ImageScanVerdict;
  categories: string[];
  rationale: string;
  modelId: string;
};

export interface ImageSafetyScanner {
  scanImageUrls(params: {
    urls: string[];
    policySummary?: string;
    environment?: string;
    tenantId?: string | null;
    /** Beauty/medical procedure imagery defaults to needs_human when true. */
    sensitiveMedicalContext?: boolean;
  }): Promise<ImageScanResult>;
}

export const DEFAULT_IMAGE_SAFETY_POLICY =
  "Flag CSAM, illegal exploitation, graphic violence, and hardcore porn. Beauty procedure photos are usually acceptable but require human review when ambiguous.";

async function resolveVisionModel(environment: string, tenantId: string | null): Promise<string> {
  const runtime = await resolveAiRuntime(environment, tenantId);
  const preferred = runtime.catalog.find((m) => m.enabled && m.gateway && /vision|flash|qwen|pixtral/i.test(m.id));
  if (preferred) return preferred.id;
  const routed = routeModel({
    task: "classification",
    riskTier: 1,
    contextTokens: 500,
    escalationSignals: [],
    escalationCount: 0,
    maxEscalations: 1,
    maxCostUsd: 0.02,
    spentUsd: 0,
    catalog: runtime.catalog,
  });
  if (routed.gateway) return routed.modelId;
  try {
    const live = await fetchLiveGatewayModels();
    const vision = pickLatestGatewayModel(live, "alibaba", (m) => modelHasVision(m));
    return vision?.id ?? routed.modelId;
  } catch {
    return routed.modelId;
  }
}

export class GatewayVlmImageSafetyScanner implements ImageSafetyScanner {
  async scanImageUrls(params: {
    urls: string[];
    policySummary?: string;
    environment?: string;
    tenantId?: string | null;
    sensitiveMedicalContext?: boolean;
  }): Promise<ImageScanResult> {
    if (params.sensitiveMedicalContext) {
      return {
        verdict: "needs_human",
        categories: ["medical_beauty"],
        rationale: "Medical/beauty procedure imagery requires human review (high false-positive cost).",
        modelId: "heuristic",
      };
    }
    const urls = params.urls.filter(Boolean).slice(0, 3);
    if (!urls.length) {
      return { verdict: "safe", categories: [], rationale: "No images to scan.", modelId: "none" };
    }

    const environment = params.environment ?? "production";
    const modelId = await resolveVisionModel(environment, params.tenantId ?? null);
    const result = await callLlm({
      system: [
        "You are a content safety vision classifier for a beauty marketplace.",
        params.policySummary ?? DEFAULT_IMAGE_SAFETY_POLICY,
        'Return JSON: { "verdict": "safe"|"needs_human"|"likely_violation", "categories": string[], "rationale": string }.',
        "Never recommend automatic account suspension.",
      ].join("\n"),
      user: "Classify the attached image(s) against the policy.",
      images: urls.map((url) => ({ url })),
      schema: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["safe", "needs_human", "likely_violation"] },
          categories: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: ["verdict", "categories", "rationale"],
      },
      modelId,
      task: "classification",
      riskTier: 1,
      environment,
      tenantId: params.tenantId ?? null,
      featureKey: "agent.content-moderator",
      maxCostUsd: 0.02,
    });

    if (!result.success) {
      return {
        verdict: "needs_human",
        categories: ["scanner_error"],
        rationale: result.errorCode ?? "vision_scan_failed",
        modelId,
      };
    }

    try {
      const parsed = JSON.parse(result.text) as ImageScanResult;
      return {
        verdict: parsed.verdict ?? "needs_human",
        categories: parsed.categories ?? [],
        rationale: parsed.rationale ?? "",
        modelId,
      };
    } catch {
      return {
        verdict: "needs_human",
        categories: ["unparseable"],
        rationale: "Vision model returned non-JSON output.",
        modelId,
      };
    }
  }
}

let defaultScanner: ImageSafetyScanner | null = null;

export function getImageSafetyScanner(): ImageSafetyScanner {
  if (!defaultScanner) defaultScanner = new GatewayVlmImageSafetyScanner();
  return defaultScanner;
}
